/**
 * 小餐饮爆品工作台 — 实时联网代理 (Vercel Serverless Function)
 * ---------------------------------------------------------------------------
 * 与 cloudflare/worker.js 完全等价，仅运行环境不同。
 * 部署：把 vercel/ 目录作为项目根部署到 Vercel，在环境变量中设置：
 *   DEEPSEEK_API_KEY（必填）
 *   SEARCH_API_KEY / SEARCH_PROVIDER（可选，真正实时联网搜索）
 * 密钥只存于 Vercel 环境变量，绝不进前端或仓库。
 *
 * 契约：GET /api/brands?q=... 返回 {"brands":[{brandName,hotItem,avgPrice,rating,tag}]}
 * ---------------------------------------------------------------------------
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  const q = (req.query && req.query.q ? String(req.query.q) : '').trim();
  if (!q) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'missing q' }));
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'server not configured', degraded: true }));
  }

  try {
    let ctx = '';
    if (process.env.SEARCH_API_KEY && process.env.SEARCH_PROVIDER) {
      ctx = await webSearch(process.env.SEARCH_PROVIDER, process.env.SEARCH_API_KEY, q);
    }
    const data = await queryDeepSeek(process.env.DEEPSEEK_API_KEY, q, ctx);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS });
    res.end(JSON.stringify(data));
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    res.writeHead(502, { 'Content-Type': 'application/json', ...CORS });
    res.end(JSON.stringify({ error: msg, brands: [], degraded: true }));
  }
}

async function webSearch(provider, key, q) {
  if (provider === 'serpapi') {
    const r = await fetch(
      'https://serpapi.com/search.json?engine=google&num=10&q=' +
        encodeURIComponent(q) + '&api_key=' + key
    );
    if (!r.ok) throw new Error('SerpAPI HTTP ' + r.status);
    const j = await r.json();
    return (j.organic_results || []).map((o) => (o.title || '') + ' ' + (o.snippet || '')).join('\n');
  }
  if (provider === 'tavily') {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, query: q, max_results: 8, search_depth: 'advanced' }),
    });
    if (!r.ok) throw new Error('Tavily HTTP ' + r.status);
    const j = await r.json();
    return (j.results || []).map((o) => (o.title || '') + ' ' + (o.content || '')).join('\n');
  }
  return '';
}

async function queryDeepSeek(key, q, searchContext) {
  const sys = '你是餐饮市场研究助手。只输出 JSON，不要任何解释或 markdown 代码块。';
  const user = buildPrompt(q, searchContext);

  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
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
  } catch {
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
