/* =============================================================================
 * 小餐饮爆品与赛道筛选工作台 —— 数据模型 (Data Model)
 * -----------------------------------------------------------------------------
 * 表 1：行业主表 (Industry Tree)  —— 多级父子关联，支持 1~3 级层级检索
 *   字段：id(主键) / name(名称) / level(层级:1|2|3) / parentId(父级ID, 指向上一级)
 *
 * 表 2：品类全景数据表 (Category Analytics) —— 关联三级行业，沉淀分析指标
 *   字段：level3Id(关联三级行业) / marketSize(市场规模-亿元) / growth(同比增长%)
 *        / competition(竞争烈度 0~1) / penetration(渗透率 0~1)
 *        / avgPrice(客单价-元) / repurchase(复购率 0~1)
 *        / topBrands(TOP品牌+市占) / demographics(人群画像)
 *        / trend(近12个月规模走势) / ocean(蓝海/红海/高潜/平稳) / products(商品全景)
 *
 * 表 3：战略空位表 (Strategic Gap Table) —— 顾均辉空位表模型
 *   字段：strategy.competitors(对手及占据心智) / strategy.painPoints(未满足痛点)
 *        / strategy.weaknesses(竞品固有弱点) / strategy.gap(战略空位与切入点)
 *        / strategy.gapType(空位类型：人群/价格/场景/特性 空位)
 * ========================================================================== */

/* ---------- 表 1：行业主表 (Industry Tree) ---------- */
const INDUSTRY_TREE = [
  // L1 茶饮咖啡
  { id: 'L1_1',   name: '茶饮咖啡',     level: 1, parentId: null },
  { id: 'L2_1_1', name: '新中式茶饮',   level: 2, parentId: 'L1_1' },
  { id: 'L3_1_1_1', name: '鲜果茶',     level: 3, parentId: 'L2_1_1' },
  { id: 'L3_1_1_2', name: '纯茶/原叶茶',level: 3, parentId: 'L2_1_1' },
  { id: 'L3_1_1_3', name: '养生茶',     level: 3, parentId: 'L2_1_1' },
  { id: 'L2_1_2', name: '现磨咖啡',     level: 2, parentId: 'L1_1' },
  { id: 'L3_1_2_1', name: '美式/意式',  level: 3, parentId: 'L2_1_2' },
  { id: 'L3_1_2_2', name: '奶咖/特调',  level: 3, parentId: 'L2_1_2' },
  { id: 'L2_1_3', name: '柠檬茶',       level: 2, parentId: 'L1_1' },
  { id: 'L3_1_3_1', name: '手打柠檬茶', level: 3, parentId: 'L2_1_3' },
  { id: 'L3_1_3_2', name: '鸭屎香柠檬茶',level:3, parentId: 'L2_1_3' },

  // L1 小吃快餐
  { id: 'L1_2',   name: '小吃快餐',     level: 1, parentId: null },
  { id: 'L2_2_1', name: '饭食便当',     level: 2, parentId: 'L1_2' },
  { id: 'L3_2_1_1', name: '中式快餐',   level: 3, parentId: 'L2_2_1' },
  { id: 'L3_2_1_2', name: '盖浇饭',     level: 3, parentId: 'L2_2_1' },
  { id: 'L2_2_2', name: '面馆粉店',     level: 2, parentId: 'L1_2' },
  { id: 'L3_2_2_1', name: '牛肉面',     level: 3, parentId: 'L2_2_2' },
  { id: 'L3_2_2_2', name: '螺蛳粉',     level: 3, parentId: 'L2_2_2' },
  { id: 'L3_2_2_3', name: '酸辣粉',     level: 3, parentId: 'L2_2_2' },
  { id: 'L2_2_3', name: '炸物小吃',     level: 2, parentId: 'L1_2' },
  { id: 'L3_2_3_1', name: '炸鸡',       level: 3, parentId: 'L2_2_3' },
  { id: 'L3_2_3_2', name: '小酥肉/薯塔',level: 3, parentId: 'L2_2_3' },

  // L1 烘焙甜品
  { id: 'L1_3',   name: '烘焙甜品',     level: 1, parentId: null },
  { id: 'L2_3_1', name: '中式烘焙',     level: 2, parentId: 'L1_3' },
  { id: 'L3_3_1_1', name: '中式糕点',   level: 3, parentId: 'L2_3_1' },
  { id: 'L3_3_1_2', name: '麻薯/蛋黄酥',level: 3, parentId: 'L2_3_1' },
  { id: 'L2_3_2', name: '西式烘焙',     level: 2, parentId: 'L1_3' },
  { id: 'L3_3_2_1', name: '面包/吐司',  level: 3, parentId: 'L2_3_2' },
  { id: 'L3_3_2_2', name: '蛋糕/甜品',  level: 3, parentId: 'L2_3_2' },
  { id: 'L2_3_3', name: '网红甜品',     level: 2, parentId: 'L1_3' },
  { id: 'L3_3_3_1', name: '雪媚娘/慕斯',level: 3, parentId: 'L2_3_3' },

  // L1 火锅串串
  { id: 'L1_4',   name: '火锅串串',     level: 1, parentId: null },
  { id: 'L2_4_1', name: '火锅',         level: 2, parentId: 'L1_4' },
  { id: 'L3_4_1_1', name: '市井火锅',   level: 3, parentId: 'L2_4_1' },
  { id: 'L3_4_1_2', name: '椰子鸡火锅', level: 3, parentId: 'L2_4_1' },
  { id: 'L2_4_2', name: '串串香',       level: 2, parentId: 'L1_4' },
  { id: 'L3_4_2_1', name: '火锅串串',   level: 3, parentId: 'L2_4_2' },
  { id: 'L3_4_2_2', name: '钵钵鸡',     level: 3, parentId: 'L2_4_2' },

  // L1 夜宵烧烤
  { id: 'L1_5',   name: '夜宵烧烤',     level: 1, parentId: null },
  { id: 'L2_5_1', name: '烧烤',         level: 2, parentId: 'L1_5' },
  { id: 'L3_5_1_1', name: '烤串',       level: 3, parentId: 'L2_5_1' },
  { id: 'L3_5_1_2', name: '烤鱼',       level: 3, parentId: 'L2_5_1' },
  { id: 'L2_5_2', name: '小龙虾/卤味',  level: 2, parentId: 'L1_5' },
  { id: 'L3_5_2_1', name: '小龙虾',     level: 3, parentId: 'L2_5_2' },
  { id: 'L3_5_2_2', name: '卤味熟食',   level: 3, parentId: 'L2_5_2' },

  // L1 轻食沙拉
  { id: 'L1_6',   name: '轻食沙拉',     level: 1, parentId: null },
  { id: 'L2_6_1', name: '轻食',         level: 2, parentId: 'L1_6' },
  { id: 'L3_6_1_1', name: '沙拉碗',     level: 3, parentId: 'L2_6_1' },
  { id: 'L3_6_1_2', name: '波奇饭',     level: 3, parentId: 'L2_6_1' },
  { id: 'L2_6_2', name: '饮品代餐',     level: 2, parentId: 'L1_6' },
  { id: 'L3_6_2_1', name: '代餐奶昔',   level: 3, parentId: 'L2_6_2' },
  { id: 'L3_6_2_2', name: '果蔬汁',     level: 3, parentId: 'L2_6_2' },
];

