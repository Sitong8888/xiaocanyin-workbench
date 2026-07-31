/* =====================================================================
 * 小餐饮工作台 · Cloudflare Worker 代理 v3
 * 架构：两步式搜索 + 强事实锚定（Grounding）提取
 *
 *  Step 1  净化检索词（搜推分离）：
 *          发给搜索引擎的关键词必须是干净自然语言：
 *            [城市] [区县] [三级细分] 美团 大众点评 热门
 *          彻底剔除 分类: 语法、>、双引号与省级前缀（否则博查等引擎 0 召回）；
 *          分类路径仅作为背景上下文传给 Step 2 的智谱 GLM 做品类约束。
 *          → 若配置 SEARCH_API_KEY + SEARCH_PROVIDER（tavily | bocha | serpapi），
 *            优先用外部专业搜索 API 抓取百度/美团网页快照；
 *          → 未配置则用智谱 Web Search API 兜底获取快照。
 *
 *  Step 2  强事实约束提取（Grounding）：
 *          把网页快照（Web Snippets）作为唯一上下文喂给智谱 GLM-4，
 *          绝对禁止生成未在文本中出现的店名；
 *          提取结果再过两道防线：假名正则清洗 + 锚定校验（店名必须出现在快照原文中）。
 *
 *  环境变量（wrangler secret put）：
 *    AMAP_KEY         必填，高德 Web 服务 Key —— 主路径用其 POI 搜索 API 实采 100% 真实门店
 *    ZHIPU_API_KEY    必填，智谱 API Key —— 仅对高德真实门店做特劳特×顾均辉定位分析
 *    SEARCH_PROVIDER  选填，外部搜索商：tavily | bocha | serpapi（仅当未配 AMAP_KEY 时作兜底）
 *    SEARCH_API_KEY   选填，外部搜索商的 API Key
 *
 *  新架构（数据真实性优先）：
 *    Step 1  高德 POI 实采：restapi.amap.com/v3/place/text，取真实店名/地址/评分/均价
 *    Step 2  智谱分析：把真实门店列表作为唯一事实喂给 GLM-4，铁律保持 brandName/address
 *            不变，只补充招牌爆品与战略定位建议（杜绝拼凑幻觉）
 *    退化：未配 AMAP_KEY → 走旧「两步搜索+抽取」管线；高德 0 家 → isRealAmap:false
 * ===================================================================== */

const ZHIPU_CHAT_URL   = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const ZHIPU_SEARCH_URL = "https://open.bigmodel.cn/api/paas/v4/web_search";

/* ---------- 边缘防护：速率限制 + KV 结果缓存 ----------
 * KV 绑定名：BRAND_CACHE（见 wrangler.toml）。未绑定时全部优雅降级：
 *   · 限流直接放行（不阻断业务）
 *   · 缓存读写跳过（每次走实时管线）
 * 可调环境变量：RATE_LIMIT_PER_MIN（默认 30 次/IP/分钟）、CACHE_TTL（默认 21600s=6h） */
const RL_DEFAULT_PER_MIN = 30;
const CACHE_TTL_HIT   = 21600;   // 有真实榜单 → 缓存 6h（付费 API 不再重复烧）
const CACHE_TTL_EMPTY = 600;     // 空结果 → 只缓存 10min（防反复空烧，但不长期锁死）

export function cacheKeyOf(searchQuery) {
  return "brands:v1:" + String(searchQuery || "").replace(/\s+/g, " ").trim().toLowerCase();
}

/* 固定窗口限流（KV 计数，非严格原子——对「防刷付费 API」这个目标足够） */
async function rateLimitOk(env, ip, limit) {
  const kv = env.BRAND_CACHE;
  if (!kv) return true;
  const bucket = Math.floor(Date.now() / 60000);
  const key = `rl:v1:${ip}:${bucket}`;
  let cur = 0;
  try { cur = Number(await kv.get(key)) || 0; } catch { return true; }   // KV 读失败不阻断业务
  if (cur >= limit) return false;
  try { await kv.put(key, String(cur + 1), { expirationTtl: 120 }); } catch { /* 写失败忽略 */ }
  return true;
}

