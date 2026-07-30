/* =========================================================================
 * 爆品与赛道筛选 · 视图层（区域洞察 / 战略空位 / 抽屉）(insight.js)
 *  - 区域级联面板、区域动态洞察（联网实时）、顾均辉战略空位面板、下钻抽屉
 * ========================================================================= */
'use strict';

/* ---------------- 渲染：区域级联 ---------------- */
function renderRegionPanel() {
  const panel = $('#regionPanel');
  setHTML(panel, '');
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
  // 省级
  panel.appendChild(mk(getProvinces(), it => {
    state.region = { prov: { id: it.id, name: it.name }, city: null, dist: null };
    renderRegionPanel(); renderRegionEff(); maybeRender(); refreshRegionInsight();
  }, state.region.prov ? state.region.prov.id : null));

  // 市级
  if (state.region.prov) {
    panel.appendChild(mk(getCities(state.region.prov.id), it => {
      state.region.city = { id: it.id, name: it.name }; state.region.dist = null;
      renderRegionPanel(); renderRegionEff(); maybeRender(); refreshRegionInsight();
    }, state.region.city ? state.region.city.id : null));
  }
  // 区/县级
  if (state.region.prov && state.region.city) {
    panel.appendChild(mk(getDistricts(state.region.prov.id, state.region.city.id), it => {
      state.region.dist = it.name;
      renderRegionPanel(); renderRegionEff(); maybeRender(); refreshRegionInsight(); closeRegionPanel();
    }, state.region.dist || null));
  }
  // 清除按钮
  const clear = document.createElement('button');
  clear.className = 'region-clear';
  clear.textContent = '清除区域';
  clear.onclick = () => {
    state.region = { prov: null, city: null, dist: null };
    renderRegionPanel(); renderRegionEff(); maybeRender(); refreshRegionInsight();
  };
  panel.appendChild(clear);
}

function regionLabel() {
  const r = state.region;
  if (!r.prov) return null;
  const pv = r.prov.name;
  const ct = r.city ? r.city.name : '';
  const ds = r.dist || '';
  return [pv, ct, ds].filter(Boolean).join(' · ');
}

function renderRegionEff() {
  const banner = $('#regionBanner');
  const label = regionLabel();
  if (!label) {
    banner.className = 'region-banner empty';
    setHTML(banner, raw('📍 未选择区域 · 当前显示<b>全国基准</b>数据（选择省/市/区可查看定制化市场规模 / 热度 / 爆品标签）'));
    return;
  }
  const p = getRegionProf(state.region.prov.id);
  banner.className = 'region-banner';
  setHTML(banner, raw(
    `<div class="rb-main">📍 <b>${label}</b></div>` +
    `<div class="rb-tags">` +
      `<span class="rb-chip">区域系数 ×${p.sizeMod}</span>` +
      `<span class="rb-chip heat-${p.heat}">热度：${p.heat}</span>` +
      p.tags.map(t => `<span class="rb-chip tag">#${t}</span>`).join('') +
    `</div>`));
}

function closeRegionPanel() { $('#regionPanel').classList.remove('open'); $('#regionPick').textContent = '选择区域 ▾'; }

/* ---------------- 区域动态洞察（联网实时查询） ---------------- */
function renderMockBrands(ins) {
  return ins.localBrands.map(b => `
    <div class="rb-item">
      <span class="rb-name">${esc(b.name)}${b.local ? '<i class="rb-local">本地新锐</i>' : '<i class="rb-nat">全国连锁</i>'}</span>
      <span class="rb-share">市占 ${b.share}%</span>
      <div class="rb-bar"><span style="width:${Math.min(100, b.share * 3)}%"></span></div>
    </div>`).join('');
}
function renderMockProducts(ins) {
  return ins.products.map(p => `
    <div class="rp-card">
      <div class="rp-top"><span class="rp-name">${esc(p.name)}</span><span class="rp-tag">${esc(p.tag)}</span></div>
      <div class="rp-meta"><span>¥${p.price}</span><span class="rp-heat">热度 ${p.heat}</span></div>
    </div>`).join('');
}
function renderLiveBrands(live) {
  return live.map(b => {
    const dy = b.douyinRank
      ? `<i class="rb-douyin">${b.douyinRank.indexOf('🎵') === 0 ? '' : '🎵 '}${esc(b.douyinRank)}</i>`
      : '';
    return `
    <div class="rb-item live">
      <div class="rb-top">
        <span class="rb-name">${esc(b.brandName)} <i class="rb-tag ${tagClass(b.tag)}">${esc(b.tag)}</i>${dy}</span>
        <span class="rb-rating">★ ${b.rating}</span>
      </div>
      <div class="rb-meta">招牌爆品：${esc(b.hotItem) || '—'} ｜ 人均 ¥${b.avgPrice}</div>
    </div>`;
  }).join('');
}

