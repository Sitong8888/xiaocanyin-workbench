/* =============================================================================
 * 小餐饮爆品与赛道筛选工作台 —— 交互逻辑与图表渲染
 * 依赖：data.js (INDUSTRY_TREE / CATEGORY_ANALYTICS / 工具函数)
 * 新增：④ 战略空位分析面板（顾均辉空位表模型）+ 双赛道空位对比
 * ========================================================================== */

const OCEAN_TEXT = { blue: '蓝海', potential: '高潜', red: '红海', stable: '平稳' };
const OCEAN_CLASS = { blue: 'tag-blue', potential: 'tag-potential', red: 'tag-red', stable: 'tag-stable' };
const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

/* 空位类型 -> 颜色/图标映射（人群/价格/场景/特性 空位） */
const GAP_CLASS = {
  '人群空位': 'gap-people',
  '价格空位': 'gap-price',
  '场景空位': 'gap-scene',
  '特性空位': 'gap-feature',
};
const GAP_ICON = { '人群空位': '👥', '价格空位': '💰', '场景空位': '🕒', '特性空位': '✨' };

const state = {
  A: { sel: { L1: null, L2: null, L3: null } },
  B: { sel: { L1: null, L2: null, L3: null } },
};
let stratFocus = 'A'; // 战略面板当前聚焦：A / B / C(对比)

/* ---------- 级联筛选组件 ---------- */
function renderCascader(group) {
  const panel = document.querySelector(`[data-panel="${group}"]`);
  const sel = state[group].sel;
  panel.innerHTML = '';

  const levels = [1, 2, 3];
  const labels = { 1: '一级赛道', 2: '二级品类', 3: '三级细分' };
  levels.forEach(lv => {
    const col = document.createElement('div');
    col.className = 'casc-col';
    const lbl = document.createElement('div');
    lbl.className = 'col-label';
    lbl.textContent = labels[lv];
    col.appendChild(lbl);

    const parentId = lv === 1 ? null : sel['L' + (lv - 1)];
    const nodes = lv === 1 ? getChildren(null) : (parentId ? getChildren(parentId) : []);

    if (!nodes.length && lv > 1) {
      const empty = document.createElement('div');
      empty.className = 'col-label';
      empty.style.color = '#c0c4cc';
      empty.textContent = '—';
      col.appendChild(empty);
    }
    nodes.forEach(n => {
      const b = document.createElement('button');
      const ocean = getAnalytics(n.id).ocean;
      b.className = 'casc-item' + (lv === 3 ? ' leaf' : '') + (sel['L' + lv] === n.id ? ' active' : '');
      b.innerHTML = `${n.name}` + (lv === 3 ? `<span class="mini">${OCEAN_TEXT[ocean]}</span>` : '');
      b.onclick = () => {
        // 选择某级 -> 清空其下级
        state[group].sel['L' + lv] = n.id;
        for (let k = lv + 1; k <= 3; k++) state[group].sel['L' + k] = null;
        renderCascader(group);
        updatePath(group);
        maybeRender();
      };
      col.appendChild(b);
    });
    panel.appendChild(col);
  });
}

function updatePath(group) {
  const el = document.querySelector(`[data-path="${group}"]`);
  const sel = state[group].sel;
  const names = [sel.L1, sel.L2, sel.L3].filter(Boolean).map(id => getNode(id).name);
  if (!names.length) { el.innerHTML = '未选择'; return; }
  const oceanHtml = sel.L3 ? ` <span class="tag ${OCEAN_CLASS[getAnalytics(sel.L3).ocean]}">${OCEAN_TEXT[getAnalytics(sel.L3).ocean]}</span>` : '';
  el.innerHTML = names.map((n, i) => i === names.length - 1 ? `<b>${n}</b>` : n).join(' <span style="color:#c0c4cc">/</span> ') + oceanHtml;
}

/* ---------- 看板渲染 ---------- */
function maybeRender() {
  const a = state.A.sel.L3, b = state.B.sel.L3;
  const empty = document.getElementById('emptyState');
  const dash = document.getElementById('dashboard');
  const drill = document.getElementById('drillBtn');

  if (a && b) {
    empty.hidden = true; dash.hidden = false; drill.hidden = false;
    renderKPI(a, b);
    renderRadar(a, b);
    renderMatrix(a, b);
    renderLine(a, b);
  } else if (a || b) {
    empty.hidden = true; dash.hidden = false; drill.hidden = true;
    const only = a || b;
    renderKPI(only, null);
    renderRadar(only, null);
    renderMatrix(only, null);
    renderLine(only, null);
  } else {
    empty.hidden = false; dash.hidden = true;
  }
  renderStrategy(); // ④ 战略空位分析面板
}

