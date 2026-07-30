#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
实时联网查询代理（示例实现）
=====================================================================
前端 js/app.js 在配置了 window.APP_CONFIG.liveApiBase 后，会向该代理发起：
    GET {base}?q=<检索词>
本代理负责真正联网，把「城市 + 细分行业 + 美团/大众点评」相关的公开网络信息，
通过 搜索引擎 + LLM 解析为结构化 JSON 返回：
    {"brands":[{"brandName","hotItem","avgPrice","rating","tag"}]}

重要说明
--------
* 美团 / 大众点评 **没有官方公开 API**，也无法从纯前端直接抓取（反爬 + CORS + 密钥暴露）。
* 本代理用「通用网页搜索（SerpAPI）+ LLM 抽取」作为现实可行的替代方案：
  检索公开可见的美团/大众点评排行榜、媒体报道、榜单等，再由 LLM 抽取品牌与招牌爆品。
  返回的是「基于公开网络信息的合理结果」，并非美团内部交易数据。
* 搜索/LLM 的 API Key 仅存放在本代理的环境变量中，绝不进前端。

环境变量
--------
  LIVE_PROVIDER = "llm"（默认，推荐）或 "serpapi"
  LIVE_BASE_URL = OpenAI 兼容 Chat 端点
                  DeepSeek: https://api.deepseek.com/v1/chat/completions
                  智谱 GLM:  https://open.bigmodel.cn/api/paas/v4/chat/completions
  LIVE_API_KEY  = 你的 LLM API Key
  LIVE_MODEL    = 模型名（deepseek-chat / glm-4-plus / glm-4 等）
  SERPAPI_KEY   = （仅 serpapi 模式需要）SerpAPI Key

部署参考（见同目录 README.md）：Flask 本地运行 / Vercel / CloudStudio / 任意 Python 主机。
"""
import os
import json
import urllib.parse
import urllib.request
import urllib.error

SYSTEM_PROMPT = (
    "你是本地生活/餐饮数据提取助手。用户会给你一个检索词（含城市与细分行业），"
    "请基于可获取的公开网络信息（美团/大众点评排行榜、新闻报道、榜单等），"
    "提取该区域该行业最热门的 4-6 个品牌/商家，输出严格 JSON："
    '{"brands":[{"brandName":"品牌名","hotItem":"招牌爆品","avgPrice":人均数字,'
    '"rating":评分或热度数字,"tag":"红海|蓝海|高潜|平稳"}]}，'
    "tag 表示该赛道竞争激烈程度（红海=竞争激烈，蓝海=机会大，高潜=高增长，平稳=稳定）。"
    "只输出 JSON，不要任何解释。若信息不足，尽力推断并标注 tag=平稳。"
)


def _post_json(url, payload, headers, timeout=25):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={**headers, "Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _openai_chat(messages, web_search):
    base = os.environ["LIVE_BASE_URL"]
    key = os.environ["LIVE_API_KEY"]
    model = os.environ.get("LIVE_MODEL", "deepseek-chat")
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    if web_search:
        if "deepseek.com" in base:
            payload["tools"] = [{"type": "web_search"}]
        elif "bigmodel.cn" in base:
            payload["tools"] = [{"type": "web_search", "web_search": {"search_result": True}}]
    headers = {"Authorization": f"Bearer {key}"}
    data = _post_json(base, payload, headers)
    return data["choices"][0]["message"]["content"]


def _serpapi_snippets(q):
    key = os.environ["SERPAPI_KEY"]
    url = "https://serpapi.com/search.json?engine=google&q=" + urllib.parse.quote(q) + "&api_key=" + key
    with urllib.request.urlopen(url, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return [r.get("snippet", "") for r in data.get("organic_results", [])]


def _parse_brands(content):
    try:
        s = content.strip()
        if s.startswith("```"):
            parts = s.split("```", 2)
            s = parts[1] if len(parts) > 1 else s
        if s.startswith("json"):
            s = s[4:]
        obj = json.loads(s)
        brands = obj.get("brands", [])
        out = []
        for b in brands[:8]:
            tag = b.get("tag", "平稳")
            if tag not in ("红海", "蓝海", "高潜", "平稳"):
                tag = "平稳"
            out.append({
                "brandName": str(b.get("brandName") or b.get("name") or "未知品牌"),
                "hotItem": str(b.get("hotItem") or b.get("signboard") or ""),
                "avgPrice": float(b.get("avgPrice") or 0),
                "rating": float(b.get("rating") or 0),
                "tag": tag,
            })
        return out
    except Exception:
        return []


def search_brands(q):
    provider = os.environ.get("LIVE_PROVIDER", "llm")
    if provider == "serpapi":
        snippets = _serpapi_snippets(q)
        user = f"检索词：{q}\n网络摘要：\n" + "\n".join(snippets[:12])
        web_search = False
    else:
        user = (
            f"检索词：{q}\n请联网检索该区域该行业在美团/大众点评的热门品牌与招牌爆品，"
            f"并提取结构化结果。"
        )
        web_search = True
    content = _openai_chat(
        [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}],
        web_search,
    )
    return _parse_brands(content)


# ---------------- HTTP 入口（Flask，本地运行 / 多数 Python 主机可直接托管） ----------------
try:
    from flask import Flask, request, jsonify

    app = Flask(__name__)

    @app.route("/api/brands")
    def brands():
        q = request.args.get("q", "")
        if not q:
            return jsonify({"brands": []})
        try:
            return jsonify({"brands": search_brands(q)})
        except Exception as e:  # 任何后端错误都返回空，前端会自动降级到基准数据
            return jsonify({"brands": [], "error": str(e)})

    if __name__ == "__main__":
        app.run(port=int(os.environ.get("PORT", 5000)), host="0.0.0.0")
except ImportError:
    # 没有 Flask 也能作为库被 serverless 框架 import（自行暴露 search_brands 即可）
    pass
