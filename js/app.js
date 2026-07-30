/* =========================================================================
 * 爆品与赛道筛选 · 交互逻辑 (app.js)
 *  - 行业大类下拉选择（切换即重置 A/B 到该大类）
 *  - 区域级联选择器（全国 省 → 市 → 区/县），数据按区域系数定制
 *  - 【核心】区域动态洞察：切换区域/三级行业时触发联网实时查询（模拟异步）
 *    实时刷新 区域市场热度 / 竞争指数 / 本地 TOP 品牌 / 爆品 / 本地化战略空位
 *  - 主/对比分析对象三级联动、KPI 横滑、雷达/矩阵/趋势对比
 *  - 顾均辉战略空位面板 + 双赛道空位对比 + 下钻抽屉
 * ========================================================================= */
(function () {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const state = {
    category: 'catering',
    region: { prov: null, city: null, dist: null },   // prov/city: {id,name}; dist: string
    A: { sel: { L1: null, L2: null, L3: null } },
    B: { sel: { L1: null, L2: null, L3: null } },
  };

  /* ---------------- 工具 ---------------- */
  const fmt = n => (n >= 10000 ? (n / 10000).toFixed(1) + '万' : String(Math.round(n)));
  const oceanText = o => OCEAN_TEXT[o] || '—';
  const oceanClass = o => OCEAN_CLASS[o] || 'o-stable';

  function getSel(catId, sel) { return sel.L3 ? getAnalytics(catId, sel.L3) : null; }
  function primaryL3() { return state.A.sel.L3 || state.B.sel.L3; }

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
      banner.innerHTML = '📍 未选择区域 · 当前显示<b>全国基准</b>数据（选择省/市/区可查看定制化市场规模 / 热度 / 爆品标签）';
      return;
    }
    const p = getRegionProf(state.region.prov.id);
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

  /* ---------------- 区域动态洞察（联网实时查询） ---------------- */
  // 契约：若 window.APP_CONFIG.liveApiBase 已配置，则向该后端代理发起实时检索，
  //       代理返回 {"brands":[{brandName,hotItem,avgPrice,rating,tag}]}；
  //       前端负责 Loading 态与失败降级（无后端 / 超时 / 解析失败 → 用 data.js 基准数据）。
  const APP_CONFIG = (window.APP_CONFIG && typeof window.APP_CONFIG === 'object') ? window.APP_CONFIG : {};
  const LIVE_TIMEOUT = APP_CONFIG.liveApiTimeout || 6000;

  // 检索词构造器（搜推分离）：
  //   · 搜索部分 = 干净自然语言（无引号/无分类语法/剔除省级前缀），保证博查等搜索引擎正常召回
  //   · 分类路径 = 仅以 分类:xxx 形式附带，供 Worker 提取步骤（智谱 GLM）做品类约束，不进搜索词
  // 示例：海口市 龙华区 鲜果茶 美团 大众点评 热门 分类:餐饮>茶饮咖啡>新式茶饮>鲜果茶
  function buildLiveQuery() {
    const r = state.region;
    if (!r.prov) return null;
    const l3Id = primaryL3();
    if (!l3Id) return null;
    // 有市则丢弃省（博查用「海口市 龙华区」比「海南省海口市龙华区」召回好得多）
    const regionParts = [r.city ? r.city.name : r.prov.name, r.dist || ''].filter(Boolean);
    const cat = CATEGORIES.find(c => c.id === state.category);
    const path = getPath(state.category, l3Id);           // [L1, L2, L3]
    const catPath = [cat ? cat.name : '', path[0] ? path[0].name : '', path[1] ? path[1].name : '', path[2] ? path[2].name : '']
      .filter(Boolean).join('>');
    const l3Name = path[2] ? path[2].name : (path[1] ? path[1].name : '');
    return `${regionParts.join(' ')} ${l3Name} 美团 大众点评 热门 分类:${catPath}`;
  }

  // 前端兜底：拦截后端漏网的占位符/假数据
  const FAKE_RE = /(XX|YY|ZZ|ABC|某某|品牌名|示例|测试|店名|占位|待补充|unknown|placeholder|example|N\/A)/i;
  function isFakeBrand(b) {
    if (!b) return true;
    const name = String(b.brandName || b.name || '').trim();
    if (name.length < 2 || FAKE_RE.test(name)) return true;
    if (FAKE_RE.test(String(b.hotItem || b.signboard || ''))) return true;
    const p = parseFloat(String(b.avgPrice == null ? '' : b.avgPrice).replace(/[^\d.]/g, ''));
    if (!(p > 0)) return true;
    return false;
  }

  // 防 XSS：联网返回的数据不可信，渲染前先转义
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function normLiveBrand(b) {
    b = b || {};
    let tag = String(b.tag || '').trim();
    if (!['红海', '蓝海', '高潜', '平稳'].includes(tag)) tag = '平稳';
    let rating = parseFloat(b.rating); if (isNaN(rating)) rating = 0;
    let avgPrice = parseFloat(b.avgPrice); if (isNaN(avgPrice)) avgPrice = 0;
    return {
      brandName: b.brandName || b.name || '未知品牌',
      hotItem: b.hotItem || b.signboard || '',
      avgPrice: avgPrice,
      rating: rating,
      tag: tag,
      douyinRank: String(b.douyinRank || '').trim(),   // 🎵 抖音本地生活榜单（如：抖音同城热销榜 Top2）
    };
  }
  function tagClass(tag) {
    return ({ '红海': 'o-red', '蓝海': 'o-blue', '高潜': 'o-high', '平稳': 'o-stable' }[tag]) || 'o-stable';
  }

  // 实时检索：调用后端代理（后端再联网美团/大众点评/搜索引擎 + LLM 解析为结构化数据）
  async function fetchLiveBrands(query) {
    const base = APP_CONFIG.liveApiBase;
    if (!base) return null;                 // 未配置后端 → 触发降级
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), LIVE_TIMEOUT);
    try {
      const sep = base.indexOf('?') >= 0 ? '&' : '?';
      const url = base + sep + 'q=' + encodeURIComponent(query);
      const headers = APP_CONFIG.liveApiKey ? { 'x-api-key': String(APP_CONFIG.liveApiKey) } : {};
      const res = await fetch(url, { signal: ctrl.signal, headers });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data.brands || data.data || data.results || []);
      if (!Array.isArray(arr) || !arr.length) return null;
      const clean = arr.filter(b => !isFakeBrand(b)).map(normLiveBrand).slice(0, 8);
      if (!clean.length) return null;         // 全是假数据 → 触发降级，不展示脏数据
      return clean;
    } catch (e) {
      return null;                          // 网络 / 解析失败 → 触发降级
    } finally {
      clearTimeout(tid);
    }
  }

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
      box.innerHTML = `<div class="ri-ph">🌐 未选择区域 — 选择省 / 市 / 区（县）后，将触发<b>联网实时查询</b>，刷新该区域的：市场热度 · 竞争指数 · 本地 TOP 品牌 · 爆品 · 本地化战略空位。</div>`;
      return;
    }
    if (!l3Id) {
      box.className = 'region-insight';
      box.innerHTML = `<div class="ri-ph">📍 已选区域 <b>${esc(label)}</b> — 请选择一个三级行业，立即触发该区域的实时市场洞察。</div>`;
      return;
    }
    const ins = genRegionInsight(state.category, l3Id, state.region);
    const query = buildLiveQuery();
    const useLive = !!APP_CONFIG.liveApiBase && !!query;
    if (useLive) {
      // Loading 态：先渲染骨架，再异步拉取实时数据
      box.className = 'region-insight loading';
      box.innerHTML = regionInsightShell(ins, { loading: true, query });
      const token = { prov: prov, l3: l3Id };
      fetchLiveBrands(query).then(live => {
        // 防止竞态：若用户已切换区域/行业，丢弃过期结果
        if (state.region.prov !== token.prov || primaryL3() !== token.l3) return;
        box.innerHTML = regionInsightShell(ins, live ? { live } : { fallback: true });
        box.classList.remove('loading');
      }).catch(() => {
        if (state.region.prov !== token.prov || primaryL3() !== token.l3) return;
        box.innerHTML = regionInsightShell(ins, { fallback: true });
        box.classList.remove('loading');
      });
    } else {
      box.className = 'region-insight';
      box.innerHTML = regionInsightShell(ins, {});
    }
  }

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

  /* ---------------- 战略空位面板（顾均辉空位表） ---------------- */
  function gapChip(t) { return `<span class="gap-tag ${'gt-' + GAP_TYPES.indexOf(t)}">${GAP_ICON[t] || ''} ${t}</span>`; }

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
      single.innerHTML = '<div class="ph">请选择分析对象以查看战略空位分析</div>';
      compare.innerHTML = '';
      return;
    }
    tabs.hidden = false;
    let cur = (tabs.dataset.tab) || (canCompare ? 'compare' : 'single');
    if (cur === 'compare' && !canCompare) cur = 'single';
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
    $('#drawerBody').innerHTML = `
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