/* ---------- 各一级赛道的 TOP 品牌池 ---------- */
const BRAND_POOL = {
  L1_1: ['喜茶', '奈雪的茶', '霸王茶姬', '蜜雪冰城', '茶百道', '瑞幸咖啡', '库迪咖啡', '幸运咖', '柠季', '丘大叔'],
  L1_2: ['老乡鸡', '真功夫', '杨国福麻辣烫', '魏家凉皮', '和府捞面', '西少爷', '夸父炸串', '正新鸡排', '米村拌饭'],
  L1_3: ['泸溪河', '鲍师傅', '好利来', '詹记', '墨茉点心局', '虎头局', '面包新语', '85度C', '仟吉'],
  L1_4: ['海底捞', '巴奴毛肚火锅', '怂火锅', '小龙坎', '马路边边', '钢管厂五区', '蜀大侠'],
  L1_5: ['木屋烧烤', '丰茂烤串', '很久以前', '文和友', '信良记小龙虾', '绝味鸭脖', '周黑鸭'],
  L1_6: ['甜心摇滚沙拉', '色拉说', 'gaga', 'Wagas', '超能鹿战队', '柠檬共和国', '你好椰'],
};

/* ---------- 各一级赛道商品命名模板（用于商品全景） ---------- */
const PRODUCT_POOL = {
  L1_1: ['招牌果茶', '季节鲜果茶', '经典奶茶', '轻乳茶', '买一送一桶'],
  L1_2: ['招牌套餐', '超值双拼', '经典单品', '加料升级', '周卡特惠'],
  L1_3: ['当日现烤', '网红麻薯', '限定礼盒', 'mini组合', '买二送一'],
  L1_4: ['双人套餐', '招牌锅底', '串串自助', '荤素拼盘', '夜宵专场'],
  L1_5: ['撸串套餐', '秘制烤鱼', '小龙虾桶', '卤味拼盘', '宵夜狂欢'],
  L1_6: ['低卡沙拉碗', '波奇饭', '代餐奶昔', '鲜榨果蔬汁', '周订阅卡'],
};

