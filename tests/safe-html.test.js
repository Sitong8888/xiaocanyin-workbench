/* =========================================================================
 * 回归测试：SafeHTML 默认转义封装 + 前端错误上报
 * ---------------------------------------------------------------------------
 * 契约：
 *   1. setHTML(el, 普通字符串) → 默认按纯文本转义，绝不形成可执行节点
 *   2. html`...` 插值默认 esc；raw() 显式标记可信 HTML 才透传
 *   3. 数组插值逐项处理后拼接（SafeHtml 透传 / 其它转义）
 *   4. 错误上报：去重 + 每会话限量 + POST 到 <origin>/log；未配 liveApiBase 全关
 * ========================================================================= */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function bootCore(appConfig) {
  const dom = new JSDOM('<div id="t"></div>', { runScripts: 'outside-only', url: 'https://site.test/page' });
  const { window } = dom;
  window.APP_CONFIG = appConfig || {};
  const fetchCalls = [];
  window.fetch = (url, opts) => { fetchCalls.push({ url: String(url), opts }); return Promise.resolve({ ok: true }); };
  // 经典 <script> 顶层 const 不挂 window → 同次 eval 末尾显式导出被测 API
  window.eval(read('js/core.js') +
    '\n;window.__api = { esc, raw, html, setHTML, reportClientError, initErrorReporting, ERR_REPORT };');
  return { window, api: window.__api, el: window.document.getElementById('t'), fetchCalls };
}

describe('SafeHTML 默认转义封装', () => {
  test('setHTML 传普通字符串 → 默认转义，注入载荷不形成节点', () => {
    const { api, el } = bootCore();
    api.setHTML(el, '<img src=x onerror="window.__pwned=1">');
    assert.equal(el.querySelectorAll('img').length, 0, '❌ 普通字符串被当作 HTML 解析');
    assert.ok(el.textContent.includes('<img'), '应以纯文本呈现');
  });

  test('html`` 模板插值默认转义，静态部分保留标记', () => {
    const { api, el } = bootCore();
    const evil = '<script>window.__pwned=1</script>';
    api.setHTML(el, api.html`<b class="name">${evil}</b>`);
    assert.equal(el.querySelectorAll('script').length, 0);
    assert.equal(el.querySelectorAll('b.name').length, 1, '静态标记应正常渲染');
    assert.ok(el.querySelector('b').textContent.includes('<script>'), '插值应为纯文本');
  });

  test('raw() 显式标记的可信 HTML 才透传；嵌套进 html`` 不被二次转义', () => {
    const { api, el } = bootCore();
    api.setHTML(el, api.html`<div>${api.raw('<i class="ok">trusted</i>')}</div>`);
    assert.equal(el.querySelectorAll('i.ok').length, 1, 'raw 标记的 HTML 应透传');
  });

  test('数组插值：SafeHtml 透传、普通值转义、逐项拼接', () => {
    const { api, el } = bootCore();
    const items = [api.raw('<u>a</u>'), '<u>b</u>'];
    api.setHTML(el, api.html`<div>${items}</div>`);
    assert.equal(el.querySelectorAll('u').length, 1, '只有 raw 项形成节点');
    assert.ok(el.textContent.includes('<u>b</u>'), '普通项应被转义为文本');
  });

  test('setHTML 对 null/undefined 容错为空串', () => {
    const { api, el } = bootCore();
    api.setHTML(el, null);
    assert.equal(el.innerHTML, '');
  });
});

describe('前端错误上报', () => {
  const CFG = { liveApiBase: 'https://worker.test/api/brands' };

  test('上报端点 = liveApiBase 的 origin + /log；POST 携带错误摘要', () => {
    const { api, fetchCalls } = bootCore(CFG);
    api.reportClientError({ msg: 'boom', src: 'x.js', line: 7 });
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, 'https://worker.test/log');
    const body = JSON.parse(fetchCalls[0].opts.body);
    assert.equal(body.msg, 'boom');
    assert.equal(body.page, '/page');
  });

  test('同一错误只上报一次（去重）；每会话限量', () => {
    const { api, fetchCalls } = bootCore(CFG);
    for (let i = 0; i < 5; i++) api.reportClientError({ msg: 'same', src: 'x.js', line: 1 });
    assert.equal(fetchCalls.length, 1, '重复错误应去重');
    for (let i = 0; i < 30; i++) api.reportClientError({ msg: 'e' + i, src: 'x.js', line: i });
    assert.ok(fetchCalls.length <= 1 + api.ERR_REPORT.max, '超出会话限量后应停止上报');
  });

  test('未配置 liveApiBase → 完全关闭，永不发请求', () => {
    const { api, fetchCalls } = bootCore({});
    api.reportClientError({ msg: 'boom' });
    api.initErrorReporting();
    assert.equal(fetchCalls.length, 0);
  });

  test('window error 事件挂载后自动上报（initErrorReporting）', () => {
    const { api, window, fetchCalls } = bootCore(CFG);
    api.initErrorReporting();
    window.dispatchEvent(new window.ErrorEvent('error', { message: 'runtime boom', filename: 'app.js', lineno: 3 }));
    assert.equal(fetchCalls.length, 1);
    assert.ok(JSON.parse(fetchCalls[0].opts.body).msg.includes('runtime boom'));
  });
});