function regionInsightShell(ins, opts) {
  opts = opts || {};
  const label = regionLabel() || '全国';
  let brandsInner, srcLabel;
  if (opts.loading) {
    brandsInner = `<div class="ri-loading"><span class="spinner"></span> 正在实时抓取「${esc(label)}」美团 / 大众点评 / 抖音数据…</div>`;
    srcLabel = '<span class="ri-src loading">● 实时抓取中</span>';
  } else if (opts.live) {
    brandsInner = opts.live.length
      ? renderLiveBrands(opts.live)
      : (renderMockBrands(ins) + `<div class="ri-sub">🔥 区域爆品卡</div><div class="rp-grid">${renderMockProducts(ins)}</div>`);
    srcLabel = '<span class="ri-src live">● 实时美团/点评/抖音</span>';
  } else if (opts.fallback) {
    brandsInner = `<div class="ri-fallback">ℹ️ 「${esc(label)}」暂未检索到可验证的真实榜单，已为您提供<b>行业基准分析模型</b></div>` +
      renderMockBrands(ins) + `<div class="ri-sub">🔥 区域爆品卡</div><div class="rp-grid">${renderMockProducts(ins)}</div>`;
    srcLabel = '<span class="ri-src mock">○ 行业基准分析模型</span>';
  } else {
    brandsInner = renderMockBrands(ins) + `<div class="ri-sub">🔥 区域爆品卡</div><div class="rp-grid">${renderMockProducts(ins)}</div>`;
    srcLabel = '<span class="ri-src mock">○ 基准数据</span>';
  }
  return `
    <div class="ri-head">
      <span class="ri-title">🌐 ${esc(ins.regionName)} · ${esc(getNode(state.category, primaryL3()).name)} · 区域动态洞察</span>
      <span class="ri-query">检索词：<code>${esc(buildLiveQuery() || ins.query)}</code></span>
    </div>
    <div class="ri-chips">
      <span class="ri-chip heat">市场热度 <b>${ins.heat}</b>/100</span>
      <span class="ri-chip comp">竞争指数 <b>${(ins.competition * 100).toFixed(0)}</b>/100</span>
      <span class="ri-chip ${OCEAN_CLASS[ins.ocean]}">${OCEAN_TEXT[ins.ocean]}</span>
      <span class="ri-chip mod">区域系数 ×${ins.sizeMod}</span>
    </div>
    <div class="ri-body">
      <div class="ri-col">
        <div class="ri-sub">🏆 该区域 TOP 品牌 / 爆品 ${srcLabel}</div>
        <div id="riBrands">${brandsInner}</div>
      </div>
      <div class="ri-col">
        <div class="ri-sub">🎯 本地化战略空位（特劳特《定位》× 顾均辉 · 4 大心智指标）
          <span class="pos-badge ${'gt-' + GAP_TYPES.indexOf(ins.positionType || ins.gapType)}">${GAP_ICON[ins.positionType || ins.gapType] || ''} ${esc(ins.positionType || ins.gapType)}</span>
        </div>
        <div class="ri-cell"><div class="ri-t">😣 本地客户心智痛点</div><div class="ri-b">${esc(ins.mindPain || ins.localPain)}</div></div>
        <div class="ri-cell"><div class="ri-t">⚠️ 竞品固有弱点（对立面）</div><div class="ri-b">${esc(ins.rivalWeak || ins.localWeak)}</div></div>
        <div class="ri-nail">🏆 心智空位结论<div class="sg-text">${esc(ins.mindNail || ins.localGap)}</div></div>
        <div class="ri-sub" style="margin-top:10px">🚀 本地化切入点（3 大战术指令）</div>
        <div class="ri-tactic th"><div class="ri-t">🔨 爆品与视觉锤战术</div><div class="ri-b">${esc(ins.tacticHammer || '')}</div></div>
        <div class="ri-tactic tt"><div class="ri-t">📱 美团/抖音流量攻占</div><div class="ri-b">${esc(ins.tacticTraffic || '')}</div></div>
        <div class="ri-tactic tr"><div class="ri-t">🛡️ 本地信任状建立</div><div class="ri-b">${esc(ins.tacticTrust || '')}</div></div>
      </div>
    </div>`;
}

