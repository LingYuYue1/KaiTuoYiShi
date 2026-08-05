import {
  ZHIKU_CATEGORY_POLICIES,
  type 智库治理分类,
} from '@/models/zhikuGovernance';

export interface 智库内置身份注册项 {
  id: string;
  legacyId: string;
  compatibilityIds: readonly string[];
  category: 智库治理分类;
  presetId: string;
  sourceFile: string;
  sourceIndex: number;
  sourceTitle: string;
}

type RawIdentityGroup = readonly [
  presetId: string,
  sourceFile: string,
  entries: readonly (readonly [id: string, legacyId: string, sourceTitle: string, compatibilityIds?: readonly string[]])[],
];

// sourceIndex is intentionally the position inside each group. Entries without a historical
// source id used this same index in the legacy loader, so changes are caught by the dry run.
const RAW_IDENTITY_GROUPS: readonly RawIdentityGroup[] = [
  ['zhiku_character_rebuild_core', 'character-rebuild-core.json', [
    ['JS-000', 'zhiku_character_rebuild_stelle_profile', '星'],
    ['JS-001', 'zhiku_character_rebuild_caelus_profile', '穹'],
    ['JS-002', 'zhiku_character_rebuild_march_profile', '三月七'],
    ['JS-003', 'zhiku_character_rebuild_welt_profile', '瓦尔特·杨'],
    ['JS-004', 'zhiku_character_rebuild_danheng_profile', '丹恒'],
    ['JS-005', 'zhiku_character_rebuild_himeko_profile', '姬子'],
    ['JS-006', 'zhiku_character_rebuild_pompom_profile', '帕姆'],
    ['JS-076', 'zhiku_character_rebuild_danheng_imbibitor_lunae_profile', '丹恒·饮月'],
    ['JS-077', 'zhiku_character_rebuild_danheng_souldragon_profile', '丹恒·腾荒'],
    ['JS-082', 'zhiku_character_rebuild_himeko_qixing_profile', '姬子•启行'],
    ['JS-083', 'zhiku_character_rebuild_march_hunt_profile', '三月七·巡猎'],
    ['JS-084', 'zhiku_character_rebuild_evernight_profile', '长夜月'],
  ]],
  ['zhiku_stellaron_hunters_character_rebuild', 'stellaron-hunters-character-rebuild.json', [
    ['JS-007', 'zhiku_character_rebuild_kafka_profile', '卡芙卡'],
    ['JS-008', 'zhiku_character_rebuild_blade_profile', '刃'],
    ['JS-009', 'zhiku_character_rebuild_silver_wolf_profile', '银狼'],
    ['JS-010', 'zhiku_character_rebuild_firefly_profile', '流萤'],
    ['JS-011', 'zhiku_character_rebuild_elio_profile', '艾利欧'],
    ['JS-078', 'zhiku_character_rebuild_chiye_blade_profile', '千冶•刃'],
    ['JS-080', 'zhiku_character_rebuild_silver_wolf_lv999_profile', '银狼LV.999'],
  ]],
  ['zhiku_herta_station_character_rebuild', 'herta-station-character-rebuild.json', [
    ['JS-012', 'zhiku_character_rebuild_herta_profile', '黑塔'],
    ['JS-013', 'zhiku_character_rebuild_asta_profile', '艾丝妲'],
    ['JS-014', 'zhiku_character_rebuild_arlan_profile', '阿兰'],
    ['JS-099', 'zhiku_character_rebuild_the_herta_profile', '大黑塔', ['JS-012B']],
  ]],
  ['zhiku_genius_society_character_rebuild', 'genius-society-character-rebuild.json', [
    ['JS-015', 'zhiku_character_rebuild_ruanmei_profile', '阮·梅'],
    ['JS-016', 'zhiku_character_rebuild_screwllum_profile', '螺丝咕姆'],
    ['JS-017', 'zhiku_character_rebuild_stephen_lloyd_profile', '斯蒂芬'],
  ]],
  ['zhiku_intelligentsia_guild_character_rebuild', 'intelligentsia-guild-character-rebuild.json', [
    ['JS-019', 'zhiku_character_rebuild_dr_ratio_profile', '真理医生'],
  ]],
  ['zhiku_belobog_character_rebuild', 'belobog-character-rebuild.json', [
    ['JS-020', 'zhiku_character_rebuild_bronya_profile', '布洛妮娅'],
    ['JS-021', 'zhiku_character_rebuild_seele_profile', '希儿'],
    ['JS-022', 'zhiku_character_rebuild_gepard_profile', '杰帕德'],
    ['JS-023', 'zhiku_character_rebuild_serval_profile', '希露瓦'],
    ['JS-024', 'zhiku_character_rebuild_pela_profile', '佩拉'],
    ['JS-025', 'zhiku_character_rebuild_natasha_profile', '娜塔莎'],
    ['JS-026', 'zhiku_character_rebuild_clara_profile', '克拉拉'],
    ['JS-027', 'zhiku_character_rebuild_svarog_profile', '史瓦罗'],
    ['JS-028', 'zhiku_character_rebuild_sampo_profile', '桑博'],
    ['JS-029', 'zhiku_character_rebuild_hook_profile', '虎克'],
    ['JS-030', 'zhiku_character_rebuild_luka_profile', '卢卡'],
    ['JS-031', 'zhiku_character_rebuild_lynx_profile', '玲可'],
    ['JS-032', 'zhiku_character_rebuild_cocolia_profile', '可可利亚'],
  ]],
  ['zhiku_xianzhou_luofu_character_rebuild', 'xianzhou-luofu-character-rebuild.json', [
    ['JS-033', 'zhiku_character_rebuild_jing_yuan_profile', '景元'],
    ['JS-034', 'zhiku_character_rebuild_yanqing_profile', '彦卿'],
    ['JS-035', 'zhiku_character_rebuild_fu_xuan_profile', '符玄'],
    ['JS-036', 'zhiku_character_rebuild_bailu_profile', '白露'],
    ['JS-037', 'zhiku_character_rebuild_tingyun_profile', '停云'],
    ['JS-038', 'zhiku_character_rebuild_lingsha_profile', '灵砂'],
    ['JS-039', 'zhiku_character_rebuild_yukong_profile', '驭空'],
    ['JS-040', 'zhiku_character_rebuild_qingque_profile', '青雀'],
    ['JS-041', 'zhiku_character_rebuild_luocha_profile', '罗刹'],
    ['JS-042', 'zhiku_character_rebuild_jingliu_profile', '镜流'],
    ['JS-043', 'zhiku_character_rebuild_guinaifen_profile', '桂乃芬'],
    ['JS-044', 'zhiku_character_rebuild_sushang_profile', '素裳'],
    ['JS-045', 'zhiku_character_rebuild_huohuo_profile', '藿藿'],
    ['JS-046', 'zhiku_character_rebuild_hanya_profile', '寒鸦'],
    ['JS-047', 'zhiku_character_rebuild_xueyi_profile', '雪衣'],
    ['JS-081', 'zhiku_character_rebuild_fugue_profile', '忘归人'],
  ]],
  ['zhiku_penacony_character_rebuild', 'penacony-character-rebuild.json', [
    ['JS-048', 'zhiku_character_rebuild_sunday_profile', '星期日'],
    ['JS-049', 'zhiku_character_rebuild_gallagher_profile', '加拉赫'],
    ['JS-050', 'zhiku_character_rebuild_robin_profile', '知更鸟'],
    ['JS-051', 'zhiku_character_rebuild_misha_profile', '米沙'],
    ['JS-052', 'zhiku_character_rebuild_sparkle_profile', '花火'],
    ['JS-053', 'zhiku_character_rebuild_the_dahlia_profile', '大丽花'],
  ]],
  ['zhiku_amphoreus_character_rebuild', 'amphoreus-character-rebuild.json', [
    ['JS-054', 'zhiku_character_rebuild_aglaea_profile', '阿格莱雅'],
    ['JS-055', 'zhiku_character_rebuild_phainon_profile', '白厄'],
    ['JS-056', 'zhiku_character_rebuild_hyacine_profile', '风堇'],
    ['JS-057', 'zhiku_character_rebuild_hysilens_profile', '海瑟音'],
    ['JS-058', 'zhiku_character_rebuild_lygus_profile', '来古士'],
    ['JS-059', 'zhiku_character_rebuild_anaxa_profile', '那刻夏'],
    ['JS-060', 'zhiku_character_rebuild_cipher_profile', '赛飞儿'],
    ['JS-061', 'zhiku_character_rebuild_tribbie_profile', '缇宝'],
    ['JS-062', 'zhiku_character_rebuild_cerydra_profile', '刻律德菈'],
    ['JS-063', 'zhiku_character_rebuild_mydei_profile', '万敌'],
    ['JS-064', 'zhiku_character_rebuild_cyrene_profile', '昔涟'],
    ['JS-065', 'zhiku_character_rebuild_castorice_profile', '遐蝶'],
    ['JS-079', 'zhiku_character_rebuild_khaslana_profile', '卡厄斯兰那'],
  ]],
  ['zhiku_interastral_peace_corporation_character_rebuild', 'interastral-peace-corporation-character-rebuild.json', [
    ['JS-066', 'zhiku_character_rebuild_topaz_profile', '托帕'],
    ['JS-067', 'zhiku_character_rebuild_aventurine_profile', '砂金'],
    ['JS-068', 'zhiku_character_rebuild_jade_profile', '翡翠'],
    ['JS-069', 'zhiku_character_rebuild_pearl_profile', '真珠'],
    ['JS-070', 'zhiku_character_rebuild_lyndonskott_profile', '林登·斯科特'],
  ]],
  ['zhiku_galaxy_rangers_character_rebuild', 'galaxy-rangers-character-rebuild.json', [
    ['JS-071', 'zhiku_character_rebuild_boothill_profile', '波提欧'],
    ['JS-072', 'zhiku_character_rebuild_rappa_profile', '乱破'],
  ]],
  ['zhiku_garden_of_recollection_character_rebuild', 'garden-of-recollection-character-rebuild.json', [
    ['JS-073', 'zhiku_character_rebuild_black_swan_profile', '黑天鹅'],
  ]],
  ['zhiku_galactic_travelers_character_rebuild', 'galactic-travelers-character-rebuild.json', [
    ['JS-074', 'zhiku_character_rebuild_argenti_profile', '银枝'],
    ['JS-075', 'zhiku_character_rebuild_acheron_profile', '黄泉'],
  ]],
  ['zhiku_xianzhou_alliance_character_expansion', 'xianzhou-alliance-character-expansion.json', [
    ['JS-085', 'zhiku_character_expansion_feixiao_profile', '飞霄'],
    ['JS-086', 'zhiku_character_expansion_jiaoqiu_profile', '椒丘'],
    ['JS-087', 'zhiku_character_expansion_yunli_profile', '云璃'],
    ['JS-088', 'zhiku_character_expansion_moze_profile', '貊泽'],
    ['JS-089', 'zhiku_character_expansion_yaoguang_profile', '爻光'],
  ]],
  ['zhiku_planarcadia_character_expansion', 'planarcadia-character-expansion.json', [
    ['JS-090', 'zhiku_character_expansion_sparxie_profile', '火花'],
    ['JS-091', 'zhiku_character_expansion_hysilens_planarcadia_profile', '绯英'],
    ['JS-092', 'zhiku_character_expansion_undying_profile', '不死途'],
    ['JS-093', 'zhiku_character_expansion_xuzhao_profile', '虚照'],
  ]],
  ['zhiku_fate_collaboration_character_expansion', 'fate-collaboration-character-expansion.json', [
    ['JS-094', 'zhiku_character_expansion_archer_profile', 'Archer'],
    ['JS-095', 'zhiku_character_expansion_saber_profile', 'Saber'],
    ['JS-096', 'zhiku_character_expansion_tohsaka_rin_profile', '远坂凛'],
    ['JS-097', 'zhiku_character_expansion_gilgamesh_profile', '吉尔伽美什'],
  ]],
  ['zhiku_planarcadia_enemy_expansion', 'planarcadia-enemy-expansion.json', [
    ['DS-000', 'zhiku_character_expansion_guiji_profile', '归寂', ['JS-098']],
  ]],
  ['zhiku_location_core', 'location-core.json', [
    ['DD-000', 'zhiku_location_core_1', '主控舱段'],
    ['DD-001', 'zhiku_location_core_2', '收容舱段'],
    ['DD-002', 'zhiku_location_core_3', '观景车厢'],
    ['DD-003', 'zhiku_location_core_4', '贝洛伯格'],
    ['DD-004', 'zhiku_location_core_5', '长乐天'],
    ['DD-005', 'zhiku_location_core_6', '黄金的时刻'],
  ]],
  ['zhiku_term_core', 'term-core.json', [
    ['MY-000', 'zhiku_term_core_1', '琥珀纪'],
    ['MY-001', 'zhiku_term_core_2', '星神'],
    ['MY-002', 'zhiku_term_core_3', '命途'],
    ['PX-000', 'zhiku_term_core_4', '派系'],
    ['PX-001', 'zhiku_term_core_5', '星核猎手'],
  ]],
  ['zhiku_worldview_core', 'worldview-core.json', [
    ['MY-003', 'zhiku_worldview_core_1', '星神总览'],
    ['MY-004', 'zhiku_worldview_core_2', '命途总览'],
    ['PX-002', 'zhiku_worldview_core_3', '派系总览'],
    ['PX-003', 'zhiku_worldview_core_4', '星穹列车'],
    ['DD-006', 'zhiku_worldview_core_5', '空间站「黑塔」'],
    ['DD-007', 'zhiku_worldview_core_6', '雅利洛-Ⅵ'],
    ['DD-008', 'zhiku_worldview_core_7', '仙舟「罗浮」'],
    ['DD-009', 'zhiku_worldview_core_8', '梦想之地匹诺康尼'],
    ['DD-010', 'zhiku_worldview_core_9', '二相乐园'],
    ['DD-011', 'zhiku_worldview_core_10', '翁法罗斯'],
  ]],
  ['zhiku_paths_core', 'paths-core.json', [
    ['MT-000', 'zhiku_paths_core_1', '巡猎'],
    ['MT-001', 'zhiku_paths_core_2', '毁灭'],
    ['MT-002', 'zhiku_paths_core_3', '存护'],
    ['MT-003', 'zhiku_paths_core_4', '智识'],
    ['MT-004', 'zhiku_paths_core_5', '同谐'],
    ['MT-005', 'zhiku_paths_core_6', '虚无'],
    ['MT-006', 'zhiku_paths_core_7', '丰饶'],
    ['MT-007', 'zhiku_paths_core_8', '欢愉'],
    ['MT-008', 'zhiku_paths_core_9', '记忆'],
    ['MT-009', 'zhiku_paths_core_10', '开拓'],
    ['MT-010', 'zhiku_paths_core_11', '繁育'],
    ['MT-011', 'zhiku_paths_core_12', '贪饕'],
    ['MT-012', 'zhiku_paths_core_13', '神秘'],
    ['MT-013', 'zhiku_paths_core_14', '均衡'],
    ['MT-014', 'zhiku_paths_core_15', '秩序'],
    ['MT-015', 'zhiku_paths_core_16', '终末'],
    ['MT-016', 'zhiku_paths_core_17', '纯美'],
    ['MT-017', 'zhiku_paths_core_18', '不朽'],
    ['MT-018', 'zhiku_paths_core_19', '命途概念'],
  ]],
  ['zhiku_aeons_core', 'aeons-core.json', [
    ['XS-000', 'zhiku_aeons_core_1', '岚｜巡猎'],
    ['XS-001', 'zhiku_aeons_core_2', '纳努克｜毁灭'],
    ['XS-002', 'zhiku_aeons_core_3', '克里珀｜存护'],
    ['XS-003', 'zhiku_aeons_core_4', '博识尊｜智识'],
    ['XS-004', 'zhiku_aeons_core_5', '希佩｜同谐'],
    ['XS-005', 'zhiku_aeons_core_6', 'IX｜虚无'],
    ['XS-006', 'zhiku_aeons_core_7', '药师｜丰饶'],
    ['XS-007', 'zhiku_aeons_core_8', '阿哈｜欢愉'],
    ['XS-008', 'zhiku_aeons_core_9', '浮黎｜记忆'],
    ['XS-009', 'zhiku_aeons_core_10', '阿基维利｜开拓'],
    ['XS-010', 'zhiku_aeons_core_11', '塔伊兹育罗斯｜繁育'],
    ['XS-011', 'zhiku_aeons_core_12', '奥博洛斯｜贪饕'],
    ['XS-012', 'zhiku_aeons_core_13', '迷思｜神秘'],
    ['XS-013', 'zhiku_aeons_core_14', '互｜均衡'],
    ['XS-014', 'zhiku_aeons_core_15', '太一｜秩序'],
    ['XS-015', 'zhiku_aeons_core_16', '末王｜终末'],
    ['XS-016', 'zhiku_aeons_core_17', '伊德莉拉｜纯美'],
    ['XS-017', 'zhiku_aeons_core_18', '龙｜不朽'],
    ['XS-018', 'zhiku_aeons_core_19', '星神概念'],
  ]],
  ['zhiku_xianzhou_history', 'xianzhou-history.json', [
    ['SJ-000', 'zhiku_xianzhou_history_1', '仙舟历史·启航与孤航（星历0–2600）'],
    ['SJ-001', 'zhiku_xianzhou_history_2', '仙舟历史·长生与三劫（星历2600–3600）'],
    ['SJ-002', 'zhiku_xianzhou_history_3', '仙舟历史·联盟成立与帝弓显现（星历3600–5700）'],
    ['SJ-003', 'zhiku_xianzhou_history_4', '仙舟历史·丰饶战争与近代（星历5700–8100）'],
  ]],
];

