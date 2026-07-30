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

    try {
      const apiKey = env.ZHIPU_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "ZHIPU_API_KEY Missing" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        });
      }

      const url = new URL(request.url);
      const query = url.searchParams.get("q") || "美团 大众点评 抖音 热门品牌 爆品";

      // 强化检索词：叠加抖音本地生活榜单关键词
      const searchQuery = query + " 抖音本地生活 热门品牌 抖音热销榜 热播榜 打卡榜";

      // 品类解析专家 System Prompt：严格按分类路径检索 + 硬性负向过滤 + douyinRank 字段
      const systemPrompt = [
        "你是一个美团/大众点评/抖音本地生活的品类解析专家。请严格根据用户提供的行业分类路径（格式：分类:大类>一级赛道>二级品类>三级细分）检索对应区域的真实品牌。",
        "【硬性规则】",
        "1. 只允许返回属于该指定三级细分品类的真实品牌。若用户查询的是吃的（如小吃快餐/火锅/地方菜/粉面/炸鸡/卤味等），绝对禁止返回星巴克、瑞幸、喜茶、蜜雪冰城、霸王茶姬等咖啡/茶饮品牌！",
        "2. 反之，若查询的是咖啡/茶饮品类，也禁止返回火锅、快餐等不相关品牌。任何跨品类品牌一律剔除。",
        "3. 优先返回该区域（省/市/区）真实存在、可在美团/大众点评/抖音检索到的品牌；本地品牌优先于全国连锁。",
        "4. 结合抖音本地生活数据：若品牌上过抖音同城热销榜/热播榜/打卡榜，必须在 douyinRank 字段标明（如：\"🎵 抖音同城热销榜 Top2\" 或 \"🎵 抖音打卡榜 Top1\"）；未上榜则该字段为空字符串。",
        "【输出格式】只返回纯 JSON 对象，禁止任何多余文字、markdown 代码块或解释，格式必须完全符合：",
        "{\"brands\":[{\"brandName\":\"品牌名\",\"hotItem\":\"招牌爆品\",\"avgPrice\":\"人均价格数字\",\"rating\":\"美团/点评评分数字\",\"tag\":\"高潜/红海/蓝海/平稳\",\"douyinRank\":\"🎵 抖音同城热销榜 Top2 或空字符串\"}]}"
      ].join("\n");

      // 智谱标准 API 请求
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
        return new Response(JSON.stringify({ error: "Zhipu API Error", detail: resJson }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        });
      }

      const rawContent = resJson.choices?.[0]?.message?.content || "";

      // 安全正则提取 JSON
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedData = JSON.parse(jsonMatch[0]);
        return new Response(JSON.stringify(parsedData), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        });
      } else {
        return new Response(JSON.stringify({ error: "JSON Parse Failed", raw: rawContent }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        });
      }
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }
  }
};
