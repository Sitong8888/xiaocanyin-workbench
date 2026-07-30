/* =========================================================================
 * 爆品与赛道筛选 · 数据模型 (data.js)
 *  - 8 大行业大类，每个大类含 一级赛道 → 二级品类 → 三级细分 完整层级
 *  - 每个三级行业附：市场规模/增长/竞争/渗透/客单/复购/趋势/TOP品牌/人群画像/战略空位
 *  - 区域数据：省 → 市 → 区/县，含区域系数/热度/标签，用于定制化展示
 *  纯静态、无外部依赖；浏览器与 Node 均可直接运行。
 * ========================================================================= */

/* ---------- 行业大类 ---------- */
const CATEGORIES = [
  { id: 'catering',  name: '餐饮', icon: '🍜' },
  { id: 'education', name: '教育', icon: '📚' },
  { id: 'training',  name: '培训', icon: '🎓' },
  { id: 'health',    name: '健康', icon: '💪' },
  { id: 'service',   name: '服务', icon: '🧹' },
  { id: 'design',    name: '设计', icon: '🎨' },
  { id: 'medical',   name: '医疗', icon: '🏥' },
  { id: 'finance',   name: '金融', icon: '💰' },
];

/* ---------- 行业树结构（按大类，数组形式便于维护） ----------
 * 结构: [ [L1名称, [ [L2名称, [L3名称, ...]], ... ]], ... ]
 */
const TREE_STRUCT = {
  catering: [
    ['茶饮咖啡', [
      ['新中式茶饮', ['鲜果茶', '冰吸柠檬茶']],
      ['咖啡饮品', ['精品咖啡', '果咖特调']],
    ]],
    ['小吃快餐', [
      ['米粉面食', ['螺蛳粉', '牛肉面', '武汉热干面']],
      ['炸物小食', ['炸鸡', '臭豆腐']],
    ]],
    ['烘焙甜品', [
      ['蛋糕甜品', ['千层蛋糕', '提拉米苏']],
      ['中式糕点', ['麻薯', '蛋黄酥']],
    ]],
    ['火锅串串', [
      ['市井火锅', ['牛油火锅', '酸汤火锅']],
      ['串串香', ['冷锅串串', '钵钵鸡']],
    ]],
    ['夜宵烧烤', [
      ['烧烤撸串', ['中式烧烤', '韩式烤肉']],
    ]],
    ['轻食沙拉', [
      ['健康轻食', ['沙拉碗', '低卡便当']],
    ]],
  ],
  education: [
    ['素质教育', [
      ['艺术启蒙', ['儿童少儿美术', '少儿编程', '少儿舞蹈']],
      ['体能运动', ['少儿体适能', '少儿游泳']],
    ]],
    ['学科培优', [
      ['K12学科', ['小学语文', '初中数学']],
      ['语言素养', ['少儿英语', '口才演讲']],
    ]],
    ['早幼教', [
      ['托育早教', ['亲子早教', '托育中心']],
    ]],
  ],
  training: [
    ['职业技能', [
      ['新媒体IT', ['AI应用培训', '短视频带货', '编程开发']],
      ['餐饮服务', ['咖啡师培训', '西点烘焙培训']],
    ]],
    ['考公考证', [
      ['公考事业', ['公务员考试', '事业单位考试']],
      ['资格认证', ['教师资格证', '会计资格证']],
    ]],
    ['兴趣拓展', [
      ['生活美学', ['花艺培训', '茶艺培训']],
    ]],
  ],
  health: [
    ['养生保健', [
      ['中医调理', ['艾灸推拿', '药食同源茶饮', '拔罐刮痧']],
      ['营养管理', ['体重管理', '慢病食疗']],
    ]],
    ['运动健身', [
      ['健身塑形', ['私教工作室', '团课操课']],
      ['瑜伽普拉提', ['普拉提馆', '瑜伽馆']],
    ]],
    ['心理疗愈', [
      ['情绪管理', ['心理咨询', '正念冥想']],
    ]],
  ],
  service: [
    ['家政生活', [
      ['上门服务', ['上门家政清洁', '收纳整理', '月嫂育儿']],
      ['维修维保', ['家电清洗', '管道疏通']],
    ]],
    ['宠物服务', [
      ['宠物护理', ['宠物洗护', '宠物寄养']],
      ['宠物医疗', ['宠物诊所']],
    ]],
    ['汽车服务', [
      ['洗车养护', ['上门洗车', '汽车美容']],
    ]],
  ],
  design: [
    ['空间设计', [
      ['商业空间', ['餐饮门面设计', '展厅设计', '奶茶店设计']],
      ['家居设计', ['全屋定制', '软装搭配']],
    ]],
    ['平面视觉', [
      ['品牌设计', ['LOGO设计', '包装设计']],
      ['新媒体视觉', ['小红书视觉', '电商详情页']],
    ]],
    ['数字体验', [
      ['UIUX', ['APP界面设计', '小程序设计']],
    ]],
  ],
  medical: [
    ['专科理疗', [
      ['消费医疗', ['牙齿矫正', '眼科屈光', '医美皮肤']],
      ['中医理疗', ['中医正骨', '针灸推拿']],
    ]],
    ['健康检测', [
      ['体检筛查', ['健康体检', '基因检测']],
    ]],
    ['康养护理', [
      ['银发照护', ['上门护理', '养老机构']],
    ]],
  ],
  finance: [
    ['财税服务', [
      ['企业财税', ['代理记账', '纳税筹划', '审计验资']],
      ['融资顾问', ['企业贷款', '股权融资']],
    ]],
    ['保险保障', [
      ['财产保险', ['企业财产险', '工程险']],
      ['人身保障', ['家庭保障规划']],
    ]],
    ['投资理财', [
      ['财富管理', ['基金投顾', '家族信托']],
    ]],
  ],
};

