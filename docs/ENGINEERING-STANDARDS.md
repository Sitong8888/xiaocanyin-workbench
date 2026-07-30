# 团队工程规范（Engineering Standards）

> 资深开发工程师（Senior Developer）制定 · 2026-07-30
> 配套文档：[CODE-REVIEW.md](./CODE-REVIEW.md)（本次代码体检报告）
> 适用范围：本项目全部前端（`js/`、`index.html`、`styles.css`）、边缘函数（`cloudflare/worker.js`、`vercel/api/*`）、测试（`tests/`）

---

## 0. 为什么需要这份规范

本次体检发现一个**已上线 P0 竞态 Bug**、**零测试**、**零工程化护栏**。这些不是个人能力问题，而是缺"团队约定"。规范的目标不是束缚，而是把"高级开发者会做的事"变成**可复用的默认动作**，让团队每个成员提交代码时都自带质量门禁。

**三条铁律（不可妥协）：**
1. 任何异步数据渲染必须有竞态守卫（view key / AbortController）。
2. 任何外部 API 响应进入 UI 前必须清洗 + 转义（防 XSS + 防幻觉）。
3. 任何功能性改动必须带回归测试，`npm run verify` 全绿才能合并。

---

## 1. 本地质量门禁（每个人每次提交前必跑）

```bash
npm install            # 首次或依赖变更后（已装可跳过）
npm run verify         # = 类型/静态检查 + ESLint + 全部测试  ← 提交前唯一需要记住的命令
```

| 命令 | 作用 | 通过标准 |
|------|------|----------|
| `npm run lint` | ESLint 9 扁平配置静态检查 | **0 error**（warning 允许，但应在 PR 里说明） |
| `npm run test` | Node 内置 `node --test` 回归套件 | **0 fail** |
| `npm run check` | Worker/API 语法与契约快速校验 | 退出码 0 |
| `npm run verify` | 以上三件套串联 | 全绿 |

> CI 已配置（` .github/workflows/ci.yml`）：`quality-gate` + `secret-scan` 双 job，PR 合并前必须全绿，且自动扫描密钥泄漏（`sk-` / `cfat-` / `ghp-` / `AKIA` 等）。

---

## 2. 代码审查清单（Code Review Checklist）

每个 PR 需逐条核对，审查人勾选后才能 approve。

### 2.1 异步与竞态（最高优先级）
- [ ] **竞态守卫**：切换筛选条件（市/区/行业）后，旧的慢响应不会覆盖当前视图。
  - 正确做法：`liveViewKey()` 用完整上下文（`大类|省|市|区|三级行业`）做指纹比对；或用 `AbortController` 取消在途请求。
  - 反例：用对象引用 `prov !== currentProv` 比对——引用相等在异步拼接场景下会失效（本次 P0 Bug 根因）。
- [ ] **请求取消**：付费/外部 API 调用在条件变化时 `ctrl.abort()`，避免空烧额度（博查/智谱）。
- [ ] **外部响应不信任**：所有从 Worker/API 拿到的文本进入 `innerHTML` 前必须 `escapeHtml()`。

### 2.2 错误处理
- [ ] **禁止空 `catch`**：`catch (e) {}` 吞错会掩盖线上故障。需要吞错时必须记日志（`console.error` / 上报）。
- [ ] **命名绑定一致**：catch 块若引用错误对象，统一用 `catch (err)` 且只用 `err.message`，禁止裸 `e`。
- [ ] **降级路径明确**：外部 API 失败时前端必须有兜底（占位符拦截 / 本地基准模型），不能白屏。

### 2.3 安全（XSS / 注入 / 密钥）
- [ ] **转义**：动态 HTML 一律走 `escapeHtml()`；能用 `textContent` 就不用 `innerHTML`。
- [ ] **清洗**：外部搜索快照里的店铺名/地址必须出现在原文中（Grounding 事实锚定），否则视为幻觉丢弃。
- [ ] **密钥**：API Key 仅在 `cloudflare/vercel` 服务端环境变量，前端 jar 不得出现；提交前 CI 会扫泄漏。

### 2.4 可维护性
- [ ] **单文件规模**：`app.js` 超过 ~700 行应考虑拆分（渲染 / 数据 / 交互 分层）。本次已临界，列为 P2 技术债。
- [ ] **函数复杂度**：单函数圈复杂度 ≤ 15（`eslint complexity` 已设阈）；超标必须重构或加 `// eslint-disable` 并说明理由。
- [ ] **参数数量**：单函数参数 ≤ 5（`max-params` 已设阈）；超出用配置对象。
- [ ] **魔法字符串**：分类 ID、平台名等提取为常量。

### 2.5 测试
- [ ] **契约测试**：检索词净化（无分类语法/引号/布尔/省前缀丢弃）、反幻觉清洗、行政区划映射必有断言。
- [ ] **竞态测试**：必须有一个用例覆盖"旧响应迟到不应覆盖新视图"。
- [ ] **回归有效性**：修复 Bug 后，先故意回退到坏实现确认测试变红，再还原——证明测试真能抓 Bug。

---

## 3. 命名与风格约定

