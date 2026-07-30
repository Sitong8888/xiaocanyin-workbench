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
      status: 200
    });

    try {
      const apiKey = env.ZHIPU_API_KEY;
      if (!apiKey) return json({ error: "ZHIPU_API_KEY Missing", brands: [] });

      const url = new URL(request.url);
      const query = url.searchParams.get("q") || "美团 大众点评 抖音 热门商家 真实店名";

      // 检索词强制带平台后缀（示例："海口市" "足道采耳" 美团 大众点评 抖音 热门商家 真实店名）
      let searchQuery = query;
      if (!/美团/.test(searchQuery)) searchQuery += " 美团 大众点评 抖音";
      if (!/热门商家/.test(searchQuery)) searchQuery += " 热门商家 真实店名";
      searchQuery += " 抖音本地生活 抖音热销榜 打卡榜 人均消费 招牌菜";

      // ===== System Prompt：真实数据铁律 + 品类负向过滤 =====
      const systemPrompt = `你是一个本地商业数据提取助手。请根据联网搜索结果，严格提取美团、大众点评、抖音上真实存在的店铺名称。

【核心铁律】：
1. 严禁捏造或使用任何带"XX"、"YY"、"ZZ"、"某某"、"ABC"、"品牌名"、"示例"、"店名"等占位符的名称！
2. 如果搜索到的内容不全，必须只返回你100%确认为真实开店的商家（如：重庆富侨、郑远元、耳道等）。宁可少返回，也绝不编造。
3. 必须输出真实店铺名称、真实招牌爆品、真实客单价（如：128）以及抖音/美团热度。客单价严禁为 0。
4. 严格按用户提供的行业分类路径（格式：分类:大类>一级赛道>二级品类>三级细分）检索：只允许返回属于该三级细分品类的商家。若查询的是吃的（小吃快餐/火锅/地方菜/粉面等），绝对禁止返回星巴克、瑞幸、喜茶、蜜雪冰城等咖啡/茶饮品牌；任何跨品类品牌一律剔除。
5. 优先返回该省/市/区本地真实存在、可在美团/大众点评/抖音检索到的商家，本地商家优先于全国连锁。
6. 若该品牌上过抖音同城热销榜/热播榜/打卡榜，必须在 douyinRank 标明（如："🎵 抖音同城热销榜 Top2"）；未上榜则为空字符串。

【输出格式】只返回纯 JSON 对象，禁止任何多余文字、markdown 代码块或解释：
{"brands":[{"brandName":"真实店铺名","hotItem":"真实招牌爆品","avgPrice":"128","rating":"4.7","tag":"高潜/红海/蓝海/平稳","douyinRank":"🎵 抖音同城热销榜 Top2 或空字符串"}]}
若确实搜索不到任何可确认的真实商家，返回 {"brands":[]}，不得编造。`;

      const zhipuResponse = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "glm-4-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: searchQuery }
          ],
          tools: [{ type: "web_search", web_search: { search_result: true } }]
        })
      });

      const resJson = await zhipuResponse.json();
      if (!zhipuResponse.ok) {
        return json({ error: "Zhipu API Error", detail: resJson, brands: [] });
      }

      const rawContent = resJson.choices?.[0]?.message?.content || "";

      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return json({ error: "JSON Parse Failed", raw: rawContent, brands: [] });
      }

      let resultData;
      try {
        resultData = JSON.parse(jsonMatch[0]);
      } catch (e) {
        return json({ error: "JSON Parse Failed", raw: rawContent, brands: [] });
      }

      // ===== 强行正则过滤脏数据（核心）=====
      const fakePattern = /(XX|YY|ZZ|ABC|某某|品牌|爆品|示例|测试|店名|占位|待补充|unknown|placeholder|example|N\/A)/i;
      let rawCount = 0, keptCount = 0;

      if (resultData && Array.isArray(resultData.brands)) {
        rawCount = resultData.brands.length;
        resultData.brands = resultData.brands.filter(b => {
          if (!b || !b.brandName) return false;
          const name = String(b.brandName).trim();
          if (!name || name.length < 2) return false;
          if (fakePattern.test(name)) return false;                 // 假名称
          if (fakePattern.test(String(b.hotItem || ''))) return false; // 假爆品
          const priceStr = String(b.avgPrice == null ? '' : b.avgPrice).trim();
          if (priceStr === '' || priceStr === '¥0' || priceStr === '0') return false;
          const priceNum = parseFloat(priceStr.replace(/[^\d.]/g, ''));
          if (!(priceNum > 0)) return false;   // 客单价为 0 / 非法 / 缺失
          return true;
        });
        keptCount = resultData.brands.length;
      } else {
        resultData = { brands: [] };
      }

      resultData._meta = { rawCount, keptCount, filtered: rawCount - keptCount, model: "glm-4-flash" };
      return json(resultData);

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message, brands: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }
  }
};
