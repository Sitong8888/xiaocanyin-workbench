/**
 * 小餐饮爆品工作台 — 实时联网代理 (Cloudflare Worker)
 * ---------------------------------------------------------------------------
 * 功能：接收前端 ?q= 检索词，调用【智谱 GLM-4.7-Flash】并开启联网搜索，
 *       从公开的网页（美团 / 大众点评榜单、媒体、本地生活资讯等）中抽取结构化
 *       「区域 TOP 品牌 / 爆品」。
 *
 * 安全：ZHIPU_API_KEY 仅存于 Worker 环境变量(secret)，绝不进入前端或仓库。
 *       —— 用 `wrangler secret put ZHIPU_API_KEY` 设置，不要写进 wrangler.toml。
 *
 * 模型 & 联网：
 *   - Endpoint: https://open.bigmodel.cn/api/paas/v4/chat/completions
 *   - Model:    glm-4.7-flash（若智谱默认映射为 glm-4-flash，自动兼容回退）
 *   - 鉴权:     Authorization: Bearer [ZHIPU_API_KEY]
 *   - 联网搜索: tools: [{ type: "web_search", web_search: { search_result: true } }]
 *
 * 与前端契约一致：返回 {"brands":[{brandName,hotItem,avgPrice,rating,tag}]}
 * ---------------------------------------------------------------------------
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
};

// 智谱 GLM 模型列表：优先 glm-4.7-flash，失败自动回退 glm-4-flash
const ZHIPU_MODELS = ['glm-4.7-flash', 'glm-4-flash'];
const ZHIPU_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

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

    if (!env.ZHIPU_API_KEY) {
      // 代理未配置 key → 前端会优雅降级到基准数据
      return json({ error: 'server not configured (ZHIPU_API_KEY missing)', degraded: true }, 500);
    }

    try {
      const data = await queryZhipu(env.ZHIPU_API_KEY, q);
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

// ---- 调用智谱 GLM（开启联网搜索，自动兼容模型名）----
async function queryZhipu(key, q) {
  const sys = '你是餐饮市场研究助手。只输出 JSON，不要任何解释、不要 markdown 代码块。';
  const user = buildPrompt(q);
  const tools = [{ type: 'web_search', web_search: { search_result: true } }];

  let lastErr = null;
  for (const model of ZHIPU_MODELS) {
    try {
      const data = await callZhipu(key, q, sys, user, tools, model);
      return data;
    } catch (e) {
      // 模型名相关错误 → 尝试下一个兼容模型；其他错误直接抛出
      if (e && e.modelError) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error('Zhipu 调用失败（所有候选模型均不可用）');
}

async function callZhipu(key, q, sys, user, tools, model) {
  const r = await fetch(ZHIPU_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + key,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      tools,
      // 不使用 response_format，避免与工具冲突；改用提示词强约束 + 容错解析
      temperature: 0.5,
    }),
  });

  if (!r.ok) {
    const t = await r.text();
    // 404 / 模型名报错 → 标记为 modelError 以触发回退
    const isModelErr =
      r.status === 404 ||
      /model/i.test(t) ||
      /unknown/i.test(t) ||
      /not found/i.test(t);
    const err = new Error('Zhipu HTTP ' + r.status + ' ' + t.slice(0, 200));
    err.modelError = isModelErr;
    throw err;
  }

  const j = await r.json();
  const content =
    (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '{}';

  const parsed = extractJSON(content);
  const brands = Array.isArray(parsed.brands) ? parsed.brands : [];
  return {
    region: parsed.region || '',
    query: q,
    source: 'zhipu-web-search',
    model, // 回传实际命中的模型名，便于前端/调试核对
    brands: brands.slice(0, 8).map(norm),
  };
}

function buildPrompt(q) {
  return `针对检索词「${q}」，联网查一查该区域（省/市/区县）在美团、大众点评上真实热门的餐饮品牌与招牌爆品，并列出。

只输出如下严格 JSON（不要任何解释、不要 markdown 代码块）：
{"region":"区域名","query":"${q}","brands":[{"brandName":"品牌名","hotItem":"招牌爆品","avgPrice":人均元(数字),"rating":评分0-5(数字),"tag":"红海|蓝海|高潜|平稳"}]}
要求：
- brandName 必须是在该区域真实存在/知名的品牌（可来自美团/大众点评榜单、本地生活媒体）；
- hotItem 是它最出圈的招牌爆品；
- avgPrice / rating 尽量贴近真实公开数据，未知可填 0；
- tag 标注竞争态势（红海=竞争激烈、蓝海=空白机会、高潜=快速增长、平稳=稳定）；
- 最多 6 条，按热度排序。`;
}

// 容错 JSON 解析：剥离可能的 markdown 代码块，并截取首个 { 到末个 }
function extractJSON(text) {
  if (!text) return {};
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1];
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return {};
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch (e) {
    return {};
  }
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
