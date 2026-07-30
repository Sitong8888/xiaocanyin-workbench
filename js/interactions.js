/* =========================================================================
 * 爆品与赛道筛选 · 交互与编排层 (interactions.js)
 *  - 切换行业大类、绑定事件、初始化默认值、启动应用
 * ========================================================================= */
'use strict';

function setCategory(catId) {
  if (!catId || state.category === catId) return;
  state.category = catId;
  const l3s = Object.values(TREES[catId].L3);
  const setTo = (grp, idx) => {
    const node = l3s[idx] || l3s[0];
    if (!node) return;
    const path = getPath(catId, node.id);
    grp.sel.L1 = path[0] ? path[0].id : null;
    grp.sel.L2 = path[1] ? path[1].id : null;
    grp.sel.L3 = node.id;
  };
  setTo(state.A, 0);
  setTo(state.B, Math.min(1, l3s.length - 1));
  $$('.cascader-panel').forEach(p => p.classList.remove('open'));
  $$('.btn-pick').forEach(btn => { if (btn.dataset.group) btn.textContent = '选择行业 ▾'; });
  ['A', 'B'].forEach(g => { renderCascader(g); updatePath(g); });
  renderRegionEff();
  maybeRender();
  refreshRegionInsight();
}

/* ---------------- 事件绑定 ---------------- */
function bindEvents() {
  $$('.btn-pick').forEach(btn => {
    if (btn.dataset.group) {
      btn.addEventListener('click', () => {
        const g = btn.dataset.group;
        const panel = $(`.cascader-panel[data-panel="${g}"]`);
        const willShow = !panel.classList.contains('open');
        $$('.cascader-panel').forEach(p => p.classList.remove('open'));
        if (willShow) { renderCascader(g); panel.classList.add('open'); btn.textContent = '收起 ▴'; }
        else { btn.textContent = '选择行业 ▾'; }
      });
    }
  });
  $('#regionPick').addEventListener('click', () => {
    const panel = $('#regionPanel');
    const willShow = !panel.classList.contains('open');
    if (willShow) { renderRegionPanel(); panel.classList.add('open'); $('#regionPick').textContent = '收起 ▴'; }
    else { panel.classList.remove('open'); $('#regionPick').textContent = '选择区域 ▾'; }
  });
  $('#drillBtn').addEventListener('click', openDrawer);
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#drawerMask').addEventListener('click', closeDrawer);
}

/* ---------------- 初始化 ---------------- */
function initDefault() {
  const setTo = (grp, name) => {
    const id = findL3Id(state.category, name);
    if (!id) return;
    const path = getPath(state.category, id);
    grp.sel.L1 = path[0].id; grp.sel.L2 = path[1].id; grp.sel.L3 = id;
  };
  setTo(state.A, '鲜果茶');
  setTo(state.B, '螺蛳粉');
  renderCategorySelect();
  renderRegionEff();
  ['A', 'B'].forEach(g => { renderCascader(g); updatePath(g); });
  maybeRender();
  refreshRegionInsight();
}

function boot() {
  bindEvents();
  initDefault();
}