function fmt(v) { return v.toLocaleString('zh-CN'); }

function renderKPI(aId, bId) {
  const wrap = document.getElementById('kpiSwiper');
  wrap.innerHTML = '';
  const cards = [];

  function build(id, cls) {
    const d = getAnalytics(id);
    const path = getPath(id);
    const head = `<span class="kpi-name">${path[path.length-1].name}</span>`;
    cards.push(`
      <div class="kpi-card">
        <div class="kpi-top">${head} <span class="tag ${OCEAN_CLASS[d.ocean]}">${OCEAN_TEXT[d.ocean]}</span></div>
        <div class="kpi-val">${fmt(d.marketSize)}<small> 亿元</small></div>
        <div class="kpi-sub">市场规模</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top"><span class="kpi-name">同比增长</span></div>
        <div class="kpi-val ${d.growth >= 0 ? 'up' : 'down'}">${d.growth >= 0 ? '+' : ''}${d.growth}<small>%</small></div>
        <div class="kpi-sub">${d.growth >= 15 ? '高增长赛道' : d.growth < 8 ? '增长乏力' : '平稳增长'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top"><span class="kpi-name">渗透率</span></div>
        <div class="kpi-val">${Math.round(d.penetration * 100)}<small>%</small></div>
        <div class="kpi-sub">目标人群覆盖</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top"><span class="kpi-name">客单价</span></div>
        <div class="kpi-val">¥${d.avgPrice}</div>
        <div class="kpi-sub">竞争烈度 ${Math.round(d.competition * 100)}%</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top"><span class="kpi-name">复购率</span></div>
        <div class="kpi-val">${Math.round(d.repurchase * 100)}<small>%</small></div>
        <div class="kpi-sub">复购越高越稳</div>
      </div>`);
  }
  if (aId) build(aId, 'a');
  if (bId) build(bId, 'b');
  wrap.innerHTML = cards.join('');
}

/* ---------- 雷达图 (SVG) ---------- */
function renderRadar(aId, bId) {
  const svg = document.getElementById('radarChart');
  const cx = 160, cy = 150, R = 100;
  const dims = [
    { key: 'marketSize',  label: '市场规模', norm: v => v / GLOBAL_MAX.marketSize * 100 },
    { key: 'growth',      label: '增长率',   norm: v => (v + 5) / 40 * 100 },
    { key: 'competition', label: '竞争度',   norm: v => v * 100 },
    { key: 'penetration', label: '渗透率',   norm: v => v * 100 },
    { key: 'avgPrice',    label: '客单价',   norm: v => v / GLOBAL_MAX.avgPrice * 100 },
    { key: 'repurchase',  label: '复购率',   norm: v => v * 100 },
  ];
  const n = dims.length;
  const ang = i => (-Math.PI / 2) + i * (2 * Math.PI / n);
  const pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];

  let s = '';
  [0.25, 0.5, 0.75, 1].forEach(g => {
    const poly = dims.map((_, i) => pt(i, R * g).join(',')).join(' ');
    s += `<polygon points="${poly}" fill="none" stroke="#e7eaf1" stroke-width="1"/>`;
  });
  dims.forEach((d, i) => {
    const [x, y] = pt(i, R);
    s += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e7eaf1"/>`;
    const [lx, ly] = pt(i, R + 18);
    const anchor = Math.abs(lx - cx) < 6 ? 'middle' : (lx > cx ? 'start' : 'end');
    s += `<text x="${lx}" y="${ly + 4}" font-size="10" fill="#6b7280" text-anchor="${anchor}">${d.label}</text>`;
  });
  function poly(id, stroke, fill) {
    if (!id) return '';
    const d = getAnalytics(id);
    const pts = dims.map((dim, i) => pt(i, R * Math.max(0.05, dim.norm(d[dim.key]) / 100)).join(',')).join(' ');
    return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
  }
  if (bId) s += poly(bId, '#ff7a45', 'rgba(255,122,69,.18)');
  if (aId) s += poly(aId, '#2f6bff', 'rgba(47,107,255,.20)');
  function dots(id, color) {
    if (!id) return '';
    const d = getAnalytics(id);
    return dims.map((dim, i) => {
      const [x, y] = pt(i, R * Math.max(0.05, dim.norm(d[dim.key]) / 100));
      return `<circle cx="${x}" cy="${y}" r="2.5" fill="${color}"/>`;
    }).join('');
  }
  if (bId) s += dots(bId, '#ff7a45');
  if (aId) s += dots(aId, '#2f6bff');
  svg.innerHTML = s;
}