async function readCache(env, key) {
  if (!env.BRAND_CACHE) return null;
  try {
    const hit = await env.BRAND_CACHE.get(key, "json");
    return (hit && Array.isArray(hit.brands)) ? hit : null;
  } catch { return null; }
}

async function writeCache(env, key, payload, ttl) {
  if (!env.BRAND_CACHE) return;
  try { await env.BRAND_CACHE.put(key, JSON.stringify(payload), { expirationTtl: ttl }); } catch { /* 缓存写失败不影响返回 */ }
}

/* ---------- Step 1a：解析前端 query → 净化检索词（搜推分离） ---------- */
/* 兼容两种前端格式：
 *   新："海口市 龙华区 鲜果茶 美团 大众点评 热门 分类:餐饮>茶饮咖啡>新式茶饮>鲜果茶"
 *   旧：""海南省海口市龙华区" "鲜果茶" 美团 大众点评 抖音 热门商家 真实店名 分类:…"
 * 输出给搜索引擎的 searchQuery 必须是干净自然语言：
 *   海口市 龙华区 鲜果茶 美团 大众点评 热门
 * （无 分类: 语法、无 >、无双引号、无省级前缀 —— 否则博查 0 召回）
 * catPath 只作为背景上下文传给 Step 2 的智谱 GLM 做品类约束。 */
export function buildSearchQuery(rawQuery) {
  let raw = String(rawQuery || "").trim();

  // 1) 提取并剥离分类路径（仅供提取步骤使用，绝不进搜索词）
  const catM = raw.match(/分类[:：]\s*(\S+)/);
  const catPath = catM ? catM[1] : "";
  raw = raw.replace(/分类[:：]\s*\S+/g, " ");

  // 2) 剥离所有中英文引号（强制引号短语会让搜索引擎 0 召回）
  raw = raw.replace(/["“”'‘’]/g, " ");

  // 3) 去掉冗余修饰词与旧版布尔语法
  raw = raw.replace(/真实店名|热门商家|品牌排行榜|排行榜|爆品|榜单|团购|[()（）]|OR/g, " ");
  raw = raw.replace(/\s+/g, " ").trim();

  // 4) 拆 token：分离区域词 / 品类词（平台词后面统一重拼，防重复）
  const PLATFORM_RE = /^(美团|大众点评|点评|抖音|热门)$/;
  const regionToks = [], otherToks = [];
  for (const t of raw.split(" ").filter(Boolean)) {
    if (PLATFORM_RE.test(t)) continue;
    if (/[省市区县旗盟州]$/.test(t) || /(省|市|自治区).+?(市|区|县|旗)/.test(t)) regionToks.push(t);
    else otherToks.push(t);
  }

  // 5) 区域净化：丢省级前缀 + 市/区之间补空格（"海南省海口市龙华区" → "海口市 龙华区"）
  let region = regionToks.join("");
  region = region.replace(/^(.{1,8}?(?:省|自治区))(?=.)/, "");
  region = region.replace(/(市)(?=.)/, "$1 ");

  // 6) 三级细分：优先取分类路径末段（规范名），否则取剩余品类词
  const l3 = catPath ? (catPath.split(">").pop() || "") : otherToks.join(" ");
  const coreCat = l3 || otherToks.join(" ");

  const searchQuery = `${region} ${coreCat} 美团 大众点评 热门`.replace(/\s+/g, " ").trim();
  const cityTok = regionToks.find(t => /[市]$/.test(t));
  const distTok = regionToks.find(t => /[区县]$/.test(t));
  return { region: region.replace(/\s+/g, ""), l3, catPath, searchQuery, city: cityTok || "", district: distTok || "" };
}

/* ---------- Step 1b：外部专业搜索 API（Tavily / 博查 / SerpAPI） ---------- */
async function searchExternal(provider, apiKey, q) {
  provider = String(provider || "").toLowerCase().trim();
  try {
    if (provider === "tavily") {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey, query: q, max_results: 10, search_depth: "advanced", include_answer: false }),
      });
      if (!res.ok) return null;
      const j = await res.json();
      const arr = j.results || [];
      return arr.map(r => ({ title: r.title || "", content: r.content || "", url: r.url || "" }));
    }
    if (provider === "bocha" || provider === "bochaai") {
      const res = await fetch("https://api.bochaai.com/v1/web-search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({ query: q, count: 10, summary: true, freshness: "oneYear" }),
      });
      if (!res.ok) return null;
      const j = await res.json();
      const arr = (j.data && j.data.webPages && j.data.webPages.value) || [];
      return arr.map(r => ({ title: r.name || "", content: r.summary || r.snippet || "", url: r.url || "" }));
    }
    if (provider === "serpapi") {
      const u = "https://serpapi.com/search.json?engine=baidu&q=" + encodeURIComponent(q) + "&api_key=" + encodeURIComponent(apiKey);
      const res = await fetch(u);
      if (!res.ok) return null;
      const j = await res.json();
      const arr = j.organic_results || [];
      return arr.map(r => ({ title: r.title || "", content: r.snippet || "", url: r.link || "" }));
    }
  } catch { /* 外部搜索失败 → 走智谱兜底 */ }
  return null;
}

