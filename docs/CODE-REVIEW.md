# 代码审查报告 · 小餐饮爆品与赛道筛选工作台

> 审查人：高级开发工程师　｜　审查日期：2026-07-31　｜　审查范围：全仓库 v2.0.0
> 审查基线：commit `0b053ad`（19 次提交、约 3000 行有效代码）

---

## 一、总体评价

先说结论：**这份代码的"业务正确性意识"明显高于同规模项目的平均水平，但"工程可持续性"几乎为零。**

具体来说——你们在对抗 LLM 幻觉这件事上做得相当扎实：假名正则、Grounding 锚定校验、客单价校验、前端兜底二次拦截、失败优雅降级，五道防线层层递进，`_meta` 里还留了 `rawCount / fakeDrop / ungroundedDrop` 做可观测性。这个设计思路是对的，很多团队做 AI 应用连一道防线都没有。

但问题也在这里：**这些防线的正确性，全靠"当时写代码的人记得住"来维持。** 19 次提交里没有一个测试文件入库，历次验证都是临时脚本跑完即删。没有 lint、没有 CI、没有类型约束。这意味着任何一次改动都在裸奔——包括本次审查发现的那个已经上线的 P0 竞态 Bug。

一句话：**你们缺的不是能力，是护栏。**

| 维度 | 评分 | 说明 |
|---|---|---|
| 业务正确性设计 | ★★★★☆ | 多层防幻觉、优雅降级、可观测字段，思路成熟 |
| 安全实践 | ★★★★☆ | 密钥全在 Cloudflare Secret、XSS 转义到位，历史无泄漏 |
| 代码可读性 | ★★★★☆ | 中文注释详尽，关键决策有"为什么"而不只是"是什么" |
| 可测试性 | ★★★☆☆ | Worker 纯函数导出干净，但前端逻辑与 DOM 强耦合 |
| **工程化护栏** | **★☆☆☆☆** | **无测试、无 lint、无 CI、无依赖管理 —— 本次重点补齐** |
| 架构可扩展性 | ★★☆☆☆ | 单文件膨胀（data.js 1601 行 / app.js 714 行）已接近维护上限 |

---

## 二、问题清单（按严重程度）

### 🔴 P0-1　异步竞态：过期响应污染当前视图【已修复】

**位置**：`js/app.js` · `refreshRegionInsight()`

**原代码**：
```js
const token = { prov: prov, l3: l3Id };
fetchLiveBrands(query).then(live => {
  if (state.region.prov !== token.prov || primaryL3() !== token.l3) return;
  box.innerHTML = regionInsightShell(ins, live ? { live } : { fallback: true });
});
```

**问题**：守卫只比对了 `prov` **对象引用**和三级行业 id。但切换「市」或「区县」时：

```js
state.region.dist = it.name;          // prov 引用没变
state.region.city = { id, name };     // prov 引用还是没变
```

`prov` 引用不变、`l3Id` 不变 → **守卫恒为真**。用户从"南山区"切到"龙华区"，如果南山区的请求返回更慢（联网检索往返 25~30 秒，快慢差异极大），**南山区的商家榜单会覆盖掉龙华区的结果**。用户看到的是张冠李戴的数据，且毫无察觉。

对一个以"真实商家数据"为核心卖点的产品，这是信任级事故——比返回假数据更隐蔽，因为数据本身是真的，只是属于错误的地方。

**附带损失**：旧请求从未被 `abort`，一直跑到 35 秒超时。博查与智谱**都是按次计费**，用户在级联选择器里点 5 次，就有 4 次是纯烧钱。

**修复**：
```js
function liveViewKey() {   // 完整视图指纹，任一维度变化都算切换
  const r = state.region;
  return [state.category, r.prov?.id ?? '-', r.city?.id ?? '-', r.dist || '-', primaryL3() || '-'].join('|');
}

const token = liveViewKey();
if (liveAbort) liveAbort.abort();      // 取消在途请求，停止空烧额度
const ctrl = new AbortController();
liveAbort = ctrl;
const settle = payload => {
  if (liveViewKey() !== token) return; // 视图已切换 → 丢弃
  ...
};
```

