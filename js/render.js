/* =========================================================================
 * 爆品与赛道筛选 · 视图层（看板 / 图表）(render.js)
 *  - 行业大类下拉、A/B 三级级联、KPI / 雷达 / 矩阵 / 趋势 渲染、看板编排
 * ========================================================================= */
'use strict';

/* ---------------- 渲染：行业大类下拉 ---------------- */
function renderCategorySelect() {
  const sel = $('#catSelect');
  sel.innerHTML = '';
  CATEGORIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.icon}  ${c.name}`;
    sel.appendChild(opt);
  });
  sel.value = state.category;
  sel.onchange = () => setCategory(sel.value);
}

function gapChip(t) { return `<span class="gap-tag ${'gt-' + GAP_TYPES.indexOf(t)}">${GAP_ICON[t] || ''} ${t}</span>`; }

/* ---------------- 渲染：行业级联（A / B） ---------------- */
function renderCascader(group) {
  const panel = $(`.cascader-panel[data-panel="${group}"]`);
  const sel = state[group].sel;
  panel.innerHTML = '';
  const mk = (nodes, lv) => {
    const col = document.createElement('div');
    col.className = 'casc-col';
    nodes.forEach(n => {
      const b = document.createElement('button');
      const isLeaf = lv === 3;
      const ocean = isLeaf ? getAnalytics(state.category, n.id).ocean : null;
      b.className = 'casc-item' + (isLeaf ? ' leaf' : '') + (sel['L' + lv] === n.id ? ' active' : '');
      b.innerHTML = n.name + (isLeaf ? `<span class="mini ${oceanClass(ocean)}">${oceanText(ocean)}</span>` : '');
      b.onclick = () => {
        sel['L' + lv] = n.id;
        for (let k = lv + 1; k <= 3; k++) sel['L' + k] = null;
        renderCascader(group);
        updatePath(group);
        maybeRender();
        refreshRegionInsight();
        if (isLeaf) { panel.classList.remove('open'); const btn = $(`.btn-pick[data-group="${group}"]`); if (btn) btn.textContent = '选择行业 ▾'; }
      };
      col.appendChild(b);
    });
    return col;
  };
  panel.appendChild(mk(getChildren(state.category, null), 1));
  if (sel.L1) panel.appendChild(mk(getChildren(state.category, sel.L1), 2));
  if (sel.L2) panel.appendChild(mk(getChildren(state.category, sel.L2), 3));
}

function updatePath(group) {
  const sel = state[group].sel;
  const path = sel.L3 ? getPath(state.category, sel.L3) : [];
  const target = $(`#path-${group}`);
  if (!target) return;
  if (!sel.L3) { target.innerHTML = '<span class="ph">未选择</span>'; return; }
  const ocean = getAnalytics(state.category, sel.L3).ocean;
  target.innerHTML = path.map((n, i) => `<span class="pseg ${i === 2 ? oceanClass(ocean) : ''}">${n.name}</span>`).join('<span class="arr">›</span>') +
    `<span class="mini ${oceanClass(ocean)}">${oceanText(ocean)}</span>`;
}

/* ---------------- 渲染：看板 ---------------- */
function maybeRender() {
  const aRaw = getSel(state.category, state.A.sel);
  const bRaw = getSel(state.category, state.B.sel);
  const prov = state.region.prov ? state.region.prov.id : null;
  const a = aRaw ? applyRegion(aRaw, prov) : null;
  const b = bRaw ? applyRegion(bRaw, prov) : null;

  const empty = $('#emptyState');
  const dash = $('#dashboard');
  const drill = $('#drillBtn');

  try {
    if (a && b) {
      empty.hidden = true; dash.hidden = false; drill.hidden = false;
      renderKPI(a, b); renderRadar(a, b); renderMatrix(a, b); renderLine(a, b);
    } else if (a || b) {
      empty.hidden = true; dash.hidden = false; drill.hidden = true;
      const only = a || b;
      renderKPI(only, null); renderRadar(only, null); renderMatrix(only, null); renderLine(only, null);
    } else {
      empty.hidden = false; dash.hidden = true;
    }
  } catch (err) {
    console.error('render error', err);
  }
  renderStrategy(a, b);
}

