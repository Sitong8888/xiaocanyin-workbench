/* =========================================================================
 * 爆品与赛道筛选 · 核心层 (core.js)
 *  - 全局状态 state、DOM 选择器、通用工具、XSS 转义、竞态守卫基础设施
 *  - 以经典 <script> 加载，与 data.js / 其他 js 模块共享全局词法作用域（无打包器）
 * ========================================================================= */
'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const state = {
  category: 'catering',
  region: { prov: null, city: null, dist: null },   // prov/city: {id,name}; dist: string
  A: { sel: { L1: null, L2: null, L3: null } },
  B: { sel: { L1: null, L2: null, L3: null } },
};

/* ---------------- 工具 ---------------- */
const fmt = n => (n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(Math.round(n)));
const oceanText = o => OCEAN_TEXT[o] || '—';
const oceanClass = o => OCEAN_CLASS[o] || 'o-stable';

function getSel(catId, sel) { return sel.L3 ? getAnalytics(catId, sel.L3) : null; }
function primaryL3() { return state.A.sel.L3 || state.B.sel.L3; }

/* 防 XSS：所有外部/动态文本进入 innerHTML 前必须经此函数转义（LLM 返回不可信） */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ---------------- SafeHTML：innerHTML 默认转义封装 ----------------
 * 铁律：全项目禁止直接赋值 el.innerHTML（ESLint no-restricted-syntax 强制），
 * 统一走 setHTML(el, content)：
 *   · 传普通字符串 → 默认按纯文本转义（不可能形成可执行节点）
 *   · 传 html`...` 模板 → 插值默认 esc 转义；嵌入已审计的 HTML 用 raw() 显式标记
 *   · 传 raw(s)      → 显式声明"这段是可信标记"，代码评审时一眼可见信任边界 */
function raw(s) { return { __safeHtml: true, value: String(s == null ? '' : s) }; }

function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    if (v && v.__safeHtml) out += v.value;
    else if (Array.isArray(v)) out += v.map(x => (x && x.__safeHtml) ? x.value : esc(x)).join('');
    else out += esc(v);
    out += strings[i + 1];
  }
  return { __safeHtml: true, value: out };
}

function setHTML(el, content) {
  if (!el) return;
  el.innerHTML = (content && content.__safeHtml) ? content.value : esc(content); // eslint-disable-line no-restricted-syntax
}

/* 实时后端配置：由 config.js 注入 window.APP_CONFIG；缺省为纯基准数据模式（安全基线） */
const APP_CONFIG = (window.APP_CONFIG && typeof window.APP_CONFIG === 'object') ? window.APP_CONFIG : {};
const LIVE_TIMEOUT = APP_CONFIG.liveApiTimeout || 6000;

/* ---------------- 前端错误上报（轻量，无第三方 SDK） ----------------
 * window error + unhandledrejection → 去重(同一错误只报一次) + 限量(每次会话≤10条)
 * → sendBeacon/fetch POST 到 Worker /log 端点（wrangler tail 可实时查看）。
 * 上报失败静默，绝不影响用户；未配置 liveApiBase 则完全关闭。 */
const ERR_REPORT = { max: 10, sent: 0, seen: {} };

function errReportEndpoint() {
  const base = APP_CONFIG.liveApiBase;
  if (!base) return null;
  try { return new URL(base, window.location.href).origin + '/log'; } catch { return null; }
}

function reportClientError(entry) {
  const endpoint = errReportEndpoint();
  if (!endpoint) return;
  const key = String(entry.msg || '').slice(0, 200) + '@' + (entry.src || '') + ':' + (entry.line || 0);
  if (ERR_REPORT.seen[key] || ERR_REPORT.sent >= ERR_REPORT.max) return;
  ERR_REPORT.seen[key] = true;
  ERR_REPORT.sent++;
  const body = JSON.stringify({ ...entry, page: window.location.pathname, t: Date.now() });
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(endpoint, body)) return;
  } catch { /* sendBeacon 不可用 → 降级 fetch */ }
  try {
    fetch(endpoint, { method: 'POST', body, keepalive: true }).catch(() => {});
  } catch { /* 静默：上报永不影响业务 */ }
}

function initErrorReporting() {
  if (!errReportEndpoint()) return;
  window.addEventListener('error', ev => {
    reportClientError({
      msg: String(ev.message || 'unknown error'),
      src: String(ev.filename || ''),
      line: ev.lineno || 0, col: ev.colno || 0,
      stack: ev.error && ev.error.stack ? String(ev.error.stack).slice(0, 800) : '',
    });
  });
  window.addEventListener('unhandledrejection', ev => {
    const r = ev.reason;
    reportClientError({
      msg: 'unhandledrejection: ' + (r && r.message ? r.message : String(r)).slice(0, 300),
      stack: r && r.stack ? String(r.stack).slice(0, 800) : '',
    });
  });
}

/* 视图指纹：区域(省/市/区) + 三级行业 + 行业大类 的完整标识，用于异步竞态守卫。
 * ⚠️ 历史 Bug：旧实现只比对 prov 引用与 l3Id，切换市/区县时二者均不变 → 守卫失效，
 *    慢返回的旧区域响应会覆盖新区域结果（见 tests/app-race.test.js）。 */
function liveViewKey() {
  const r = state.region;
  return [
    state.category,
    r.prov ? r.prov.id : '-',
    r.city ? r.city.id : '-',
    r.dist || '-',
    primaryL3() || '-',
  ].join('|');
}

let liveAbort = null;   // 在途请求控制器：新请求发起前主动取消旧请求，避免浪费付费额度