/* ---------- 双向交叉矩阵 ---------- */
function renderMatrix(aId, bId) {
  const box = document.getElementById('matrixBox');
  const rows = [
    { label: '市场规模', get: d => d.marketSize, fmt: v => fmt(v) + '亿', max: GLOBAL_MAX.marketSize },
    { label: '同比增长', get: d => d.growth,    fmt: v => (v >= 0 ? '+' : '') + v + '%', max: 35 },
    { label: '竞争烈度', get: d => d.competition * 100, fmt: v => Math.round(v) + '%', max: 100 },
    { label: '渗透率',   get: d => d.penetration * 100, fmt: v => Math.round(v) + '%', max: 100 },
    { label: '客单价',   get: d => d.avgPrice,  fmt: v => '¥' + v, max: GLOBAL_MAX.avgPrice },
    { label: '复购率',   get: d => d.repurchase * 100, fmt: v => Math.round(v) + '%', max: 100 },
  ];
  let html = '';
  rows.forEach(r => {
    const a = aId ? r.get(getAnalytics(aId)) : 0;
    const b = bId ? r.get(getAnalytics(bId)) : 0;
    const aW = aId ? Math.max(4, (a / r.max) * 100) : 0;
    const bW = bId ? Math.max(4, (b / r.max) * 100) : 0;
    html += `<div class="m-row">
      <div class="m-head"><span>${r.label}</span><span>${aId ? r.fmt(a) : '-'}${bId ? ' / ' + r.fmt(b) : ''}</span></div>
      <div class="m-bars">
        ${aId ? `<div class="m-bar a" style="width:${aW}%"></div>` : ''}
        ${bId ? `<div class="m-bar b" style="width:${bW}%"></div>` : ''}
      </div>
    </div>`;
  });
  box.innerHTML = html;
}

/* ---------- 趋势折线图 (SVG) ---------- */
function renderLine(aId, bId) {
  const svg = document.getElementById('lineChart');
  const W = 640, H = 280, padL = 40, padR = 16, padT = 16, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xAt = i => padL + (i / 11) * plotW;

  const allVals = [];
  if (aId) allVals.push(...getAnalytics(aId).trend);
  if (bId) allVals.push(...getAnalytics(bId).trend);
  const maxV = Math.max(1, ...allVals) * 1.1;
  const yAt = v => padT + plotH - (v / maxV) * plotH;

  let s = '';
  for (let g = 0; g <= 4; g++) {
    const v = maxV * g / 4;
    const y = yAt(v);
    s += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#eef1f6"/>`;
    s += `<text x="${padL - 6}" y="${y + 4}" font-size="9" fill="#9aa3b2" text-anchor="end">${Math.round(v)}</text>`;
  }
  MONTHS.forEach((m, i) => {
    if (i % 2 === 0) s += `<text x="${xAt(i)}" y="${H - 10}" font-size="9" fill="#9aa3b2" text-anchor="middle">${m}</text>`;
  });
  function line(id, color) {
    const t = getAnalytics(id).trend;
    const pts = t.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ');
    const area = `${padL},${yAt(0)} ` + pts + ` ${xAt(11)},${yAt(0)}`;
    let out = `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>`;
    out += t.map((v, i) => `<circle cx="${xAt(i)}" cy="${yAt(v)}" r="2.5" fill="${color}"/>`).join('');
    return out;
  }
  if (bId) s += line(bId, '#ff7a45');
  if (aId) s += line(aId, '#2f6bff');
  svg.innerHTML = s;
}