| 维度 | 约定 |
|------|------|
| 变量 | `camelCase`，布尔加 `is/has/can` 前缀（`liveAbort`, `isLoading`） |
| 函数 | 动词开头（`fetchLiveBrands`, `escapeHtml`, `buildSearchQuery`） |
| 常量 | `UPPER_SNAKE`（`FAKE_PATTERN`, `BOCHA_ENDPOINT`） |
| 全局状态 | 集中放 `state` 对象，禁止散落全局 `var` |
| 异步 | `async/await` 优先；回调仅限必要场景 |
| 比较 | 强制 `===` / `!==`（`eqeqeq` 已启用） |
| 模块 | 前端 `js/` 为 `script`（挂全局），`cloudflare/vercel/tests` 为 ESM `module` |

---

## 4. 关键反模式 → 正确模式（来自本次真实案例）

### 4.1 竞态（P0）
```js
// ❌ 旧实现：对象引用比对，切换市/区时 prov 变了但 l3 没变，守卫失效
if (prov !== currentProv) return;

// ✅ 新实现：完整视图指纹 + AbortController
const token = liveViewKey();              // 大类|省|市|区|三级行业
if (liveAbort) liveAbort.abort();
const ctrl = new AbortController();
liveAbort = ctrl;
fetchLiveBrands(query, ctrl).then(live => { if (liveViewKey() !== token) return; /* ... */ });
```

### 4.2 空 catch（P1）
```js
// ❌ catch (e) {}  // 吞错，线上静默失败
// ✅ catch (err) { console.error('region insight failed', err.message); }
```

### 4.3 信任外部 LLM 输出（P1）
```js
// ❌ 直接把智谱返回的店铺名塞进 innerHTML
// ✅ 店名必须能在搜索快照原文中找到（Grounding）；找不到则丢弃该条
const ok = snippetsToText(snippets).includes(brandName);
```

### 4.4 搜推分离（架构级）
- 检索词 = **干净自然语言**（剔除分类路径/引号/布尔/省前缀），只送搜索引擎。
- 分类路径 = **仅作 LLM 的结构化提取约束**，不污染检索词。
- 原因：分类语法会让博查/Google 检索质量崩坏，且浪费 token。

---

## 5. 测试编写约定

- 框架：Node 内置 `node --test`（无需额外 runner）。
- 前端 DOM 测试：`jsdom` 注入；**`data.js` + `app.js` 必须在同一次 `window.eval` 执行**（const 不挂 window，分开 eval 会找不到依赖）。
- 断言风格：`node:assert` 的 `assert.ok / strictEqual / deepStrictEqual`。
- 文件命名：`tests/<模块>-<关注点>.test.js`。
- 覆盖率目标：核心纯函数（净化/清洗/映射）100%；交互流程关键路径覆盖。

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// 前端测试辅助：一次性 eval 两个脚本，保证 const 作用域连通
function boot(responder) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
  const code = readFileSync('js/data.js') + '\n' + readFileSync('js/app.js');
  dom.window.eval(code);
  return dom.window;
}
```

---

## 6. 能力提升路径（团队成长建议）

> 不是一次审查就结束。把"质量门禁"变成肌肉记忆，分三阶段：

### 阶段一：守门（已部分完成）
- [x] 建立 `npm run verify` 强制门禁
- [x] CI 双 job 拦截
- [ ] **每位成员本地 pre-commit hook 跑 `npm run verify`**（建议加 husky / simple-git-hooks）
- [ ] 每周Review会过一遍本周 PR 的"竞态/空catch/XSS"三类问题

### 阶段二：习惯内化
- [ ] 新功能 TDD：先写失败的契约测试，再写实现
- [ ] 每个 Bug 附带"回归测试 + 回退验证记录"
- [ ] 重构 `app.js` 分层（P2 技术债），降到 400 行内

### 阶段三：工程卓越
- [ ] Worker 速率限制 + KV 缓存（防刷爆付费 API）
- [ ] 前端错误上报（线上 `window.onerror` → 日志服务）
- [ ] `innerHTML` 默认转义封装（统一 `safeHTML()` 入口，杜绝裸拼接）
- [ ] 性能预算：首屏 < 1.5s，动画 60fps

---

## 7. 速查：本次新增的可复用资产

| 资产 | 路径 | 用途 |
|------|------|------|
| 竞态守卫 | `js/app.js` → `liveViewKey()` / `liveAbort` | 复制即用 |
| 转义工具 | `js/app.js` → `escapeHtml()` | 所有动态 HTML 入口 |
| 检索词净化 | `cloudflare/worker.js` → `buildSearchQuery` | 测试见 `tests/worker-query.test.js` |
| 反幻觉清洗 | `cloudflare/worker.js` → `groundFilter` / `FAKE_PATTERN` | 测试见 `tests/worker-filter.test.js` |
| 测试辅助 | `tests/app-race.test.js` → `boot()` | jsdom 前端测试范式 |
| 门禁配置 | `eslint.config.js` / `.github/workflows/ci.yml` | 直接复用到新项目 |

---

*最后更新：2026-07-30 · 由资深开发工程师基于真实代码体检产出。任何条款有争议，以 PR 讨论结论为准并更新本文档。*
