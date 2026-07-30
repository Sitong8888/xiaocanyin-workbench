/* =========================================================================
 * 回归测试：假数据正则清洗 + 事实锚定（Grounding）校验
 * ---------------------------------------------------------------------------
 * 背景：LLM 曾大量返回「XX足浴」「某某采耳馆」「品牌名A」等占位符，
 *      以及快照中根本不存在的拼凑店名（幻觉）。
 * 契约：只有「非占位符 + 客单价 > 0 + 店名能在搜索快照原文中找到」的条目才允许出站。
 *      这是用户信任的底线——宁可返回空数组降级，也绝不输出编造数据。
 * ========================================================================= */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { groundFilter, snippetsToText, FAKE_PATTERN } from '../cloudflare/worker.js';

const SNIPPET = `
【快照1】海口龙华区奶茶店推荐榜
喜茶（国贸店）人气常年第一，古茗、阿水大叔柠檬茶紧随其后。
【快照2】海口足浴按摩人气榜
重庆富侨口碑不错，郑远元专业修脚也在榜单上。
`;

describe('FAKE_PATTERN — 占位符识别', () => {
  const shouldMatch = ['XX足浴', 'YY茶饮', 'ZZ店', 'ABC按摩', '某某采耳馆', '品牌名A',
    '示例商家', '测试门店', '店名待定', '占位商户', '待补充', 'unknown', 'Placeholder', 'example shop'];
  const shouldNotMatch = ['喜茶', '古茗', '重庆富侨', '郑远元', '阿水大叔', '海口老爸茶采耳'];

  test('占位符全部命中', () => {
    for (const s of shouldMatch) assert.ok(FAKE_PATTERN.test(s), `应判定为假名: ${s}`);
  });
  test('真实店名不得误伤', () => {
    for (const s of shouldNotMatch) assert.ok(!FAKE_PATTERN.test(s), `误伤真实店名: ${s}`);
  });
});

describe('groundFilter — 三重清洗', () => {
  test('占位符店名被拦截', () => {
    const r = groundFilter([{ brandName: 'XX茶饮', hotItem: '招牌奶茶', avgPrice: 20 }], SNIPPET);
    assert.equal(r.brands.length, 0);
    assert.equal(r.fakeDrop, 1);
  });

  test('占位符爆品名同样被拦截', () => {
    const r = groundFilter([{ brandName: '喜茶', hotItem: '示例爆品', avgPrice: 25 }], SNIPPET);
    assert.equal(r.brands.length, 0);
    assert.equal(r.fakeDrop, 1);
  });

  test('客单价为 0 / ¥0 / 空 / 非数字 一律拦截', () => {
    for (const price of [0, '0', '¥0', '', null, undefined, '面议']) {
      const r = groundFilter([{ brandName: '喜茶', hotItem: '多肉葡萄', avgPrice: price }], SNIPPET);
      assert.equal(r.brands.length, 0, `avgPrice=${JSON.stringify(price)} 应被拦截`);
    }
  });

  test('客单价带货币符号可正常解析并保留', () => {
    const r = groundFilter([{ brandName: '喜茶', hotItem: '多肉葡萄', avgPrice: '¥25' }], SNIPPET);
    assert.equal(r.brands.length, 1);
  });

  test('【核心】快照中不存在的幻觉店名被锚定校验剔除', () => {
    const r = groundFilter([
      { brandName: '喜茶', hotItem: '多肉葡萄', avgPrice: 25 },
      { brandName: '龙华区精品茶饮旗舰店', hotItem: '招牌果茶', avgPrice: 22 },
    ], SNIPPET);
    assert.deepEqual(r.brands.map(b => b.brandName), ['喜茶']);
    assert.equal(r.ungroundedDrop, 1, '幻觉店名必须计入 ungroundedDrop 以便观测');
  });

  test('带括号分店后缀的真实店名应被保留（去括号后匹配）', () => {
    const r = groundFilter([{ brandName: '古茗（滨海大道店）', hotItem: '超市水果茶', avgPrice: 18 }], SNIPPET);
    assert.equal(r.brands.length, 1, '括号分店名不应被误杀');
  });

  test('单字店名被拦截（几乎必为解析残渣）', () => {
    const r = groundFilter([{ brandName: '茶', hotItem: '奶茶', avgPrice: 15 }], SNIPPET);
    assert.equal(r.brands.length, 0);
  });

  test('全脏输入 → 返回空数组（触发前端降级，绝不输出脏数据）', () => {
    const r = groundFilter([
      { brandName: 'XX足浴', hotItem: '足疗', avgPrice: 100 },
      { brandName: '某某采耳馆', hotItem: '采耳', avgPrice: 88 },
      { brandName: '重庆富侨', hotItem: '足疗', avgPrice: 0 },
      { brandName: '虚构养生会所', hotItem: '按摩', avgPrice: 120 },
    ], SNIPPET);
    assert.equal(r.brands.length, 0);
    assert.equal(r.rawCount, 4);
    assert.equal(r.fakeDrop + r.ungroundedDrop, 4, '每一条都必须有明确的拦截归因');
  });

  test('异常输入不抛异常（null / 非数组 / 空对象）', () => {
    for (const input of [null, undefined, 'not-an-array', {}, [null, {}, { brandName: '' }]]) {
      const r = groundFilter(input, SNIPPET);
      assert.ok(Array.isArray(r.brands));
      assert.equal(r.brands.length, 0);
    }
  });

  test('空快照时一切都无法锚定 → 全部剔除', () => {
    const r = groundFilter([{ brandName: '喜茶', hotItem: '多肉葡萄', avgPrice: 25 }], '');
    assert.equal(r.brands.length, 0, '没有事实来源时不允许输出任何品牌');
  });
});

describe('snippetsToText — 上下文构造', () => {
  test('最多取 12 条快照（控制 token 成本）', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ title: `标题${i}`, content: `正文${i}` }));
    const text = snippetsToText(many);
    assert.equal((text.match(/【快照/g) || []).length, 12);
  });

  test('单条正文截断至 600 字', () => {
    const text = snippetsToText([{ title: 'T', content: '字'.repeat(2000) }]);
    assert.ok(text.length < 700, `未截断，长度=${text.length}`);
  });

  test('空标题且空正文的脏快照被过滤', () => {
    const text = snippetsToText([{ title: '', content: '' }, { title: 'ok', content: 'c' }]);
    assert.equal((text.match(/【快照/g) || []).length, 1);
  });

  test('异常输入返回空串', () => {
    assert.equal(snippetsToText(null), '');
    assert.equal(snippetsToText([]), '');
  });
});
