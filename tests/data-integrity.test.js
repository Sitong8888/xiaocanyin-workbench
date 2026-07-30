/* =========================================================================
 * 回归测试：数据字典完整性
 * ---------------------------------------------------------------------------
 * data.js 是 1600 行、128KB 的手写数据字典，是全站的事实来源。
 * 任何一个三级赛道缺字段，都会在用户点到它的瞬间白屏或渲染 undefined。
 * 逐条遍历成本极低（毫秒级），但能拦住 100% 的结构性缺失。
 * ========================================================================= */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = require(path.join(ROOT, 'js/data.js'));

const { CATEGORIES, TREES, ANALYTICS, GAP_TYPES, genRegionInsight, getProvinces, getCities, getDistricts, findL3Id } = D;

/** 收集全部 (大类, 三级赛道 id) 组合 */
const ALL_L3 = CATEGORIES.flatMap(c => Object.keys(TREES[c.id].L3).map(id => ({ cat: c.id, catName: c.name, id })));

describe('分类树结构', () => {
  test('8 大行业大类齐备', () => {
    assert.equal(CATEGORIES.length, 8);
    for (const c of CATEGORIES) {
      assert.ok(c.id && c.name && c.icon, `大类字段缺失: ${JSON.stringify(c)}`);
      assert.ok(TREES[c.id], `缺少分类树: ${c.id}`);
      assert.ok(ANALYTICS[c.id], `缺少分析数据: ${c.id}`);
    }
  });

  test('三级赛道总量为 158（数量变更需同步更新本断言）', () => {
    assert.equal(ALL_L3.length, 158);
  });

  test('每个三级赛道都能回溯出完整的 L1>L2>L3 路径', () => {
    for (const { cat, id } of ALL_L3) {
      const p = D.getPath(cat, id);
      assert.equal(p.length, 3, `路径不完整: ${cat}/${id} → ${JSON.stringify(p)}`);
      assert.ok(p.every(n => n && n.name), `路径存在空节点: ${cat}/${id}`);
    }
  });
});

describe('赛道分析数据完整性（逐条遍历 158 个赛道）', () => {
  test('基础指标字段齐备且类型正确', () => {
    for (const { cat, id } of ALL_L3) {
      const a = ANALYTICS[cat][id];
      assert.ok(a, `缺少分析数据: ${cat}/${id}`);
      assert.ok(Array.isArray(a.hitProducts) && a.hitProducts.length >= 2,
        `${cat}/${id} 预置爆品应 ≥2 个`);
      assert.ok(a.strategy, `${cat}/${id} 缺少战略空位数据`);
    }
  });

  test('特劳特定位四要素 + 三战术指令齐备', () => {
    const required = ['mindPain', 'rivalWeak', 'positionType', 'mindNail', 'tactics'];
    for (const { cat, id } of ALL_L3) {
      const s = ANALYTICS[cat][id].strategy;
      for (const k of required) {
        assert.ok(s[k], `${cat}/${id} 缺少 strategy.${k}`);
      }
      assert.ok(GAP_TYPES.includes(s.positionType),
        `${cat}/${id} 定位类型非法: ${s.positionType}`);
      for (const k of ['hammer', 'traffic', 'trust']) {
        assert.ok(s.tactics[k], `${cat}/${id} 缺少战术指令 tactics.${k}`);
      }
    }
  });

  test('跨品类污染检查：餐饮类对立面不得混入咖啡茶饮巨头', () => {
    const hotpot = findL3Id('catering', '重庆老火锅');
    const s = ANALYTICS.catering[hotpot].strategy;
    assert.match(s.rivalWeak, /海底捞/, '火锅赛道的对立面应锚定火锅头部品牌');
    assert.doesNotMatch(s.rivalWeak, /星巴克|瑞幸|喜茶/, '❌ 火锅赛道混入了咖啡/茶饮品牌');
  });
});

describe('区域洞察生成器', () => {
  const region = { prov: { id: 'GD', name: '广东省' }, city: { id: 'SZ', name: '深圳市' }, dist: '南山区' };

  test('输出本地化的心智指标与战术指令', () => {
    const id = findL3Id('catering', '螺蛳粉');
    const ins = genRegionInsight('catering', id, region);
    assert.ok(ins.mindPain.includes('南山区'), '心智痛点应本地化到具体区县');
    assert.ok(ins.mindNail.includes('南山区'), '定位钉子应本地化到具体区县');
    assert.ok(GAP_TYPES.includes(ins.positionType));
    assert.match(ins.tacticHammer, /¥\d+/, '视觉锤战术应包含价格锚点');
    assert.match(ins.tacticTraffic, /美团/);
    assert.ok(ins.localPain && ins.localWeak && ins.localGap, '需保留旧字段以兼容存量渲染');
  });

  test('对全部 158 个赛道生成洞察均不抛异常且无 undefined 泄漏', () => {
    for (const { cat, id } of ALL_L3) {
      const ins = genRegionInsight(cat, id, region);
      for (const [k, v] of Object.entries(ins)) {
        if (typeof v === 'string') {
          assert.ok(!v.includes('undefined'), `${cat}/${id} 字段 ${k} 泄漏 undefined: ${v}`);
          assert.ok(!v.includes('NaN'), `${cat}/${id} 字段 ${k} 泄漏 NaN: ${v}`);
        }
      }
    }
  });

  test('相同输入产出稳定结果（生成器必须是确定性的）', () => {
    const id = findL3Id('catering', '鲜果茶');
    const a = genRegionInsight('catering', id, region);
    const b = genRegionInsight('catering', id, region);
    assert.deepEqual(a, b, '❌ 生成器带随机性，用户每次刷新看到的结论都不同');
  });
});

describe('行政区划数据', () => {
  test('省级列表非空且字段完整', () => {
    const provs = getProvinces();
    assert.ok(provs.length >= 30);
    for (const p of provs) assert.ok(p.id && p.name, `省级数据缺字段: ${JSON.stringify(p)}`);
  });

  test('每个省至少有一个城市，城市 id 在省内唯一', () => {
    for (const p of getProvinces()) {
      const cities = getCities(p.id);
      assert.ok(cities.length >= 1, `${p.name} 无城市数据`);
      const ids = cities.map(c => c.id);
      assert.equal(new Set(ids).size, ids.length, `${p.name} 存在重复城市 id`);
    }
  });

  test('区县查询对未知 id 返回空数组而非抛异常', () => {
    assert.deepEqual(getDistricts('NOT_EXIST', 'NOPE'), []);
  });
});
