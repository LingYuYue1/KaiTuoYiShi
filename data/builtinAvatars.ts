import {
  STATIC_ASSET_FALLBACK_AVATAR,
  createStaticAssetReference,
  isRemoteStaticAssetUrl,
  resolveStaticAssetOrLocal,
  resolveStaticAssetReference,
} from '@/utils/staticAssets';

export interface BuiltinAvatarCandidate {
  id: string;
  title: string;
  src: string;
  reference?: string;
}

export interface BuiltinAvatarSet {
  canonicalName: string;
  candidates: BuiltinAvatarCandidate[];
}

function avatarLogicalId(id: string): string {
  return 'avatar:' + id.replace(/-(\d+)$/, ':$1');
}

function avatarSource(id: string): string {
  return resolveStaticAssetOrLocal(avatarLogicalId(id), STATIC_ASSET_FALLBACK_AVATAR);
}

function avatarReference(id: string): string | undefined {
  const logicalId = avatarLogicalId(id);
  return resolveStaticAssetReference(logicalId)
    ? createStaticAssetReference(logicalId)
    : undefined;
}

const BUILTIN_AVATAR_CANONICAL_ALIASES: Record<string, string> = {
  '三月七·巡猎': '三月七',
  '巡猎三月七': '三月七',
  '长夜月': '三月七',
  '三月': '三月七',
  'March 7th': '三月七',
  '丹恒·饮月': '丹恒',
  '饮月': '丹恒',
  'Imbibitor Lunae': '丹恒',
  '丹恒·腾荒': '丹恒',
  'Dan Heng': '丹恒',
  '姬子•启行': '姬子',
  '姬子·启行': '姬子',
  'Himeko': '姬子',
  '瓦尔特·杨': '瓦尔特',
  '瓦尔特杨': '瓦尔特',
  '瓦尔特·扬': '瓦尔特',
  '瓦尔特扬': '瓦尔特',
  '杨叔': '瓦尔特',
  '老杨': '瓦尔特',
  'Welt': '瓦尔特',
  'Pom-Pom': '帕姆',
  'Pom Pom': '帕姆',
  'Herta': '黑塔',
  '大黑塔': '黑塔',
  'The Herta': '黑塔',
  'Asta': '艾丝妲',
  'Arlan': '阿兰',
  '灰发少女': '星',
  'Stelle': '星',
  '开拓者·星': '星',
  '灰发少年': '穹',
  'Caelus': '穹',
  '开拓者·穹': '穹',
  'Aventurine': '砂金',
  '卡卡瓦卡': '砂金',
  'Bailu': '白露',
  'Fu Xuan': '符玄',
  'Jade': '翡翠',
  'Jing Yuan': '景元',
  'Seele': '希儿',
  'Topaz': '托帕',
  '叶珉': '托帕',
  '银狼LV.999': '银狼',
  '千冶•刃': '刃',
  '千冶·刃': '刃',
  '卡厄斯兰那': '白厄',
  '史蒂芬·劳埃德': '史蒂芬',
  '康士坦丝': '大丽花',
  'Constance': '大丽花',
  '忘归人': '停云',
};