/* ---------- Step 1c：智谱 Web Search API 兜底 ---------- */
async function searchZhipu(zhipuKey, q) {
  try {
    const res = await fetch(ZHIPU_SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${zhipuKey}` },
      body: JSON.stringify({ search_engine: "search_std", search_query: q.slice(0, 78) }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const arr = j.search_result || [];
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr.map(r => ({ title: r.title || "", content: r.content || "", url: r.link || "" }));
  } catch { return null; }
}

/* ===================== 新主路径：高德 POI 实采 + 智谱定位分析 ===================== */
const AMAP_PLACE_URL = "https://restapi.amap.com/v3/place/text";
const AMAP_REGEO_URL = "https://restapi.amap.com/v3/geocode/regeo";

/* ---------- Step 1：高德 POI 搜索（100% 真实注册营业门店） ----------
 * 解析高德返回 pois：真实店名 name / 真实地址 address / 高德评分 biz_ext.rating / 高德均价 biz_ext.cost */
async function searchAmapPoi(amapKey, keywords, city) {
  const params = new URLSearchParams({
    key: amapKey,
    keywords: String(keywords || ""),
    city: String(city || ""),
    offset: "10",
    extensions: "all",
    output: "JSON",
  });
  const u = AMAP_PLACE_URL + "?" + params.toString();
  let j;
  try {
    const res = await fetch(u);
    if (!res.ok) return null;
    j = await res.json();
  } catch { return null; }
  if (j.status !== "1" || !Array.isArray(j.pois)) return [];
  return j.pois.map(p => {
    const ext = p.biz_ext || {};
    const rating = ext.rating ? parseFloat(ext.rating) : 0;
    const cost = ext.cost ? parseFloat(String(ext.cost).replace(/[^\d.]/g, "")) : 0;
    return {
      brandName: String(p.name || "").trim(),
      address: String(p.address || "").trim(),
      city: String(p.cityname || "").trim(),
      district: String(p.adname || "").trim(),
      rating: isNaN(rating) ? 0 : rating,
      cost: isNaN(cost) ? 0 : cost,
      type: String(p.type || "").trim(),
    };
  }).filter(b => b.brandName);
}

/* ---------- Step 2：智谱 GLM-4 事实绑定 + 特劳特定位分析 ----------
 * 高德真实门店列表即唯一事实；智谱只补充招牌爆品与定位建议，严禁改店名/地址 */
async function analyzeWithZhipu(zhipuKey, pois, l3, region, catPath) {
  const ctx = pois.map((p, i) =>
    `${i + 1}. brandName="${p.brandName}" | address="${p.address}" | 高德人均(元)=${p.cost || "未知"} | 高德评分=${p.rating || "未知"}`
  ).join("\n");
  const systemPrompt = `你是一个商业战略分析师（特劳特《定位》× 顾均辉空位理论）。
以下是高德地图 API 100% 真实检索到的本地门店列表（含真实店名 brandName 与真实地址 address）：
${ctx}

【铁律】
1. 你必须严格保持每条记录的 brandName 与 address 原样不变，绝对禁止任何拼凑、修改、翻译或虚构！所有分析结论只能基于这些真实门店。
2. 为每个真实门店配置其典型的招牌爆品（hotItem，1 个该品牌真实常见单品；若不确定写"招牌产品"）。
3. 结合特劳特×顾均辉定位理论，为每条门店给出一句战略定位建议（positioning，≤24 字，指出可切入的心智空位或对立面打法）。
4. tag 从 [红海, 蓝海, 高潜, 平稳] 中选一个（依据该品类在当地的竞争激烈度判断）。
5. avgPrice 必须使用上面给出的"高德人均(元)"真实数字（字符串，如"19"），严禁编造；若未知填"0"。
6. 严禁输出任何未在门店列表中出现的店名。

【输出】只返回纯 JSON 对象，禁止 markdown 代码块与任何解释：
{"brands":[{"brandName":"原样真实店名","address":"原样真实地址","hotItem":"招牌爆品","avgPrice":"19","rating":4.7,"tag":"高潜","positioning":"一句战略定位建议"}]}`;
  const userPrompt = `目标赛道：${l3 || "本地生活"}（背景分类：${catPath || "无"}）｜区域：${region || "用户指定"}。
请基于上面的真实门店列表，输出战略空位分析 JSON。`;
  try {
    const res = await fetch(ZHIPU_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${zhipuKey}` },
      body: JSON.stringify({
        model: "glm-4-flash",
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const rawContent = j.choices?.[0]?.message?.content || "";
    const m = rawContent.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]);
  } catch { return null; }
}