/* ---------- 确定性伪随机（保证刷新数据稳定） ---------- */
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 表 3：战略空位表 (顾均辉空位表模型) 实战示例 ---------- */
const STRATEGY_TABLE = {
  /* ---- 茶饮咖啡 ---- */
  'L3_1_1_1': { // 鲜果茶（红海）
    competitors: [
      { name: '喜茶', mind: '高端鲜果茶标杆（多肉葡萄）' },
      { name: '奈雪的茶', mind: '茶饮+软欧包「第三空间」' },
      { name: '霸王茶姬', mind: '国风原叶鲜奶茶' },
      { name: '蜜雪冰城', mind: '极致性价比·下沉市场' },
    ],
    painPoints: ['高峰期排队久、出杯慢', '客单价 20-30 元与学生党/下沉市场有距离', '甜度与热量焦虑', '同质化严重、缺乏记忆点'],
    weaknesses: ['头部重门店重 SKU，供应链与损耗高', '价格带被蜜雪封死，向上空间有限', '下沉与社区覆盖弱'],
    gap: '主打「15 元社区鲜果茶 + 3 分钟快取」，攻占价格空位与社区场景空位。',
    gapType: '价格空位',
  },
  'L3_1_1_2': { // 纯茶/原叶茶
    competitors: [
      { name: '茶颜悦色', mind: '国风茶饮文化' },
      { name: '煮葉', mind: '原叶鲜煮茶' },
      { name: '霸王茶姬', mind: '原叶鲜奶茶' },
    ],
    painPoints: ['年轻人嫌传统茶苦涩、不会泡', '想喝茶又怕奶茶热量', '缺即饮便利场景'],
    weaknesses: ['原叶茶现制出杯慢、标准化难', '缺乏年轻化表达'],
    gap: '「0 糖现萃原叶茶 + 便利店冷萃瓶装」，攻特性空位（0 糖健康）与场景空位。',
    gapType: '特性空位',
  },
  'L3_1_1_3': { // 养生茶（蓝海）
    competitors: [
      { name: '椿风', mind: '养生茶饮' },
      { name: '荷田水铺', mind: '国潮养生茶' },
      { name: '同仁堂知嘛健康', mind: '药食同源信任背书' },
    ],
    painPoints: ['熬夜/脱发/湿气重诉求强烈', '嫌中药苦难坚持', '想养生又怕麻烦'],
    weaknesses: ['养生概念同质化、功效难感知', '原料成本与供应链重'],
    gap: '「熬夜护肝/祛湿即饮小方」，攻人群空位（亚健康白领）+ 特性空位。',
    gapType: '人群空位',
  },
  'L3_1_2_1': { // 美式/意式
    competitors: [
      { name: '瑞幸', mind: '快取平价咖啡' },
      { name: '库迪', mind: '9.9 价格战' },
      { name: '星巴克', mind: '第三空间' },
    ],
    painPoints: ['精品与平价两极分化', '想喝好豆又嫌贵', '写字楼外送慢'],
    weaknesses: ['价格战下利润薄', '口味同质、缺乏差异化'],
    gap: '「云南小众产区单一产地 SOE + 15 元快取」，攻特性空位（产地故事）。',
    gapType: '特性空位',
  },
  'L3_1_2_2': { // 奶咖/特调
    competitors: [
      { name: '瑞幸', mind: '生椰拿铁大单品' },
      { name: '幸运咖', mind: '低价奶咖' },
      { name: 'Manner', mind: '高品质平价' },
    ],
    painPoints: ['生椰椰子味审美疲劳', '想喝新口味但怕踩雷', '乳糖不耐人群被忽略'],
    weaknesses: ['大单品依赖、迭代快易被抄', '植物基覆盖弱'],
    gap: '「燕麦/椰乳零乳糖特调 + 季节限定」，攻人群空位（乳糖不耐）。',
    gapType: '人群空位',
  },
  'L3_1_3_1': { // 手打柠檬茶
    competitors: [
      { name: '柠季', mind: '手打柠檬茶连锁' },
      { name: '丘大叔', mind: '鸭屎香柠檬茶' },
      { name: 'LINLEE', mind: '手打柠檬茶' },
    ],
    painPoints: ['夏季解腻需求强', '嫌奶茶甜', '门店排队'],
    weaknesses: ['柠檬供应链受季节影响', '冬季需求明显下滑'],
    gap: '「冬季热柠茶 + 陈皮柠檬」，攻场景空位（四季常青）。',
    gapType: '场景空位',
  },
  'L3_1_3_2': { // 鸭屎香柠檬茶（蓝海）
    competitors: [
      { name: '丘大叔', mind: '鸭屎香柠檬茶' },
      { name: '柠季', mind: '手打柠檬茶' },
      { name: '茶救星球', mind: '单丛柠檬茶' },
    ],
    painPoints: ['单丛香气小众但受欢迎', '想喝正宗鸭屎香怕勾兑'],
    weaknesses: ['真假鸭屎香难辨、原料分级乱'],
    gap: '「原产地单丛直供 + 香气标准化」，攻特性空位（真单丛）。',
    gapType: '特性空位',
  },

  /* ---- 小吃快餐 ---- */
  'L3_2_1_1': { // 中式快餐
    competitors: [
      { name: '老乡鸡', mind: '干净卫生社区店' },
      { name: '真功夫', mind: '蒸饭标准化' },
      { name: '大米先生', mind: '现炒自选' },
    ],
    painPoints: ['上班族要快+干净+不贵', '外卖油腻', '预制菜信任危机'],
    weaknesses: ['标准化与「现炒」难兼得', '租金人力成本高'],
    gap: '「明档现炒 + 称重自选 + 20 元」，攻特性空位（现炒可见）。',
    gapType: '特性空位',
  },
  'L3_2_1_2': { // 盖浇饭
    competitors: [
      { name: '夫妻小店', mind: '便宜顶饱' },
      { name: '外卖专营店', mind: '纯外卖低价的' },
      { name: '乡村基', mind: '连锁快餐饭' },
    ],
    painPoints: ['便宜顶饱但油腻、菜不新鲜', '想吃得健康点'],
    weaknesses: ['低端形象、卫生参差'],
    gap: '「低油轻食盖饭 + 粗粮饭底」，攻人群空位（健身上班族）。',
    gapType: '人群空位',
  },
  'L3_2_2_1': { // 牛肉面
    competitors: [
      { name: '马记永', mind: '兰州拉面升级' },
      { name: '陈香贵', mind: '国潮牛肉面' },
      { name: '马子禄', mind: '老字号清真' },
    ],
    painPoints: ['想吃好面但连锁贵', '非清真人群被排除', '汤底偏咸'],
    weaknesses: ['清真定位限制人群', '汤底高钠不健康'],
    gap: '「清真外的川味/番茄牛肉面 + 低钠汤」，攻人群空位 + 特性空位。',
    gapType: '人群空位',
  },
  'L3_2_2_2': { // 螺蛳粉（红海）
    competitors: [
      { name: '李子柒', mind: '零售袋装标杆' },
      { name: '好欢螺', mind: '袋装螺蛳粉' },
      { name: '柒粉', mind: '堂食连锁' },
    ],
    painPoints: ['臭味劝退社交场景', '堂食排队', '外卖到家味道重'],
    weaknesses: ['臭味限制场景', '同质化', '客单偏低'],
    gap: '「无烟无味家庭装 + 写字楼私密堂食」，攻场景空位。',
    gapType: '场景空位',
  },
  'L3_2_2_3': { // 酸辣粉
    competitors: [
      { name: '阿宽', mind: '零售酸辣粉' },
      { name: '双娇', mind: '堂食酸辣粉' },
      { name: '街边小店', mind: '现做便宜' },
    ],
    painPoints: ['想吃酸辣又怕油', '明矾粉丝健康顾虑'],
    weaknesses: ['低端、原料安全疑虑'],
    gap: '「红薯鲜粉无添加 + 轻酸辣」，攻特性空位（无添加）。',
    gapType: '特性空位',
  },
  'L3_2_3_1': { // 炸鸡（高潜）
    competitors: [
      { name: '正新鸡排', mind: '平价大鸡排' },
      { name: '肯德基', mind: '全家桶西式炸鸡' },
      { name: '叫了个炸鸡', mind: '外卖炸鸡' },
    ],
    painPoints: ['好吃但油腻有罪恶感', '想现炸不想冷冻', '酱料少'],
    weaknesses: ['冷冻半成品感', '健康负面'],
    gap: '「现腌现炸 + 空气炸低脂 + 地域酱」，攻特性空位。',
    gapType: '特性空位',
  },
  'L3_2_3_2': { // 小酥肉/薯塔
    competitors: [
      { name: '夸父炸串', mind: '炸串连锁' },
      { name: '正新鸡排', mind: '油炸小吃' },
      { name: '街边摊', mind: '现炸酥肉' },
    ],
    painPoints: ['追剧零食需求强', '外卖凉了不脆'],
    weaknesses: ['配送脆度流失'],
    gap: '「自热脆盒 + 即食锁鲜」，攻场景空位（居家零食）。',
    gapType: '场景空位',
  },

  /* ---- 烘焙甜品 ---- */
  'L3_3_1_1': { // 中式糕点
    competitors: [
      { name: '泸溪河', mind: '桃酥/麻薯' },
      { name: '詹记', mind: '安徽糕点' },
      { name: '鲍师傅', mind: '肉松小贝' },
    ],
    painPoints: ['想买伴手礼但同质', '短保不便利'],
    weaknesses: ['短保损耗', '区域品牌难出省'],
    gap: '「长保国潮礼盒 + 电商」，攻场景空位（送礼）。',
    gapType: '场景空位',
  },
  'L3_3_1_2': { // 麻薯/蛋黄酥（蓝海）
    competitors: [
      { name: '墨茉点心局', mind: '网红麻薯' },
      { name: '泸溪河', mind: '麻薯/桃酥' },
      { name: '轩妈', mind: '蛋黄酥' },
    ],
    painPoints: ['网红麻薯排队', '想常温便携'],
    weaknesses: ['网红周期短', '产能瓶颈'],
    gap: '「常温锁鲜麻薯 + 下沉社区」，攻价格空位 + 人群空位。',
    gapType: '价格空位',
  },
  'L3_3_2_1': { // 面包/吐司
    competitors: [
      { name: '面包新语', mind: '连锁面包' },
      { name: '好利来', mind: '甜面包/蛋糕' },
      { name: '山姆', mind: '会员制大吐司' },
    ],
    painPoints: ['早餐刚需但主食面包糖油高'],
    weaknesses: ['主食化弱、同质'],
    gap: '「低糖全麦主食吐司 + 周订阅」，攻场景空位（早餐主食）。',
    gapType: '场景空位',
  },
  'L3_3_2_2': { // 蛋糕/甜品（红海）
    competitors: [
      { name: '好利来', mind: '高端蛋糕/半熟芝士' },
      { name: '21cake', mind: '线上蛋糕' },
      { name: '私房烘焙', mind: '定制蛋糕' },
    ],
    painPoints: ['生日蛋糕贵', '小份甜品选择少'],
    weaknesses: ['同质', '定制贵'],
    gap: '「一人食 mini 蛋糕 + 9.9」，攻人群空位（独居青年）。',
    gapType: '人群空位',
  },
  'L3_3_3_1': { // 雪媚娘/慕斯
    competitors: [
      { name: '私房烘焙', mind: '手工慕斯' },
      { name: '满记甜品', mind: '港式甜品' },
      { name: '鲜芋仙', mind: '台式甜品' },
    ],
    painPoints: ['想吃冰凉甜品怕胖', '冷藏不便携'],
    weaknesses: ['冷链要求高'],
    gap: '「-18℃ 冻幸免化 + 低卡」，攻特性空位（低卡）。',
    gapType: '特性空位',
  },

  /* ---- 火锅串串 ---- */
  'L3_4_1_1': { // 市井火锅（红海）
    competitors: [
      { name: '海底捞', mind: '极致服务' },
      { name: '巴奴', mind: '毛肚/产品主义' },
      { name: '怂火锅', mind: '情绪价值' },
    ],
    painPoints: ['火锅人均高', '服务过度打扰', '排队久'],
    weaknesses: ['头部营销重、租金高'],
    gap: '「社区平价市井火锅 + 自带菜」，攻价格空位。',
    gapType: '价格空位',
  },
  'L3_4_1_2': { // 椰子鸡火锅
    competitors: [
      { name: '润园四季', mind: '椰子鸡标杆' },
      { name: '同仁四季', mind: '椰子鸡连锁' },
    ],
    painPoints: ['想清淡养生火锅', '客单高', '仅在华南强势'],
    weaknesses: ['区域性强、价格高'],
    gap: '「北方清真椰子鸡 + 快餐化」，攻人群空位（北方/清真）。',
    gapType: '人群空位',
  },
  'L3_4_2_1': { // 火锅串串
    competitors: [
      { name: '马路边边', mind: '怀旧串串' },
      { name: '钢管厂五区', mind: '小郡肝串串' },
      { name: '小郡肝', mind: '串串香' },
    ],
    painPoints: ['想撸串又怕辣油', '按签计重不透明'],
    weaknesses: ['油重', '计数纠纷'],
    gap: '「清油藤椒串串 + 明档称重」，攻特性空位（清油）。',
    gapType: '特性空位',
  },
  'L3_4_2_2': { // 钵钵鸡
    competitors: [
      { name: '叶婆婆', mind: '乐山钵钵鸡' },
      { name: '马记', mind: '钵钵鸡连锁' },
      { name: '街边小店', mind: '冷串钵钵鸡' },
    ],
    painPoints: ['想吃冷串但卫生顾虑', '售卖网点少'],
    weaknesses: ['区域（乐山）局限'],
    gap: '「冷链包装钵钵鸡 + 全国电商」，攻场景空位。',
    gapType: '场景空位',
  },

  /* ---- 夜宵烧烤 ---- */
  'L3_5_1_1': { // 烤串
    competitors: [
      { name: '木屋烧烤', mind: '连锁烧烤' },
      { name: '丰茂烤串', mind: '现穿烤串' },
      { name: '很久以前', mind: '羊肉串连锁' },
    ],
    painPoints: ['夜宵社交强但等很久', '油烟大'],
    weaknesses: ['人力重、翻台慢'],
    gap: '「半成品自烤 + 露营场景」，攻场景空位（露营）。',
    gapType: '场景空位',
  },
  'L3_5_1_2': { // 烤鱼
    competitors: [
      { name: '探鱼', mind: '文艺烤鱼' },
      { name: '炉鱼', mind: '杭帮烤鱼' },
      { name: '江边城外', mind: '重庆烤鱼' },
    ],
    painPoints: ['两人吃一整条多', '想少油'],
    weaknesses: ['油重', '分量不灵活'],
    gap: '「单人烤鱼 + 低脂酱」，攻人群空位（一人食）。',
    gapType: '人群空位',
  },
  'L3_5_2_1': { // 小龙虾（高潜）
    competitors: [
      { name: '信良记', mind: '预制小龙虾' },
      { name: '文和友', mind: '网红龙虾馆' },
      { name: '靓靓蒸虾', mind: '湖北蒸虾' },
    ],
    painPoints: ['剥虾麻烦', '季节短价高', '堂食重'],
    weaknesses: ['季节性强', '剥食麻烦'],
    gap: '「去头去虾线即食 + 全年冷链」，攻场景空位（居家）。',
    gapType: '场景空位',
  },
  'L3_5_2_2': { // 卤味熟食
    competitors: [
      { name: '绝味鸭脖', mind: '散装卤味连锁' },
      { name: '周黑鸭', mind: '锁鲜装卤味' },
      { name: '紫燕百味鸡', mind: '佐餐卤味' },
    ],
    painPoints: ['想佐餐卤味但偏辣咸', '社区鲜卤店少'],
    weaknesses: ['辣咸重', '社区覆盖不足'],
    gap: '「低盐卤味 + 社区鲜卤」，攻特性空位（低盐）。',
    gapType: '特性空位',
  },

  /* ---- 轻食沙拉 ---- */
  'L3_6_1_1': { // 沙拉碗（蓝海）
    competitors: [
      { name: '甜心摇滚沙拉', mind: '外卖沙拉' },
      { name: 'Wagas', mind: '西式轻食' },
      { name: 'gaga', mind: '轻食餐厅' },
    ],
    painPoints: ['想吃草但贵、吃不饱、味道寡'],
    weaknesses: ['价格高', '饱腹感弱'],
    gap: '「18 元饱腹热沙拉 + 蛋白自选」，攻价格空位。',
    gapType: '价格空位',
  },
  'L3_6_1_2': { // 波奇饭
    competitors: [
      { name: '超能鹿战队', mind: '低卡波奇' },
      { name: '甜心摇滚', mind: '轻食波奇' },
      { name: '本土小店', mind: '夏威夷波奇' },
    ],
    painPoints: ['想低卡又好吃', '生食接受度低'],
    weaknesses: ['生食门槛', '价格偏高'],
    gap: '「熟制波奇 + 主食可选」，攻人群空位（中生食者）。',
    gapType: '人群空位',
  },
  'L3_6_2_1': { // 代餐奶昔
    competitors: [
      { name: '鲨鱼菲特', mind: '代餐奶昔' },
      { name: '朵拉', mind: '蛋白奶昔' },
      { name: 'WonderLab', mind: '瓶装奶昔' },
    ],
    painPoints: ['减脂代餐难喝', '饱腹短'],
    weaknesses: ['口感差', '复购低'],
    gap: '「高蛋白燕麦奶昔 + 饱腹 4h」，攻特性空位（饱腹）。',
    gapType: '特性空位',
  },
  'L3_6_2_2': { // 果蔬汁
    competitors: [
      { name: '你好椰', mind: '椰子水' },
      { name: '柠檬共和国', mind: ' NFC 柠檬茶' },
      { name: '一榨', mind: '鲜榨果汁' },
    ],
    painPoints: ['想喝纯果汁怕糖', 'NFC 贵'],
    weaknesses: ['价格高', '含糖疑虑'],
    gap: '「0 添加冷压蔬菜汁 + 9.9」，攻价格空位。',
    gapType: '价格空位',
  },
};

