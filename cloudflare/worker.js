export default {
  async fetch(request, env) {
    // 1. 设置跨域 Header
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // 2. 处理 OPTIONS 预检请求
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders, status: 200 });
    }

    try {
      const apiKey = env.ZHIPU_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "ZHIPU_API_KEY not configured" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        });
      }

      // 获取前端参数
      const url = new URL(request.url);
      const query = url.searchParams.get("q") || "美团 大众点评 热门品牌 爆品";

      // 智谱 API 逻辑：支持的多模型 fallback 顺序
      const modelsToTry = ["glm-4.5-air", "glm-4.7-flash", "glm-4-flash"];
      let lastError = null;
      let resultData = null;
      for (const modelName of modelsToTry) {
        try {
          const response = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: modelName,
              messages: [
                {
                  role: "system",
                  content: "你是一个餐饮与商业赛道分析专家。请根据用户的查询词，检索该区域美团/大众点评热门品牌与爆品。请只输出合法的 JSON 格式数据，格式必须包含：{\"brands\": [{\"brandName\":\"...\", \"hotItem\":\"...\", \"avgPrice\":\"...\", \"rating\":\"...\", \"tag\":\"红海/蓝海/高潜\"}]}"
                },
                { role: "user", content: query }
              ],
              tools: [{ type: "web_search", web_search: { enable: true } }],
              response_format: { type: "json_object" }
            })
          });

          if (response.ok) {
            const resJson = await response.json();
            const content = resJson.choices?.[0]?.message?.content;
            if (content) {
              resultData = JSON.parse(content);
              break; // 成功拿到数据，跳出循环
            }
          } else {
            lastError = await response.text();
          }
        } catch (err) {
          lastError = err.message;
        }
      }

      if (resultData) {
        return new Response(JSON.stringify(resultData), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        });
      } else {
        return new Response(JSON.stringify({ error: "Failed to fetch from Zhipu", detail: lastError }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        });
      }
    } catch (globalErr) {
      return new Response(JSON.stringify({ error: globalErr.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }
  }
};