/* ---------- 区域树：省 → 市 → 区/县 ---------- */
const REGIONS = {
  ZJ: { name: '浙江省', cities: {
    SX: { name: '绍兴市', districts: { ZJ: '诸暨市', YX: '越城区', KH: '柯桥区' } },
    HZ: { name: '杭州市', districts: { XH: '西湖区', YH: '余杭区', BJ: '滨江区' } },
    NB: { name: '宁波市', districts: { YH: '鄞州区', ZH: '镇海区' } },
  }},
  BJ: { name: '北京市', cities: {
    CY: { name: '朝阳区', districts: { CY: 'CBD商圈', WJ: '望京' } },
    HD: { name: '海淀区', districts: { ZGC: '中关村', WDK: '五道口' } },
  }},
  SH: { name: '上海市', cities: {
    PD: { name: '浦东新区', districts: { LJZ: '陆家嘴', JL: '金桥' } },
    XH: { name: '徐汇区', districts: { XJ: '徐家汇', TL: '田林' } },
  }},
  GD: { name: '广东省', cities: {
    GZ: { name: '广州市', districts: { TH: '天河区', YX: '越秀区' } },
    SZ: { name: '深圳市', districts: { FT: '福田区', NS: '南山区' } },
    FS: { name: '佛山市', districts: { CS: '禅城区', NS: '南海区' } },
  }},
  JS: { name: '江苏省', cities: {
    NJ: { name: '南京市', districts: { GL: '鼓楼区', JL: '江宁区' } },
    SZ: { name: '苏州市', districts: { GC: '姑苏区', SJ: '苏州工业园区' } },
    WX: { name: '无锡市', districts: { BH: '滨湖区', XC: '新吴区' } },
  }},
  SC: { name: '四川省', cities: {
    CD: { name: '成都市', districts: { JD: '锦江区', HS: '高新区' } },
    MY: { name: '绵阳市', districts: { YF: '游仙区', AF: '安州区' } },
  }},
  HB: { name: '湖北省', cities: {
    WH: { name: '武汉市', districts: { WS: '武昌区', HN: '洪山区' } },
    YC: { name: '宜昌市', districts: { XC: '西陵区', DX: '点军区' } },
  }},
  SD: { name: '山东省', cities: {
    JN: { name: '济南市', districts: { LX: '历下区', SH: '市中区' } },
    QD: { name: '青岛市', districts: { SZ: '市南区', LY: '崂山区' } },
  }},
};

/* 区域画像：规模系数 / 热度 / 标签（用于定制化展示） */
const REGION_PROFILE = {
  ZJ: { sizeMod: 1.15, heat: '高',   tags: ['县域经济活跃', '下沉市场潜力大', '聚餐文化浓'] },
  BJ: { sizeMod: 1.38, heat: '极高', tags: ['高客单价', '白领刚需', '品牌敏感'] },
  SH: { sizeMod: 1.32, heat: '极高', tags: ['国际化', '高复购', '品质导向'] },
  GD: { sizeMod: 1.26, heat: '高',   tags: ['年轻人口多', '夜经济旺', '尝新意愿强'] },
  JS: { sizeMod: 1.12, heat: '中高', tags: ['均衡市场', '社区店友好'] },
  SC: { sizeMod: 1.05, heat: '中高', tags: ['口味偏好鲜明', '慢生活'] },
  HB: { sizeMod: 0.96, heat: '中',   tags: ['教育重镇', '性价比敏感'] },
  SD: { sizeMod: 1.08, heat: '中高', tags: ['人口大省', '大众消费稳'] },
};

/* ---------- 海洋 / 空位 类型 ---------- */
const OCEAN_TEXT  = { blue: '蓝海', high: '高潜', red: '红海', stable: '平稳' };
const OCEAN_CLASS = { blue: 'o-blue', high: 'o-high', red: 'o-red', stable: 'o-stable' };
const GAP_TYPES = ['人群空位', '价格空位', '场景空位', '特性空位'];
const GAP_ICON  = { '人群空位': '👥', '价格空位': '💰', '场景空位': '🕒', '特性空位': '✨' };

/* =========================================================================
 * 确定性伪随机（保证刷新数据稳定）
 * ========================================================================= */
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
function pick(arr, r) { return arr[Math.floor(r() * arr.length) % arr.length]; }

