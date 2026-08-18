import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-opening-story-alignment-regression');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cleanTempDir() {
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });
}

function transpileModule(sourcePath) {
  const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
  const sourceDir = path.posix.dirname(sourcePath.replaceAll('\\', '/'));
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
      skipLibCheck: true,
    },
  }).outputText
    .replace(/@\/(data|models|services|utils)\//g, (_match, folder) => {
      let relative = path.posix.relative(sourceDir, folder);
      if (!relative.startsWith('.')) relative = `./${relative}`;
      return `${relative}/`;
    })
    .replace(/from\s+['"]((?:\.\/|\.\.\/)[^'"]+)['"]/g, (match, specifier) =>
      specifier.endsWith('.mjs') || specifier.endsWith('.json') ? match : `from '${specifier}.mjs'`);
  const outputPath = path.join(tempDir, sourcePath.replace(/\.ts$/, '.mjs'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
}

function writeStub(relativePath, content) {
  const outputPath = path.join(tempDir, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, 'utf8');
}

cleanTempDir();
for (const sourcePath of [
  'models/storyWeaving.ts',
  'models/npc.ts',
  'models/world.ts',
  'models/journey.ts',
  'data/journeyPresets.ts',
  'data/zhikuCanonicalCharacters.ts',
  'data/canonicalCharacters.ts',
  'data/storyWeavingPreset.ts',
]) {
  transpileModule(sourcePath);
}
writeStub('data/zhikuPreset.mjs', 'export const bundledZhikuPresets = [];\nexport async function loadBundledZhikuPreset() { return { 条目: [] }; }\n');
writeStub('data/builtinAvatars.mjs', 'export function getDefaultBuiltinAvatar() { return undefined; }\nexport function getDefaultBuiltinAvatarForNames() { return undefined; }\n');
writeStub('utils/npcMemorySanitizer.mjs', 'export function 清理NPC同行记忆摘要(value) { return typeof value === "string" ? value.trim() : ""; }\n');
writeStub('utils/staticAssets.mjs', 'export const STATIC_ASSET_FALLBACK_AVATAR = "";\n');

const storyWeavingPreset = await import(pathToFileURL(path.join(tempDir, 'data/storyWeavingPreset.mjs')).href);
const journeyPresets = await import(pathToFileURL(path.join(tempDir, 'data/journeyPresets.mjs')).href);
const worldModel = await import(pathToFileURL(path.join(tempDir, 'models/world.mjs')).href);
const bundled = JSON.parse(fs.readFileSync(path.join(root, 'data/storyWeavingCanonDecomposed.json'), 'utf8'));

function makeArchive(chapterId, chapterName, regionId = 'xianzhou_luofu', regionName = '罗浮仙舟') {
  return {
    来源: 'official_preset',
    主线启用: true,
    星球来源: 'existing',
    地区ID: regionId,
    地区名称: regionName,
    章节锚点ID: chapterId,
    章节锚点名称: chapterName,
    章节参考说明: `${regionName} / ${chapterName} 开局章节参考。`,
    参考性质: '背景参考',
    玩家介入原文: `我从${chapterName}切入当前主线。`,
    防回退规则: [],
    整理档案: {
      已认识角色: ['云骑军', '素裳'],
      初始关系: ['云骑军：正在盘查我', '素裳：曾经帮我处理过星槎事故'],
    },
  };
}

function expectAlignment({ chapterId, chapterName, regionId, regionName, seriesId, group, segmentId }) {
  const archive = makeArchive(chapterId, chapterName, regionId, regionName);
  const aligned = storyWeavingPreset.alignStoryWeavingToOpeningArchive(bundled, archive);
  assert(
    aligned.当前系列ID === seriesId,
    `${chapterName} 开局必须切到 ${seriesId}，实际为 ${aligned.当前系列ID}`,
  );
  assert(
    aligned.当前进度?.当前分段组号 === group,
    `${chapterName} 开局必须从第 ${group} 段注入，实际为 ${aligned.当前进度?.当前分段组号}`,
  );
  assert(
    aligned.当前进度?.当前分段ID === segmentId,
    `${chapterName} 开局必须锚到 ${segmentId}，实际为 ${aligned.当前进度?.当前分段ID}`,
  );
  assert(
    aligned.当前进度?.最近判定理由.some((item) => item.includes(chapterId)),
    `${chapterName} 开局对齐必须留下章节锚点诊断。`,
  );
  return aligned;
}

const alignmentCases = [
  {
    chapterId: 'herta_station_incident',
    chapterName: '主线苏醒前夕',
    regionId: 'herta_space_station',
    regionName: '黑塔空间站',
    seriesId: 'story_canon_zhiku_herta_station_chapter1',
    group: 1,
    segmentId: 'story_canon_zhiku_herta_station_chapter1_segment_1',
  },
  {
    chapterId: 'belobog_arrival',
    chapterName: '初抵贝洛伯格',
    regionId: 'jarilo_vi',
    regionName: '贝洛伯格',
    seriesId: 'story_canon_zhiku_jarilo_vi_chapters',
    group: 2,
    segmentId: 'story_canon_zhiku_jarilo_vi_chapters_segment_2',
  },
  {
    chapterId: 'belobog_underworld',
    chapterName: '下层区暗流',
    regionId: 'jarilo_vi',
    regionName: '贝洛伯格',
    seriesId: 'story_canon_zhiku_jarilo_vi_chapters',
    group: 5,
    segmentId: 'story_canon_zhiku_jarilo_vi_chapters_segment_5',
  },
  {
    chapterId: 'belobog_cocolia_crisis',
    chapterName: '可可利亚危机前夜',
    regionId: 'jarilo_vi',
    regionName: '贝洛伯格',
    seriesId: 'story_canon_zhiku_jarilo_vi_sunrise_chapters',
    group: 5,
    segmentId: 'story_canon_zhiku_jarilo_vi_sunrise_chapters_segment_5',
  },
  {
    chapterId: 'luofu_arrival',
    chapterName: '初抵罗浮',
    regionId: 'xianzhou_luofu',
    regionName: '罗浮仙舟',
    seriesId: 'story_canon_zhiku_xianzhou_luofu_travel_chapters',
    group: 1,
    segmentId: 'story_canon_zhiku_xianzhou_luofu_travel_chapters_segment_1',
  },
  {
    chapterId: 'luofu_kafka_interrogation',
    chapterName: '太卜司审问前后',
    regionId: 'xianzhou_luofu',
    regionName: '罗浮仙舟',
    seriesId: 'story_canon_zhiku_xianzhou_luofu_travel_chapters',
    group: 8,
    segmentId: 'story_canon_zhiku_xianzhou_luofu_travel_chapters_segment_8',
  },
  {
    chapterId: 'luofu_phantylia_crisis',
    chapterName: '建木灾变',
    regionId: 'xianzhou_luofu',
    regionName: '罗浮仙舟',
    seriesId: 'story_canon_zhiku_xianzhou_luofu_cloud_tree_chapters',
    group: 4,
    segmentId: 'story_canon_zhiku_xianzhou_luofu_cloud_tree_chapters_segment_4',
  },
  {
    chapterId: 'penacony_invitation',
    chapterName: '盛会邀约',
    regionId: 'penacony',
    regionName: '匹诺康尼',
    seriesId: 'story_canon_penacony_noise_and_fury',
    group: 3,
    segmentId: 'story_canon_penacony_noise_and_fury_segment_3',
  },
  {
    chapterId: 'penacony_dream_edge',
    chapterName: '梦境边界异动',
    regionId: 'penacony',
    regionName: '匹诺康尼',
    seriesId: 'story_canon_penacony_noise_and_fury',
    group: 8,
    segmentId: 'story_canon_penacony_noise_and_fury_segment_8',
  },
  {
    chapterId: 'penacony_reverie_crisis',
    chapterName: '美梦崩塌前夜',
    regionId: 'penacony',
    regionName: '匹诺康尼',
    seriesId: 'story_canon_penacony_in_our_time',
    group: 10,
    segmentId: 'story_canon_penacony_in_our_time_segment_10',
  },
  {
    chapterId: 'amphoreus_falling_wood',
    chapterName: '重渊坠星',
    regionId: 'amphoreus',
    regionName: '翁法罗斯',
    seriesId: 'story_canon_amphoreus_1_falling_wood',
    group: 1,
    segmentId: 'story_canon_amphoreus_1_falling_wood_segment_1',
  },
  {
    chapterId: 'amphoreus_gate_throne',
    chapterName: '金线之城奥赫玛',
    regionId: 'amphoreus',
    regionName: '翁法罗斯',
    seriesId: 'story_canon_amphoreus_2_gate_throne',
    group: 1,
    segmentId: 'story_canon_amphoreus_2_gate_throne_segment_1',
  },
  {
    chapterId: 'amphoreus_sleeping_flowers',
    chapterName: '来世之城斯缇科西亚',
    regionId: 'amphoreus',
    regionName: '翁法罗斯',
    seriesId: 'story_canon_amphoreus_3_sleeping_flowers',
    group: 6,
    segmentId: 'story_canon_amphoreus_3_sleeping_flowers_segment_6',
  },
  {
    chapterId: 'amphoreus_sun_hurt',
    chapterName: '循环裂隙',
    regionId: 'amphoreus',
    regionName: '翁法罗斯',
    seriesId: 'story_canon_amphoreus_5_sun_hurt',
    group: 1,
    segmentId: 'story_canon_amphoreus_5_sun_hurt_segment_1',
  },
  {
    chapterId: 'erxiang_paradise_welcome',
    chapterName: '幻月满盈',
    regionId: 'erxiang_paradise',
    regionName: '二相乐园',
    seriesId: 'story_canon_erxiang_paradise_1_welcome',
    group: 1,
    segmentId: 'story_canon_erxiang_paradise_1_welcome_segment_1',
  },
  {
    chapterId: 'erxiang_paradise_pigeon_river',
    chapterName: '鸽川区暗流',
    regionId: 'erxiang_paradise',
    regionName: '二相乐园',
    seriesId: 'story_canon_erxiang_paradise_2_out_of_control',
    group: 1,
    segmentId: 'story_canon_erxiang_paradise_2_out_of_control_segment_1',
  },
  {
    chapterId: 'erxiang_paradise_academy',
    chapterName: '火花大会',
    regionId: 'erxiang_paradise',
    regionName: '二相乐园',
    seriesId: 'story_canon_erxiang_paradise_1_welcome',
    group: 3,
    segmentId: 'story_canon_erxiang_paradise_1_welcome_segment_3',
  },
  {
    chapterId: 'erxiang_paradise_ink_residue',
    chapterName: '残卷墨色',
    regionId: 'erxiang_paradise',
    regionName: '二相乐园',
    seriesId: 'story_canon_erxiang_paradise_5_whistle',
    group: 5,
    segmentId: 'story_canon_erxiang_paradise_5_whistle_segment_5',
  },
];

for (const item of alignmentCases) {
  expectAlignment(item);
}

const openingPresetChapterCases = [
  ['amphoreus_falling_wood', 'amphoreus_falling_wood'],
  ['amphoreus_refugee', 'amphoreus_falling_wood'],
  ['amphoreus_golden_thread', 'amphoreus_gate_throne'],
  ['amphoreus_styx', 'amphoreus_sleeping_flowers'],
  ['amphoreus_loop', 'amphoreus_sun_hurt'],
  ['erxiang_paradise_welcome', 'erxiang_paradise_welcome'],
  ['erxiang_paradise_pigeon_river', 'erxiang_paradise_pigeon_river'],
  ['erxiang_paradise_academy', 'erxiang_paradise_academy'],
  ['erxiang_paradise_ink_residue', 'erxiang_paradise_ink_residue'],
];

for (const [scenarioId, chapterId] of openingPresetChapterCases) {
  const bundle = journeyPresets.getOpeningScenarioBundle(scenarioId);
  assert(bundle.preset?.chapterId === chapterId, `${scenarioId} 必须绑定章节锚点 ${chapterId}，实际为 ${bundle.preset?.chapterId}`);
  assert(bundle.chapter?.id === chapterId, `${scenarioId} 的章节资料必须解析到 ${chapterId}，实际为 ${bundle.chapter?.id}`);
}

const luofuArchive = makeArchive('luofu_arrival', '初抵罗浮');

const disabledArchive = { ...luofuArchive, 主线启用: false };
const disabled = storyWeavingPreset.alignStoryWeavingToOpeningArchive(bundled, disabledArchive);
assert(
  disabled.系列列表.filter((series) => series.来源类型 === 'canon').every((series) => series.激活注入 === false),
  '自由开局关闭主线时，内置原著剧情编织必须默认关闭注入。',
);

const initialNpcs = worldModel.根据开局档案创建初始NPC记录(luofuArchive);
assert(initialNpcs.some((npc) => npc.姓名 === '素裳'), '明确写入关系的具名角色素裳应进入初始 NPC 档案。');
assert(!initialNpcs.some((npc) => npc.姓名.includes('云骑')), '云骑军/云骑这类群体词不得进入伙伴或路人档案。');

console.log('opening story alignment regression ok');
