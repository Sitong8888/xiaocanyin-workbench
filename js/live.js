/* =========================================================================
 * 爆品与赛道筛选 · 实时联网层 (live.js)
 *  - 检索词构造（搜推分离）、反幻觉清洗、品牌归一化、实时抓取（fetch + AbortController）
 * ========================================================================= */
'use strict';

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

function normLiveBrand(b) {
  b = b || {};
  let tag = String(b.tag || '').trim();
  if (!['红海', '蓝海', '高潜', '平稳'].includes(tag)) tag = '平稳';
  let rating = parseFloat(b.rating); if (isNaN(rating)) rating = 0;
  let avgPrice = parseFloat(b.avgPrice); if (isNaN(avgPrice)) avgPrice = 0;
  return {
    brandName: b.brandName || b.name || '未知品牌',
    address: String(b.address || '').trim(),           // 高德实采真实地址（仅 isRealAmap=true 时有效）
    positioning: String(b.positioning || '').trim(),  // 智谱战略定位建议
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
async function fetchLiveBrands(query, externalCtrl) {
  const base = APP_CONFIG.liveApiBase;
  if (!base) return null;                 // 未配置后端 → 触发降级
  const ctrl = externalCtrl || new AbortController();
  const tid = setTimeout(() => ctrl.abort(), LIVE_TIMEOUT);
  try {
    const sep = base.indexOf('?') >= 0 ? '&' : '?';
    const url = base + sep + 'q=' + encodeURIComponent(query);
    const headers = APP_CONFIG.liveApiKey ? { 'x-api-key': String(APP_CONFIG.liveApiKey) } : {};
    const res = await fetch(url, { signal: ctrl.signal, headers });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const isRealAmap = !!data.isRealAmap;   // 高德 POI 实采标志（true=100%真实门店）
    const arr = Array.isArray(data) ? data : (data.brands || data.data || data.results || []);
    if (!Array.isArray(arr) || !arr.length) return { isRealAmap, brands: [] };
    const clean = arr.filter(b => !isFakeBrand(b)).map(normLiveBrand).slice(0, 8);
    if (!clean.length) return { isRealAmap, brands: [] };   // 全是假数据 → 触发降级，不展示脏数据
    return { isRealAmap, brands: clean };
  } catch {
    return null;                          // 网络 / 解析失败 → 触发降级
  } finally {
    clearTimeout(tid);
  }
}
