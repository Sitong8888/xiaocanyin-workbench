/* =========================================================================
 * 回归测试：Worker 检索词净化（「搜推分离」架构）
 * ---------------------------------------------------------------------------
 * 背景：曾因把 `分类:餐饮>...>鲜果茶` 语法与强制双引号直接送进博查搜索，
 *      导致搜索引擎 0 召回 → 全站退化为「暂未检索到榜单」保底提示。
 * 契约：发给搜索引擎的 searchQuery 必须是干净自然语言；
 *      分类路径只能出现在 catPath 字段里（供 Step 2 的 LLM 做品类约束）。
 * ========================================================================= */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchQuery } from '../cloudflare/worker.js';

/** 搜索词净化的硬性契约：任何输入都必须满足 */
function assertCleanQuery(sq) {
  assert.ok(!sq.includes('分类'), `搜索词残留分类语法: ${sq}`);
  assert.ok(!sq.includes('>'), `搜索词残留路径分隔符: ${sq}`);
  assert.ok(!/["“”'‘’]/.test(sq), `搜索词残留引号: ${sq}`);
  assert.ok(!/\bOR\b/.test(sq), `搜索词残留布尔语法: ${sq}`);
  assert.ok(!/[()（）]/.test(sq), `搜索词残留括号: ${sq}`);
  assert.ok(!/\s{2,}/.test(sq), `搜索词存在连续空格: ${sq}`);
  assert.equal(sq, sq.trim(), '搜索词首尾存在空白');
}

describe('buildSearchQuery — 搜索词净化契约', () => {
  test('新版格式：输出干净自然语言，分类路径仅进 catPath', () => {
    const r = buildSearchQuery(
      '海口市 龙华区 鲜果茶 美团 大众点评 热门 分类:餐饮>茶饮咖啡>新式茶饮>鲜果茶'
    );
    assert.equal(r.searchQuery, '海口市 龙华区 鲜果茶 美团 大众点评 热门');
    assert.equal(r.catPath, '餐饮>茶饮咖啡>新式茶饮>鲜果茶');
    assert.equal(r.l3, '鲜果茶');
    assertCleanQuery(r.searchQuery);
  });

  test('旧版格式（带引号+省前缀+冗余词）必须被净化为同一结果', () => {
    const legacy = buildSearchQuery(
      '"海南省海口市龙华区" "鲜果茶" 美团 大众点评 抖音 热门商家 真实店名 分类:餐饮>茶饮咖啡>新式茶饮>鲜果茶'
    );
    assert.equal(legacy.searchQuery, '海口市 龙华区 鲜果茶 美团 大众点评 热门');
    assertCleanQuery(legacy.searchQuery);
  });

  test('中文全角引号与全角冒号同样被剥离', () => {
    const r = buildSearchQuery('“深圳市南山区” “螺蛳粉” 分类：餐饮>小吃快餐>特色粉面>螺蛳粉');
    assertCleanQuery(r.searchQuery);
    assert.equal(r.catPath, '餐饮>小吃快餐>特色粉面>螺蛳粉');
    assert.ok(r.searchQuery.includes('螺蛳粉'));
  });

  test('省级前缀被丢弃，市/区之间补空格', () => {
    const r = buildSearchQuery('广东省深圳市南山区 螺蛳粉 分类:餐饮>小吃快餐>特色粉面>螺蛳粉');
    assert.ok(!r.searchQuery.includes('广东省'), '省级前缀应被丢弃');
    assert.ok(r.searchQuery.startsWith('深圳市 南山区'), `实际: ${r.searchQuery}`);
  });

  test('边界：只选到省时不得把区域清空', () => {
    const r = buildSearchQuery('广东省 螺蛳粉 美团 大众点评 热门 分类:餐饮>小吃快餐>特色粉面>螺蛳粉');
    assert.ok(r.searchQuery.includes('广东省'), '仅省级时应保留省名，否则搜索失去地域约束');
    assertCleanQuery(r.searchQuery);
  });

  test('边界：直辖市（无省级前缀）解析正常', () => {
    const r = buildSearchQuery('重庆市 渝中区 重庆老火锅 分类:餐饮>火锅>川渝火锅>重庆老火锅');
    assert.equal(r.searchQuery, '重庆市 渝中区 重庆老火锅 美团 大众点评 热门');
  });

  test('边界：空输入 / 纯空白不抛异常', () => {
    for (const input of ['', '   ', null, undefined]) {
      const r = buildSearchQuery(input);
      assert.equal(typeof r.searchQuery, 'string');
      assertCleanQuery(r.searchQuery);
    }
  });

  test('平台词恒定只出现一次（防重复拼接）', () => {
    const r = buildSearchQuery('海口市 龙华区 鲜果茶 美团 大众点评 抖音 美团 热门 分类:餐饮>茶饮咖啡>新式茶饮>鲜果茶');
    assert.equal((r.searchQuery.match(/美团/g) || []).length, 1, '「美团」重复出现会稀释检索权重');
    assert.equal((r.searchQuery.match(/大众点评/g) || []).length, 1);
  });

  test('无分类路径时退化为剩余品类词，仍保持干净', () => {
    const r = buildSearchQuery('海口市 龙华区 足道采耳');
    assert.equal(r.catPath, '');
    assert.ok(r.searchQuery.includes('足道采耳'));
    assertCleanQuery(r.searchQuery);
  });
});
