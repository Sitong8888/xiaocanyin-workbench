/* =========================================================================
 * 回归测试：异步竞态守卫（P0）
 * ---------------------------------------------------------------------------
 * 【历史 Bug】refreshRegionInsight 的竞态守卫写作：
 *     const token = { prov, l3 };
 *     if (state.region.prov !== token.prov || primaryL3() !== token.l3) return;
 *   切换「市」或「区县」时，prov 对象引用不变、l3Id 也不变 → 守卫恒为真，
 *   慢返回的旧区域响应会覆盖新区域的结果，用户看到张冠李戴的商家榜单。
 *
 * 【修复】改用完整视图指纹 liveViewKey() = 大类|省|市|区|三级行业，
 *   并在发起新请求前 abort 在途请求（博查/智谱均按次计费，空烧即真金白银）。
 *
 * 本文件即该 Bug 的可执行证据：在旧实现上必然失败。
 * ========================================================================= */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/**
 * 启动一个隔离的应用实例。
 * @param {(q:string)=>{delay:number, brands:Array}} responder 按检索词决定响应内容与延迟
 * @returns {{window:Object, calls:Array, $:Function, pick:Function, insightHTML:Function}}
 */
async function boot(responder) {
  const dom = new JSDOM(read('index.html'), { runScripts: 'outside-only', url: 'http://localhost/' });
  const { window } = dom;
  const calls = [];

  window.AbortController = AbortController;
  window.APP_CONFIG = { liveApiBase: 'https://mock.test/api', liveApiTimeout: 5000 };
  window.fetch = (url, opts) => {
    const q = decodeURIComponent(String(url).split('q=')[1] || '');
    const signal = opts && opts.signal;
    const rec = { q, signal };
    calls.push(rec);
    const { delay, brands } = responder(q);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ ok: true, json: async () => ({ brands }) }), delay);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          rec.aborted = true;
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }
    });
  };

  // data.js 与 app.js 必须在同一次 eval 中执行：const 声明不会挂到 window 上
  window.eval(read('js/data.js') + '\n;\n' + read('js/app.js'));
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise(r => setTimeout(r, 0));

  const $ = s => window.document.querySelector(s);
  const $$ = s => Array.from(window.document.querySelectorAll(s));
  const pick = name => {
    const btn = $$('#regionPanel .casc-item').find(b => b.textContent === name);
    assert.ok(btn, `区域面板中找不到「${name}」`);
    btn.click();
  };
  return { window, calls, $, pick, insightHTML: () => $('#regionInsight').innerHTML };
}

const brandOf = name => [{ brandName: name, hotItem: '招牌螺蛳粉', avgPrice: 22, rating: 4.7, tag: '高潜' }];

describe('区域切换竞态守卫', () => {
  test('【核心】慢返回的旧区县响应，不得覆盖新区县结果', async () => {
    const app = await boot(q => /南山/.test(q)
      ? { delay: 300, brands: brandOf('南山螺霸王') }     // 旧区：慢
      : { delay: 20, brands: brandOf('龙华柳味源') });     // 新区：快

    app.$('#regionPick').click();
    app.pick('广东省');
    app.pick('深圳市');
    app.pick('南山区');            // 请求 1（慢）
    app.$('#regionPick').click();
    app.pick('龙华区');            // 请求 2（快）—— prov 引用与 l3 均未变化，旧守卫在此失效

    await new Promise(r => setTimeout(r, 500));
    const html = app.insightHTML();

    assert.ok(html.includes('龙华柳味源'), '应展示当前所选区县的数据');
    assert.ok(!html.includes('南山螺霸王'), '❌ 竞态：过期区县的响应污染了当前视图');
  });

  test('切换城市时守卫同样生效（prov 引用不变）', async () => {
    const app = await boot(q => /广州/.test(q)
      ? { delay: 300, brands: brandOf('广州老友粉') }
      : { delay: 20, brands: brandOf('深圳螺满堂') });

    app.$('#regionPick').click();
    app.pick('广东省');
    app.pick('广州市');            // 请求 1（慢）
    app.pick('深圳市');            // 请求 2（快）

    await new Promise(r => setTimeout(r, 500));
    const html = app.insightHTML();
    assert.ok(html.includes('深圳螺满堂'));
    assert.ok(!html.includes('广州老友粉'), '❌ 竞态：过期城市的响应污染了当前视图');
  });

  test('发起新请求前必须 abort 在途请求（避免空烧付费额度）', async () => {
    const app = await boot(() => ({ delay: 300, brands: brandOf('测试用真实店') }));

    app.$('#regionPick').click();
    app.pick('广东省');
    app.pick('深圳市');
    app.pick('南山区');
    app.$('#regionPick').click();
    app.pick('龙华区');

    await new Promise(r => setTimeout(r, 50));
    const stale = app.calls.slice(0, -1);
    assert.ok(stale.length >= 1, '用例前提：应至少产生一个过期请求');
    for (const c of stale) {
      assert.equal(c.aborted, true, `过期请求未被取消，将持续消耗搜索/LLM 配额: ${c.q}`);
    }
  });

  test('最终渲染的区域标签与所选区域一致（端到端一致性）', async () => {
    const app = await boot(() => ({ delay: 20, brands: brandOf('龙华柳味源') }));
    app.$('#regionPick').click();
    app.pick('广东省');
    app.pick('深圳市');
    app.pick('龙华区');
    await new Promise(r => setTimeout(r, 200));
    assert.ok(app.$('#regionBanner').innerHTML.includes('龙华区'));
  });
});

describe('实时数据渲染的安全性', () => {
  test('LLM 返回的 XSS 载荷必须被转义，不得形成可执行节点', async () => {
    const payload = '<img src=x onerror="window.__pwned=1">螺蛳粉店';
    const app = await boot(() => ({
      delay: 10,
      brands: [{ brandName: payload, hotItem: '<script>window.__pwned=1</script>', avgPrice: 22, rating: 4.7, tag: '高潜' }],
    }));
    app.$('#regionPick').click();
    app.pick('广东省');
    app.pick('深圳市');
    app.pick('南山区');
    await new Promise(r => setTimeout(r, 200));

    assert.equal(app.window.__pwned, undefined, '❌ XSS：LLM 返回内容被当作 HTML 执行');
    assert.equal(app.$('#regionInsight').querySelectorAll('img[onerror], script').length, 0,
      '❌ XSS：注入的危险节点被真实插入 DOM');
  });

  test('占位符假数据被前端兜底拦截并降级为行业基准模型', async () => {
    const app = await boot(() => ({
      delay: 10,
      brands: [
        { brandName: 'XX螺蛳粉', hotItem: '招牌', avgPrice: 22, rating: 4.5, tag: '红海' },
        { brandName: '某某粉店', hotItem: '招牌', avgPrice: 18, rating: 4.2, tag: '平稳' },
      ],
    }));
    app.$('#regionPick').click();
    app.pick('广东省');
    app.pick('深圳市');
    app.pick('南山区');
    await new Promise(r => setTimeout(r, 200));
    const html = app.insightHTML();
    assert.ok(!html.includes('XX螺蛳粉'), '假数据不得进入页面');
    assert.ok(!html.includes('某某粉店'), '假数据不得进入页面');
    assert.ok(html.includes('行业基准分析模型'), '应给出明确的降级说明');
  });
});