function refreshRegionInsight() {
  const box = $('#regionInsight');
  const prov = state.region.prov;
  const l3Id = primaryL3();
  const label = regionLabel();
  if (!prov) {
    box.className = 'region-insight';
    setHTML(box, raw(`<div class="ri-ph">🌐 未选择区域 — 选择省 / 市 / 区（县）后，将触发<b>联网实时查询</b>，刷新该区域的：市场热度 · 竞争指数 · 本地 TOP 品牌 · 爆品 · 本地化战略空位。</div>`));
    return;
  }
  if (!l3Id) {
    box.className = 'region-insight';
    setHTML(box, html`<div class="ri-ph">📍 已选区域 <b>${label}</b> — 请选择一个三级行业，立即触发该区域的实时市场洞察。</div>`);
    return;
  }
  const ins = genRegionInsight(state.category, l3Id, state.region);
  const query = buildLiveQuery();
  const useLive = !!APP_CONFIG.liveApiBase && !!query;
  if (useLive) {
    // Loading 态：先渲染骨架，再异步拉取实时数据
    box.className = 'region-insight loading';
    setHTML(box, raw(regionInsightShell(ins, { loading: true, query })));
    // 竞态守卫：以「行业大类+省+市+区+三级行业」完整指纹为准（任一维度变化即视为已切换）
    const token = liveViewKey();
    // 取消上一次仍在途的请求：既防止过期响应，也避免博查/智谱的付费额度被空烧
    if (liveAbort) liveAbort.abort();
    const ctrl = new AbortController();
    liveAbort = ctrl;
    const settle = payload => {
      if (liveViewKey() !== token) return;   // 视图已切换 → 丢弃过期结果
      if (liveAbort === ctrl) liveAbort = null;
      setHTML(box, raw(regionInsightShell(ins, payload)));
      box.classList.remove('loading');
    };
    fetchLiveBrands(query, ctrl)
      .then(live => settle(live ? { live } : { fallback: true }))
      .catch(() => settle({ fallback: true }));
  } else {
    box.className = 'region-insight';
    setHTML(box, raw(regionInsightShell(ins, {})));
  }
}