/* ---------- 各品类文案库 ---------- */
const BRAND_BANKS = {
  catering:  ['茶颜悦色', '喜茶', '蜜雪冰城', '霸王茶姬', '沪上阿姨', '瑞幸', '海底捞', '杨国福'],
  education:  ['新东方', '学而思', '美术宝', '编程猫', '番茄少儿', '金宝贝'],
  training:   ['达内', '传智播客', '黑马训练营', '三节课', '开课吧', '腾讯课堂'],
  health:     ['同仁堂', '固生堂', 'Keep', '乐刻', '超级猩猩', '壹心理'],
  service:    ['天鹅到家', '58到家', '京东服务', '宠物家', '波奇', '途虎'],
  design:     ['站酷', '特赞', '猪八戒', '洛可可', '东道', '古田路9号'],
  medical:    ['通策医疗', '爱尔眼科', '美年大健康', '瑞慈', '泰康', '和睦家'],
  finance:    ['金蝶', '用友', '慧算账', '平安普惠', '蚂蚁', '招商银行'],
};
const PERSONA_BANKS = {
  catering:  ['18-30岁学生/白领，追求颜值与社交属性', '下沉市场家庭客群，重性价比与复购', '都市女性，关注健康轻食'],
  education:  ['3-12岁少儿家长，重素质与升学', '一二线中产家庭，教育投入意愿强', '焦虑型父母，怕孩子输在起跑线'],
  training:   ['22-35岁职场人，谋求技能跃迁', '待业/转行人群，急需变现技能', '小微企业主，想做线上生意'],
  health:     ['25-45岁亚健康白领，养生刚需', '银发族及慢病人群，重调理', '产后/健身人群，塑形诉求强'],
  service:    ['双职工家庭，家政刚需', '养宠年轻人群，重宠物体验', '有车一族，维保便利化'],
  design:     ['连锁品牌方，重门店形象', '电商/内容创业者，重视觉转化', '地产/商业体，重空间体验'],
  medical:    ['18-35岁消费医疗人群，重颜值', '中老年慢病/康养人群', '高端家庭，重品质医疗'],
  finance:    ['中小微企业主，财税合规刚需', '高净值人群，财富保全诉求', '创业公司，融资与筹划并重'],
};

