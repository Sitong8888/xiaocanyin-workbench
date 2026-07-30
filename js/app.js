/* =========================================================================
 * 爆品与赛道筛选 · 交互逻辑 (app.js)
 *  - 行业大类 Tab 切换（切换即重置 A/B 到该大类）
 *  - 区域级联选择器（省 → 市 → 区/县），数据按区域系数定制
 *  - 主/对比分析对象三级联动、KPI 横滑、雷达/矩阵/趋势对比
 *  - 顾均辉战略空位面板 + 双赛道空位对比
 *  - 下钻抽屉（品牌/爆品 + 区域标签）
 * ========================================================================= */
(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const state = {
    category: 'catering',
    region: { prov: null, city: null, dist: null },
    A: { sel: { L1: null, L2: null, L3: null } },
    B: { sel: { L1: null, L2: null, L3: null } },
  };

  /* ---------------- 工具 ---------------- */
  const fmt = n => (n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(Math.round(n)));
  const oceanText = o => OCEAN_TEXT[o] || '—';
  const oceanClass = o => OCEAN_CLASS[o] || 'o-stable';

  function getSel(catId, sel) { return sel.L3 ? getAnalytics(catId, sel.L3) : null; }

  /* ---------------- 渲染：行业大类 Tab ---------------- */
  function renderCategoryTabs() {
    const wrap = $('#catTabs');
    wrap.innerHTML = '';
    CATEGORIES.forEach(c => {
      const b = document.createElement('button');
      b.className = 'cat-tab' + (c.id === state.category ? ' active' : '');
      b.innerHTML = `<span class="cat-ic">${c.icon}</span>${c.name}`;
      b.onclick = () => {
        if (state.category === c.id) return;
        state.category = c.id;
        // 切换到该大类第一个/第二个三级行业，保证联动有效
        const l3s = Object.values(TREES[c.id].L3);
        const setTo = (grp, idx) => {
          const node = l3s[idx] || l3s[0];
          if (!node) return;
          const path = getPath(c.id, node.id);
          grp.sel.L1 = path[0] ? path[0].id : null;
          grp.sel.L2 = path[1] ? path[1].id : null;
          grp.sel.L3 = node.id;
        };
        setTo(state.A, 0);
        setTo(state.B, Math.min(1, l3s.length - 1));
        renderCategoryTabs();
        $$('.cascader-panel').forEach(p => { p.classList.remove('open'); });
        $$('.btn-pick').forEach(btn => { if (btn.dataset.group) btn.textContent = '选择行业 ▾'; });
        ['A', 'B'].forEach(g => { renderCascader(g); updatePath(g); });
        renderRegionEff();
        maybeRender();
      };
      wrap.appendChild(b);
    });
  }

  /* ---------------- 渲染：区域级联 ---------------- */
  function renderRegionPanel() {
    const panel = $('#regionPanel');
    panel.innerHTML = '';
    const mk = (items, onPick, activeId, cls) => {
      const col = document.createElement('div');
      col.className = 'casc-col ' + (cls || '');
      items.forEach(it => {
        const b = document.createElement('button');
        b.className = 'casc-item' + (it.id === activeId ? ' active' : '');
        b.textContent = it.name;
        b.onclick = () => onPick(it);
        col.appendChild(b);
      });
      return col;
    };
    const provs = Object.keys(REGIONS).map(id => ({ id, name: REGIONS[id].name }));
    panel.appendChild(mk(provs, it => {
      state.region = { prov: it.id, city: null, dist: null };
      renderRegionPanel(); renderRegionEff(); maybeRender();
    }, state.region.prov));

    if (state.region.prov) {
      const cities = Object.keys(REGIONS[state.region.prov].cities)
        .map(id => ({ id, name: REGIONS[state.region.prov].cities[id].name }));
      panel.appendChild(mk(cities, it => {
        state.region.city = it.id; state.region.dist = null;
        renderRegionPanel(); renderRegionEff(); maybeRender();
      }, state.region.city));
    }
    if (state.region.prov && state.region.city) {
      const dists = Object.keys(REGIONS[state.region.prov].cities[state.region.city].districts)
        .map(id => ({ id, name: REGIONS[state.region.prov].cities[state.region.city].districts[id] }));
      panel.appendChild(mk(dists, it => {
        state.region.dist = it.id;
        renderRegionPanel(); renderRegionEff(); maybeRender(); closeRegionPanel();
      }, state.region.dist));
    }
    // 清除按钮
    const clear = document.createElement('button');
    clear.className = 'region-clear';
    clear.textContent = '清除区域';
    clear.onclick = () => {
      state.region = { prov: null, city: null, dist: null };
      renderRegionPanel(); renderRegionEff(); maybeRender();
    };
    panel.appendChild(clear);
  }

  function regionLabel() {
    const r = state.region;
    if (!r.prov) return null;
    const pv = REGIONS[r.prov].name;
    const ct = r.city ? REGIONS[r.prov].cities[r.city].name : '';
    const ds = (r.city && r.dist) ? REGIONS[r.prov].cities[r.city].districts[r.dist] : '';
    return [pv, ct, ds].filter(Boolean).join(' · ');
  }

  function renderRegionEff() {
    const banner = $('#regionBanner');
    const label = regionLabel();
    if (!label) {
      banner.className = 'region-banner empty';
      banner.innerHTML = '📍 未选择区域 · 当前显示<b>全国基准</b>数据（点击「选择区域」查看定制化市场规模 / 热度 / 爆品标签）';
      return;
    }
    const p = getRegionProf(state.region.prov);
    banner.className = 'region-banner';
    banner.innerHTML =
      `<div class="rb-main">📍 <b>${label}</b></div>` +
      `<div class="rb-tags">` +
        `<span class="rb-chip">区域系数 ×${p.sizeMod}</span>` +
        `<span class="rb-chip heat-${p.heat}">热度：${p.heat}</span>` +
        p.tags.map(t => `<span class="rb-chip tag">#${t}</span>`).join('') +
      `</div>`;
  }

  function closeRegionPanel() { $('#regionPanel').classList.remove('open'); $('#regionPick').textContent = '选择区域 ▾'; }

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
    const head = $(`.cascader-head[data-group="${group}"] .path-label`) ||
                 $(`.cascader-head[data-group="${group}"]`);
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
    const prov = state.region.prov;
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
    } catch (e) {
      console.error('render error', e);
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
    // 网格
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
    // 轴
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

  /* ---------------- 战略空位面板（顾均辉空位表） ---------------- */
  function gapChip(t) { return `<span class="gap-tag ${'gt-' + GAP_TYPES.indexOf(t)}">${GAP_ICON[t] || ''} ${t}</span>`; }

  function strategyBlock(catId, l3Id, role) {
    if (!l3Id) return '';
    const ana = getAnalytics(catId, l3Id);
    const s = ana.strategy;
    const path = getPath(catId, l3Id).map(n => n.name).join(' / ');
    const regionNote = state.region.prov
      ? `<div class="strat-region">📍 区域提示：在 <b>${regionLabel()}</b> 切入「${s.gapType}」空位，可叠加标签 ${getRegionProf(state.region.prov).tags.map(t => '#' + t).join(' ')}</div>`
      : '';
    return `
      <div class="strat-head"><span class="badge ${role === 'A' ? 'badge-a' : 'badge-b'}">${role === 'A' ? '主对象 A' : '对比 B'}</span> ${path}
        ${gapChip(s.gapType)}</div>
      <div class="strat-grid">
        <div class="strat-cell"><div class="sc-t">🥊 核心竞争对手 / 占据心智</div><div class="sc-b">${s.competitors.map(c => `<div class="comp"><b>${c.name}</b>：${c.mind}</div>`).join('')}</div></div>
        <div class="strat-cell"><div class="sc-t">😣 客户未被满足的痛点</div><div class="sc-b">${s.painPoints.map(p => `<div class="pain">• ${p}</div>`).join('')}</div></div>
        <div class="strat-cell"><div class="sc-t">⚠️ 竞品固有弱点</div><div class="sc-b">${s.weaknesses.map(w => `<div class="weak">• ${w}</div>`).join('')}</div></div>
      </div>
      <div class="strat-gap">🎯 战略空位与切入点（核心结论）<div class="sg-text">${s.gap}</div></div>
      ${regionNote}`;
  }

  function renderStrategy(a, b) {
    const tabs = $('#stratTabs');
    const single = $('#stratSingle');
    const compare = $('#stratCompare');
    const aId = state.A.sel.L3, bId = state.B.sel.L3;
    const cat = state.category;
    const canCompare = !!(aId && bId);

    if (!aId && !bId) {
      tabs.hidden = true; single.hidden = false; compare.hidden = false;
      single.innerHTML = '<div class="ph">请选择分析对象以查看战略空位分析</div>';
      compare.innerHTML = '';
      return;
    }
    tabs.hidden = false;
    // 默认 tab：A、B 都选中时默认进入对比，否则单对象
    let cur = (tabs.dataset.tab) || (canCompare ? 'compare' : 'single');
    if (cur === 'compare' && !canCompare) cur = 'single'; // 仅单对象时不显示对比
    tabs.innerHTML = '';
    const mkTab = (key, label) => {
      const t = document.createElement('button');
      t.className = 'strat-tab' + (cur === key ? ' active' : '');
      t.textContent = label;
      t.onclick = () => { tabs.dataset.tab = key; renderStrategy(a, b); };
      return t;
    };
    if (aId) tabs.appendChild(mkTab('single', '主分析对象'));
    if (canCompare) tabs.appendChild(mkTab('compare', '双赛道空位对比'));

    if (cur === 'compare' && canCompare) {
      single.hidden = true; compare.hidden = false;
      compare.innerHTML = `<div class="cmp-grid">` +
        `<div class="cmp-col">${strategyBlock(cat, aId, 'A')}</div>` +
        `<div class="cmp-col">${strategyBlock(cat, bId, 'B')}</div>` +
        `</div>` + diffInsight(cat, aId, bId);
    } else {
      single.hidden = false; compare.hidden = true;
      single.innerHTML = strategyBlock(cat, aId || bId, aId ? 'A' : 'B');
    }
  }

  function diffInsight(catId, aId, bId) {
    const sa = getAnalytics(catId, aId), sb = getAnalytics(catId, bId);
    if (!sa || !sb) return '';
    const gapA = sa.strategy.gapType, gapB = sb.strategy.gapType;
    let txt;
    if (gapA === gapB) {
      txt = `⚔️ 双方同属「${gapA}」——正面交锋，建议错开商圈/客群或其中一个改打相邻空位，避免贴身价格战。`;
    } else {
      txt = `🤝 双方空位类型不同（A：${gapA} / B：${gapB}）——可错位互补、共存共生，适合同场域组合打法。`;
    }
    return `<div class="diff-insight">${txt}</div>`;
  }

  /* ---------------- 下钻抽屉 ---------------- */
  function primarySel() { return state.A.sel.L3 ? 'A' : (state.B.sel.L3 ? 'B' : null); }

  function openDrawer() {
    const g = primarySel(); if (!g) return;
    const cat = state.category;
    const l3Id = state[g].sel.L3;
    const raw = getAnalytics(cat, l3Id);
    const ana = applyRegion(raw, state.region.prov);
    const path = getPath(cat, l3Id).map(n => n.name).join(' / ');
    const ocean = raw.ocean;
    const regionChip = state.region.prov
      ? `<div class="drawer-region">📍 ${regionLabel()} ｜ 区域系数 ×${ana.regionMod} ｜ 热度：${ana.regionHeat}${ana.regionTags.map(t => ` ｜ #${t}`).join('')}</div>` : '';
    const brands = ana.topBrands.map(br => `
      <div class="prod">
        <div class="prod-top"><span class="prod-name">${br.name}</span><span class="prod-share">市占 ${br.share}%</span></div>
        <div class="prod-bar"><span style="width:${br.share * 2.6}%"></span></div>
        <div class="prod-tags">${state.region.prov ? ana.regionTags.slice(0, 2).map(t => `<i class="ptag">#${t}</i>`).join('') : '<i class="ptag">全国基准</i>'}</div>
      </div>`).join('');
    $('#drawerBody').innerHTML = `
      <div class="drawer-title">${path} <span class="mini ${oceanClass(ocean)}">${oceanText(ocean)}</span></div>
      ${regionChip}
      <div class="drawer-sub">🏆 代表品牌 / 爆品（按市占）</div>
      ${brands}
      <div class="drawer-sub">👥 人群画像</div>
      <div class="drawer-persona">${ana.persona}</div>
      <div class="drawer-sub">🎯 战略空位</div>
      <div class="drawer-gap">${ana.strategy.gap} ${gapChip(ana.strategy.gapType)}</div>`;
    $('#drawerMask').classList.add('show');
    $('#drawer').classList.add('show');
  }
  function closeDrawer() {
    $('#drawerMask').classList.remove('show');
    $('#drawer').classList.remove('show');
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
      else { panel.classList.remove('open'); $('#regionPick').textContent = '选择行业 ▾'; }
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
    renderCategoryTabs();
    renderRegionEff();
    ['A', 'B'].forEach(g => { renderCascader(g); updatePath(g); });
    maybeRender();
  }

  function boot() {
    bindEvents();
    initDefault();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
