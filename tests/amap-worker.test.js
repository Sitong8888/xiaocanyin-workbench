import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../cloudflare/worker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fakeKV() {
  const m = new Map();
  return {
    _map: m,
    async get(k, type) { const v = m.get(k); if (v == null) return null; return type === 'json' ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, v); },
  };
}
const req = (url, init) => new Request(url, { ...init, headers: { 'CF-Connecting-IP': '1.2.3.4', ...(init && init.headers) } });

const Q = 'https://w.test/api/brands?q=' + encodeURIComponent('海口市 龙华区 鲜果茶 美团 大众点评 热门 分类:餐饮>茶饮咖啡>新式茶饮>鲜果茶');
const Q_EMPTY = 'https://w.test/api/brands?q=' + encodeURIComponent('海口市 龙华区 无匹配店 美团 热门 分类:餐饮>茶饮咖啡>新式茶饮>无匹配店');

/* 内存 fetch：按 URL 路由到高德 POI / 高德逆地理 / 智谱，其余一律失败 */
let upstreamCalls;
beforeEach(() => { upstreamCalls = 0; globalThis.fetch = mockFetch(false); });
function mockFetch(emptyPoi) {
  return async (url) => {
    upstreamCalls++;
    const u = String(url);
    if (u.includes('/geo')) {
      return { ok: true, json: async () => ({ status: '1', regeocode: { addressComponent: { province: '海南省', city: '海口市', district: '龙华区', adcode: '460106' } } }) };
    }
    if (u.includes('restapi.amap.com/v3/place/text')) {
      if (emptyPoi || decodeURIComponent(u).includes('无匹配店')) {
        return { ok: true, json: async () => ({ status: '1', pois: [] }) };
      }
      return { ok: true, json: async () => ({ status: '1', pois: [
        { name: '蜜雪冰城(龙华店)', address: '海口市龙华区滨海大道1号', biz_ext: { rating: '4.6', cost: '8' }, cityname: '海口市', adname: '龙华区', type: '餐饮服务' },
        { name: '霸王茶姬(龙华店)', address: '海口市龙华区国贸路2号', biz_ext: { rating: '4.8', cost: '19' }, cityname: '海口市', adname: '龙华区', type: '餐饮服务' },
      ] }) };
    }
    if (u.includes('open.bigmodel.cn')) {
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ brands: [
        { brandName: '蜜雪冰城(龙华店)', address: '海口市龙华区滨海大道1号', hotItem: '冰鲜柠檬水', avgPrice: '8', rating: 4.6, tag: '红海', positioning: '极致性价比心智' },
        { brandName: '霸王茶姬(龙华店)', address: '海口市龙华区国贸路2号', hotItem: '伯牙绝弦', avgPrice: '19', rating: 4.8, tag: '高潜', positioning: '原叶鲜奶茶差异化' },
      ] }) } }] }) };
    }
    return { ok: false, json: async () => ({}) };
  };
}

describe('高德逆地理编码 /geo 端点', () => {
  test('经纬度 → 省/市/区（AMAP_KEY 仅存后端）', async () => {
    const env = { AMAP_KEY: 'k', ZHIPU_API_KEY: 'z' };
    const res = await worker.fetch(req('https://w.test/geo?lat=20.01&lng=110.32'), env);
    assert.equal(res.status, 200);
    const g = await res.json();
    assert.equal(g.province, '海南省');
    assert.equal(g.city, '海口市');
    assert.equal(g.district, '龙华区');
  });
  test('缺少坐标 → 400', async () => {
    const env = { AMAP_KEY: 'k' };
    const res = await worker.fetch(req('https://w.test/geo?lat=abc'), env);
    assert.equal(res.status, 400);
  });
});