/* 兜底策略（未纳入 STRATEGY_TABLE 时按海洋类型生成，保证每个赛道都有空位分析） */
function fallbackStrategy(id, ocean) {
  const l1 = id.split('_')[1];
  const pool = BRAND_POOL['L1_' + l1] || [];
  const competitors = pool.slice(0, 4).map(n => ({ name: n, mind: '赛道头部品牌' }));
  const painByOcean = {
    blue: ['赛道高速成长但供给稀缺，用户选择少', '缺乏针对细分人群的专门产品'],
    potential: ['需求旺盛但同质化严重', '用户难以区分品牌差异'],
    red: ['竞争白热化、价格战激烈', '用户被过度营销疲劳'],
    stable: ['市场成熟、缺乏新意', '用户复购依赖习惯而非偏好'],
  };
  const gapByOcean = {
    blue: { gap: '趁赛道供给稀缺，率先占位一个清晰细分定位，抢占用户心智。', gapType: '场景空位' },
    potential: { gap: '在高速增长中找一处未被定义的特性空位，建立差异化锚点。', gapType: '特性空位' },
    red: { gap: '避开头部正面交锋，切一个被忽略的人群或场景空位求生。', gapType: '人群空位' },
    stable: { gap: '用一个新的产品特性重新激活成熟市场，制造新鲜感。', gapType: '特性空位' },
  };
  const g = gapByOcean[ocean] || gapByOcean.stable;
  return {
    competitors,
    painPoints: painByOcean[ocean] || painByOcean.stable,
    weaknesses: ['头部资源集中、中小品牌难突围', '供应链与品牌投入门槛高'],
    gap: g.gap,
    gapType: g.gapType,
  };
}

