# Vercel Serverless 代理（备选）

与 `cloudflare/worker.js` 等价的 Vercel 版本。

## 1. 部署
把本目录（`vercel/`）作为项目根推到 GitHub，在 Vercel 导入该仓库并指定根目录为 `vercel/`；
或直接：
```bash
npm install -g vercel
cd vercel
vercel login
vercel deploy --prod
```
部署后地址形如 `https://xiaocan-proxy.vercel.app`，接口路径为 `/api/brands`。

## 2. 设置环境变量（Project Settings → Environment Variables）
- `DEEPSEEK_API_KEY`（必填）
- `SEARCH_API_KEY` / `SEARCH_PROVIDER`（可选，真正实时联网搜索，取值 serpapi 或 tavily）

密钥只存于 Vercel，不进前端或仓库。对话里贴过的旧 Key 建议吊销重发。

## 3. 回填前端
把 `https://<你的>.vercel.app/api/brands` 填进前端 `js/config.js` 的 `liveApiBase`，
push 后 GitHub Pages 即变实时。

> 注意：Vercel 免费版 Serverless 函数有调用额度与冷启动，高频使用请留意账单。
