import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-story-weaving-regression');
const expectedCanonSeriesIds = [
  'story_canon_zhiku_herta_station_chapter1',
  'story_canon_zhiku_jarilo_vi_chapters',
  'story_canon_zhiku_jarilo_vi_sunrise_chapters',
  'story_canon_zhiku_xianzhou_luofu_travel_chapters',
  'story_canon_zhiku_xianzhou_luofu_cloud_tree_chapters',
  'story_canon_zhiku_xianzhou_luofu_aftermath_chapters',
];

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
    .replace(/@\/(data|models|services|prompts|utils|hooks)\//g, (_match, folder) => {
      let relative = path.posix.relative(sourceDir, folder);
      if (!relative.startsWith('.')) relative = `./${relative}`;
      return `${relative}/`;
    })
    .replace(/from\s+['"]((?:\.\/|\.\.\/)[^'"]+)['"]/g, (match, specifier) =>
      specifier.endsWith('.mjs') ? match : `from '${specifier}.mjs'`);
  const outputPath = path.join(tempDir, sourcePath.replace(/\.ts$/, '.mjs'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
}

function writeStub(relativePath, content) {
  const outputPath = path.join(tempDir, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function textList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : [];
}

function extractBlock(text, title) {
  const marker = `【${title}】`;
  const start = text.indexOf(marker);
  if (start < 0) return '';
  const rest = text.slice(start);
  const next = rest.slice(marker.length).search(/\n【[^】]+】/);
  return next >= 0 ? rest.slice(0, marker.length + next) : rest;
}

function segment(overrides) {
  return {
    id: overrides.id,
    组号: overrides.组号,
    标题: overrides.标题,
    章节范围: overrides.标题,
    章节标题: [overrides.标题],
    是否开局组: false,
    起始章序号: overrides.组号,
    结束章序号: overrides.组号,
    启用注入: true,
    原文内容: '',
    字数: 0,
    原文摘要: overrides.本段概括 ?? overrides.标题,
    本段概括: overrides.本段概括 ?? overrides.标题,
    时间线起点: '',
    时间线终点: '',
    开局已成立事实: [],
    前段延续事实: overrides.前段延续事实 ?? [],
    本段结束状态: overrides.本段结束状态 ?? [],
    给后续参考: overrides.给后续参考 ?? [],
    原著硬约束: [],
    可提前铺垫: [],
    登场角色: overrides.登场角色 ?? [],
    涉及地点: overrides.涉及地点 ?? [],
    涉及派系: [],
    角色档案: [],
    势力档案: [],
    地图地点档案: [],
    关键事件: overrides.关键事件 ?? [],
    时间线: [],
    角色推进: [],
    处理状态: '已完成',
    运行状态: overrides.运行状态,
    updatedAt: 1,
  };
}

function npc(overrides) {
  return {
    id: overrides.id,
    姓名: overrides.姓名,
    阶位: overrides.阶位 ?? 'companion',
    好感度: overrides.好感度 ?? 0,
    关系: overrides.关系 ?? 'stranger',
    同行: overrides.同行 ?? false,
    初见回合: overrides.初见回合 ?? 1,
    最近回合: overrides.最近回合 ?? 1,
    性别: overrides.性别 ?? '其他',
    对玩家称呼: overrides.对玩家称呼,
    介绍: overrides.介绍 ?? '',
    同行记忆: (overrides.同行记忆 ?? []).map((摘要, index) => ({
      id: `${overrides.id}_memory_${index}`,
      回合: overrides.最近回合 ?? 1,
      摘要,
      来源: '正文',
      关联NPCID: [overrides.id],
    })),
    备注: [],
  };
}

cleanTempDir();
for (const sourcePath of [
  'models/storyWeaving.ts',
  'models/news.ts',
  'services/storyWeaving.ts',
  'services/storyProgressService.ts',
  'services/storyPlanningAnalysis.ts',
  'models/npc.ts',
  'services/npcRelationshipPlanning.ts',
  'services/ai/newsModel.ts',
  'services/ai/phoneService.ts',
  'services/ai/variableModel.ts',
]) {
  transpileModule(sourcePath);
}
writeStub('services/ai/chatCompletionClient.mjs', 'export async function chatCompletionNonStream() { throw new Error("chatCompletionNonStream is not available in regression script"); }\n');
writeStub('services/ai/retry.mjs', 'export async function withRetries(fn) { return fn(); }\n');
writeStub('prompts/cot/storyWeavingCot.mjs', 'export const STORY_WEAVING_COT_PROMPT = "";\n');
writeStub('prompts/cot/newsCot.mjs', 'export const NEWS_COT_PROMPT = "";\n');
writeStub('prompts/cot/phoneCot.mjs', 'export const PHONE_COT_PROMPT = "";\n');
writeStub('prompts/cot/variableCot.mjs', 'export const VARIABLE_COT_PROMPT = "";\n');
writeStub('data/newsWorldbook.mjs', 'export const NEWS_WORLD_BOOK_PROMPT = "";\n');
writeStub('data/phoneWorldbook.mjs', 'export const PHONE_WORLD_BOOK_PROMPT = "";\n');
writeStub('data/variableWorldbook.mjs', 'export const VARIABLE_SYSTEM_WORLDBOOK_PROMPT = "";\n');
writeStub('data/companionArchiveWorldbook.mjs', 'export const COMPANION_ARCHIVE_WORLDBOOK_CONTENT = "";\n');
writeStub('hooks/useGame/historyWindow.mjs', 'export function buildImmediateStoryReview() { return ""; }\n');
writeStub('utils/worldbook.mjs', 'export {};\n');
writeStub('utils/variableRegistry.mjs', 'export function buildVariableRegistryPrompt() { return ""; }\n');
writeStub('data/canonicalCharacters.mjs', 'export function matchCanonical() { return null; }\n');
writeStub('data/builtinAvatars.mjs', 'export function getDefaultBuiltinAvatar() { return undefined; }\n');
writeStub('utils/npcMemorySanitizer.mjs', 'export function 清理NPC同行记忆摘要(value) { return typeof value === "string" ? value.trim() : ""; }\n');

const storyWeaving = await import(pathToFileURL(path.join(tempDir, 'services/storyWeaving.mjs')).href);
const storyProgress = await import(pathToFileURL(path.join(tempDir, 'services/storyProgressService.mjs')).href);
const storyPlanning = await import(pathToFileURL(path.join(tempDir, 'services/storyPlanningAnalysis.mjs')).href);
const npcRelationshipPlanning = await import(pathToFileURL(path.join(tempDir, 'services/npcRelationshipPlanning.mjs')).href);
const newsModel = await import(pathToFileURL(path.join(tempDir, 'services/ai/newsModel.mjs')).href);
const phoneService = await import(pathToFileURL(path.join(tempDir, 'services/ai/phoneService.mjs')).href);
const variableModel = await import(pathToFileURL(path.join(tempDir, 'services/ai/variableModel.mjs')).href);

function buildArchivedAnchorSystem({
  seriesId = 'series_generic',
  sourceType = 'canon',
  archived,
  next,
}) {
  return {
    当前系列ID: seriesId,
    系列列表: [{
      id: seriesId,
      标题: '通用剧情归档回归',
      作品名: '通用测试',
      来源类型: sourceType,
      来源智库条目ID: [],
      章节列表: [],
      分段列表: [archived, next],
      每段章数: 1,
      激活注入: true,
      当前分段组号: archived.组号,
      当前阶段概括: '',
      核心角色摘要: [],
      核心角色: [...new Set([...archived.登场角色, ...next.登场角色])],
      涉及地点索引: [...new Set([...archived.涉及地点, ...next.涉及地点])],
      涉及派系索引: [],
      createdAt: 1,
      updatedAt: 1,
    }],
    当前进度: {
      当前系列ID: seriesId,
      当前分段ID: archived.id,
      当前分段组号: archived.组号,
      推进状态: '已完成',
      已完成摘要: archived.本段结束状态,
      当前待解问题: [],
      切换说明: [`${archived.标题} 已归档`],
      历史归档: [],
      最近门禁结果: 'soft',
      最近判定理由: ['测试：旧段已经归档'],
      最近一次推进判定回合: 12,
      updatedAt: 1,
    },
  };
}

function buildActiveCurrentSystem({ seriesId = 'series_active_guard', current, next, sourceType = 'canon' }) {
  return {
    当前系列ID: seriesId,
    系列列表: [{
      id: seriesId,
      标题: '通用自动归档防误切回归',
      作品名: '通用测试',
      来源类型: sourceType,
      来源智库条目ID: [],
      章节列表: [],
      分段列表: [current, next],
      每段章数: 1,
      激活注入: true,
      当前分段组号: current.组号,
      当前阶段概括: '',
      核心角色摘要: [],
      核心角色: [...new Set([...current.登场角色, ...next.登场角色])],
      涉及地点索引: [...new Set([...current.涉及地点, ...next.涉及地点])],
      涉及派系索引: [],
      createdAt: 1,
      updatedAt: 1,
    }],
    当前进度: {
      当前系列ID: seriesId,
      当前分段ID: current.id,
      当前分段组号: current.组号,
      推进状态: '推进中',
      已完成摘要: [],
      当前待解问题: current.给后续参考,
      切换说明: [],
      历史归档: [],
      最近门禁结果: 'soft',
      最近判定理由: ['测试：当前段仍在推进中'],
      最近一次推进判定回合: 20,
      updatedAt: 1,
    },
  };
}

function assertArchivedAnchorSkipsToNext({ system, archivedId, archivedGroup, nextId, nextTitle, userInput, body }) {
  const diagnostics = storyWeaving.getStoryWeavingInjectionDiagnostics(system);
  assert(diagnostics, '应能得到剧情编织注入诊断。');
  assert(diagnostics.当前分段ID === nextId, `实际注入段应迁移到下一段，得到 ${diagnostics.当前分段ID}`);
  assert(diagnostics.归档锚点分段ID === archivedId, '应识别并跳过已归档锚点。');
  assert(diagnostics.健康状态 === '已跳过归档锚点', `健康状态应为已跳过归档锚点，得到 ${diagnostics.健康状态}`);

  const injection = storyWeaving.buildStoryWeavingInjection(system, {
    recentUserInput: userInput,
    recentAIResponse: body,
    currentLocation: '',
  });
  assert(injection.includes('当前段软参考素材') || injection.includes('当前段强承接素材'), '注入文本应包含当前段素材。');
  assert(injection.includes(nextTitle), '注入文本应包含下一段作为当前素材。');
  assert(!injection.includes(`【当前段强承接素材】\n组号：${archivedGroup}`), '已归档段不得作为当前强承接素材。');
  assert(!injection.includes(`【当前段软参考素材】\n组号：${archivedGroup}`), '已归档段不得作为当前软参考素材。');
  const currentBlock = extractBlock(injection, '当前段强承接素材') || extractBlock(injection, '当前段软参考素材');
  assert(currentBlock.includes(nextTitle), '当前段素材块应对应实际注入段。');
  assert(!currentBlock.includes(`组号：${archivedGroup}`), '当前段素材块不得保留旧归档段组号。');

  const aligned = storyProgress.autoAlignCanonStoryProgress({
    storyWeaving: system,
    turnCount: 13,
    userInput,
    body,
  });
  assert(aligned.changed === true, '归档锚点自愈应产生 changed=true。');
  assert(aligned.progressed === false, '归档锚点自愈不应写成正文推进 progressed=true。');
  assert(
    aligned.system.当前进度?.当前分段ID === nextId,
    `自愈后的进度锚点应指向下一段，实际 ${aligned.system.当前进度?.当前分段ID} / ${aligned.system.当前进度?.当前分段组号}。`,
  );
}

function assertArchivedRuntimeStatusDoesNotRevive(runtimeStatus) {
  const archived = segment({
    id: `seg_archived_status_${runtimeStatus}`,
    组号: 1,
    标题: `旧段状态：${runtimeStatus}`,
    运行状态: runtimeStatus,
    本段概括: `旧段已经处于 ${runtimeStatus} 状态。`,
    本段结束状态: [`旧段已经处于 ${runtimeStatus} 状态`],
    登场角色: ['玩家'],
  });
  const next = segment({
    id: `seg_next_after_${runtimeStatus}`,
    组号: 2,
    标题: `下一段：${runtimeStatus} 后续`,
    运行状态: '未开始',
    本段概括: `系统应从 ${runtimeStatus} 的旧段后续继续。`,
    本段结束状态: ['后续段完成'],
    登场角色: ['玩家'],
  });
  assertArchivedAnchorSkipsToNext({
    system: buildArchivedAnchorSystem({
      seriesId: `series_runtime_${runtimeStatus}`,
      archived,
      next,
    }),
    archivedId: archived.id,
    archivedGroup: archived.组号,
    nextId: next.id,
    nextTitle: next.标题,
    userInput: '我继续沿着后续路线前进。',
    body: `旧段已经是 ${runtimeStatus}，玩家继续进入后续阶段。`,
  });
}

const archivedDoomsdayExample = segment({
  id: 'seg_archived_doomsday_example',
  组号: 1,
  标题: '已归档战斗事件样例',
  运行状态: '已经历',
  本段概括: '反物质军团袭击空间站，末日兽被击退。',
  本段结束状态: ['末日兽已被击退，空间站危机暂时解除'],
  登场角色: ['三月七', '丹恒', '姬子'],
});
const nextExpressExample = segment({
  id: 'seg_next_express_example',
  组号: 2,
  标题: '下一段：登上星穹列车',
  运行状态: '未开始',
  本段概括: '玩家在姬子的邀请下登上星穹列车。',
  前段延续事实: ['末日兽已被击退'],
  本段结束状态: ['玩家登上星穹列车'],
  登场角色: ['姬子', '三月七', '丹恒'],
});

assertArchivedAnchorSkipsToNext({
  system: buildArchivedAnchorSystem({
    seriesId: 'series_archived_battle',
    archived: archivedDoomsdayExample,
    next: nextExpressExample,
  }),
  archivedId: archivedDoomsdayExample.id,
  archivedGroup: archivedDoomsdayExample.组号,
  nextId: nextExpressExample.id,
  nextTitle: nextExpressExample.标题,
  userInput: '我跟着姬子前往列车。',
  body: '末日兽已经被击退。姬子示意众人前往星穹列车，新的旅程即将开始。',
});
const doomsdayInjection = storyWeaving.buildStoryWeavingInjection(buildArchivedAnchorSystem({
  seriesId: 'series_archived_battle_current_block_guard',
  archived: archivedDoomsdayExample,
  next: nextExpressExample,
}), {
  recentUserInput: '我跟着姬子前往列车。',
  recentAIResponse: '末日兽已经被击退。姬子示意众人前往星穹列车。',
  currentLocation: '黑塔空间站',
});
const doomsdayCurrentBlock = extractBlock(doomsdayInjection, '当前段强承接素材') || extractBlock(doomsdayInjection, '当前段软参考素材');
assert(doomsdayCurrentBlock.includes('下一段：登上星穹列车'), '末日兽样例的当前素材应迁移到登车段。');
assert(!doomsdayCurrentBlock.includes('反物质军团袭击空间站，末日兽被击退'), '末日兽旧段概括不得残留在当前素材块里。');
assert(doomsdayInjection.includes('末日兽已被击退'), '末日兽结果仍可作为已发生承接事实保留。');

const archivedSocialExample = segment({
  id: 'seg_archived_social_example',
  组号: 1,
  标题: '已归档会面事件样例',
  运行状态: '已经历',
  本段概括: '玩家已经完成与线人的会面，并取得通行密钥。',
  本段结束状态: ['线人会面已结束，通行密钥已经交付'],
  登场角色: ['线人甲', '玩家'],
});
const nextSocialExample = segment({
  id: 'seg_next_social_example',
  组号: 2,
  标题: '下一段：进入封锁区',
  运行状态: '未开始',
  本段概括: '玩家使用通行密钥进入封锁区调查。',
  前段延续事实: ['通行密钥已经交付'],
  本段结束状态: ['玩家进入封锁区'],
  登场角色: ['玩家'],
});

assertArchivedAnchorSkipsToNext({
  system: buildArchivedAnchorSystem({
    seriesId: 'series_archived_social',
    sourceType: 'custom',
    archived: archivedSocialExample,
    next: nextSocialExample,
  }),
  archivedId: archivedSocialExample.id,
  archivedGroup: archivedSocialExample.组号,
  nextId: nextSocialExample.id,
  nextTitle: nextSocialExample.标题,
  userInput: '我拿着通行密钥走向封锁区入口。',
  body: '线人会面已经结束，通行密钥在掌心发出微光。玩家抵达封锁区入口，准备进入调查。',
});

for (const status of ['已经历', '已跳过', '已偏离', '暂停']) {
  assertArchivedRuntimeStatusDoesNotRevive(status);
}

const activeAmbiguousExample = segment({
  id: 'seg_active_ambiguous_example',
  组号: 1,
  标题: '当前调查段样例',
  运行状态: '当前',
  本段概括: '玩家正在调查一处异常信号源。',
  本段结束状态: ['异常信号源已经定位并完成封存'],
  给后续参考: ['等待确认信号源来源'],
  登场角色: ['玩家'],
});
const nextAmbiguousExample = segment({
  id: 'seg_next_ambiguous_example',
  组号: 2,
  标题: '下一段：追踪信号来源',
  运行状态: '未开始',
  本段概括: '玩家追踪异常信号背后的来源。',
  本段结束状态: ['信号来源已经确认'],
  登场角色: ['玩家'],
});

const ambiguousAlignment = storyProgress.autoAlignCanonStoryProgress({
  storyWeaving: buildActiveCurrentSystem({
    current: activeAmbiguousExample,
    next: nextAmbiguousExample,
  }),
  turnCount: 21,
  userInput: '我离开房间，准备结束今天的行动。',
  body: '众人完成了简单整理后离开现场，事情似乎暂时告一段落，但异常信号源还没有被定位，也没有完成封存。',
});
assert(ambiguousAlignment.progressed === false, '泛收束词不得触发自动归档 progressed=true。');
assert(ambiguousAlignment.system.当前进度?.当前分段ID === activeAmbiguousExample.id, '泛收束词场景应继续停留在当前段。');
assert(
  ambiguousAlignment.system.当前进度?.最近判定理由.some((item) => item.includes('缺少明确收束证据')),
  '未推进理由应说明缺少明确收束证据。',
);
const ambiguousPlanning = storyPlanning.buildStoryPlanningAnalysis(ambiguousAlignment.system);
assert(ambiguousPlanning, '泛收束词场景应生成剧情规划分析。');
assert(ambiguousPlanning.建议动作 === '等待正文证据', `泛收束词场景应建议等待正文证据，得到 ${ambiguousPlanning.建议动作}`);
assert(ambiguousPlanning.偏离风险 === '中', `缺少明确收束证据时偏离/错位风险应为中，得到 ${ambiguousPlanning.偏离风险}`);
assert(
  ambiguousPlanning.切段条件.some((item) => item.includes('异常信号源已经定位并完成封存')),
  '规划分析应保留明确切段条件。',
);
assert(
  ambiguousPlanning.待迁移事项.some((item) => item.includes('等待确认信号源来源')),
  '规划分析应保留待迁移事项。',
);
assert(
  ambiguousPlanning.下一步调度.some((item) => item.includes('当前段保持软参考')),
  '规划分析应提示当前段保持软参考。',
);

const explicitAutoProgressCurrent = segment({
  id: 'seg_explicit_auto_progress_current',
  组号: 1,
  标题: '明确完成的自动推进当前段',
  运行状态: '当前',
  本段概括: '玩家正在处理一处门禁异常。',
  本段结束状态: ['门禁异常；完成封存'],
  给后续参考: ['后续调查转向备用通道'],
  登场角色: ['玩家'],
});
const explicitAutoProgressNext = segment({
  id: 'seg_explicit_auto_progress_next',
  组号: 2,
  标题: '自动推进后的下一段',
  运行状态: '未开始',
  本段概括: '玩家转向备用通道继续调查。',
  本段结束状态: ['备用通道调查完成'],
  登场角色: ['玩家'],
});
const explicitAutoProgress = storyProgress.autoAlignCanonStoryProgress({
  storyWeaving: buildActiveCurrentSystem({
    seriesId: 'series_explicit_auto_progress',
    current: explicitAutoProgressCurrent,
    next: explicitAutoProgressNext,
  }),
  turnCount: 24,
  userInput: '我确认关闭门禁异常并完成封存。',
  body: '门禁异常已被关闭并完成封存，现场记录也已同步，这一阶段正式结束。玩家随后把注意力转向备用通道。',
});
assert(explicitAutoProgress.progressed === true, '明确结束证据应允许后台自动推进。');
assert(explicitAutoProgress.changed === true, '自动推进应直接更新剧情编织系统。');
assert(!('suggestion' in explicitAutoProgress), '自动推进结果不应再暴露手动推进建议字段。');
assert(
  explicitAutoProgress.system.当前进度?.历史归档.some((item) => item.分段ID === explicitAutoProgressCurrent.id),
  '自动推进应写入历史归档，供后续记忆/新闻/手机读取。',
);

const skippedPlanning = storyPlanning.buildStoryPlanningAnalysis(buildArchivedAnchorSystem({
  seriesId: 'series_planning_skipped',
  archived: segment({
    id: 'seg_planning_skipped',
    组号: 1,
    标题: '规划检查旧段',
    运行状态: '已跳过',
    本段概括: '旧段已跳过。',
    本段结束状态: ['旧段已跳过'],
    登场角色: ['玩家'],
  }),
  next: segment({
    id: 'seg_planning_next',
    组号: 2,
    标题: '规划检查下一段',
    运行状态: '未开始',
    本段概括: '下一段等待开始。',
    本段结束状态: ['下一段完成'],
    登场角色: ['玩家'],
  }),
}));
assert(skippedPlanning, '跳过旧段场景应生成剧情规划分析。');
assert(skippedPlanning.建议动作 === '需要人工检查', `跳过旧段应建议人工检查，得到 ${skippedPlanning.建议动作}`);
assert(skippedPlanning.归档检查.some((item) => item.includes('不应自动复活为当前段')), '规划分析应提示旧段不应复活。');
assert(skippedPlanning.下一步调度.some((item) => item.includes('下一候选分段')), '规划分析应提示下一候选分段。');

const longMemory = '在封锁区入口，凌与玩家并肩穿过警戒线，凌答应之后会联系玩家交接后续线索，同时两人因为是否立刻公开证据产生争执，但最终凌选择信任玩家并把备用密钥托付给玩家。这是一条故意很长的同行记忆，用来确认关系规划不会把原文整段塞进关注点里。';
const relationshipSnapshot = npcRelationshipPlanning.buildNpcRelationshipPlanning([
  npc({
    id: 'npc_ling',
    姓名: '凌',
    性别: '女',
    关系: 'friend',
    好感度: 35,
    同行: true,
    最近回合: 30,
    对玩家称呼: '开拓者',
    介绍: '被从大相冰中救出的少女，失去了过去的记忆。',
    同行记忆: [longMemory],
  }),
  npc({
    id: 'npc_rui',
    姓名: '锐',
    性别: '男',
    关系: 'acquaintance',
    好感度: 15,
    同行: false,
    最近回合: 29,
    同行记忆: ['锐曾答应玩家在下一次通讯时提供封锁区地图，并提醒玩家不要独自行动。'],
  }),
  npc({
    id: 'npc_unrelated',
    姓名: '无关路人',
    性别: '男',
    阶位: 'extra',
    关系: 'stranger',
    好感度: 0,
    同行: false,
    最近回合: 2,
    同行记忆: [],
  }),
], 30);
const lingPlanning = relationshipSnapshot.条目.find((item) => item.npcId === 'npc_ling');
const ruiPlanning = relationshipSnapshot.条目.find((item) => item.npcId === 'npc_rui');
const unrelatedPlanning = relationshipSnapshot.条目.find((item) => item.npcId === 'npc_unrelated');
assert(lingPlanning, '女性 NPC 关系规划应存在。');
assert(ruiPlanning, '男性 NPC 关系规划也应存在，关系规划不能绑定女主路线。');
assert(!unrelatedPlanning, '无关系信号的陌生路人不应进入关系规划。');
assert(lingPlanning.建议动作 === '兑现承诺或冲突', `存在承诺/冲突时应建议兑现承诺或冲突，得到 ${lingPlanning.建议动作}`);
assert(lingPlanning.关注点.some((item) => item.includes('关系线索')), '关注点应输出关系线索。');
assert(!lingPlanning.关注点.some((item) => item.includes('这是一条故意很长的同行记忆')), '关注点不得塞入完整同行记忆原文。');
assert(ruiPlanning.建议动作 === '兑现承诺或冲突', `男性 NPC 的承诺线也应被规划，得到 ${ruiPlanning.建议动作}`);

const newsArchived = segment({
  id: 'seg_news_archived',
  组号: 1,
  标题: '新闻旧归档段',
  运行状态: '已经历',
  本段概括: '旧事件已经处理完毕。',
  本段结束状态: ['旧事件已经处理完毕'],
  登场角色: ['玩家'],
  涉及地点: ['旧地点'],
});
const newsNext = segment({
  id: 'seg_news_next',
  组号: 2,
  标题: '新闻下一当前段',
  运行状态: '未开始',
  本段概括: '新的公共压力正在形成。',
  前段延续事实: ['旧事件已经处理完毕'],
  给后续参考: ['新的公共压力正在形成'],
  本段结束状态: ['新事件完成'],
  登场角色: ['玩家'],
  涉及地点: ['新地点'],
});
const newsPrompt = newsModel.buildNewsModelPrompt({
  turnCount: 40,
  world: {},
  traveler: {},
  news: [],
  storyWeaving: buildArchivedAnchorSystem({
    seriesId: 'series_news_archived_anchor',
    archived: newsArchived,
    next: newsNext,
  }),
});
assert(newsPrompt.includes('【注入窗口诊断】'), '新闻提示词应包含剧情编织注入窗口诊断。');
assert(newsPrompt.includes('新闻下一当前段'), '新闻当前外围压力应使用实际注入段。');
assert(!newsPrompt.includes('【当前段外围压力】\n{\\n  "关联剧情系列ID": "series_news_archived_anchor",\\n  "关联剧情分段ID": "seg_news_archived"'), '新闻不得把已归档旧段当当前外围压力。');

const phoneArchived = segment({
  id: 'seg_phone_archived',
  组号: 1,
  标题: '手机旧归档段',
  运行状态: '已经历',
  本段概括: '旧手机事件已经结束。',
  本段结束状态: ['旧手机事件已经结束'],
  登场角色: ['玩家'],
});
const phoneNext = segment({
  id: 'seg_phone_next',
  组号: 2,
  标题: '手机下一当前段',
  运行状态: '未开始',
  本段概括: '手机联系人只能围绕新的待解问题试探。',
  前段延续事实: ['旧手机事件已经结束'],
  给后续参考: ['新的待解问题仍未确认'],
  本段结束状态: ['新手机线索已经确认'],
  登场角色: ['玩家'],
});
const phoneMessages = phoneService.buildPhoneMessages({
  traveler: { 姓名: '开拓者' },
  world: { 当前日期: '琥珀纪 2157.03.08', 当前时间: '12:00', 当前地点: '测试地点' },
  memory: { 长期记忆: [], 短期记忆: [], 即时记忆: [] },
  yiting: { 回忆档案: [] },
  npcRecords: [],
  news: [],
  turnCount: 41,
  chat: {
    id: 'phone_regression_chat',
    type: 'private',
    title: '测试联系人',
    participantIds: [],
    messages: [],
  },
  userText: '现在能联系吗？',
  storyWeaving: buildArchivedAnchorSystem({
    seriesId: 'series_phone_archived_anchor',
    archived: phoneArchived,
    next: phoneNext,
  }),
});
const phoneContext = phoneMessages.map((message) => message.content).join('\n');
assert(phoneContext.includes('注入窗口健康'), '手机上下文应包含剧情编织注入窗口诊断。');
assert(phoneContext.includes('手机下一当前段'), '手机上下文应使用实际注入段作为当前段。');
assert(phoneContext.includes('已跳过归档锚点'), '手机上下文应提示已跳过归档旧锚点。');
assert(!phoneContext.includes('当前段：1｜手机旧归档段'), '手机不得把已归档旧段标记为当前段。');

const stageSummaryExperienced = segment({
  id: 'seg_stage_summary_experienced',
  组号: 1,
  标题: '阶段索引已经历段',
  运行状态: '已经历',
  本段概括: '这是一条应进入阶段索引的主线历史。',
  本段结束状态: ['主线历史成立'],
  登场角色: ['玩家'],
});
const stageSummaryDeviated = segment({
  id: 'seg_stage_summary_deviated',
  组号: 2,
  标题: '阶段索引偏离段',
  运行状态: '已偏离',
  本段概括: '这是一条不应污染阶段索引的偏离素材。',
  本段结束状态: ['偏离素材成立'],
  登场角色: ['玩家'],
});
const stageSummaryCurrent = segment({
  id: 'seg_stage_summary_current',
  组号: 3,
  标题: '阶段索引当前段',
  运行状态: '当前',
  本段概括: '这是一条应进入阶段索引的当前主线素材。',
  本段结束状态: ['当前主线素材成立'],
  登场角色: ['玩家'],
});
const stageSummarySystem = {
  当前系列ID: 'series_stage_summary_guard',
  系列列表: [{
    id: 'series_stage_summary_guard',
    标题: '阶段索引污染保护',
    作品名: '通用测试',
    来源类型: 'canon',
    来源智库条目ID: [],
    章节列表: [],
    分段列表: [stageSummaryExperienced, stageSummaryDeviated, stageSummaryCurrent],
    每段章节数: 1,
    激活注入: true,
    当前分段组号: stageSummaryCurrent.组号,
    当前阶段概括: '',
    核心角色摘要: [],
    核心角色: ['玩家'],
    涉及地点索引: [],
    涉及派系索引: [],
    createdAt: 1,
    updatedAt: 1,
  }],
  当前进度: {
    当前系列ID: 'series_stage_summary_guard',
    当前分段ID: stageSummaryCurrent.id,
    当前分段组号: stageSummaryCurrent.组号,
    推进状态: '推进中',
    已完成摘要: [],
    当前待解问题: [],
    切换说明: [],
    历史归档: [{
      id: 'archive_stage_summary_deviated',
      系列ID: 'series_stage_summary_guard',
      分段ID: stageSummaryDeviated.id,
      分段组号: stageSummaryDeviated.组号,
      分段标题: stageSummaryDeviated.标题,
      归档回合: 33,
      归档状态: '已偏离',
      摘要: stageSummaryDeviated.本段概括,
      切换说明: '测试偏离归档',
      判定理由: ['测试偏离素材仍可在历史归档保留'],
      createdAt: 1,
    }],
    最近门禁结果: 'soft',
    最近判定理由: [],
    最近一次推进判定回合: 33,
    updatedAt: 1,
  },
};
const stageSummaryInjection = storyWeaving.buildStoryWeavingInjection(stageSummarySystem, {
  recentUserInput: '继续主线。',
  recentAIResponse: '',
  currentLocation: '',
});
const stageIndexBlock = stageSummaryInjection.split('# 核心角色')[0] ?? stageSummaryInjection;
assert(stageIndexBlock.includes('阶段索引已经历段'), '阶段索引应保留可承接的已经历主线段。');
assert(stageIndexBlock.includes('阶段索引当前段'), '阶段索引应保留当前主线段。');
assert(!stageIndexBlock.includes('阶段索引偏离段'), '阶段索引不应被已偏离段污染；偏离内容应留在历史归档/诊断层。');

const variablePrompt = variableModel.buildVariableModelPrompt({});
assert(variablePrompt.includes('只记录正文和变量草稿能相互印证的已发生事实'), '变量模型提示词必须保留正文事实边界。');
assert(variablePrompt.includes('剧情编织滑窗、智库资料、新闻苗头、即时剧情回顾和剧情回忆'), '变量模型提示词必须明确参考材料不等于变量事实。');
assert(variablePrompt.includes('不要把剧情编织当前段、后续段、原著分段结果'), '变量模型提示词必须禁止把剧情编织分段直接落库。');

const storyWeavingSource = fs.readFileSync(path.join(root, 'services/storyWeaving.ts'), 'utf8');
assert(storyWeavingSource.includes('本段结束状态必须写成可判定的完成条件或阶段落点'), 'AI 分解提示词必须要求本段结束状态是可判定完成条件。');
assert(storyWeavingSource.includes('不能写氛围句、悬念句、预告句'), 'AI 分解提示词必须禁止氛围句/悬念句进入结束状态。');
assert(storyWeavingSource.includes('关键事件.事件结果必须写事件完成后的结果'), 'AI 分解提示词必须要求事件结果表达完成后的结果。');

const storyWeavingPresetSource = fs.readFileSync(path.join(root, 'data/storyWeavingPreset.ts'), 'utf8');
assert(storyWeavingPresetSource.includes('buildCanonFallbackEndStates'), '智库兜底转换必须通过可判定结束状态清洗函数。');
assert(storyWeavingPresetSource.includes('buildCanonFallbackEventResults'), '智库兜底转换必须通过事件结果清洗函数。');
assert(!storyWeavingPresetSource.includes('本段结束状态: entry.摘要 ? [entry.摘要] : []'), '智库兜底转换不得把摘要直接作为本段结束状态。');
assert(!storyWeavingPresetSource.includes('事件结果: entry.摘要 ? [entry.摘要] : []'), '智库兜底转换不得把摘要直接作为事件结果。');

const decomposedCanonPath = path.join(root, 'data/storyWeavingCanonDecomposed.json');
assert(fs.existsSync(decomposedCanonPath), '内置剧情编织应包含已分解 canon 预设 JSON。');
const decomposedCanon = JSON.parse(fs.readFileSync(decomposedCanonPath, 'utf8'));
const decomposedSeries = Array.isArray(decomposedCanon.系列列表) ? decomposedCanon.系列列表 : [];
for (const seriesId of expectedCanonSeriesIds) {
  const series = decomposedSeries.find((item) => item?.id === seriesId || item?.内置预设ID === seriesId);
  assert(series, `已分解 canon 预设缺少系列 ${seriesId}。`);
  const segments = Array.isArray(series.分段列表) ? series.分段列表 : [];
  assert(segments.length > 0, `已分解 canon 系列 ${seriesId} 应包含分段。`);
  for (const segment of segments) {
    const title = `${series.标题 ?? seriesId} / ${segment?.组号 ?? '?'}:${segment?.标题 ?? '未命名'}`;
    assert(segment?.处理状态 === '已完成', `${title} 应为已完成分解状态。`);
    assert(typeof segment?.本段概括 === 'string' && segment.本段概括.trim(), `${title} 应包含本段概括。`);
    assert(typeof segment?.原文摘要 === 'string' && segment.原文摘要.trim(), `${title} 应包含原文摘要。`);
    const endStates = textList(segment?.本段结束状态);
    assert(endStates.length > 0, `${title} 应包含本段结束状态。`);
    assert(Array.isArray(segment?.关键事件) && segment.关键事件.length > 0, `${title} 应包含关键事件。`);
    for (const state of endStates) {
      assert(state !== segment.原文摘要 && state !== segment.本段概括, `${title} 的结束状态不得直接复制摘要：${state}`);
    }
    for (const event of segment.关键事件) {
      for (const result of textList(event?.事件结果)) {
        assert(result !== segment.原文摘要 && result !== segment.本段概括, `${title} 的事件结果不得直接复制摘要：${result}`);
      }
    }
  }
}

console.log('story-weaving regression ok');