export const BUILTIN_AVATAR_SETS: BuiltinAvatarSet[] = [
  {
    canonicalName: '三月七',
    candidates: [
      { id: 'march7th-01', title: '三月七 01', src: avatarSource('march7th-01'), reference: avatarReference('march7th-01') },
      { id: 'march7th-02', title: '三月七 02', src: avatarSource('march7th-02'), reference: avatarReference('march7th-02') },
      { id: 'march7th-03', title: '三月七 03', src: avatarSource('march7th-03'), reference: avatarReference('march7th-03') },
    ],
  },
  {
    canonicalName: '丹恒',
    candidates: [
      { id: 'danheng-01', title: '丹恒 01', src: avatarSource('danheng-01'), reference: avatarReference('danheng-01') },
      { id: 'danheng-02', title: '丹恒 02', src: avatarSource('danheng-02'), reference: avatarReference('danheng-02') },
      { id: 'danheng-03', title: '丹恒 03', src: avatarSource('danheng-03'), reference: avatarReference('danheng-03') },
    ],
  },
  {
    canonicalName: '姬子',
    candidates: [
      { id: 'himeko-01', title: '姬子 01', src: avatarSource('himeko-01'), reference: avatarReference('himeko-01') },
      { id: 'himeko-02', title: '姬子 02', src: avatarSource('himeko-02'), reference: avatarReference('himeko-02') },
      { id: 'himeko-03', title: '姬子 03', src: avatarSource('himeko-03'), reference: avatarReference('himeko-03') },
    ],
  },
  {
    canonicalName: '瓦尔特',
    candidates: [
      { id: 'welt-01', title: '瓦尔特 01', src: avatarSource('welt-01'), reference: avatarReference('welt-01') },
      { id: 'welt-02', title: '瓦尔特 02', src: avatarSource('welt-02'), reference: avatarReference('welt-02') },
      { id: 'welt-03', title: '瓦尔特 03', src: avatarSource('welt-03'), reference: avatarReference('welt-03') },
    ],
  },
  {
    canonicalName: '帕姆',
    candidates: [
      { id: 'pom-pom-01', title: '帕姆 01', src: avatarSource('pom-pom-01'), reference: avatarReference('pom-pom-01') },
      { id: 'pom-pom-02', title: '帕姆 02', src: avatarSource('pom-pom-02'), reference: avatarReference('pom-pom-02') },
      { id: 'pom-pom-03', title: '帕姆 03', src: avatarSource('pom-pom-03'), reference: avatarReference('pom-pom-03') },
    ],
  },
  {
    canonicalName: '黑塔',
    candidates: [
      { id: 'herta-01', title: '黑塔 01', src: avatarSource('herta-01'), reference: avatarReference('herta-01') },
      { id: 'herta-02', title: '黑塔 02', src: avatarSource('herta-02'), reference: avatarReference('herta-02') },
      { id: 'herta-03', title: '黑塔 03', src: avatarSource('herta-03'), reference: avatarReference('herta-03') },
    ],
  },
  {
    canonicalName: '艾丝妲',
    candidates: [
      { id: 'asta-01', title: '艾丝妲 01', src: avatarSource('asta-01'), reference: avatarReference('asta-01') },
      { id: 'asta-02', title: '艾丝妲 02', src: avatarSource('asta-02'), reference: avatarReference('asta-02') },
      { id: 'asta-03', title: '艾丝妲 03', src: avatarSource('asta-03'), reference: avatarReference('asta-03') },
    ],
  },
  {
    canonicalName: '阿兰',
    candidates: [
      { id: 'arlan-01', title: '阿兰 01', src: avatarSource('arlan-01'), reference: avatarReference('arlan-01') },
      { id: 'arlan-02', title: '阿兰 02', src: avatarSource('arlan-02'), reference: avatarReference('arlan-02') },
      { id: 'arlan-03', title: '阿兰 03', src: avatarSource('arlan-03'), reference: avatarReference('arlan-03') },
    ],
  },
  {
    canonicalName: '星',
    candidates: [
      { id: 'stelle-01', title: '星 01', src: avatarSource('stelle-01'), reference: avatarReference('stelle-01') },
      { id: 'stelle-02', title: '星 02', src: avatarSource('stelle-02'), reference: avatarReference('stelle-02') },
      { id: 'stelle-03', title: '星 03', src: avatarSource('stelle-03'), reference: avatarReference('stelle-03') },
    ],
  },
  {
    canonicalName: '穹',
    candidates: [
      { id: 'caelus-01', title: '穹 01', src: avatarSource('caelus-01'), reference: avatarReference('caelus-01') },
      { id: 'caelus-02', title: '穹 02', src: avatarSource('caelus-02'), reference: avatarReference('caelus-02') },
      { id: 'caelus-03', title: '穹 03', src: avatarSource('caelus-03'), reference: avatarReference('caelus-03') },
    ],
  },
  {
    canonicalName: '布洛妮娅',
    candidates: [
      { id: 'bronya-01', title: '布洛妮娅 01', src: avatarSource('bronya-01'), reference: avatarReference('bronya-01') },
      { id: 'bronya-02', title: '布洛妮娅 02', src: avatarSource('bronya-02'), reference: avatarReference('bronya-02') },
      { id: 'bronya-03', title: '布洛妮娅 03', src: avatarSource('bronya-03'), reference: avatarReference('bronya-03') },
    ],
  },
  {
    canonicalName: '阿格莱雅',
    candidates: [
      { id: 'aglaea-01', title: '阿格莱雅 01', src: avatarSource('aglaea-01'), reference: avatarReference('aglaea-01') },
    ],
  },
  {
    canonicalName: '砂金',
    candidates: [
      { id: 'aventurine-01', title: '砂金 01', src: avatarSource('aventurine-01'), reference: avatarReference('aventurine-01') },
    ],
  },
  {
    canonicalName: '白露',
    candidates: [
      { id: 'bailu-01', title: '白露 01', src: avatarSource('bailu-01'), reference: avatarReference('bailu-01') },
    ],
  },
  {
    canonicalName: '克拉拉',
    candidates: [
      { id: 'clara-01', title: '克拉拉 01', src: avatarSource('clara-01'), reference: avatarReference('clara-01') },
    ],
  },
  {
    canonicalName: '符玄',
    candidates: [
      { id: 'fu-xuan-01', title: '符玄 01', src: avatarSource('fu-xuan-01'), reference: avatarReference('fu-xuan-01') },
    ],
  },
  {
    canonicalName: '杰帕德',
    candidates: [
      { id: 'gepard-01', title: '杰帕德 01', src: avatarSource('gepard-01'), reference: avatarReference('gepard-01') },
    ],
  },
  {
    canonicalName: '翡翠',
    candidates: [
      { id: 'jade-01', title: '翡翠 01', src: avatarSource('jade-01'), reference: avatarReference('jade-01') },
    ],
  },
  {
    canonicalName: '景元',
    candidates: [
      { id: 'jing-yuan-01', title: '景元 01', src: avatarSource('jing-yuan-01'), reference: avatarReference('jing-yuan-01') },
    ],
  },
  {
    canonicalName: '卡芙卡',
    candidates: [
      { id: 'kafka-01', title: '卡芙卡 01', src: avatarSource('kafka-01'), reference: avatarReference('kafka-01') },
    ],
  },
  {
    canonicalName: '娜塔莎',
    candidates: [
      { id: 'natasha-01', title: '娜塔莎 01', src: avatarSource('natasha-01'), reference: avatarReference('natasha-01') },
    ],
  },
  {
    canonicalName: '佩拉',
    candidates: [
      { id: 'pela-01', title: '佩拉 01', src: avatarSource('pela-01'), reference: avatarReference('pela-01') },
    ],
  },
  {
    canonicalName: '希儿',
    candidates: [
      { id: 'seele-01', title: '希儿 01', src: avatarSource('seele-01'), reference: avatarReference('seele-01') },
    ],
  },
  {
    canonicalName: '希露瓦',
    candidates: [
      { id: 'serval-01', title: '希露瓦 01', src: avatarSource('serval-01'), reference: avatarReference('serval-01') },
    ],
  },
  {
    canonicalName: '银狼',
    candidates: [
      { id: 'silver-wolf-01', title: '银狼 01', src: avatarSource('silver-wolf-01'), reference: avatarReference('silver-wolf-01') },
      { id: 'silver-wolf-02', title: '银狼 02', src: avatarSource('silver-wolf-02'), reference: avatarReference('silver-wolf-02') },
      { id: 'silver-wolf-03', title: '银狼 03', src: avatarSource('silver-wolf-03'), reference: avatarReference('silver-wolf-03') },
    ],
  },
  {
    canonicalName: '史瓦罗',
    candidates: [
      { id: 'svarog-01', title: '史瓦罗 01', src: avatarSource('svarog-01'), reference: avatarReference('svarog-01') },
    ],
  },
  {
    canonicalName: '托帕',
    candidates: [
      { id: 'topaz-01', title: '托帕 01', src: avatarSource('topaz-01'), reference: avatarReference('topaz-01') },
    ],
  },
  {
    canonicalName: '黄泉',
    candidates: [
      { id: 'acheron-01', title: '黄泉 01', src: avatarSource('acheron-01'), reference: avatarReference('acheron-01') },
    ],
  },
  {
    canonicalName: '那刻夏',
    candidates: [
      { id: 'anaxa-01', title: '那刻夏 01', src: avatarSource('anaxa-01'), reference: avatarReference('anaxa-01') },
    ],
  },
  {
    canonicalName: 'Archer',
    candidates: [
      { id: 'archer-01', title: 'Archer 01', src: avatarSource('archer-01'), reference: avatarReference('archer-01') },
    ],
  },
  {
    canonicalName: '银枝',
    candidates: [
      { id: 'argenti-01', title: '银枝 01', src: avatarSource('argenti-01'), reference: avatarReference('argenti-01') },
    ],
  },
  {
    canonicalName: '不死途',
    candidates: [
      { id: 'ashveil-01', title: '不死途 01', src: avatarSource('ashveil-01'), reference: avatarReference('ashveil-01') },
    ],
  },
  {
    canonicalName: '黑天鹅',
    candidates: [
      { id: 'black-swan-01', title: '黑天鹅 01', src: avatarSource('black-swan-01'), reference: avatarReference('black-swan-01') },
    ],
  },
  {
    canonicalName: '刃',
    candidates: [
      { id: 'blade-01', title: '刃 01', src: avatarSource('blade-01'), reference: avatarReference('blade-01') },
    ],
  },
  {
    canonicalName: '波提欧',
    candidates: [
      { id: 'boothill-01', title: '波提欧 01', src: avatarSource('boothill-01'), reference: avatarReference('boothill-01') },
    ],
  },
  {
    canonicalName: '遐蝶',
    candidates: [
      { id: 'castorice-01', title: '遐蝶 01', src: avatarSource('castorice-01'), reference: avatarReference('castorice-01') },
    ],
  },
  {
    canonicalName: '刻律德菈',
    candidates: [
      { id: 'cerydra-01', title: '刻律德菈 01', src: avatarSource('cerydra-01'), reference: avatarReference('cerydra-01') },
    ],
  },
  {
    canonicalName: '赛飞儿',
    candidates: [
      { id: 'cipher-01', title: '赛飞儿 01', src: avatarSource('cipher-01'), reference: avatarReference('cipher-01') },
    ],
  },
  {
    canonicalName: '可可利亚',
    candidates: [
      { id: 'cocolia-01', title: '可可利亚 01', src: avatarSource('cocolia-01'), reference: avatarReference('cocolia-01') },
    ],
  },
  {
    canonicalName: '昔涟',
    candidates: [
      { id: 'cyrene-01', title: '昔涟 01', src: avatarSource('cyrene-01'), reference: avatarReference('cyrene-01') },
    ],
  },
  {
    canonicalName: '真理医生',
    candidates: [
      { id: 'dr-ratio-01', title: '真理医生 01', src: avatarSource('dr-ratio-01'), reference: avatarReference('dr-ratio-01') },
    ],
  },
  {
    canonicalName: '艾利欧',
    candidates: [
      { id: 'elio-01', title: '艾利欧 01', src: avatarSource('elio-01'), reference: avatarReference('elio-01') },
    ],
  },
  {
    canonicalName: '绯英',
    candidates: [
      { id: 'evanescia-01', title: '绯英 01', src: avatarSource('evanescia-01'), reference: avatarReference('evanescia-01') },
    ],
  },
  {
    canonicalName: '飞霄',
    candidates: [
      { id: 'feixiao-01', title: '飞霄 01', src: avatarSource('feixiao-01'), reference: avatarReference('feixiao-01') },
    ],
  },
  {
    canonicalName: '流萤',
    candidates: [
      { id: 'firefly-01', title: '流萤 01', src: avatarSource('firefly-01'), reference: avatarReference('firefly-01') },
    ],
  },
  {
    canonicalName: '加拉赫',
    candidates: [
      { id: 'gallagher-01', title: '加拉赫 01', src: avatarSource('gallagher-01'), reference: avatarReference('gallagher-01') },
    ],
  },
  {
    canonicalName: '吉尔伽美什',
    candidates: [
      { id: 'gilgamesh-01', title: '吉尔伽美什 01', src: avatarSource('gilgamesh-01'), reference: avatarReference('gilgamesh-01') },
    ],
  },
  {
    canonicalName: '归寂',
    candidates: [
      { id: 'guiji-01', title: '归寂 01', src: avatarSource('guiji-01'), reference: avatarReference('guiji-01') },
    ],
  },
  {
    canonicalName: '桂乃芬',
    candidates: [
      { id: 'guinaifen-01', title: '桂乃芬 01', src: avatarSource('guinaifen-01'), reference: avatarReference('guinaifen-01') },
    ],
  },
  {
    canonicalName: '寒鸦',
    candidates: [
      { id: 'hanya-01', title: '寒鸦 01', src: avatarSource('hanya-01'), reference: avatarReference('hanya-01') },
    ],
  },
  {
    canonicalName: '虎克',
    candidates: [
      { id: 'hook-01', title: '虎克 01', src: avatarSource('hook-01'), reference: avatarReference('hook-01') },
    ],
  },
  {
    canonicalName: '藿藿',
    candidates: [
      { id: 'huohuo-01', title: '藿藿 01', src: avatarSource('huohuo-01'), reference: avatarReference('huohuo-01') },
    ],
  },
  {
    canonicalName: '风堇',
    candidates: [
      { id: 'hyacine-01', title: '风堇 01', src: avatarSource('hyacine-01'), reference: avatarReference('hyacine-01') },
    ],
  },
  {
    canonicalName: '海瑟音',
    candidates: [
      { id: 'hysilens-01', title: '海瑟音 01', src: avatarSource('hysilens-01'), reference: avatarReference('hysilens-01') },
    ],
  },
  {
    canonicalName: '椒丘',
    candidates: [
      { id: 'jiaoqiu-01', title: '椒丘 01', src: avatarSource('jiaoqiu-01'), reference: avatarReference('jiaoqiu-01') },
    ],
  },
  {
    canonicalName: '镜流',
    candidates: [
      { id: 'jingliu-01', title: '镜流 01', src: avatarSource('jingliu-01'), reference: avatarReference('jingliu-01') },
    ],
  },
  {
    canonicalName: '灵砂',
    candidates: [
      { id: 'lingsha-01', title: '灵砂 01', src: avatarSource('lingsha-01'), reference: avatarReference('lingsha-01') },
    ],
  },
  {
    canonicalName: '卢卡',
    candidates: [
      { id: 'luka-01', title: '卢卡 01', src: avatarSource('luka-01'), reference: avatarReference('luka-01') },
    ],
  },
  {
    canonicalName: '罗刹',
    candidates: [
      { id: 'luocha-01', title: '罗刹 01', src: avatarSource('luocha-01'), reference: avatarReference('luocha-01') },
    ],
  },
  {
    canonicalName: '来古士',
    candidates: [
      { id: 'lygus-01', title: '来古士 01', src: avatarSource('lygus-01'), reference: avatarReference('lygus-01') },
    ],
  },
  {
    canonicalName: '林登·斯科特',
    candidates: [
      { id: 'lyndon-skott-01', title: '林登·斯科特 01', src: avatarSource('lyndon-skott-01'), reference: avatarReference('lyndon-skott-01') },
    ],
  },
  {
    canonicalName: '玲可',
    candidates: [
      { id: 'lynx-01', title: '玲可 01', src: avatarSource('lynx-01'), reference: avatarReference('lynx-01') },
    ],
  },
  {
    canonicalName: '米沙',
    candidates: [
      { id: 'misha-01', title: '米沙 01', src: avatarSource('misha-01'), reference: avatarReference('misha-01') },
    ],
  },
  {
    canonicalName: '貊泽',
    candidates: [
      { id: 'moze-01', title: '貊泽 01', src: avatarSource('moze-01'), reference: avatarReference('moze-01') },
    ],
  },
  {
    canonicalName: '万敌',
    candidates: [
      { id: 'mydei-01', title: '万敌 01', src: avatarSource('mydei-01'), reference: avatarReference('mydei-01') },
    ],
  },
  {
    canonicalName: '真珠',
    candidates: [
      { id: 'pearl-01', title: '真珠 01', src: avatarSource('pearl-01'), reference: avatarReference('pearl-01') },
    ],
  },
  {
    canonicalName: '白厄',
    candidates: [
      { id: 'phainon-01', title: '白厄 01', src: avatarSource('phainon-01'), reference: avatarReference('phainon-01') },
    ],
  },
  {
    canonicalName: '青雀',
    candidates: [
      { id: 'qingque-01', title: '青雀 01', src: avatarSource('qingque-01'), reference: avatarReference('qingque-01') },
    ],
  },
  {
    canonicalName: '乱破',
    candidates: [
      { id: 'rappa-01', title: '乱破 01', src: avatarSource('rappa-01'), reference: avatarReference('rappa-01') },
    ],
  },
  {
    canonicalName: '远坂凛',
    candidates: [
      { id: 'rin-tohsaka-01', title: '远坂凛 01', src: avatarSource('rin-tohsaka-01'), reference: avatarReference('rin-tohsaka-01') },
    ],
  },
  {
    canonicalName: '知更鸟',
    candidates: [
      { id: 'robin-01', title: '知更鸟 01', src: avatarSource('robin-01'), reference: avatarReference('robin-01') },
    ],
  },
  {
    canonicalName: '阮·梅',
    candidates: [
      { id: 'ruan-mei-01', title: '阮·梅 01', src: avatarSource('ruan-mei-01'), reference: avatarReference('ruan-mei-01') },
    ],
  },
  {
    canonicalName: 'Saber',
    candidates: [
      { id: 'saber-01', title: 'Saber 01', src: avatarSource('saber-01'), reference: avatarReference('saber-01') },
    ],
  },
  {
    canonicalName: '桑博',
    candidates: [
      { id: 'sampo-01', title: '桑博 01', src: avatarSource('sampo-01'), reference: avatarReference('sampo-01') },
    ],
  },
  {
    canonicalName: '螺丝咕姆',
    candidates: [
      { id: 'screwllum-01', title: '螺丝咕姆 01', src: avatarSource('screwllum-01'), reference: avatarReference('screwllum-01') },
    ],
  },
  {
    canonicalName: '花火',
    candidates: [
      { id: 'sparkle-01', title: '花火 01', src: avatarSource('sparkle-01'), reference: avatarReference('sparkle-01') },
    ],
  },
  {
    canonicalName: '火花',
    candidates: [
      { id: 'sparxie-01', title: '火花 01', src: avatarSource('sparxie-01'), reference: avatarReference('sparxie-01') },
    ],
  },
  {
    canonicalName: '史蒂芬',
    candidates: [
      { id: 'stephen-lloyd-01', title: '史蒂芬 01', src: avatarSource('stephen-lloyd-01'), reference: avatarReference('stephen-lloyd-01') },
    ],
  },
  {
    canonicalName: '星期日',
    candidates: [
      { id: 'sunday-01', title: '星期日 01', src: avatarSource('sunday-01'), reference: avatarReference('sunday-01') },
    ],
  },
  {
    canonicalName: '素裳',
    candidates: [
      { id: 'sushang-01', title: '素裳 01', src: avatarSource('sushang-01'), reference: avatarReference('sushang-01') },
    ],
  },
  {
    canonicalName: '大丽花',
    candidates: [
      { id: 'the-dahlia-01', title: '大丽花 01', src: avatarSource('the-dahlia-01'), reference: avatarReference('the-dahlia-01') },
    ],
  },
  {
    canonicalName: '停云',
    candidates: [
      { id: 'tingyun-01', title: '停云 01', src: avatarSource('tingyun-01'), reference: avatarReference('tingyun-01') },
    ],
  },
  {
    canonicalName: '缇宝',
    candidates: [
      { id: 'tribbie-01', title: '缇宝 01', src: avatarSource('tribbie-01'), reference: avatarReference('tribbie-01') },
    ],
  },
  {
    canonicalName: '雪衣',
    candidates: [
      { id: 'xueyi-01', title: '雪衣 01', src: avatarSource('xueyi-01'), reference: avatarReference('xueyi-01') },
    ],
  },
  {
    canonicalName: '虚照',
    candidates: [
      { id: 'xuzhao-01', title: '虚照 01', src: avatarSource('xuzhao-01'), reference: avatarReference('xuzhao-01') },
    ],
  },
  {
    canonicalName: '彦卿',
    candidates: [
      { id: 'yanqing-01', title: '彦卿 01', src: avatarSource('yanqing-01'), reference: avatarReference('yanqing-01') },
    ],
  },
  {
    canonicalName: '爻光',
    candidates: [
      { id: 'yaoguang-01', title: '爻光 01', src: avatarSource('yaoguang-01'), reference: avatarReference('yaoguang-01') },
    ],
  },
  {
    canonicalName: '驭空',
    candidates: [
      { id: 'yukong-01', title: '驭空 01', src: avatarSource('yukong-01'), reference: avatarReference('yukong-01') },
    ],
  },
  {
    canonicalName: '云璃',
    candidates: [
      { id: 'yunli-01', title: '云璃 01', src: avatarSource('yunli-01'), reference: avatarReference('yunli-01') },
    ],
  },
];

