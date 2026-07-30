/* =========================================================================
 * 爆品与赛道筛选 · 入口 (app.js)
 *  - 仅负责在 DOM 就绪后启动应用；全部逻辑已分层到：
 *      core.js（状态/基建）· live.js（实时联网）· render.js（看板/图表）
 *      insight.js（区域洞察/战略空位/抽屉）· interactions.js（交互/编排）
 *  - 加载顺序见 index.html：config → data → core → live → render → insight → interactions → app
 * ========================================================================= */
'use strict';

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