/* 兜底战略空位文案库（按大类） */
const CAT_BANKS = {
  catering: {
    comp: ['头部连锁以「标准化/性价比」占据心智', '网红品牌以「颜值/打卡」占据年轻人心智', '老字号以「正宗/情怀」占据本地心智'],
    pain: ['等待时间长、出餐慢', '口味不稳定、品控参差', '价格虚高、性价比低', '健康顾虑（糖油盐）难满足'],
    weak: ['为保规模牺牲了个性化与在地口味', '供应链重，难以快速试新', '门店重，下沉渗透不足'],
    aud: ['银发族', '健身减脂人群', '办公族刚需', '亲子家庭', '夜班人群'],
    price: ['9.9元极致性价比', '中高端品质溢价', '学生特惠'],
    scene: ['办公室下午茶', '通勤即取即走', '家庭囤货', '夜宵场景', '节令礼赠'],
    feat: ['0蔗糖清爽', '在地食材限定', '现制现售', '小份化'],
  },
  education: {
    comp: ['头部机构以「提分/升学」占据心智', '素质机构以「赢在起跑线」占据家长心智', '在线平台以「名师/便捷」占据心智'],
    pain: ['师资参差、频繁换老师', '效果难量化、家长焦虑', '通勤远、时间不灵活', '价格高、续费压力大'],
    weak: ['为规模标准化牺牲个性化', '重营销轻教研', '线下重资产难下沉'],
    aud: ['小镇家长', '内向慢热儿童', '多动/专注力弱儿童', '二孩家庭'],
    price: ['普惠社区价', '按次灵活付费', '公益体验课'],
    scene: ['社区就近', '碎片化线上', '亲子共学', '假期集训'],
    feat: ['小班个性化', '成果可视化', '双师陪伴'],
  },
  training: {
    comp: ['大厂背景机构以「名企就业」占据心智', '在线平台以「低价海量课」占据心智', '考证机构以「通过率」占据心智'],
    pain: ['课程与岗位脱节、学完难变现', '师资注水、实战少', '服务断档、售后无门', '价格虚高'],
    weak: ['为流量堆课忽视交付', '线下成本高难规模化', '更新慢跟不上技术'],
    aud: ['转行焦虑人群', '三四线待业青年', '小微企业主', '宝妈再就业'],
    price: ['0元试学', '分期免息', '就业后付款'],
    scene: ['下班后夜学', '周末集训', '线上陪练', '项目制实战'],
    feat: ['真项目交付', '1对1就业', 'AI工具实操'],
  },
  health: {
    comp: ['连锁中医馆以「名医/老字号」占据心智', '健身品牌以「自律/身材」占据心智', '平台以「便捷预约」占据心智'],
    pain: ['效果慢、难坚持', '价格不透明、办卡坑', '专业度存疑、踩雷', '时间碎片化难坚持'],
    weak: ['重资产门店难下沉', '服务标准化不足', '年轻化表达弱'],
    aud: ['久坐亚健康白领', '银发慢病人群', '产后修复女性', '运动小白'],
    price: ['按次轻会员', '社区亲民价', '团购体验'],
    scene: ['办公室微养生', '周末调理', '居家跟练', '午间放松'],
    feat: ['辨证个性化', '无推销', '数据化追踪'],
  },
  service: {
    comp: ['平台型家政以「海量阿姨/保障」占据心智', '社区店以「就近/信任」占据心智', '垂直品牌以「专业标准」占据心智'],
    pain: ['阿姨素质不稳、踩雷', '临时加价/爽约', '隐私安全顾虑', '售后无保障'],
    weak: ['扩张牺牲培训质量', '信息不对称严重', '标准化难落地'],
    aud: ['双职工家庭', '独居青年', '养宠人群', '银发家庭'],
    price: ['透明一口价', '会员套餐', '首单立减'],
    scene: ['上班前托管', '节假日大扫除', '搬家收纳', '宠物寄养'],
    feat: ['实名认证', '全程保险', '不满意重做'],
  },
  design: {
    comp: ['4A/大厂以「品牌背书」占据心智', '平台以「海量供给/低价」占据心智', '工作室以「个性审美」占据心智'],
    pain: ['报价不透明、增项多', '审美不符、反复改', '交付拖期', '落地难、施工脱节'],
    weak: ['规模化难保个性', '重设计轻落地', '响应慢'],
    aud: ['连锁品牌方', '小微创业店', '内容电商', '商业地产'],
    price: ['模块化平价', '按效果付费', '小步快跑'],
    scene: ['新店开业', '品牌升级', '节日营销', '空间焕新'],
    feat: ['可落地施工图', '爆款视觉', '数据化转化'],
  },
  medical: {
    comp: ['连锁专科以「专家/设备」占据心智', '公立背书机构以「权威」占据心智', '平台以「便捷预约」占据心智'],
    pain: ['排队久、体验差', '价格不透明、过度医疗顾虑', '隐私顾虑', '术后服务断档'],
    weak: ['重资产难下沉', '年轻化沟通弱', '服务温度不足'],
    aud: ['颜值焦虑青年', '银发康养族', '高净值家庭', '慢病管理人群'],
    price: ['分期免息', '透明价目', '会员管理'],
    scene: ['周末诊疗', '假期矫正', '居家康养', '检后管理'],
    feat: ['无痛舒适', '私密1对1', '全周期管理'],
  },
  finance: {
    comp: ['传统代账以「便宜/熟人」占据心智', '大厂财税以「系统/合规」占据心智', '顾问以「资源/关系」占据心智'],
    pain: ['隐性收费、账目混乱', '政策更新跟不上、易踩雷', '响应慢、问询无门', '数据安全顾虑'],
    weak: ['人力交付难规模化', '缺乏业财融合', '增值服务弱'],
    aud: ['初创小微企业', '电商卖家', '高净值家庭', '拟融资公司'],
    price: ['按规模阶梯', '包年无忧', '首月免费'],
    scene: ['创业起步', '税务稽查季', '融资前梳理', '年终汇算'],
    feat: ['业财一体化', '风险预警', '专属顾问'],
  },
};

function fallbackGap(name, gapType, bank, r) {
  const t = {
    '人群空位': `聚焦头部忽视的「${pick(bank.aud, r)}」，做差异化人群定位`,
    '价格空位': `以「${pick(bank.price, r)}」价格带切入，避开红海价格战`,
    '场景空位': `占领「${pick(bank.scene, r)}」细分场景，建立专属心智`,
    '特性空位': `强化「${pick(bank.feat, r)}」产品特性，形成记忆点`,
  };
  return t[gapType];
}

function fallbackStrategy(catId, name, ocean, r) {
  const bank = CAT_BANKS[catId] || CAT_BANKS.catering;
  const gapType = pick(GAP_TYPES, r);
  return {
    competitors: [{ name: pick(bank.comp, r).split('以')[0].replace(/头部|网红|老字号|大厂|在线|考证|连锁|平台|4A|工作室|传统|大厂财税|顾问|公立|小微/g, '').slice(0, 6) || '头部品牌', mind: pick(bank.comp, r) }],
    painPoints: [pick(bank.pain, r), pick(bank.pain, r)],
    weaknesses: [pick(bank.weak, r), pick(bank.weak, r)],
    gap: fallbackGap(name, gapType, bank, r),
    gapType: gapType,
  };
}

