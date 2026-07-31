import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadData() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8');
  const sandbox = { module: { exports: {} }, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

test('茶饮赛道品牌池不含火锅/快餐类（修复跨品类混入）', () => {
  const s = loadData();
  const hotpot = ['海底捞', '巴奴', '湊湊', '小龙坎', '杨国福', '张亮', '华莱士', '肯德基'];
  const teaPool = s.brandBankFor('catering', '轻乳茶/原叶鲜奶茶');
  assert.ok(!teaPool.some(b => hotpot.includes(b)), '茶饮池混入火锅/快餐: ' + teaPool.join(','));
  const noodlePool = s.brandBankFor('catering', '螺蛳粉');
  assert.ok(!noodlePool.some(b => ['喜茶', '霸王茶姬', '奈雪的茶'].includes(b)), '粉面池混入茶饮: ' + noodlePool.join(','));
});

test('genBase catering 客单价落在合理区间 [8,60]（修复离谱价格）', () => {
  const s = loadData();
  for (const name of ['重庆老火锅', '螺蛳粉', '轻乳茶/原叶鲜奶茶', '鲜果茶']) {
    const b = s.genBase('catering', 'x_' + name, name);
    assert.ok(b.price >= 8 && b.price <= 60, name + ' 价格越界: ' + b.price);
  }
});

test('轻乳茶走 CURATED 真实路径（价格/品牌真实，非随机编造）', () => {
  const s = loadData();
  const TREES = s.module.exports.TREES;
  const l3 = Object.values(TREES.catering.L3).find(n => n.name === '轻乳茶/原叶鲜奶茶');
  const ana = s.getAnalytics('catering', l3.id);
  assert.strictEqual(ana.price, 19, '轻乳茶客单价应为 19');
  assert.strictEqual(ana.topBrands.map(b => b.name).join(','), '霸王茶姬,喜茶,茶颜悦色');
});

test('genRegionInsight 轻乳茶不混入火锅且爆品价格合理（修复假店面/错价）', () => {
  const s = loadData();
  const TREES = s.module.exports.TREES;
  const l3 = Object.values(TREES.catering.L3).find(n => n.name === '轻乳茶/原叶鲜奶茶');
  const region = { prov: { id: '46', name: '海南省' }, city: { name: '海口市' }, dist: '龙华区' };
  const ins = s.genRegionInsight('catering', l3.id, region);
  const hotpot = ['海底捞', '巴奴', '湊湊', '小龙坎', '杨国福'];
  assert.ok(!ins.localBrands.map(b => b.name).some(n => hotpot.includes(n)), '区域洞察混入火锅品牌');
  for (const p of ins.products) {
    assert.ok(p.price >= 12 && p.price <= 28, '爆品价格越界: ' + p.name + ' ¥' + p.price);
  }
});
