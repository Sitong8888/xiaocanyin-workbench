/* =========================================================================
 * 实时联网查询配置 (config.js)
 *  - 默认 liveApiBase 为空：前端使用 data.js 基准数据，不发起任何联网请求（安全）。
 *  - 部署后端代理（见仓库 proxy/ 目录示例）并填入 liveApiBase 后，
 *    【TOP 品牌 / 爆品】将实时联网抓取美团 / 大众点评公开数据，并带 Loading 与失败降级。
 *  - 注意：此文件会被打包进公开的前端，liveApiKey 会暴露给浏览器，
 *    仅建议填写「一次性 / 低权限 / 可随时吊销」的代理鉴权 key，真正的搜索/LLM key
 *    必须只存放在后端代理的环境变量里（切勿写入前端）。
 * ========================================================================= */
window.APP_CONFIG = {
  // 你的后端代理地址（Cloudflare Worker 或 Vercel，详见仓库 cloudflare/ 与 vercel/ 目录）。
  // 留空（""）则前端使用基准数据，不联网（安全默认）。
  // —— 部署后端代理后，把得到的地址填到下面（例如）：
  //      Cloudflare: "https://xiaocan-proxy.<你的子域>.workers.dev"
  //      Vercel:     "https://<你的>.vercel.app/api/brands"
  // 地址末尾带不带 "/api/brands" 均可，前端会自动拼接 ?q=。
  // ✅ 已部署 Cloudflare Worker（2026-07-31 升级为智谱 GLM-4.7-Flash + 联网搜索）：
  liveApiBase: "https://xiaocan-proxy.wubin877342196.workers.dev",

  // 可选：若你的代理需要简单鉴权（建议用一次性/低权限 key）
  liveApiKey: "",

  // 请求超时（毫秒）：实测智谱「联网检索+抽取」往返约 25~30 秒，故设为 35 秒，
  // 确保前端在 Worker 返回前不会过早中断降级为基准数据（fetchLiveBrands 读取此值）。
  liveApiTimeout: 35000,
};