const prefixToCategory = new Map(
  Object.values(ZHIKU_CATEGORY_POLICIES).map((policy) => [policy.machineIdPrefix, policy.key]),
);

export const ZHIKU_BUNDLED_IDENTITY_REGISTRY: readonly 智库内置身份注册项[] = RAW_IDENTITY_GROUPS.flatMap(
  ([presetId, sourceFile, entries]) => entries.map(([id, legacyId, sourceTitle, compatibilityIds = []], sourceIndex) => {
    const category = prefixToCategory.get(id.slice(0, 2));
    if (!category) throw new Error(`智库身份注册表包含未知前缀：${id}`);
    return { id, legacyId, compatibilityIds, category, presetId, sourceFile, sourceIndex, sourceTitle };
  }),
);

const identityBySource = new Map(
  ZHIKU_BUNDLED_IDENTITY_REGISTRY.map((entry) => [`${entry.presetId}:${entry.sourceIndex}`, entry]),
);

const identityByAnyId = new Map<string, 智库内置身份注册项>();
for (const entry of ZHIKU_BUNDLED_IDENTITY_REGISTRY) {
  identityByAnyId.set(entry.id, entry);
  identityByAnyId.set(entry.legacyId, entry);
  for (const compatibilityId of entry.compatibilityIds) identityByAnyId.set(compatibilityId, entry);
}

export function resolveBundledZhikuIdentity(
  presetId: string,
  sourceIndex: number,
  sourceId?: string,
  sourceTitle?: string,
): 智库内置身份注册项 | undefined {
  const entry = identityBySource.get(`${presetId}:${sourceIndex}`);
  if (!entry) return undefined;
  const legacyId = sourceId?.trim() || `${presetId}_${sourceIndex + 1}`;
  const title = sourceTitle?.trim();
  return entry.legacyId === legacyId && (!title || entry.sourceTitle === title) ? entry : undefined;
}

export function findBundledZhikuIdentity(id: string): 智库内置身份注册项 | undefined {
  return identityByAnyId.get(id.trim());
}

export function resolveZhikuMachineId(id: string): string {
  return findBundledZhikuIdentity(id)?.id ?? id;
}
