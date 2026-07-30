# 实时联网查询代理（部署说明）

前端 `js/app.js` 在配置了 `window.APP_CONFIG.liveApiBase` 后，会向本代理发起：

```
GET {liveApiBase}?q=<检索词>
```

代理联网检索「城市 + 细分行业 + 美团/大众点评」公开信息，返回：

```json
{ "brands": [ { "brandName", "hotItem", "avgPrice", "rating", "tag" } ] }
```

前端据此渲染 TOP 品牌/爆品卡片，带 Loading 态；若代理不可用/超时/解析失败，自动降级为 `data.js` 基准数据。

> ⚠️ 说明：美团/大众点评**没有官方公开 API**，也无法从纯前端直接抓取。这里用「通用网页搜索 + LLM 抽取」作为现实可行的替代——检索公开可见的排行榜/媒体/榜单，再抽取品牌与招牌爆品。**这是基于公开网络信息的合理结果，并非美团内部交易数据。**

## 1. 准备 API Key

二选一（或组合）：

- **LLM 模式（推荐）**：DeepSeek（`https://api.deepseek.com/v1/chat/completions`，model `deepseek-chat`）或 智谱 GLM（`https://open.bigmodel.cn/api/paas/v4/chat/completions`，model `glm-4-plus`）。DeepSeek/智谱均支持联网搜索工具，可直接产出实时结果。
- **SerpAPI 模式**：`https://serpapi.com` 的 Key，先搜网页摘要，再用上面的 LLM 抽取。

## 2. 配置环境变量

```bash
export LIVE_PROVIDER=llm
export LIVE_BASE_URL=https://api.deepseek.com/v1/chat/completions
export LIVE_API_KEY=sk-你的key
export LIVE_MODEL=deepseek-chat
# serpapi 模式额外需要：
# export SERPAPI_KEY=你的serpapi_key
```

## 3. 本地运行（验证用）

```bash
pip install flask
python server.py
# 另开终端测试：
curl "http://localhost:5000/api/brands?q=浙江 绍兴 诸暨 鲜果茶 美团 大众点评 热门品牌 招牌爆品 排行榜"
```

## 4. 部署到可公网访问的地址

GitHub Pages 是纯静态、**不能**跑后端，因此代理需单独部署到任意支持 Python 的主机：

- **Vercel / CloudStudio / 阿里云函数 / 腾讯云函数**：将本目录作为 Python 服务部署，`/api/brands` 为入口（Flask 已就绪；各平台按官方方式指向 `server.py` 的 Flask `app`）。
- **自有服务器/VPS**：`gunicorn server:app` 或 `python server.py` 后用 Nginx 反向代理。

部署完成后得到一个公网 URL，例如 `https://your-proxy.xyz/api/brands`。

## 5. 让前端启用实时查询

编辑前端 `js/config.js`，填入你的代理地址：

```js
window.APP_CONFIG = {
  liveApiBase: "https://your-proxy.xyz/api/brands",
  liveApiKey: "",          // 若代理需简单鉴权（建议一次性/低权限 key）
  liveApiTimeout: 6000,
};
```

提交并 push 到 GitHub 后，Pages 站点即变为实时联网模式：切换【省/市/区县】或【三级行业】会显示「正在实时抓取…」，返回后渲染真实品牌/爆品；失败则自动降级。

> 安全：代理的 `LIVE_API_KEY` 只存在于后端环境变量，**不要**写进前端 `config.js`。前端 `liveApiKey` 若填写，请用可随时吊销的代理鉴权 key。
