/**
 * 小餐饮爆品工作台 — 实时联网代理 (Cloudflare Worker)
 * ---------------------------------------------------------------------------
 * 功能：接收前端 ?q= 检索词，调用 DeepSeek 生成结构化「区域 TOP 品牌 / 爆品」。
 *
 * 安全：DEEPSEEK_API_KEY 仅存于 Worker 环境变量(secret)，绝不进入前端或仓库。
 *       —— 用 `wrangler secret put DEEPSEEK_API_KEY` 设置，不要写进 wrangler.toml。
 *
 * 数据真实性说明：
 *   DeepSeek 原生无联网搜索能力。默认情况下（仅配置 DEEPSEEK_API_KEY）代理基于
 *   DeepSeek 的模型知识输出真实知名品牌，返回 source="deepseek-knowledge"。
 *   若同时配置 SEARCH_API_KEY + SEARCH_PROVIDER(serpapi|tavily)，则先做真实网页
 *   搜索，再让 DeepSeek 从真实公开结果中抽取，数据更贴近「实时」
 *   （返回 source="web-search+deepseek"）。
 *
 * 与前端契约一致：返回 {"brands":[{brandName,hotItem,avgPrice,rating,tag}]}
 * ---------------------------------------------------------------------------
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // 路由：根路径或 /api/brands 均可（前端 liveApiBase 末尾可带或不带 /api/brands）
    const pathOk = url.pathname === '/' || url.pathname === '/api/brands';
    if (!pathOk) {
      return json({ error: 'not found' }, 404);
    }

    const q = (url.searchParams.get('q') || '').trim();
    if (!q) {
      return json({ error: 'missing q' }, 400);
    }

    if (!env.DEEPSEEK_API_KEY) {
      // 代理未配置 key → 前端会优雅降级到基准数据
      return json({ error: 'server not configured (DEEPSEEK_API_KEY missing)', degraded: true }, 500);
    }

    try {
      let searchContext = '';
      if (env.SEARCH_API_KEY && env.SEARCH_PROVIDER) {
        searchContext = await webSearch(env.SEARCH_PROVIDER, env.SEARCH_API_KEY, q);
      }
      const data = await queryDeepSeek(env.DEEPSEEK_API_KEY, q, searchContext);
      return json(data, 200);
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      return json({ error: msg, brands: [], degraded: true }, 502);
    }
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

// ---- 可选：真实网页搜索（需另行配置搜索 API Key）----
async function webSearch(provider, key, q) {
  if (provider === 'serpapi') {
    const r = await fetch(
      'https://serpapi.com/search.json?engine=google&num=10&q=' +
        encodeURIComponent(q) + '&api_key=' + key
    );
    if (!r.ok) throw new Error('SerpAPI HTTP ' + r.status);
    const j = await r.json();
    return (j.organic_results || [])
      .map((o) => (o.title || '') + ' ' + (o.snippet || ''))
      .join('\n');
  }
  if (provider === 'tavily') {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, query: q, max_results: 8, search_depth: 'advanced' }),
    });
    if (!r.ok) throw new Error('Tavily HTTP ' + r.status);
    const j = await r.json();
    return (j.results || [])
      .map((o) => (o.title || '') + ' ' + (o.content || ''))
      .join('\n');
  }
  return '';
}

// ---- 调用 DeepSeek ----
async function queryDeepSeek(key, q, searchContext) {
  const sys = '你是餐饮市场研究助手。只输出 JSON，不要任何解释或 markdown 代码块。';
  const user = buildPrompt(q, searchContext);

  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + key,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }),
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error('DeepSeek HTTP ' + r.status + ' ' + t.slice(0, 200));
  }

  const j = await r.json();
  const content =
    (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '{}';

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error('DeepSeek 返回非 JSON');
  }

  const brands = Array.isArray(parsed.brands) ? parsed.brands : [];
  return {
    region: parsed.region || '',
    query: q,
    source: searchContext ? 'web-search+deepseek' : 'deepseek-knowledge',
    brands: brands.slice(0, 8).map(norm),
  };
}

function buildPrompt(q, searchContext) {
  const base = `针对检索词「${q}」，列出该区域真实存在/知名的品牌与招牌爆品。`;
  const schema = `返回严格 JSON：
{"region":"区域名","query":"${q}","brands":[{"brandName":"品牌名","hotItem":"招牌爆品","avgPrice":人均元(数字),"rating":评分0-5(数字),"tag":"红海|蓝海|高潜|平稳"}]}
要求：brandName 必须是真实品牌；tag 标注竞争态势；最多 6 条。`;

  if (searchContext) {
    return `${base}
以下是联网搜索到的真实公开信息（来自美团/大众点评/媒体榜单等），请仅从这些真实结果中抽取品牌与爆品，不要编造：
==== 搜索结果 ====
${searchContext}
==== 结束 ====
${schema}`;
  }
  return `${base}
${schema}`;
}

function norm(b) {
  b = b || {};
  let tag = String(b.tag || '').trim();
  if (!['红海', '蓝海', '高潜', '平稳'].includes(tag)) tag = '平稳';
  let rating = parseFloat(b.rating);
  if (isNaN(rating)) rating = 0;
  let avgPrice = parseFloat(b.avgPrice);
  if (isNaN(avgPrice)) avgPrice = 0;
  return {
    brandName: b.brandName || b.name || '未知品牌',
    hotItem: b.hotItem || b.signboard || '',
    avgPrice,
    rating,
    tag,
  };
}