describe('高德 POI 主路径：100% 真实门店', () => {
  test('返回 isRealAmap:true 且品牌含真实地址/均价（高德真值优先）', async () => {
    const env = { AMAP_KEY: 'k', ZHIPU_API_KEY: 'z', BRAND_CACHE: fakeKV() };
    globalThis.fetch = mockFetch(false);
    const res = await worker.fetch(req(Q), env);
    const j = await res.json();
    assert.equal(j.isRealAmap, true, '应为高德实采');
    assert.ok(j.brands.length === 2, '应返回 2 家真实门店');
    const m = j.brands.find(b => b.brandName.includes('霸王茶姬'));
    assert.ok(m, '应含霸王茶姬真实门店');
    assert.equal(m.address, '海口市龙华区国贸路2号', '地址应来自高德真实 POI');
    assert.equal(m.avgPrice, 19, '均价应取自高德 biz_ext.cost（真实）');
    assert.equal(m.hotItem, '伯牙绝弦', '招牌爆品应由智谱补充');
    assert.equal(j._meta.pipeline, 'amap-poi+zhipu');
  });

  test('二次同查询命中缓存（_meta.cache=hit），不再打高德/智谱', async () => {
    const env = { AMAP_KEY: 'k', ZHIPU_API_KEY: 'z', BRAND_CACHE: fakeKV() };
    globalThis.fetch = mockFetch(false);
    await worker.fetch(req(Q), env);
    const callsAfterFirst = upstreamCalls;
    assert.ok(callsAfterFirst >= 2, '首次应触达高德+智谱');
    const r2 = await worker.fetch(req(Q), env);
    const j2 = await r2.json();
    assert.equal(j2._meta.cache, 'hit', '二次应命中缓存');
    assert.equal(upstreamCalls, callsAfterFirst, '缓存命中后不得再消耗上游额度');
  });

  test('高德 0 家 → isRealAmap:false（前端走行业基准兜底）', async () => {
    const env = { AMAP_KEY: 'k', ZHIPU_API_KEY: 'z', BRAND_CACHE: fakeKV() };
    globalThis.fetch = mockFetch(false);
    const res = await worker.fetch(req(Q_EMPTY), env);
    const j = await res.json();
    assert.equal(j.isRealAmap, false, '无门店应为 false');
    assert.ok(!j.brands || !j.brands.length, '不应返回虚构品牌');
    assert.equal(j._meta.reason, 'amap_no_poi');
  });

  test('智谱分析失败 → 仍返回真实高德门店（仅缺分析字段，不丢真实数据）', async () => {
    const env = { AMAP_KEY: 'k', ZHIPU_API_KEY: 'z', BRAND_CACHE: fakeKV() };
    // 让智谱请求失败：mock 中 open.bigmodel.cn 返回 500
    globalThis.fetch = async (url) => {
      upstreamCalls++;
      const u = String(url);
      if (u.includes('restapi.amap.com/v3/place/text')) {
        return { ok: true, json: async () => ({ status: '1', pois: [
          { name: '蜜雪冰城(龙华店)', address: '海口市龙华区滨海大道1号', biz_ext: { rating: '4.6', cost: '8' }, cityname: '海口市', adname: '龙华区', type: '餐饮' },
        ] }) };
      }
      return { ok: false, json: async () => ({}) };
    };
    const res = await worker.fetch(req(Q), env);
    const j = await res.json();
    assert.equal(j.isRealAmap, true, '高德门店仍应返回');
    assert.ok(j.brands[0].brandName.includes('蜜雪冰城'), '真实店名保留');
    assert.equal(j.brands[0].address, '海口市龙华区滨海大道1号');
    assert.equal(j._meta.analyzed, false, '智谱未分析应标记');
  });
});

describe('resolveRegionByNames（地理定位回填）', () => {
  test('高德省/市/区名 → 本工作台 region 模型（后缀归一）', () => {
    const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8');
    const sandbox = { module: { exports: {} }, console };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    const r = sandbox.resolveRegionByNames('海南省', '海口市', '龙华区');
    assert.ok(r.prov && r.prov.id === 'HI' || r.prov, '应能解析省份');
    assert.ok(r.city && r.city.name === '海口市', '应解析海口市');
    assert.equal(r.dist, '龙华区', '应解析龙华区');
  });
  test('直辖市（city 缺失）用 district 反查市', () => {
    const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8');
    const sandbox = { module: { exports: {} }, console };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
    // 北京市朝阳区：高德 city 可能为空，用 district 反查
    const r = sandbox.resolveRegionByNames('北京市', '', '朝阳区');
    assert.ok(r.prov && r.prov.name === '北京市');
    assert.ok(r.city && r.city.name === '北京市', '直辖市应能定位到自身');
    assert.equal(r.dist, '朝阳区');
  });
});

afterEach(() => { delete globalThis.fetch; });
