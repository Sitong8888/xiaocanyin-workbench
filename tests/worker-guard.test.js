/* =========================================================================
 * 回归测试：Worker 边缘防护（速率限制 + KV 缓存 + /log 错误上报端点）
 * ---------------------------------------------------------------------------
 * 契约：
 *   1. /log POST → 204，永不触碰付费 API，非法 body 静默
 *   2. 速率限制：同 IP 超过 RATE_LIMIT_PER_MIN → 429 + Retry-After
 *   3. KV 缓存：同一检索词二次请求命中缓存（_meta.cache=hit），不再打上游
 *   4. KV 未绑定 → 全部优雅降级（限流放行、缓存跳过），业务不受影响
 * ========================================================================= */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker, { cacheKeyOf } from '../cloudflare/worker.js';

/* 内存版 KV：模拟 Cloudflare KV namespace 行为 */
function fakeKV() {
  const m = new Map();
  return {
    _map: m,
    async get(k, type) {
      const v = m.get(k);
      if (v == null) return null;
      return type === 'json' ? JSON.parse(v) : v;
    },
    async put(k, v) { m.set(k, v); },
  };
}

const req = (url, init) => new Request(url, {
  ...init,
  headers: { 'CF-Connecting-IP': '1.2.3.4', ...(init && init.headers) },
});

const Q = 'https://w.test/api/brands?q=' + encodeURIComponent('深圳市 南山区 螺蛳粉 美团 热门 分类:餐饮>粉面>螺蛳粉');

let realFetch, upstreamCalls;
beforeEach(() => {
  realFetch = globalThis.fetch;
  upstreamCalls = 0;
  // 上游（搜索/LLM）一律失败 → 管线走 no_snippets 快速返回，测试不出网
  globalThis.fetch = async () => { upstreamCalls++; return { ok: false, json: async () => ({}) }; };
});
afterEach(() => { globalThis.fetch = realFetch; });

describe('cacheKeyOf：检索词归一化', () => {
  test('多空格/大小写/首尾空白归一为同一 key', () => {
    assert.equal(cacheKeyOf('  深圳市  螺蛳粉  '), cacheKeyOf('深圳市 螺蛳粉'));
    assert.equal(cacheKeyOf('ABC Tea'), cacheKeyOf('abc tea'));
    assert.notEqual(cacheKeyOf('深圳市 螺蛳粉'), cacheKeyOf('广州市 螺蛳粉'));
  });
});

describe('/log 前端错误上报端点', () => {
  test('合法 JSON → 204 无内容；不需要任何 API Key', async () => {
    const res = await worker.fetch(req('https://w.test/log', {
      method: 'POST',
      body: JSON.stringify({ msg: 'boom', src: 'app.js', line: 1 }),
    }), {});
    assert.equal(res.status, 204);
    assert.equal(upstreamCalls, 0, '/log 绝不触碰上游付费 API');
  });

  test('非法 body → 静默 204，不抛错', async () => {
    const res = await worker.fetch(req('https://w.test/log', { method: 'POST', body: 'not-json{{{' }), {});
    assert.equal(res.status, 204);
  });
});

describe('速率限制（KV 固定窗口计数）', () => {
  test('同 IP 超过阈值 → 429 + Retry-After', async () => {
    const env = { ZHIPU_API_KEY: 'k', BRAND_CACHE: fakeKV(), RATE_LIMIT_PER_MIN: '2' };
    const r1 = await worker.fetch(req(Q), env);
    const r2 = await worker.fetch(req(Q), env);
    const r3 = await worker.fetch(req(Q), env);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r3.status, 429, '第 3 次应被限流');
    assert.equal(r3.headers.get('Retry-After'), '60');
    const j = await r3.json();
    assert.equal(j._meta.reason, 'rate_limited');
  });

  test('KV 未绑定 → 限流放行，业务不受影响', async () => {
    const env = { ZHIPU_API_KEY: 'k', RATE_LIMIT_PER_MIN: '1' };
    const r1 = await worker.fetch(req(Q), env);
    const r2 = await worker.fetch(req(Q), env);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200, '无 KV 时不得误伤正常请求');
  });
});

describe('KV 结果缓存', () => {
  test('第二次同查询命中缓存（_meta.cache=hit），不再打上游', async () => {
    const env = { ZHIPU_API_KEY: 'k', BRAND_CACHE: fakeKV() };
    const r1 = await worker.fetch(req(Q), env);
    const j1 = await r1.json();
    assert.equal(j1._meta.cache, undefined, '首次请求应走实时管线');
    const callsAfterFirst = upstreamCalls;
    assert.ok(callsAfterFirst >= 1, '首次请求应触达上游');

    const r2 = await worker.fetch(req(Q), env);
    const j2 = await r2.json();
    assert.equal(j2._meta.cache, 'hit', '二次请求应命中缓存');
    assert.equal(upstreamCalls, callsAfterFirst, '缓存命中后不得再消耗上游付费额度');
  });

  test('nocache=1 强制绕过缓存（调试用）', async () => {
    const env = { ZHIPU_API_KEY: 'k', BRAND_CACHE: fakeKV() };
    await worker.fetch(req(Q), env);
    const callsAfterFirst = upstreamCalls;
    const r2 = await worker.fetch(req(Q + '&nocache=1'), env);
    const j2 = await r2.json();
    assert.equal(j2._meta.cache, undefined);
    assert.ok(upstreamCalls > callsAfterFirst, 'nocache 应重新触达上游');
  });

  test('KV 未绑定 → 缓存跳过，每次都走实时管线（优雅降级）', async () => {
    const env = { ZHIPU_API_KEY: 'k' };
    await worker.fetch(req(Q), env);
    const callsAfterFirst = upstreamCalls;
    await worker.fetch(req(Q), env);
    assert.ok(upstreamCalls > callsAfterFirst);
  });
});