function renderKPI(a, b) {
  const wrap = $('#kpiWrap');
  wrap.innerHTML = '';
  const cards = [];
  const pair = (label, va, vb, unit, suffix) => {
    cards.push({ label, a: va, b: vb, unit, suffix: suffix || '' });
  };
  pair('市场规模', a.marketSize, b ? b.marketSize : null, '亿元');
  pair('同比增长', a.growth, b ? b.growth : null, '%', '');
  pair('渗透率', a.penetration, b ? b.penetration : null, '%');
  pair('客单价', a.price, b ? b.price : null, '元');
  pair('复购率', a.repurchase, b ? b.repurchase : null, '%');

  cards.forEach(c => {
    const el = document.createElement('div');
    el.className = 'kpi-card' + (state.region.prov && c.label === '市场规模' ? ' region-on' : '');
    let html = `<div class="kpi-label">${c.label}${state.region.prov && c.label === '市场规模' ? `<span class="kpi-region">×${a.regionMod}</span>` : ''}</div>`;
    html += `<div class="kpi-val">${fmt(c.a)}<span class="kpi-unit">${c.unit}</span></div>`;
    if (c.b != null) {
      html += `<div class="kpi-b">对比 B：<b>${fmt(c.b)}</b>${c.unit} <span class="kpi-delta ${c.b > c.a ? 'down' : 'up'}">${c.b > c.a ? '▼' : '▲'}${Math.abs(Math.round((c.b - c.a) / (c.a || 1) * 100))}%</span></div>`;
    } else {
      html += `<div class="kpi-b muted">（仅主对象）</div>`;
    }
    el.innerHTML = html;
    wrap.appendChild(el);
  });
}

/* 雷达图：6 维度 A/B 对比（0-1 归一） */
function renderRadar(a, b) {
  const wrap = $('#radarWrap');
  const dims = [
    { k: 'marketSize', label: '市场规模', max: Math.max(a.marketSize, b ? b.marketSize : 0) || 1 },
    { k: 'growth', label: '同比增长', max: Math.max(a.growth, b ? b.growth : 0, 1) },
    { k: 'penetration', label: '渗透率', max: Math.max(a.penetration, b ? b.penetration : 0, 1) },
    { k: 'price', label: '客单价', max: Math.max(a.price, b ? b.price : 0) || 1 },
    { k: 'repurchase', label: '复购率', max: Math.max(a.repurchase, b ? b.repurchase : 0, 1) },
    { k: 'comp', label: '竞争宽松', max: 1 },
  ];
  const valOf = (o, d) => d.k === 'comp' ? (1 - o.competition) : o[d.k];
  const N = dims.length, R = 92, cx = 130, cy = 118;
  const pt = (i, r) => [cx + r * Math.cos(-Math.PI / 2 + i * 2 * Math.PI / N), cy + r * Math.sin(-Math.PI / 2 + i * 2 * Math.PI / N)];
  let svg = `<svg viewBox="0 0 260 236" class="chart">`;
  [0.25, 0.5, 0.75, 1].forEach(g => {
    svg += `<polygon points="${dims.map((_, i) => pt(i, R * g).join(',')).join(' ')}" fill="none" stroke="#eee"/>`;
  });
  dims.forEach((d, i) => {
    const [x, y] = pt(i, R);
    svg += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#eee"/>`;
    const [lx, ly] = pt(i, R + 16);
    svg += `<text x="${lx}" y="${ly}" font-size="10" fill="#888" text-anchor="middle">${d.label}</text>`;
  });
  const poly = (o, color, fill) => {
    const pts = dims.map((d, i) => pt(i, R * Math.max(0.04, valOf(o, d) / d.max)).join(','));
    return `<polygon points="${pts}" fill="${fill}" stroke="${color}" stroke-width="2"/>` +
           dims.map((d, i) => { const [x, y] = pt(i, R * Math.max(0.04, valOf(o, d) / d.max)); return `<circle cx="${x}" cy="${y}" r="2.5" fill="${color}"/>`; }).join('');
  };
  if (b) svg += poly(b, '#ff7a59', 'rgba(255,122,89,.15)');
  svg += poly(a, '#3b82f6', 'rgba(59,130,246,.18)');
  svg += `</svg>`;
  const legend = `<div class="legend"><span class="lg lg-a">● 主对象 A</span>${b ? '<span class="lg lg-b">● 对比 B</span>' : ''}</div>`;
  wrap.innerHTML = svg + legend;
}

