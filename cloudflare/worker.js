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
      const query = url.searchParams.get("q") || "美团 大众点评 热门品牌 爆品";

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
            {
              role: "system",
              content: "你是一个数据抽取助手。请根据搜索结果，只返回纯 JSON 对象，格式必须完全符合：{\"brands\":[{\"brandName\":\"品牌名\",\"hotItem\":\"爆品\",\"avgPrice\":\"人均\",\"rating\":\"评分\",\"tag\":\"高潜/红海/蓝海\"}]}"
            },
            { role: "user", content: query }
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