**回归保障**：`tests/app-race.test.js`。已验证——把守卫改回旧实现，该文件 **3 个用例立刻失败**；改回修复版全绿。这才是有效的回归测试。

---

### 🟠 P1-1　零测试覆盖，质量完全依赖人工记忆【已修复】

19 次提交、0 个测试文件入库。历次验证（检索词净化、假数据过滤、Grounding 锚定、jsdom 交互）全部写成临时文件，跑完 `rm -f` 删除。

这带来的实际后果：
- 每次改 Worker 的 Prompt 或正则，都要**重新手写一遍**验证脚本
- 没人知道上一次验证覆盖了哪些边界，重复劳动 + 覆盖遗漏
- 改动 A 打破功能 B 时，**没有任何机制会告诉你**

**已固化 43 个用例**（`npm test`，全量耗时 < 2 秒）：

| 文件 | 用例数 | 守护的契约 |
|---|---|---|
| `tests/worker-query.test.js` | 9 | 检索词净化（搜推分离）：无分类语法/无引号/无布尔/平台词不重复 |
| `tests/worker-filter.test.js` | 17 | 占位符识别、客单价校验、Grounding 锚定、全脏输入降级 |
| `tests/app-race.test.js` | 6 | 竞态守卫、请求取消、XSS 转义、前端兜底拦截 |
| `tests/data-integrity.test.js` | 11 | 158 个三级赛道逐条遍历，字段完整性 + 生成器确定性 |

其中几个用例值得特别说明，因为它们守的是**容易被"优化"掉的隐性契约**：
- *「相同输入产出稳定结果」*——洞察生成器一旦引入随机性，用户每次刷新看到的战略结论都不同，产品可信度直接归零
- *「全脏输入 → 返回空数组」*——宁可降级也绝不输出编造数据，这是产品底线
- *「空快照时全部剔除」*——没有事实来源就不允许输出任何品牌

---

### 🟠 P1-2　无依赖管理、无 Lint、无 CI【已修复】

无 `package.json` → 依赖靠口口相传；无 lint → 拼错变量名只能等线上 `ReferenceError`；无 CI → 部署靠人肉 `wrangler deploy` + `git push`，没有任何拦截点。

**已建立**：`package.json`（scripts + devDeps + engines）、`eslint.config.js`（扁平配置，规则见下）、`.github/workflows/ci.yml`（质量门禁 + 密钥泄漏扫描双 job）。

**ESLint 首次运行即抓出 5 个真实 error**，全部是未使用的 `catch (e)` 绑定。更有意思的是：我在批量修复时误把 3 处**真正使用了 `e`** 的 catch 块也改了，**ESLint 当场以 `no-undef` 拦下**——如果没有 lint，这 3 处会变成"异常处理器自己抛异常"的隐蔽故障，只在出错时才暴露。这就是护栏的价值，它连修 Bug 的人一起保护。

---

### 🟡 P2-1　单文件膨胀，逼近维护上限

| 文件 | 行数 | 体积 | 风险 |
|---|---|---|---|
| `js/data.js` | 1601 | 128 KB | 首屏全量加载，**未压缩未拆分**，移动端弱网劣化明显 |
| `js/app.js` | 714 | 36 KB | 状态、渲染、网络、格式化全混在一个 IIFE 里 |

`data.js` 里 8 大行业的数据是**互斥使用**的——用户选餐饮时，另外 7 个行业的 112 KB 纯属浪费。

**建议路径**（按性价比排序）：
1. 立刻可做：Cloudflare Pages / GitHub Pages 开启 gzip（128 KB → 约 25 KB），零改动
2. 中期：按行业大类拆成 8 个 `data.catering.js` 等，切换时动态 `import()`
3. 长期：数据下沉到 Worker 的 KV，前端只保留分类树骨架

---

### 🟡 P2-2　圈复杂度超标（5 处，已纳入 lint warning）