/* ---------- 生成基础数据（确定性） ---------- */
function genBase(catId, l3Id, name) {
  const r = mulberry32(hashStr(catId + '|' + l3Id));
  const rnd = (min, max) => min + (max - min) * r();
  const marketSize = Math.round(rnd(8, 320));          // 全国市场规模（亿元）
  const growth = +rnd(-2, 28).toFixed(1);              // 同比增长 %
  const competition = +rnd(0.3, 0.92).toFixed(2);      // 竞争烈度 0-1
  const penetration = +rnd(5, 65).toFixed(1);           // 渗透率 %
  const price = Math.round(rnd(15, 580));               // 客单价（元/课程/项目基准）
  const repurchase = +rnd(15, 78).toFixed(1);           // 复购率 %
  const ocean = growth >= 12 && competition < 0.6 ? 'blue'
              : growth >= 12 && competition >= 0.6 ? 'high'
              : growth < 8 && competition >= 0.7 ? 'red' : 'stable';
  // 12 个月趋势（带增长漂移）
  let cur = (marketSize / 12) * 0.7;
  const trend = [];
  for (let i = 0; i < 12; i++) { cur *= (1 + (growth / 100) / 12 * (0.6 + 0.8 * r())); trend.push(+cur.toFixed(1)); }
  // TOP 品牌
  const bn = BRAND_BANKS[catId] || BRAND_BANKS.catering;
  const topBrands = [0, 1, 2].map(i => ({ name: bn[(i + Math.floor(r() * bn.length)) % bn.length], share: +(i === 0 ? rnd(12, 34) : rnd(3, 12)).toFixed(1) }));
  const persona = pick(PERSONA_BANKS[catId] || PERSONA_BANKS.catering, r);
  const strategy = fallbackStrategy(catId, name, ocean, r);
  return { marketSize, growth, competition, penetration, price, repurchase, ocean, trend, topBrands, persona, strategy };
}