/* ---------- 表 2：品类全景数据表 (Category Analytics) 生成 ---------- */
const CATEGORY_ANALYTICS = (function () {
  const out = {};
  // 部分赛道做"人为微调"，让蓝海/红海分布更贴近现实直觉
  const TUNING = {
    'L3_1_1_3': { growth: 22, competition: 0.42 },   // 养生茶 -> 蓝海
    'L3_1_3_2': { growth: 28, competition: 0.38 },   // 鸭屎香柠檬茶 -> 蓝海
    'L3_3_1_2': { growth: 26, competition: 0.45 },   // 麻薯/蛋黄酥 -> 蓝海
    'L3_6_1_1': { growth: 18, competition: 0.4 },    // 沙拉碗 -> 蓝海
    'L3_1_1_1': { growth: 6,  competition: 0.82 },   // 鲜果茶 -> 红海（高竞争低增长）
    'L3_3_2_2': { growth: 5,  competition: 0.78 },   // 蛋糕/甜品 -> 红海
    'L3_2_2_2': { growth: 7,  competition: 0.71 },   // 螺蛳粉 -> 红海
    'L3_4_1_1': { growth: 6,  competition: 0.8 },    // 市井火锅 -> 红海
    'L3_2_3_1': { growth: 16, competition: 0.68 },   // 炸鸡 -> 高潜
    'L3_5_2_1': { growth: 19, competition: 0.6 },    // 小龙虾 -> 高潜
  };

  INDUSTRY_TREE.filter(n => n.level === 3).forEach(node => {
    const id = node.id;
    const l1 = id.split('_')[1]; // 赛道大类
    const rng = mulberry32(hashStr(id));
    const t = TUNING[id] || {};

    const marketSize  = Math.round(20 + rng() * 580);                       // 20~600 亿元
    const growth      = +(t.growth      !== undefined ? t.growth      : (rng() * 40 - 5)).toFixed(1);
    const competition = +(t.competition !== undefined ? t.competition : (0.2 + rng() * 0.75)).toFixed(2);
    const penetration = +(0.1 + rng() * 0.6).toFixed(2);
    const avgPrice    = Math.round(8 + rng() * 37);                        // 8~45 元
    const repurchase  = +(0.15 + rng() * 0.55).toFixed(2);

    // 蓝海/红海/高潜/平稳 判定
    let ocean;
    if (growth >= 15 && competition <= 0.5) ocean = 'blue';       // 蓝海：高增 + 低竞争
    else if (growth >= 15 && competition > 0.5) ocean = 'potential'; // 高潜：高增 + 高竞争
    else if (growth < 8 && competition > 0.65) ocean = 'red';     // 红海：低增 + 高竞争
    else ocean = 'stable';                                        // 平稳

    // 近 12 个月规模走势（含季节波动 + 增长漂移 + 噪声）
    const trend = [];
    for (let m = 0; m < 12; m++) {
      const seasonal = 1 + 0.08 * Math.sin((m / 12) * Math.PI * 2);
      const noise = 0.92 + rng() * 0.16;
      const drift = 1 + (growth / 100) * (m / 11);
      trend.push(+(marketSize * (0.55 + 0.45 * (m / 11)) * seasonal * noise * drift).toFixed(1));
    }

    // 人群画像
    const rawAge = [rng(), rng(), rng(), rng()];
    const ageSum = rawAge.reduce((a, b) => a + b, 0);
    const demographics = {
      age: {
        '18-25': Math.round((rawAge[0] / ageSum) * 100),
        '26-35': Math.round((rawAge[1] / ageSum) * 100),
        '36-45': Math.round((rawAge[2] / ageSum) * 100),
        '46+':   Math.round((rawAge[3] / ageSum) * 100),
      },
      female: Math.round(40 + rng() * 40), // 女性占比
      cityTier: {
        '一线':    Math.round(15 + rng() * 25),
        '新一线':  Math.round(20 + rng() * 20),
        '二线':    Math.round(15 + rng() * 20),
        '三线及以下': Math.round(10 + rng() * 20),
      },
    };

    // TOP 品牌 + 市占（确定性抽取并归一）
    const pool = BRAND_POOL['L1_' + l1] || [];
    const picks = [];
    const used = new Set();
    const topN = 3 + Math.floor(rng() * 2); // 3~4 个
    while (picks.length < topN && used.size < pool.length) {
      const idx = Math.floor(rng() * pool.length);
      if (!used.has(idx)) { used.add(idx); picks.push(pool[idx]); }
    }
    let shares = picks.map(() => 0.5 + rng());
    const shareSum = shares.reduce((a, b) => a + b, 0);
    shares = shares.map(s => Math.round((s / shareSum) * 100));
    const topBrands = picks.map((b, i) => ({ name: b, share: shares[i] }));

    // 商品全景
    const pTpl = PRODUCT_POOL['L1_' + l1] || ['招牌单品'];
    const pTags = ['爆款', '新品', '高复购', '引流款', '利润款'];
    const products = pTpl.map((p, i) => ({
      name: p,
      price: Math.round(avgPrice * (0.7 + rng() * 0.9)),
      tag: pTags[i % pTags.length],
      heat: Math.round(60 + rng() * 40), // 热度 0~100
    }));

    out[id] = {
      level3Id: id,
      name: node.name,
      marketSize, growth, competition, penetration, avgPrice, repurchase,
      ocean, trend, demographics, topBrands, products,
      strategy: STRATEGY_TABLE[id] || fallbackStrategy(id, ocean),
    };
  });
  return out;
})();

/* ---------- 便捷查询工具 ---------- */
function getNode(id) { return INDUSTRY_TREE.find(n => n.id === id); }
function getChildren(parentId) { return INDUSTRY_TREE.filter(n => n.parentId === parentId); }
function getPath(id) {
  const path = [];
  let cur = getNode(id);
  while (cur) { path.unshift(cur); cur = cur.parentId ? getNode(cur.parentId) : null; }
  return path;
}
function getAnalytics(id) { return CATEGORY_ANALYTICS[id]; }

/* 全局归一化用最大值（雷达图维度映射） */
const GLOBAL_MAX = (function () {
  const vals = Object.values(CATEGORY_ANALYTICS);
  return {
    marketSize: Math.max(...vals.map(v => v.marketSize)),
    avgPrice: Math.max(...vals.map(v => v.avgPrice)),
  };
})();