/* 双向交叉矩阵：维度 × (A/B) 对比条 */
function renderMatrix(a, b) {
  const wrap = $('#matrixWrap');
  const rows = [
    { label: '市场规模', av: a.marketSize, bv: b ? b.marketSize : 0, unit: '亿' },
    { label: '同比增长', av: a.growth, bv: b ? b.growth : 0, unit: '%' },
    { label: '渗透率', av: a.penetration, bv: b ? b.penetration : 0, unit: '%' },
    { label: '客单价', av: a.price, bv: b ? b.price : 0, unit: '元' },
    { label: '复购率', av: a.repurchase, bv: b ? b.repurchase : 0, unit: '%' },
    { label: '竞争烈度', av: a.competition * 100, bv: b ? b.competition * 100 : 0, unit: '', invert: true },
  ];
  let html = '<div class="matrix">';
  rows.forEach(r => {
    const max = Math.max(r.av, r.bv, 1);
    const aw = (r.av / max * 100).toFixed(1), bw = (r.bv / max * 100).toFixed(1);
    html += `<div class="m-row"><div class="m-label">${r.label}</div>`;
    html += `<div class="m-bar a"><span style="width:${aw}%"></span><i>${r.invert ? Math.round(r.av) + '%' : fmt(r.av) + r.unit}</i></div>`;
    if (b) html += `<div class="m-bar b"><span style="width:${bw}%"></span><i>${r.invert ? Math.round(r.bv) + '%' : fmt(r.bv) + r.unit}</i></div>`;
    html += `</div>`;
  });
  html += '</div>';
  wrap.innerHTML = html;
}

/* 趋势折线：近 12 个月 A/B */
function renderLine(a, b) {
  const wrap = $('#lineWrap');
  const data = b ? [a, b] : [a];
  const W = 280, H = 150, pad = 22;
  let max = 0, min = Infinity;
  data.forEach(o => o.trend.forEach(v => { max = Math.max(max, v); min = Math.min(min, v); }));
  max = max || 1; min = min === Infinity ? 0 : min;
  const colors = ['#3b82f6', '#ff7a59'];
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="chart">`;
  svg += `<line x1="${pad}" y1="${H - pad}" x2="${W - 6}" y2="${H - pad}" stroke="#ddd"/>`;
  svg += `<text x="2" y="${H - pad + 4}" font-size="9" fill="#aaa">${fmt(min)}</text>`;
  svg += `<text x="2" y="${pad - 6}" font-size="9" fill="#aaa">${fmt(max)}</text>`;
  data.forEach((o, di) => {
    const pts = o.trend.map((v, i) => {
      const x = pad + (W - pad - 6) * i / 11;
      const y = (H - pad) - (H - pad - pad) * (v - min) / (max - min || 1);
      return [x, y];
    });
    svg += `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${colors[di]}" stroke-width="2"/>`;
    pts.forEach(p => { svg += `<circle cx="${p[0]}" cy="${p[1]}" r="2" fill="${colors[di]}"/>`; });
  });
  svg += '</svg>';
  const legend = `<div class="legend"><span class="lg lg-a">● 主对象(近12月)</span>${b ? '<span class="lg lg-b">● 对比 B</span>' : ''}</div>` +
    `<div class="line-note">单位：亿元/月 · ${state.region.prov ? '已按区域系数 ×' + a.regionMod + ' 调整' : '全国基准'}</div>`;
  wrap.innerHTML = svg + legend;
}