/* ---------- 精选战略空位（示例赛道，覆盖用户给定结构） ---------- */
const CURATED = {
  catering: {
    '鲜果茶': {
      marketSize: 280, growth: 11, competition: 0.84, penetration: 42, price: 18, repurchase: 45, ocean: 'red',
      topBrands: [{ name: '喜茶', share: 22.5 }, { name: '霸王茶姬', share: 18.3 }, { name: '茶颜悦色', share: 11.2 }],
      persona: '18-30岁学生/白领，追求颜值与社交属性，复购靠新品迭代',
      strategy: {
        competitors: [{ name: '喜茶/霸王茶姬', mind: '以「真果鲜茶+网红打卡」占据年轻人"好喝又好拍"心智' }],
        painPoints: ['同质化严重、喝不出差异', '糖油顾虑、健康焦虑', '排队久、出杯慢'],
        weaknesses: ['为标准化牺牲在地口味与个性', '供应链重、下沉渗透受限', '价格战挤压利润'],
        gap: '以「0蔗糖清爽+在地食材限定」切入健康清爽空位，避开纯颜值红海',
        gapType: '特性空位',
      },
    },
    '冰吸柠檬茶': {
      marketSize: 95, growth: 22, competition: 0.6, penetration: 18, price: 16, repurchase: 40, ocean: 'high',
      topBrands: [{ name: '丘大叔', share: 14.1 }, { name: '邻居柠檬茶', share: 9.8 }, { name: '本地手打', share: 8.2 }],
      persona: 'Z世代学生党，重清爽解腻与高性价比',
      strategy: {
        competitors: [{ name: '手打柠檬茶品牌', mind: '以「手打/泰式/清爽」占据夏日解腻心智' }],
        painPoints: ['太酸太苦口感不稳', '冬季需求断崖', '品牌弱、易被替代'],
        weaknesses: ['产品单一、季节波动大', '缺乏品牌记忆点'],
        gap: '以「全年清爽+暖饮柠檬」破季节空位，做社区高频复购',
        gapType: '场景空位',
      },
    },
    '螺蛳粉': {
      marketSize: 160, growth: 9, competition: 0.71, penetration: 35, price: 22, repurchase: 50, ocean: 'red',
      topBrands: [{ name: '李子柒', share: 19.4 }, { name: '好欢螺', share: 16.7 }, { name: '螺霸王', share: 12.1 }],
      persona: '年轻人夜宵党，重口味与情绪价值',
      strategy: {
        competitors: [{ name: '预包装螺蛳粉', mind: '以「正宗柳州味+网红猎奇」占据方便速食心智' }],
        painPoints: ['门店现煮门槛高、扩张难', '臭味顾虑劝退部分客群', '客单低、利润薄'],
        weaknesses: ['重资产门店难标准化', '地域口味局限'],
        gap: '以「轻堂食+外卖专营+区域口味微调」切入下沉与办公场景空位',
        gapType: '场景空位',
      },
    },
    '牛肉面': {
      marketSize: 120, growth: 6, competition: 0.66, penetration: 48, price: 26, repurchase: 55, ocean: 'stable',
      topBrands: [{ name: '马子禄', share: 9.2 }, { name: '本地老碗', share: 7.5 }, { name: '陈香贵', share: 6.8 }],
      persona: '全龄刚需客群，重汤头与饱腹',
      strategy: {
        competitors: [{ name: '兰州拉面馆', mind: '以「便宜大碗+街边刚需」占据大众饱腹心智' }],
        painPoints: ['口味千店一面', '卫生与体验一般', '品牌弱'],
        weaknesses: ['极度分散、难连锁化', '价值感低'],
        gap: '以「明档现拉+干净空间+区域牛种」切入品质升级空位',
        gapType: '特性空位',
      },
    },
  },
  education: {
    '儿童少儿美术': {
      marketSize: 140, growth: 8, competition: 0.55, penetration: 22, price: 120, repurchase: 60, ocean: 'stable',
      topBrands: [{ name: '美术宝', share: 17.3 }, { name: '番茄少儿', share: 12.6 }, { name: '本地画室', share: 10.1 }],
      persona: '3-12岁家长，重审美素养与升学加分',
      strategy: {
        competitors: [{ name: '连锁美术机构', mind: '以「赢在起跑线+考级成果」占据家长心智' }],
        painPoints: ['师资参差、常换老师', '效果难量化', '通勤远'],
        weaknesses: ['标准化牺牲个性', '重营销轻教研'],
        gap: '以「小班个性+成果可视化+社区就近」切入信任空位',
        gapType: '人群空位',
      },
    },
    '少儿编程': {
      marketSize: 210, growth: 18, competition: 0.62, penetration: 19, price: 150, repurchase: 58, ocean: 'high',
      topBrands: [{ name: '编程猫', share: 21.2 }, { name: '西瓜创客', share: 14.5 }, { name: '核桃', share: 9.3 }],
      persona: '7-14岁家长，重逻辑思维与未来竞争力',
      strategy: {
        competitors: [{ name: '头部编程品牌', mind: '以「AI时代刚需+名校通道」占据家长心智' }],
        painPoints: ['学完难落地、效果虚', '师资注水', '续费压力大'],
        weaknesses: ['为流量堆课忽视交付', '更新慢'],
        gap: '以「真项目作品集+1对1升学规划」切入结果交付空位',
        gapType: '特性空位',
      },
    },
  },
  training: {
    'AI应用培训': {
      marketSize: 90, growth: 35, competition: 0.45, penetration: 8, price: 2980, repurchase: 30, ocean: 'blue',
      topBrands: [{ name: '三节课', share: 16.8 }, { name: '腾讯课堂', share: 13.2 }, { name: '开课吧', share: 10.5 }],
      persona: '22-35岁职场人，谋求AI提效与转岗',
      strategy: {
        competitors: [{ name: '综合在线平台', mind: '以「海量低价课+大厂名师」占据心智' }],
        painPoints: ['课程与岗位脱节', '学完不会用', '师资注水'],
        weaknesses: ['更新慢跟不上技术', '服务断档'],
        gap: '以「企业真实场景+工具实操+就业陪跑」切入落地空位（蓝海高速）',
        gapType: '场景空位',
      },
    },
    '短视频带货': {
      marketSize: 130, growth: 40, competition: 0.7, penetration: 12, price: 1999, repurchase: 25, ocean: 'high',
      topBrands: [{ name: '交个朋友', share: 12.1 }, { name: '本地MCN', share: 9.4 }, { name: '达人孵化', share: 8.0 }],
      persona: '小微企业主/个体，想做线上生意',
      strategy: {
        competitors: [{ name: 'MCN/达人课', mind: '以「月入过万案例」占据暴富心智' }],
        painPoints: ['割韭菜感强', '学完无流量', '投流烧钱'],
        weaknesses: ['重引流轻交付', '案例难复制'],
        gap: '以「0基础陪跑+本地生活带货」切入小微实体空位',
        gapType: '人群空位',
      },
    },
  },
  health: {
    '艾灸推拿': {
      marketSize: 110, growth: 14, competition: 0.5, penetration: 16, price: 128, repurchase: 65, ocean: 'blue',
      topBrands: [{ name: '固生堂', share: 13.6 }, { name: '同仁堂', share: 11.2 }, { name: '社区艾灸馆', share: 8.4 }],
      persona: '25-50岁亚健康白领与银发族',
      strategy: {
        competitors: [{ name: '连锁中医馆', mind: '以「名医/老字号」占据信任心智' }],
        painPoints: ['价格不透明', '效果慢难坚持', '专业度存疑'],
        weaknesses: ['重资产难下沉', '年轻化表达弱'],
        gap: '以「社区轻养生+辨证个性化+无推销」切入日常化空位',
        gapType: '场景空位',
      },
    },
    '药食同源茶饮': {
      marketSize: 60, growth: 26, competition: 0.55, penetration: 9, price: 28, repurchase: 48, ocean: 'high',
      topBrands: [{ name: '同仁堂健康', share: 15.0 }, { name: '草本茶新锐', share: 10.3 }, { name: '本地养生铺', share: 7.1 }],
      persona: '养生青年，重内调与便捷',
      strategy: {
        competitors: [{ name: '传统滋补品牌', mind: '以「千年养生智慧」占据心智' }],
        painPoints: ['苦涩难喝', '见效慢', '不知怎么选'],
        weaknesses: ['老气、年轻人无感', '标准化弱'],
        gap: '以「好喝轻养生+国潮包装」切入年轻化空位',
        gapType: '人群空位',
      },
    },
  },
  service: {
    '上门家政清洁': {
      marketSize: 150, growth: 20, competition: 0.4, penetration: 14, price: 199, repurchase: 70, ocean: 'blue',
      topBrands: [{ name: '天鹅到家', share: 18.9 }, { name: '58到家', share: 14.2 }, { name: '京东服务', share: 9.6 }],
      persona: '双职工家庭，家政刚需',
      strategy: {
        competitors: [{ name: '平台型家政', mind: '以「海量阿姨+保障」占据心智' }],
        painPoints: ['阿姨素质不稳', '临时加价/爽约', '隐私安全顾虑'],
        weaknesses: ['扩张牺牲培训', '信息不对称'],
        gap: '以「实名认证+全程保险+不满意重做」切入信任空位（蓝海）',
        gapType: '特性空位',
      },
    },
    '收纳整理': {
      marketSize: 70, growth: 24, competition: 0.42, penetration: 7, price: 299, repurchase: 55, ocean: 'blue',
      topBrands: [{ name: '留存道', share: 12.3 }, { name: '本地收纳师', share: 8.8 }, { name: '家政平台', share: 7.0 }],
      persona: '中产家庭，重空间与秩序',
      strategy: {
        competitors: [{ name: '日式收纳师', mind: '以「极简美学」占据心智' }],
        painPoints: ['价格高', '落地难维持', '沟通成本高'],
        weaknesses: ['供给少难规模化', '非标服务'],
        gap: '以「标准化套餐+线上指导维持」切入普惠空位',
        gapType: '价格空位',
      },
    },
  },
  design: {
    '餐饮门面设计': {
      marketSize: 55, growth: 16, competition: 0.48, penetration: 11, price: 8000, repurchase: 20, ocean: 'blue',
      topBrands: [{ name: '古田路9号', share: 11.0 }, { name: '洛可可', share: 9.2 }, { name: '本地设计工作室', share: 7.5 }],
      persona: '连锁/初创餐饮品牌方',
      strategy: {
        competitors: [{ name: '知名设计机构', mind: '以「品牌背书/获奖」占据心智' }],
        painPoints: ['报价不透明', '落地难脱节施工', '审美不符'],
        weaknesses: ['重设计轻落地', '响应慢'],
        gap: '以「可落地施工图+爆款视觉+快交付」切入实效空位',
        gapType: '特性空位',
      },
    },
    '展厅设计': {
      marketSize: 48, growth: 12, competition: 0.5, penetration: 9, price: 30000, repurchase: 15, ocean: 'stable',
      topBrands: [{ name: '风语筑', share: 13.4 }, { name: '本地展陈', share: 8.1 }, { name: '策划工作室', share: 6.0 }],
      persona: '商业地产/政府/品牌方',
      strategy: {
        competitors: [{ name: '大型展陈公司', mind: '以「标杆案例/资源」占据心智' }],
        painPoints: ['预算高', '周期长', '互动弱'],
        weaknesses: ['重资产难下沉', '年轻化表达弱'],
        gap: '以「小预算快闪+数字互动」切入轻量空位',
        gapType: '价格空位',
      },
    },
  },
  medical: {
    '牙齿矫正': {
      marketSize: 200, growth: 15, competition: 0.65, penetration: 13, price: 18000, repurchase: 10, ocean: 'high',
      topBrands: [{ name: '通策医疗', share: 16.8 }, { name: '拜博', share: 12.3 }, { name: '隐形矫正新锐', share: 10.1 }],
      persona: '18-35岁消费医疗人群',
      strategy: {
        competitors: [{ name: '连锁口腔', mind: '以「专家/设备/案例」占据心智' }],
        painPoints: ['价格不透明', '怕疼/怕丑', '排队久'],
        weaknesses: ['重资产难下沉', '年轻化沟通弱'],
        gap: '以「隐形舒适+分期+私密1对1」切入体验空位',
        gapType: '特性空位',
      },
    },
    '眼科屈光': {
      marketSize: 180, growth: 17, competition: 0.6, penetration: 12, price: 15000, repurchase: 8, ocean: 'high',
      topBrands: [{ name: '爱尔眼科', share: 19.5 }, { name: '普瑞', share: 11.2 }, { name: '华夏', share: 8.0 }],
      persona: '18-40岁摘镜需求人群',
      strategy: {
        competitors: [{ name: '连锁眼科', mind: '以「设备先进/专家」占据心智' }],
        painPoints: ['价格高', '安全顾虑', '术后服务断档'],
        weaknesses: ['重资产难下沉', '服务温度不足'],
        gap: '以「全周期管理+透明价目」切入信任空位',
        gapType: '特性空位',
      },
    },
  },
  finance: {
    '代理记账': {
      marketSize: 240, growth: 10, competition: 0.45, penetration: 30, price: 200, repurchase: 85, ocean: 'stable',
      topBrands: [{ name: '慧算账', share: 14.6 }, { name: '金蝶精斗云', share: 12.0 }, { name: '用友畅捷通', share: 10.3 }],
      persona: '中小微企业与个体户',
      strategy: {
        competitors: [{ name: '传统代账公司', mind: '以「便宜/熟人」占据心智' }],
        painPoints: ['隐性收费', '账目混乱', '政策跟不上'],
        weaknesses: ['人力交付难规模化', '增值弱'],
        gap: '以「业财一体化+风险预警」切入合规增值空位',
        gapType: '特性空位',
      },
    },
    '纳税筹划': {
      marketSize: 95, growth: 14, competition: 0.5, penetration: 11, price: 5000, repurchase: 60, ocean: 'blue',
      topBrands: [{ name: '四大背景顾问', share: 9.8 }, { name: '本土税务所', share: 8.2 }, { name: '财税SaaS', share: 7.0 }],
      persona: '高利润企业与创业公司',
      strategy: {
        competitors: [{ name: '税务师事务所', mind: '以「权威/关系」占据心智' }],
        painPoints: ['怕踩雷', '报价黑箱', '响应慢'],
        weaknesses: ['难标准化', '规模化弱'],
        gap: '以「合规+可落地方案+专属顾问」切入安全空位',
        gapType: '人群空位',
      },
    },
  },
};