| 函数 | 复杂度 | 位置 |
|---|---|---|
| `genRegionInsight` | **31** | `js/data.js:1473` |
| `worker.fetch` | 20 | `cloudflare/worker.js:183` |
| `groundFilter` | 19 | `cloudflare/worker.js:139` |
| `regionInsightShell` | 18 | `js/app.js:281` |
| `fallbackStrategy` | 6 个参数 | `js/data.js:1029` |

复杂度 31 意味着这个函数有 31 条独立分支路径——**没人能在 review 时读懂它的全部行为**，改动它基本靠赌。

这些目前设为 `warning` 不阻断构建，是刻意的：一次性重构风险大于收益。但请遵守一条纪律：**下次谁改到这些函数，谁顺手拆一层**。让复杂度只降不升。

---

### 🟢 P3　做得好的地方（请保持）

这几点是加分项，明确说出来是为了避免在后续重构中被误删：

1. **密钥管理零失误**——全历史 19 次提交扫描，无任何明文密钥入库。真实 Key 只存 Cloudflare Secret，`config.js` 里还写了注释警告"前端会暴露，只能填低权限 key"。这个意识很多资深团队都没有。
2. **XSS 防护无遗漏**——25 处 `innerHTML` 拼接，来自 LLM 的所有字符串字段全部走了 `esc()`，数值字段全部 `parseFloat`，`tag` 走白名单映射。审查未发现任何遗漏点。
3. **注释写"为什么"而非"是什么"**——比如 `config.js` 里"实测智谱往返约 25~30 秒，故设为 35 秒"，`worker.js` 里"强制引号短语会让搜索引擎 0 召回"。这些是团队的**血泪知识**，价值极高。
4. **Worker 导出面干净**——`buildSearchQuery` / `groundFilter` / `snippetsToText` / `FAKE_PATTERN` 都是可独立测试的纯函数。正因如此，本次固化测试才能在半小时内完成。

---

## 三、遗留风险（本次未处理，需团队决策）

| 风险 | 说明 | 建议 |
|---|---|---|
| `innerHTML` 依赖人工调用 `esc()` | 目前 25 处全部正确，但**新增第 26 处时无任何机制提醒** | 引入 `html` 标签模板函数，默认转义，从"靠自觉"变成"默认安全" |
| 无前端错误上报 | 线上 JS 异常静默失败，用户遇到白屏你们不会知道 | 接一个轻量 `window.onerror` 上报到 Worker |
| Worker 无速率限制 | 代理地址公开，任何人可无限调用，直接消耗你们的博查/智谱额度 | Worker 层加 IP 维度限流（Cloudflare KV 计数即可） |
| 无 Worker 侧缓存 | 相同"区域+品类"重复查询会重复付费 | KV 缓存 24 小时，命中率预计 > 60%，成本立降 |

**其中「Worker 无速率限制」建议优先处理**——代理地址已经公开在前端 `config.js` 里，理论上任何人都能拿去刷你们的付费额度。

---

## 四、本次交付清单

```
新增  package.json                     依赖与脚本入口（npm run verify 一键门禁）
新增  js/package.json                  作用域声明，保持 data.js 的 CJS 调试能力
新增  eslint.config.js                 ESLint 9 扁平配置，规则均对应真实事故
新增  .github/workflows/ci.yml          质量门禁 + 密钥泄漏扫描
新增  tests/worker-query.test.js        9 例 · 检索词净化契约
新增  tests/worker-filter.test.js      17 例 · 反幻觉三重清洗
新增  tests/app-race.test.js            6 例 · 竞态 / 请求取消 / XSS
新增  tests/data-integrity.test.js     11 例 · 158 赛道数据完整性
新增  docs/CODE-REVIEW.md               本报告
新增  docs/ENGINEERING-STANDARDS.md     团队工程规范与评审清单
修改  js/app.js                        修复 P0 竞态；catch 绑定修正
修改  cloudflare/worker.js             catch 绑定清理
修改  vercel/api/brands.js             catch 绑定修正（原代码引用了未定义的 e）
修改  .gitignore                       忽略 node_modules 与测试临时文件
```

验证结果：`npm run verify` → 语法检查通过 · ESLint **0 error** · 测试 **43/43 通过**（耗时 1.5 秒）
