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
  const locateBtn = $('#locateBtn');
  if (locateBtn) locateBtn.addEventListener('click', locateMe);
}

/* ---------------- 实时自动定位（浏览器 geolocation → Worker /geo 逆地理编码） ----------------
 * AMAP_KEY 仅存于 Worker 后端，前端把经纬度发给 /geo，由后端完成高德逆地理编码，避免 key 泄露。 */
let locateTimer = null;
function locateStatus(msg, isErr) {
  const el = $('#locateStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'locate-status' + (isErr ? ' err' : '');
  if (locateTimer) clearTimeout(locateTimer);
  if (msg) locateTimer = setTimeout(() => { el.textContent = ''; el.className = 'locate-status'; }, 6000);
}

function applyLocatedRegion(g) {
  const r = resolveRegionByNames(g.province, g.city, g.district);
  if (!r.prov) { locateStatus('🎯 定位结果不在数据库覆盖范围内', true); return; }
  state.region = { prov: r.prov, city: r.city, dist: r.dist };
  renderRegionPanel(); renderRegionEff(); maybeRender(); refreshRegionInsight(); closeRegionPanel();
  const where = [r.prov.name, r.city ? r.city.name : '', r.dist || ''].filter(Boolean).join(' · ');
  locateStatus('🎯 已定位到：' + where);
}

async function locateMe() {
  const btn = $('#locateBtn');
  if (!btn) return;
  if (!navigator.geolocation) { locateStatus('当前浏览器不支持地理定位', true); return; }
  btn.disabled = true; btn.textContent = '🎯 定位中…';
  locateStatus('🎯 正在获取定位…');
  const done = () => { btn.disabled = false; btn.textContent = '🎯 实时定位'; };
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const base = APP_CONFIG.liveApiBase;
        if (!base) throw new Error('未配置后端代理，无法逆地理编码');
        const { latitude, longitude } = pos.coords;
        const url = base.replace(/\/+$/, '') + `/geo?lat=${latitude}&lng=${longitude}`;
        const res = await fetch(url, { headers: APP_CONFIG.liveApiKey ? { 'x-api-key': APP_CONFIG.liveApiKey } : {} });
        if (!res.ok) throw new Error('逆地理编码 HTTP ' + res.status);
        const g = await res.json();
        if (g.error) throw new Error('逆地理编码失败：' + (g.info || g.error));
        applyLocatedRegion(g);
      } catch (e) {
        locateStatus('🎯 定位失败：' + (e && e.message || e), true);
      } finally { done(); }
    },
    (err) => { done(); locateStatus('🎯 定位被拒绝或失败：' + (err && err.message || ('code ' + err.code)), true); },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
  );
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
  initErrorReporting();   // 尽早挂载：捕获后续初始化过程中的异常
  bindEvents();
  initDefault();
}