/* ---------- 合并：高德真值优先，智谱仅补充分析字段 ---------- */
function mergeAmapBrands(pois, zhipu) {
  const map = {};
  if (zhipu && Array.isArray(zhipu.brands)) {
    for (const b of zhipu.brands) {
      if (b && b.brandName) map[String(b.brandName).trim()] = b;
    }
  }
  return pois.slice(0, 10).map(p => {
    const z = map[p.brandName];
    let tag = z && z.tag ? String(z.tag).trim() : "平稳";
    if (!["红海", "蓝海", "高潜", "平稳"].includes(tag)) tag = "平稳";
    const avgPrice = p.cost > 0 ? p.cost : (z && parseFloat(z.avgPrice) > 0 ? parseFloat(z.avgPrice) : 0);
    return {
      brandName: p.brandName,
      address: p.address,
      rating: p.rating,
      avgPrice: avgPrice,
      hotItem: z && z.hotItem ? String(z.hotItem) : "—",
      tag: tag,
      positioning: z && z.positioning ? String(z.positioning) : "",
    };
  });
}

/* ---------- /geo：浏览器定位 → 经纬度 → 高德逆地理编码（AMAP_KEY 仅存于后端） ---------- */
async function reverseGeocode(env, lng, lat) {
  const key = env.AMAP_KEY;
  if (!key) return { error: "AMAP_KEY Missing" };
  const u = `${AMAP_REGEO_URL}?key=${encodeURIComponent(key)}&location=${encodeURIComponent(lng + "," + lat)}&extensions=base&output=JSON`;
  try {
    const res = await fetch(u);
    if (!res.ok) return { error: "amap_upstream", status: res.status };
    const j = await res.json();
    if (j.status !== "1" || !j.regeocode) return { error: "amap_error", info: j.info || "" };
    const ac = j.regeocode.addressComponent || {};
    const cityRaw = Array.isArray(ac.city) ? ac.city[0] : ac.city;
    return {
      province: ac.province || "",
      city: cityRaw || "",
      district: ac.district || "",
      adcode: ac.adcode || "",
      lng, lat,
    };
  } catch (e) {
    return { error: "amap_exception", message: String(e && e.message || e) };
  }
}

