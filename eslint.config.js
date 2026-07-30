/* =========================================================================
 * ESLint 扁平配置 (ESLint 9+)
 * ---------------------------------------------------------------------------
 * 规则取舍原则：只保留「能拦住真实线上事故」的规则，不做风格洁癖。
 * 每条 error 级规则背后都对应过一次真实 Bug 或一类高危写法。
 * ========================================================================= */

// 浏览器/运行时全局（显式声明，避免引入 globals 依赖）
const RUNTIME_GLOBALS = {
  window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly',
  console: 'readonly', fetch: 'readonly', Request: 'readonly', Response: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  AbortController: 'readonly', Event: 'readonly', CustomEvent: 'readonly', URL: 'readonly',
  URLSearchParams: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly',
  requestAnimationFrame: 'readonly', IntersectionObserver: 'readonly', localStorage: 'readonly',
};

// data.js / config.js 通过 <script> 暴露给 app.js 的跨文件全局
const APP_GLOBALS = {
  APP_CONFIG: 'readonly',
  CATEGORIES: 'readonly', TREES: 'readonly', ANALYTICS: 'readonly', CHINA: 'readonly',
  REGION_PROFILE: 'readonly', OCEAN_TEXT: 'readonly', OCEAN_CLASS: 'readonly',
  GAP_TYPES: 'readonly', GAP_ICON: 'readonly',
  getTree: 'readonly', getNode: 'readonly', getChildren: 'readonly', getAnalytics: 'readonly',
  getPath: 'readonly', findL3Id: 'readonly', getRegionProf: 'readonly', applyRegion: 'readonly',
  getProvinces: 'readonly', getCities: 'readonly', getDistricts: 'readonly',
  genRegionInsight: 'readonly', regionNameOf: 'readonly',
  module: 'writable', require: 'readonly', process: 'readonly',
};

/** 通用质量规则：全项目一致 */
const CORE_RULES = {
  // —— 正确性（error：合并前必须清零）——
  'no-undef': 'error',                                  // 拼错的变量名 = 线上 ReferenceError
  'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
  'no-implicit-globals': 'off',
  'eqeqeq': ['error', 'smart'],                         // == 的隐式转换是脏数据的温床
  'no-fallthrough': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-duplicate-case': 'error',
  'no-unsafe-negation': 'error',
  'no-cond-assign': ['error', 'except-parens'],
  'no-self-compare': 'error',
  'no-unreachable': 'error',
  'valid-typeof': 'error',
  'use-isnan': 'error',

  // —— 异步安全（本项目踩过竞态坑，从严）——
  'require-atomic-updates': 'error',                    // 异步间隙写共享状态 → 竞态
  'no-async-promise-executor': 'error',
  'no-await-in-loop': 'warn',                           // 串行 await 通常是性能问题

  // —— 安全 ——
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',

  // —— 可维护性（warn：不阻断，但需要在评审中被看见）——
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  'no-debugger': 'error',
  'complexity': ['warn', 15],                           // 圈复杂度 >15 必须拆函数
  'max-depth': ['warn', 4],
  'max-params': ['warn', 5],
  'prefer-const': 'warn',
  'no-var': 'warn',
};

export default [
  { ignores: ['node_modules/**', '.wrangler/**', '.vercel/**', '.workbuddy/**', '**/*.min.js'] },

  // 前端脚本：<script> 直接加载，非模块作用域
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...RUNTIME_GLOBALS, ...APP_GLOBALS },
    },
    rules: CORE_RULES,
  },

  // 边缘/无服务端函数与测试：ESM
  {
    files: ['cloudflare/**/*.js', 'vercel/**/*.js', 'tests/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...RUNTIME_GLOBALS, process: 'readonly', globalThis: 'readonly' },
    },
    rules: CORE_RULES,
  },
];
