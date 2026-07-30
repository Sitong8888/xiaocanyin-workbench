# Cloudflare Worker 代理（推荐 · 免费）

把「小餐饮爆品工作台」的【TOP 品牌 / 爆品】从基准数据升级为 **DeepSeek 实时生成**的结构化数据。

## 1. 安装并登录 Wrangler
```bash
npm install -g wrangler
wrangler login          # 浏览器登录你的 Cloudflare 账号
```

## 2. 部署
在本目录（`cloudflare/`）执行：
```bash
npx wrangler deploy
```
部署成功后会输出类似：
```
https://xiaocan-proxy.<你的子域>.workers.dev
```

## 3. 设置密钥（仅存于 Cloudflare，不进前端/仓库）
```bash
npx wrangler secret put DEEPSEEK_API_KEY
# 粘贴你的 DeepSeek Key，例如：sk-xxxx
```
> 在对话里贴过的旧 Key 建议到 DeepSeek 后台吊销并重发，防止泄露。

可选（真正实时联网搜索，数据更真实）：
```bash
npx wrangler secret put SEARCH_API_KEY      # 你的 SerpAPI 或 Tavily Key
npx wrangler secret put SEARCH_PROVIDER      # 填 serpapi 或 tavily
```

## 4. 自测
```bash
curl "https://xiaocan-proxy.<你的子域>.workers.dev/?q=北京 朝阳区 火锅 美团 大众点评 热门品牌 招牌爆品 排行榜"
```
应返回 `{"region":...,"query":...,"source":"...","brands":[...]}`。

## 5. 回填前端
把上一步的 Worker 地址（如 `https://xiaocan-proxy.<子域>.workers.dev`）填进
前端 `js/config.js` 的 `liveApiBase`，push 后 GitHub Pages 即变实时。

---

### 数据流
浏览器(Pages) → `?q=` → Cloudflare Worker → DeepSeek API（或 + 搜索 API）→ 结构化 JSON → 前端渲染
（前端带 Loading 态与失败降级：代理不可达 / 超时 → 自动回退基准数据，绝不白屏）