/* ---------- 快照 → 文本上下文 ---------- */
export function snippetsToText(snippets) {
  return (snippets || [])
    .filter(s => s && (s.title || s.content))
    .slice(0, 12)
    .map((s, i) => `【快照${i + 1}】${s.title}\n${String(s.content || "").slice(0, 600)}`)
    .join("\n\n");
}

/* ---------- Step 2b：假名正则 + 事实锚定（Grounding）双重清洗 ---------- */
export const FAKE_PATTERN = /(XX|YY|ZZ|ABC|某某|品牌|爆品|示例|测试|店名|占位|待补充|unknown|placeholder|example|N\/A)/i;

export function groundFilter(brands, snippetText) {
  const text = String(snippetText || "");
  let rawCount = 0, fakeDrop = 0, ungroundedDrop = 0;
  const kept = [];
  if (Array.isArray(brands)) {
    rawCount = brands.length;
    for (const b of brands) {
      if (!b || !b.brandName) continue;
      const name = String(b.brandName).trim();
      if (name.length < 2 || FAKE_PATTERN.test(name) || FAKE_PATTERN.test(String(b.hotItem || ""))) { fakeDrop++; continue; }
      const priceNum = parseFloat(String(b.avgPrice == null ? "" : b.avgPrice).replace(/[^\d.]/g, ""));
      if (!(priceNum > 0)) { fakeDrop++; continue; }
      // —— 锚定校验：店名必须真实出现在搜索快照文本中，杜绝拼凑幻觉 ——
      const coreName = name.replace(/[（(][^（()）]*[)）]/g, "").replace(/\s+/g, "");
      const grounded = text.includes(name)
        || (coreName.length >= 2 && text.includes(coreName))
        || (coreName.length >= 4 && text.includes(coreName.slice(0, 4)))
        || (coreName.length >= 4 && text.includes(coreName.slice(-4)));
      if (!grounded) { ungroundedDrop++; continue; }
      kept.push(b);
    }
  }
  return { brands: kept, rawCount, fakeDrop, ungroundedDrop };
}

/* ---------- Step 2a：强事实约束提取 System Prompt ---------- */
export function buildExtractPrompt(region, l3, catPath) {
  return `你是一个严谨的数据提取器。请只从下方提供的搜索快照文本中提取真实存在的店铺名称、客单价与爆品。

【提炼铁律】：
1. 绝对禁止拼凑词汇，绝对禁止生成未在文本中出现的店名！店名必须能在快照文本中原样找到。
2. 若检索文本中真实店铺不足，有几家提几家，其余字段填 null；一家都没有就返回 {"brands":[]}。
3. 严禁使用任何带"XX"、"某某"、"ABC"、"品牌名"、"示例"等占位符的名称。
4. 客单价（avgPrice）只能取快照中出现的真实人均消费数字；文本中没有则填 null，严禁编造，严禁为 0。
5. 目标品类（背景约束）：${catPath || l3 || "本地生活"}。只提取属于「${l3 || "该三级细分品类"}」的商家，严禁把椰子鸡、烧烤、火锅等异业品牌提炼进来；若品类是吃的（小吃快餐/火锅/地方菜/粉面等），绝对禁止提取星巴克、瑞幸、喜茶、蜜雪冰城等咖啡/茶饮品牌。
6. 目标区域：${region || "用户指定区域"}。本地真实商家优先于全国连锁。
7. 若快照显示该商家上过抖音同城热销榜/热播榜/打卡榜，在 douyinRank 标明（如："🎵 抖音同城热销榜 Top2"）；否则为空字符串。

【输出格式】只返回纯 JSON 对象，禁止任何多余文字、markdown 代码块或解释：
{"brands":[{"brandName":"快照中原样出现的店名","hotItem":"真实招牌爆品或null","avgPrice":"128或null","rating":"4.7或null","tag":"高潜/红海/蓝海/平稳","douyinRank":"🎵 抖音榜单名次 或空字符串"}]}`;
}

