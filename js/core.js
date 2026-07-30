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

/* 实时后端配置：由 config.js 注入 window.APP_CONFIG；缺省为纯基准数据模式（安全基线） */
const APP_CONFIG = (window.APP_CONFIG && typeof window.APP_CONFIG === 'object') ? window.APP_CONFIG : {};
const LIVE_TIMEOUT = APP_CONFIG.liveApiTimeout || 6000;

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
