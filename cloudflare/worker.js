/* =====================================================================
 * 小餐饮工作台 · Cloudflare Worker 代理 v3
 * 架构：两步式搜索 + 强事实锚定（Grounding）提取
 *
 *  Step 1  精确检索词：
 *          "[城市][区县]" "[三级细分品类]" (美团 OR 大众点评 OR 抖音) (榜单 OR 热门 OR 团购)
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
 *    ZHIPU_API_KEY    必填，智谱 API Key（搜索兜底 + 提取）
 *    SEARCH_PROVIDER  选填，外部搜索商：tavily | bocha | serpapi
 *    SEARCH_API_KEY   选填，外部搜索商的 API Key
 * ===================================================================== */

const ZHIPU_CHAT_URL   = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const ZHIPU_SEARCH_URL = "https://open.bigmodel.cn/api/paas/v4/web_search";

/* ---------- Step 1a：解析前端 query → 强约束检索词 ---------- */
/* 前端格式："广东省深圳市南山区" "螺蛳粉" … 分类:餐饮>小吃快餐>米面粉食>螺蛳粉 */
export function buildSearchQuery(rawQuery) {
  const raw = String(rawQuery || "");
  const quoted = [];
  const re = /"([^"]+)"/g;
  let m;
  while ((m = re.exec(raw)) !== null) quoted.push(m[1]);
  const region  = quoted[0] || "";
  const l3      = quoted[1] || "";
  const catM    = raw.match(/分类:(\S+)/);
  const catPath = catM ? catM[1] : "";
  const core = (region || l3) ? `"${region}" "${l3}"` : raw.replace(/分类:\S+/, "").trim();
  return {
    region, l3, catPath,
    searchQuery: `${core} (美团 OR 大众点评 OR 抖音) (榜单 OR 热门 OR 团购)`.trim(),
  };
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
  } catch (e) { /* 外部搜索失败 → 走智谱兜底 */ }
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
  } catch (e) { return null; }
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
5. 目标品类：${catPath || l3 || "本地生活"}。只提取属于「${l3 || "该三级细分品类"}」的商家；若品类是吃的（小吃快餐/火锅/地方菜/粉面等），绝对禁止提取星巴克、瑞幸、喜茶、蜜雪冰城等咖啡/茶饮品牌。
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
      const zhipuKey = env.ZHIPU_API_KEY;
      if (!zhipuKey) return json({ error: "ZHIPU_API_KEY Missing", brands: [] });

      const url = new URL(request.url);
      const rawQuery = url.searchParams.get("q") || "";
      const { region, l3, catPath, searchQuery } = buildSearchQuery(rawQuery);

      /* ========== Step 1：获取网页快照 ========== */
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
        return json({ brands: [], _meta: { pipeline: "two-step", provider, snippetCount: 0, reason: "no_snippets", searchQuery } });
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
      catch (e) { return json({ error: "JSON Parse Failed", raw: rawContent, brands: [] }); }

      /* ========== 双重清洗：假名正则 + 事实锚定校验 ========== */
      const g = groundFilter(resultData && resultData.brands, snippetText);

      return json({
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
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message, brands: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
  },
};