/* ===================== Worker 入口 ===================== */
export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders, status: 200 });
    }
    const json = (obj) => new Response(JSON.stringify(obj), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

    try {
      const url = new URL(request.url);
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";

      /* ---------- /log：前端错误上报（sendBeacon POST，wrangler tail 可查） ---------- */
      if (url.pathname.endsWith("/log") && request.method === "POST") {
        try {
          const body = await request.text();
          const entry = JSON.parse(body.slice(0, 4096));   // 截断，防超大 payload
          console.error("[client-error]", JSON.stringify({
            ip, ua: (request.headers.get("User-Agent") || "").slice(0, 120),
            msg: String(entry.msg || "").slice(0, 500),
            src: String(entry.src || "").slice(0, 200),
            line: entry.line, col: entry.col,
            stack: String(entry.stack || "").slice(0, 800),
            page: String(entry.page || "").slice(0, 200),
            t: entry.t,
          }));
        } catch { /* 上报体不合法 → 静默丢弃 */ }
        return new Response(null, { headers: corsHeaders, status: 204 });
      }

      /* ---------- /geo：浏览器定位(经纬度) → 高德逆地理编码 → 省/市/区 ---------- */
      if (url.pathname.endsWith("/geo") && request.method === "GET") {
        const lat = parseFloat(url.searchParams.get("lat"));
        const lng = parseFloat(url.searchParams.get("lng"));
        if (isNaN(lat) || isNaN(lng)) {
          return new Response(JSON.stringify({ error: "invalid coords" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
          });
        }
        const geo = await reverseGeocode(env, lng, lat);   // 高德逆地理编码在服务端完成，AMAP_KEY 不暴露给前端
        const status = geo.error && geo.error !== "AMAP_KEY Missing" ? 200 : 200;
        return new Response(JSON.stringify(geo), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }, status,
        });
      }

      const zhipuKey = env.ZHIPU_API_KEY;
      if (!zhipuKey) return json({ error: "ZHIPU_API_KEY Missing", brands: [] });

      /* ---------- 速率限制：默认 30 次/IP/分钟（KV 未绑定时放行） ---------- */
      const rlLimit = Number(env.RATE_LIMIT_PER_MIN) || RL_DEFAULT_PER_MIN;
      if (!(await rateLimitOk(env, ip, rlLimit))) {
        return new Response(JSON.stringify({ error: "Rate Limited", brands: [], _meta: { reason: "rate_limited" } }), {
          headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
          status: 429,
        });
      }

      const rawQuery = url.searchParams.get("q") || "";
      const { region, l3, catPath, searchQuery, city, district } = buildSearchQuery(rawQuery);

      /* ---------- KV 缓存：命中直接返回，不触碰高德/智谱付费 API ---------- */
      const cacheKey = cacheKeyOf(searchQuery);
      const noCache = url.searchParams.get("nocache") === "1";
      if (!noCache) {
        const cached = await readCache(env, cacheKey);
        if (cached) {
          cached._meta = { ...(cached._meta || {}), cache: "hit" };
          return json(cached);
        }
      }

      /* ========== 主路径 Step 1+2：高德 POI 实采真实门店 → 智谱定位分析 ========== */
      if (env.AMAP_KEY) {
        // keywords 取三级细分品类（去 "/·" 等分隔，取首个词，如「轻乳茶/原叶鲜奶茶」→「轻乳茶」）
        const keywords = String(l3 || "").split(/[/\／·]/)[0].trim() || l3;
        const cityParam = city || region;   // AMap city 参数：优先市级名，否则退化为区域串
        const pois = await searchAmapPoi(env.AMAP_KEY, keywords, cityParam);
        if (pois && pois.length) {
          const zhipu = await analyzeWithZhipu(zhipuKey, pois, l3, region, catPath);
          const brands = mergeAmapBrands(pois, zhipu);
          const payload = {
            isRealAmap: true,
            brands,
            _meta: {
              pipeline: "amap-poi+zhipu",
              model: "glm-4-flash",
              poiCount: pois.length,
              analyzed: !!zhipu,
              keywords, city: cityParam, district, searchQuery,
            },
          };
          await writeCache(env, cacheKey, payload, CACHE_TTL_HIT);
          return json(payload);
        }
        // 高德 0 家 → 明确告知前端走行业基准兜底
        const emptyPayload = {
          isRealAmap: false, brands: [],
          _meta: { pipeline: "amap-poi+zhipu", poiCount: 0, reason: "amap_no_poi", keywords, city: cityParam, district, searchQuery },
        };
        await writeCache(env, cacheKey, emptyPayload, CACHE_TTL_EMPTY);
        return json(emptyPayload);
      }

      /* ========== 兜底 Step 1：获取网页快照（仅当未配置 AMAP_KEY） ========== */
      let snippets = null;
      let provider = "zhipu_web_search";
      if (env.SEARCH_API_KEY && env.SEARCH_PROVIDER) {
        snippets = await searchExternal(env.SEARCH_PROVIDER, env.SEARCH_API_KEY, searchQuery);
        if (snippets && snippets.length) provider = String(env.SEARCH_PROVIDER).toLowerCase();
        else snippets = null;
      }
      if (!snippets) snippets = await searchZhipu(zhipuKey, searchQuery);

      if (!snippets || !snippets.length) {
        // 搜索层拿不到任何快照 → 明确返回空，前端展示行业基准分析模型
        const emptyPayload = { isRealAmap: false, brands: [], _meta: { pipeline: "two-step", provider, snippetCount: 0, reason: "no_snippets", searchQuery } };
        await writeCache(env, cacheKey, emptyPayload, CACHE_TTL_EMPTY);   // 短缓存：防同一空查询反复烧搜索额度
        return json(emptyPayload);
      }
      const snippetText = snippetsToText(snippets);

      /* ========== Step 2：强事实约束提取（无联网工具，只看快照） ========== */
      const systemPrompt = buildExtractPrompt(region, l3, catPath);
      const userPrompt = `目标：提取「${region} ${l3}」在美团/大众点评/抖音上的真实商家榜单。\n\n===== 搜索快照文本（唯一事实来源） =====\n${snippetText}`;

      const zhipuResponse = await fetch(ZHIPU_CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${zhipuKey}` },
        body: JSON.stringify({
          model: "glm-4-flash",
          temperature: 0.1,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      const resJson = await zhipuResponse.json();
      if (!zhipuResponse.ok) {
        return json({ error: "Zhipu API Error", detail: resJson, brands: [] });
      }

      const rawContent = resJson.choices?.[0]?.message?.content || "";
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return json({ error: "JSON Parse Failed", raw: rawContent, brands: [] });

      let resultData;
      try { resultData = JSON.parse(jsonMatch[0]); }
      catch { return json({ error: "JSON Parse Failed", raw: rawContent, brands: [] }); }

      /* ========== 双重清洗：假名正则 + 事实锚定校验 ========== */
      const g = groundFilter(resultData && resultData.brands, snippetText);

      const payload = {
        isRealAmap: false,
        brands: g.brands.slice(0, 8),
        _meta: {
          pipeline: "two-step",
          provider,
          model: "glm-4-flash",
          snippetCount: snippets.length,
          rawCount: g.rawCount,
          keptCount: Math.min(g.brands.length, 8),
          fakeDrop: g.fakeDrop,
          ungroundedDrop: g.ungroundedDrop,
          searchQuery,
        },
      };
      // 有真实榜单缓存 6h，空榜单短缓存 10min（错误结果不缓存）
      await writeCache(env, cacheKey, payload, payload.brands.length ? CACHE_TTL_HIT : CACHE_TTL_EMPTY);
      return json(payload);
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message, brands: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
  },
};