/* ---------- ④ 战略空位分析面板（顾均辉空位表模型） ---------- */
function renderStrategy() {
  const panel = document.getElementById('strategyPanel');
  const a = state.A.sel.L3, b = state.B.sel.L3;
  if (!a && !b) { panel.hidden = true; return; }
  panel.hidden = false;

  // 若当前焦点不可用（如只剩单赛道却停在「对比」），回退
  if (stratFocus === 'C' && !(a && b)) stratFocus = a ? 'A' : 'B';
  if (stratFocus === 'B' && !b) stratFocus = 'A';
  if (stratFocus === 'A' && !a) stratFocus = b ? 'B' : 'A';

  // 切换标签
  const tabs = document.getElementById('stratTabs');
  tabs.innerHTML = '';
  const opts = [];
  if (a) opts.push({ k: 'A', label: '主分析对象' });
  if (b) opts.push({ k: 'B', label: '对比分析对象' });
  if (a && b) opts.push({ k: 'C', label: '双赛道对比' });
  opts.forEach(o => {
    const btn = document.createElement('button');
    btn.className = 'strat-tab' + (stratFocus === o.k ? ' active' : '');
    btn.textContent = o.label;
    btn.onclick = () => { stratFocus = o.k; renderStrategy(); };
    tabs.appendChild(btn);
  });

  const single = document.getElementById('stratSingle');
  const compare = document.getElementById('stratCompare');
  if (stratFocus === 'C' && a && b) {
    single.hidden = true; compare.hidden = false;
    renderStrategyCompare(a, b);
  } else {
    compare.hidden = true; single.hidden = false;
    const id = (stratFocus === 'B' && b) ? b : a;
    renderStrategySingle(id);
  }
}

function gapTagHtml(gapType) {
  return `<span class="gap-tag ${GAP_CLASS[gapType] || ''}">${GAP_ICON[gapType] || ''} ${gapType}</span>`;
}

function renderStrategySingle(id) {
  const d = getAnalytics(id);
  const s = d.strategy;
  const path = getPath(id).map(p => p.name).join(' / ');
  const competitors = s.competitors.map(c => `
    <div class="comp-item">
      <div class="comp-name">${c.name}</div>
      <div class="comp-mind">占据心智：${c.mind}</div>
    </div>`).join('');
  const pains = s.painPoints.map(p => `<li>${p}</li>`).join('');
  const weaks = s.weaknesses.map(w => `<li>${w}</li>`).join('');

  document.getElementById('stratSingle').innerHTML = `
    <div class="strat-track">${path} <span class="tag ${OCEAN_CLASS[d.ocean]}">${OCEAN_TEXT[d.ocean]}</span></div>
    <div class="strat-grid">
      <div class="strat-block">
        <div class="sb-title"><span class="sb-ic">🥊</span>核心竞争对手及占据心智</div>
        <div class="comp-list">${competitors}</div>
      </div>
      <div class="strat-block">
        <div class="sb-title"><span class="sb-ic">😣</span>客户未被满足的痛点 / 需求</div>
        <ul class="pain-list">${pains}</ul>
      </div>
      <div class="strat-block">
        <div class="sb-title"><span class="sb-ic">⚠️</span>竞品的固有弱点</div>
        <ul class="weak-list">${weaks}</ul>
      </div>
      <div class="strat-block strat-conclude">
        <div class="sb-title"><span class="sb-ic">🎯</span>战略空位与切入点（核心结论）</div>
        <div class="gap-tags">${gapTagHtml(s.gapType)}</div>
        <div class="gap-text">${s.gap}</div>
      </div>
    </div>`;
}

function renderStrategyCompare(a, b) {
  const da = getAnalytics(a), db = getAnalytics(b);
  const sa = da.strategy, sb = db.strategy;
  const sameType = sa.gapType === sb.gapType;
  const insight = sameType
    ? `两者均瞄准【${sa.gapType}】，定位正面交锋——需比拼供应链与执行力，建议避开同商圈直接竞争。`
    : `A 主攻【${sa.gapType}】、B 主攻【${sb.gapType}】，定位错位、可互补共存，适合作为组合观察或差异化切入。`;

  function col(id, d, s) {
    const pains = s.painPoints.map(p => `<li>${p}</li>`).join('');
    const weaks = s.weaknesses.map(w => `<li>${w}</li>`).join('');
    const comps = s.competitors.map(c => `<div class="comp-mini"><b>${c.name}</b> · ${c.mind}</div>`).join('');
    return `<div class="cmp-col">
      <div class="cmp-head"><span>${getPath(id).map(p => p.name).join('/')}</span>
        <span class="tag ${OCEAN_CLASS[d.ocean]}">${OCEAN_TEXT[d.ocean]}</span></div>
      <div class="cmp-sub">🥊 对手心智</div>
      <div class="cmp-comps">${comps}</div>
      <div class="cmp-sub">😣 痛点</div>
      <ul class="pain-list sm">${pains}</ul>
      <div class="cmp-sub">⚠️ 弱点</div>
      <ul class="weak-list sm">${weaks}</ul>
      <div class="cmp-sub">🎯 空位</div>
      <div class="gap-tags">${gapTagHtml(s.gapType)}</div>
      <div class="gap-text sm">${s.gap}</div>
    </div>`;
  }
  document.getElementById('stratCompare').innerHTML = `
    <div class="cmp-grid">${col(a, da, sa)}${col(b, db, sb)}</div>
    <div class="cmp-insight">💡 <b>差异洞察：</b>${insight}</div>`;
}