/* =========================================================================
 * 构建 TREES / ANALYTICS
 * ========================================================================= */
const TREES = {};
const ANALYTICS = {};
CATEGORIES.forEach((cat, idx) => {
  const ci = idx + 1;
  const struct = TREE_STRUCT[cat.id];
  TREES[cat.id] = { L1: {}, L2: {}, L3: {} };
  ANALYTICS[cat.id] = {};
  struct.forEach(([l1name, l2arr], ai) => {
    const a = ai + 1;
    const l1id = `L1_${ci}_${a}`;
    TREES[cat.id].L1[l1id] = { id: l1id, name: l1name, level: 1, parentId: null };
    l2arr.forEach(([l2name, l3arr], bi) => {
      const b = bi + 1;
      const l2id = `L2_${ci}_${a}_${b}`;
      TREES[cat.id].L2[l2id] = { id: l2id, name: l2name, level: 2, parentId: l1id };
      l3arr.forEach((l3name, ci3) => {
        const c = ci3 + 1;
        const l3id = `L3_${ci}_${a}_${b}_${c}`;
        TREES[cat.id].L3[l3id] = { id: l3id, name: l3name, level: 3, parentId: l2id };
        let ana = genBase(cat.id, l3id, l3name);
        const cur = (CURATED[cat.id] && CURATED[cat.id][l3name]) || null;
        if (cur) {
          ana = Object.assign(ana, cur);
          if (cur.strategy) ana.strategy = cur.strategy;
        }
        ANALYTICS[cat.id][l3id] = ana;
      });
    });
  });
});