export function getBuiltinAvatarSet(canonicalName: string | undefined): BuiltinAvatarSet | undefined {
  if (!canonicalName) return undefined;
  const normalizedName = canonicalName.trim();
  if (!normalizedName) return undefined;
  const ownerName = BUILTIN_AVATAR_CANONICAL_ALIASES[normalizedName] ?? normalizedName;
  return BUILTIN_AVATAR_SETS.find((set) => set.canonicalName === ownerName);
}

export function getBuiltinAvatarSetForNames(...names: Array<string | undefined>): BuiltinAvatarSet | undefined {
  const candidates = new Set<string>();
  for (const rawName of names) {
    const name = rawName?.trim();
    if (!name) continue;
    candidates.add(name);
    for (const part of name.split(/[\/／|｜、,，;；\n]+/u)) {
      const candidate = part.trim();
      if (candidate) candidates.add(candidate);
    }
  }

  for (const candidate of candidates) {
    const set = getBuiltinAvatarSet(candidate);
    if (set) return set;
  }
  return undefined;
}

export function getDefaultBuiltinAvatar(canonicalName: string | undefined): string | undefined {
  const candidates = getBuiltinAvatarSet(canonicalName)?.candidates;
  return candidates?.find((candidate) => isRemoteStaticAssetUrl(candidate.src))?.src ?? candidates?.[0]?.src;
}

export function getDefaultBuiltinAvatarForNames(...names: Array<string | undefined>): string | undefined {
  const candidates = getBuiltinAvatarSetForNames(...names)?.candidates;
  return candidates?.find((candidate) => isRemoteStaticAssetUrl(candidate.src))?.src ?? candidates?.[0]?.src;
}