/* ---------- 下钻抽屉（品牌 + 商品全景） ---------- */
function openDrawer() {
  const a = state.A.sel.L3, b = state.B.sel.L3;
  const ids = [a, b].filter(Boolean);
  const title = document.getElementById('drawerTitle');
  const body = document.getElementById('drawerBody');
  title.textContent = '品牌与商品全景图';

  let html = '';
  ids.forEach((id, idx) => {
    const d = getAnalytics(id);
    const path = getPath(id).map(p => p.name).join(' / ');
    const color = idx === 0 ? 'var(--a)' : 'var(--b)';
    let brands = d.topBrands.sort((x, y) => y.share - x.share).map(br => `
      <div class="brand-row">
        <div class="brand-name">${br.name}</div>
        <div class="brand-track"><div class="brand-fill" style="width:${br.share}%"></div></div>
        <div class="brand-share">${br.share}%</div>
      </div>`).join('');
    let prods = d.products.map(p => `
      <div class="prod-card">
        <div class="p-name">${p.name}</div>
        <div class="p-meta"><span class="p-price">¥${p.price}</span><span class="p-tag">${p.tag}</span></div>
        <div class="p-heat"><i style="width:${p.heat}%"></i></div>
      </div>`).join('');
    html += `
      <div class="drill-group">
        <h4><span class="pip" style="background:${color}"></span>${path}
          <span class="tag ${OCEAN_CLASS[d.ocean]}" style="margin-left:auto">${OCEAN_TEXT[d.ocean]}</span></h4>
        <div style="font-size:11px;color:var(--ink-2);margin-bottom:8px">
          市场规模 ${fmt(d.marketSize)} 亿 · 同比 +${d.growth}% · 客单价 ¥${d.avgPrice} · 复购 ${Math.round(d.repurchase*100)}%
        </div>
        <div style="font-size:12px;font-weight:700;margin:8px 0 4px">TOP 品牌市占</div>
        ${brands}
        <div style="font-size:12px;font-weight:700;margin:12px 0 4px">商品全景（${d.products.length}）</div>
        <div class="prod-grid">${prods}</div>
        <div class="heat-legend">热度条：绿色越长代表该商品综合热度越高</div>
      </div>`;
    if (idx < ids.length - 1) html += `<div style="height:1px;background:var(--line);margin:6px 0"></div>`;
  });
  body.innerHTML = html;
  document.getElementById('drawerMask').hidden = false;
  document.getElementById('drawer').hidden = false;
}
function closeDrawer() {
  document.getElementById('drawerMask').hidden = true;
  document.getElementById('drawer').hidden = true;
}

/* ---------- 事件绑定 ---------- */
document.querySelectorAll('.btn-pick').forEach(btn => {
  btn.onclick = () => {
    const g = btn.dataset.group;
    const panel = document.querySelector(`[data-panel="${g}"]`);
    const willShow = panel.hidden;
    document.querySelectorAll('.cascader-panel').forEach(p => p.hidden = true);
    if (willShow) { renderCascader(g); panel.hidden = false; btn.textContent = '收起 ▴'; }
    else { panel.hidden = true; btn.textContent = '选择行业 ▾'; }
  };
});
document.getElementById('drillBtn').onclick = openDrawer;
document.getElementById('drawerClose').onclick = closeDrawer;
document.getElementById('drawerMask').onclick = closeDrawer;

// 初始化：默认各选一个示例，方便进入即见效果
(function initDefault() {
  // A: 鲜果茶 / B: 螺蛳粉（均红海，便于演示空位对比）
  state.A.sel = { L1: 'L1_1', L2: 'L2_1_1', L3: 'L3_1_1_1' };
  state.B.sel = { L1: 'L1_2', L2: 'L2_2_2', L3: 'L3_2_2_2' };
  updatePath('A'); updatePath('B');
  maybeRender();
})();