/* =========================================================================
 * 查询 / 辅助函数
 * ========================================================================= */
function getTree(catId) { return TREES[catId]; }
function getNode(catId, id) {
  const t = TREES[catId]; if (!t) return null;
  return t.L1[id] || t.L2[id] || t.L3[id] || null;
}
function getChildren(catId, parentId) {
  const t = TREES[catId]; if (!t) return [];
  if (parentId === null) return Object.values(t.L1);
  if (t.L1[parentId]) return Object.values(t.L2).filter(n => n.parentId === parentId);
  if (t.L2[parentId]) return Object.values(t.L3).filter(n => n.parentId === parentId);
  return [];
}
function getAnalytics(catId, id) { return (ANALYTICS[catId] && ANALYTICS[catId][id]) || null; }
function getPath(catId, l3Id) {
  const t = TREES[catId]; if (!t || !t.L3[l3Id]) return [];
  const node = t.L3[l3Id];
  const l2 = t.L2[node.parentId];
  const l1 = t.L1[l2.parentId];
  return [l1, l2, node];
}
function findL3Id(catId, name) {
  const t = TREES[catId]; if (!t) return null;
  return Object.keys(t.L3).find(id => t.L3[id].name === name) || null;
}
function getRegionProf(provId) { return REGION_PROFILE[provId] || { sizeMod: 1, heat: '中', tags: ['全国基准'] }; }

/* 区域定制：返回带区域系数调整的数据副本 */
function applyRegion(ana, provId) {
  if (!ana) return ana;
  if (!provId) return Object.assign({}, ana, { regionMod: 1, regionTags: [], regionHeat: '—' });
  const p = getRegionProf(provId);
  return Object.assign({}, ana, {
    marketSize: Math.round(ana.marketSize * p.sizeMod),
    trend: ana.trend.map(v => +(v * p.sizeMod).toFixed(1)),
    regionMod: p.sizeMod,
    regionTags: p.tags,
    regionHeat: p.heat,
  });
}

/* 暴露到全局（浏览器多脚本共享 / Node 测试） */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CATEGORIES, TREES, ANALYTICS, REGIONS, REGION_PROFILE,
    OCEAN_TEXT, OCEAN_CLASS, GAP_TYPES, GAP_ICON,
    getTree, getNode, getChildren, getAnalytics, getPath, findL3Id, getRegionProf, applyRegion };
}