/* ---------------- 战略空位面板（顾均辉空位表） ---------------- */
function strategyBlock(catId, l3Id, role) {
  if (!l3Id) return '';
  const ana = getAnalytics(catId, l3Id);
  const s = ana.strategy;
  const path = getPath(catId, l3Id).map(n => n.name).join(' / ');
  const regionNote = state.region.prov
    ? `<div class="strat-region">📍 区域提示：在 <b>${regionLabel()}</b> 切入「${s.gapType}」空位，可叠加标签 ${getRegionProf(state.region.prov.id).tags.map(t => '#' + t).join(' ')}</div>`
    : '';
  const nail = s.mindNail
    ? `<div class="strat-nail">🏆 心智空位结论（特劳特定位钉子）<div class="sg-text">${s.mindNail}</div></div>` : '';
  const tactics = s.tactics
    ? `<div class="strat-tactics">
         <div class="ri-tactic th"><div class="ri-t">🔨 爆品与视觉锤战术</div><div class="ri-b">${s.tactics.hammer}</div></div>
         <div class="ri-tactic tt"><div class="ri-t">📱 美团/抖音流量攻占</div><div class="ri-b">${s.tactics.traffic}</div></div>
         <div class="ri-tactic tr"><div class="ri-t">🛡️ 本地信任状建立</div><div class="ri-b">${s.tactics.trust}</div></div>
       </div>` : '';
  return `
    <div class="strat-head"><span class="badge ${role === 'A' ? 'badge-a' : 'badge-b'}">${role === 'A' ? '主对象 A' : '对比 B'}</span> ${path}
      ${gapChip(s.positionType || s.gapType)}</div>
    <div class="strat-grid">
      <div class="strat-cell"><div class="sc-t">🥊 核心竞争对手 / 占据心智</div><div class="sc-b">${s.competitors.map(c => `<div class="comp"><b>${c.name}</b>：${c.mind}</div>`).join('')}</div></div>
      <div class="strat-cell"><div class="sc-t">😣 客户心智痛点</div><div class="sc-b">${s.painPoints.map(p => `<div class="pain">• ${p}</div>`).join('')}</div></div>
      <div class="strat-cell"><div class="sc-t">⚠️ 竞品固有弱点（对立面）</div><div class="sc-b">${s.weaknesses.map(w => `<div class="weak">• ${w}</div>`).join('')}</div></div>
    </div>
    <div class="strat-gap">🎯 战略空位与切入点（核心结论）<div class="sg-text">${s.gap}</div></div>
    ${nail}
    ${tactics}
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
    setHTML(single, raw('<div class="ph">请选择分析对象以查看战略空位分析</div>'));
    setHTML(compare, '');
    return;
  }
  tabs.hidden = false;
  let cur = (tabs.dataset.tab) || (canCompare ? 'compare' : 'single');
  if (cur === 'compare' && !canCompare) cur = 'single';
  setHTML(tabs, '');
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
    setHTML(compare, raw(`<div class="cmp-grid">` +
      `<div class="cmp-col">${strategyBlock(cat, aId, 'A')}</div>` +
      `<div class="cmp-col">${strategyBlock(cat, bId, 'B')}</div>` +
      `</div>` + diffInsight(cat, aId, bId)));
  } else {
    single.hidden = false; compare.hidden = true;
    setHTML(single, raw(strategyBlock(cat, aId || bId, aId ? 'A' : 'B')));
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
function openDrawer() {
  const g = state.A.sel.L3 ? 'A' : (state.B.sel.L3 ? 'B' : null); if (!g) return;
  const cat = state.category;
  const l3Id = state[g].sel.L3;
  const raw = getAnalytics(cat, l3Id);
  const ana = applyRegion(raw, state.region.prov ? state.region.prov.id : null);
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
  setHTML($('#drawerBody'), raw(`
    <div class="drawer-title">${path} <span class="mini ${oceanClass(ocean)}">${oceanText(ocean)}</span></div>
    ${regionChip}
    <div class="drawer-sub">🏆 代表品牌 / 爆品（按市占）</div>
    ${brands}
    ${(ana.hitProducts && ana.hitProducts.length) ? `
    <div class="drawer-sub">🔥 预置爆品（数据字典）</div>
    <div class="drawer-hits">${ana.hitProducts.map(h => `<span class="hit-chip">${esc(h.name)}<i>¥${h.price}·${h.tag}</i></span>`).join('')}</div>` : ''}
    <div class="drawer-sub">👥 人群画像</div>
    <div class="drawer-persona">${ana.persona}</div>
    <div class="drawer-sub">🎯 战略空位</div>
    <div class="drawer-gap">${ana.strategy.gap} ${gapChip(ana.strategy.gapType)}</div>`));
  $('#drawerMask').classList.add('show');
  $('#drawer').classList.add('show');
}
function closeDrawer() {
  $('#drawerMask').classList.remove('show');
  $('#drawer').classList.remove('show');
}
