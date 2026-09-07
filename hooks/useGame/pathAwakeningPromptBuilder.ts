import type { 角色数据结构 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import { getPath } from '@/data/journeyPresets';
import { PATH_STAGE_DEFS, PATH_CORE_BELIEFS } from '@/models/path';
import {
  assemblePromptChunks,
  injectBucket,
  makeModuleCtx,
  type BuiltSystemPrompt,
  type SystemPromptInput,
  type 命途狭间阶段,
} from './promptAssembly';
import {
  buildCharacterSection,
  buildExtraRequirementSection,
  buildSceneSection,
  buildWordCountSection,
} from './systemPromptSections';
import { renderWorldbookSystemEntry } from '@/utils/worldbook';

function pathStageLabel(traveler: 角色数据结构, pathId: string): string {
  const record = traveler.命途列表.find((p) => p.id === pathId);
  const stageDef = record ? PATH_STAGE_DEFS.find((s) => s.stage === record.阶段) : undefined;
  const nextStageDef = record ? PATH_STAGE_DEFS[record.阶段 + 1] : undefined;
  return stageDef ? `${stageDef.name} → 待升 ${nextStageDef?.name ?? '未知'}` : '未知';
}

export function buildPathAwakeningJudgementSection(
  traveler: 角色数据结构,
  worldState: 世界状态,
): string {
  const pathId = worldState.进行中狭间;
  if (!pathId) return '';
  const def = getPath(pathId);
  if (!def) return '';
  const belief = PATH_CORE_BELIEFS[pathId];
  const record = traveler.命途列表.find((p) => p.id === pathId);
  const stageLabel = pathStageLabel(traveler, pathId);
  const lines: string[] = [];
  lines.push(`本回合是「命途狭间·回应回合」。玩家上一轮已经针对命途之声提出的三道诘问给出了答案,你的任务是:`);
  lines.push('');
  lines.push('## 必须做的三件事(缺一不可)');
  lines.push('1. **先确认道路**:你**必须**输出顶层 <thinking> 标签,在里面用中文按 Step0~Step3 编号格式总结:玩家三个答案分别显露了怎样的执念、犹疑与取舍,最终如何凝成一句道路确认。命途狭间没有失败、滞留或退转,结论固定为升阶。**漏掉 <thinking> 会让调试面板缺少内容,影响排查**。');
  lines.push('2. **写正文**:用 2-4 段叙事完成两件事——');
  lines.push('   a) 命途意志对玩家答案的回应:不是判对错,而是把玩家说出的道路确认下来。若答案矛盾,写成带着裂痕仍向前。');
  lines.push('   b) 把旅人从虚境拉回现实场景(原本的物理环境、未完的事件)。结尾可以承接玩家下一步行动。');
  if (record?.阶段 === 3) {
    lines.push('   c) 本次是「伪令使 → 令使」:必须描写星神的身影/轮廓在狭间天穹出现,星神投下目光完成确认。星神不长篇对话,不降格成普通 NPC。');
  }
  lines.push('3. **必输标签**:在所有其他标签**之外**,**单独**写一行顶层标签:');
  lines.push('   `<狭间评判>升阶</狭间评判>`');
  lines.push('   ⚠ **本回合如果不输出 <狭间评判> 标签,系统将无法落地命途阶段变化,玩家会停留在狭间状态——这是必须避免的错误**。');
  lines.push('');
  lines.push('## 升阶原则(再次明确)');
  lines.push('- 进入命途狭间即代表本次升阶已经成立。');
  lines.push('- 三问只是让玩家明确自己的道路,不是考试。');
  lines.push('- 不允许输出滞留、退转、失败、惩罚或拒绝升阶。');
  lines.push('');
  lines.push('## 受问的命途');
  lines.push(`- 命途:${def.name}(${def.aeon})`);
  lines.push(`- 当前阶段:${stageLabel}`);
  lines.push(`- 核心理念:${belief.核心}`);
  lines.push('');
  lines.push('## 本回合**禁止**输出的标签');
  lines.push('- <狭间问答>(只在出题回合写,评判回合不重复)');
  lines.push('- <行动选项>(由你叙事自然引出下一拍即可,不强行列选项)');
  lines.push('- <变量更新>(命途阶段变化由前端在收到 <狭间评判> 后调 应用狭间结果 落地,不要走变量命令)');
  return `# 命途狭间·评判回合\n\n${lines.join('\n')}`;
}

export function buildPathAwakeningQuestionSection(
  traveler: 角色数据结构,
  worldState: 世界状态,
): string {
  const pathId = worldState.进行中狭间;
  if (!pathId) return '';
  const def = getPath(pathId);
  if (!def) return '';
  const belief = PATH_CORE_BELIEFS[pathId];
  const record = traveler.命途列表.find((p) => p.id === pathId);
  const stageLabel = pathStageLabel(traveler, pathId);
  const lines: string[] = [];
  lines.push(`本回合进入「命途狭间·出题回合」。旅人某条命途已积满,意志被命途意志拉入虚境受问,**不要推进主剧情、不要描写实景动作、不要输出 <行动选项>**。`);
  lines.push('');
  lines.push(`## 必输 <thinking>(漏掉会让调试面板缺少内容,影响排查)`);
  lines.push('在顶层 <thinking> 标签里按「命途狭间思维链」的 Awakening-Step0~Step5 编号格式完整推演,每步独占一行、至少 2 条要点。不允许跳过、不允许写"已思考"敷衍。');
  lines.push('');
  lines.push(`## 受问的命途`);
  lines.push(`- 命途:${def.name}(${def.aeon})`);
  lines.push(`- 当前阶段:${stageLabel}`);
  lines.push(`- 觉醒于:${record?.觉醒于 || '未知'}`);
  lines.push(`- 核心理念:${belief.核心}`);
  lines.push('');
  lines.push(`## 出题素材(围绕这三条拷问,结合旅人具体经历加工成两难选择题,见命途狭间 CoT)`);
  belief.拷问.forEach((q, i) => {
    lines.push(`${i + 1}. ${q}`);
  });
  lines.push('');
  lines.push(`## 本回合**必须**输出顶层标签 <狭间问答>`);
  lines.push('块内每行一条:');
  lines.push('  命途: <命途中文名>');
  lines.push('  题1: <第一道题的完整文本>');
  lines.push('  题2: <第二道题的完整文本>');
  lines.push('  题3: <第三道题的完整文本>');
  lines.push('');
  lines.push('## 本回合**禁止**输出的标签');
  lines.push('- <狭间评判>(留到玩家答完之后的回合)');
  lines.push('- <行动选项> / <变量更新>');
  return `# 命途狭间·出题回合\n\n${lines.join('\n')}`;
}

export function buildPathAwakeningPendingSection(worldState: 世界状态): string {
  const pathId = worldState.待触发狭间;
  if (!pathId) return '';
  const def = getPath(pathId);
  if (!def) return '';
  return `# 命途狭间·待玩家踏入

旅人的「${def.name}」命途已发出狭间邀请,正等待玩家在 UI 上点击「踏入」。本回合**不要重复发邀请、不要描写已进入虚境**;正常推进主剧情即可,可以让 NPC / 环境对那种"心头沉默的召唤"有一两笔旁观式描写,但旅人尚未真正踏入。`;
}

export function buildPathAwakeningReadySection(traveler: 角色数据结构): string {
  const readyPaths = traveler.命途列表.filter((p) => p.待升阶);
  if (readyPaths.length === 0) return '';
  const lines: string[] = [];
  lines.push(`旅人有 ${readyPaths.length} 条命途进度已积满,处于「待升阶」状态。若本回合剧情节奏合适(战后独处、夜深沉思、回望来路、价值抉择前夕之类),可主动发出邀请:`);
  lines.push('');
  lines.push('在所有标签之外**单独**写一行顶层标签:`<触发狭间>命途ID</触发狭间>`(把命途ID替换为待升阶命途的英文ID,例如 hunt / destruction / preservation 等),系统会渲染一张「命途狭间之引」邀请卡片让玩家选择是否踏入。');
  lines.push('');
  lines.push('已积满的命途:');
  for (const p of readyPaths) {
    const def = getPath(p.id);
    if (!def) continue;
    const stageDef = PATH_STAGE_DEFS.find((s) => s.stage === p.阶段);
    lines.push(`- ${def.name}（id=${p.id}）:当前 ${stageDef?.name ?? `阶段 ${p.阶段}`},满进度等待狭间问答`);
  }
  lines.push('');
  lines.push(`**禁止在战斗中 / 高紧张谈判 / 危险逃亡场景发出邀请**——狭间是精神虚境,需要旅人有一刻"能停下来面对自己"的空隙。一回合至多发出一条邀请。`);
  return `# 命途狭间·时机判定\n\n${lines.join('\n')}`;
}

export function buildPathAwakeningMainHookSection(
  traveler: 角色数据结构,
  worldState: 世界状态,
): string {
  return buildPathAwakeningPendingSection(worldState) || buildPathAwakeningReadySection(traveler);
}

export function buildPathAwakeningActiveSection(
  traveler: 角色数据结构,
  worldState: 世界状态,
  awakeningPhase?: 命途狭间阶段,
): string {
  if (!worldState.进行中狭间) return '';
  return awakeningPhase === 'judgement'
    ? buildPathAwakeningJudgementSection(traveler, worldState)
    : buildPathAwakeningQuestionSection(traveler, worldState);
}

export function buildPathAwakeningSystemPrompt(input: SystemPromptInput): BuiltSystemPrompt {
  const { traveler, world, settings, worldbookPlan, worldbookCtx, awakeningPhase, yitingInjectionOverride } = input;
  const ctx = makeModuleCtx(input, 'pathAwakening');
  const personLabel =
    settings.narrativePerson === 'second' ? '第二人称"你"'
    : settings.narrativePerson === 'first' ? '第一人称"我"'
    : '第三人称"他/她"';

  const identity = injectBucket(input.modules, ctx, 'identity');
  const rules = injectBucket(input.modules, ctx, 'rules');
  const protocol = injectBucket(input.modules, ctx, 'protocol');
  ctx.chat.push(...identity.chatModuleMessages, ...rules.chatModuleMessages, ...protocol.chatModuleMessages);
  if (worldbookPlan) ctx.chat.push(...worldbookPlan.depthMessages);

  const knowledge: string[] = [];
  if (worldbookPlan && worldbookCtx && worldbookPlan.keywordEntries.length) {
    knowledge.push(worldbookPlan.keywordEntries.map((item) => renderWorldbookSystemEntry(item, worldbookCtx, '世界书')).join('\n\n---\n\n'));
  }
  if (input.zhikuInjectionOverride?.trim()) knowledge.push(input.zhikuInjectionOverride.trim());

  return assemblePromptChunks([
    identity.systemSection,
    worldbookPlan && worldbookCtx
      ? worldbookPlan.alwaysEntries.map((item) => renderWorldbookSystemEntry(item, worldbookCtx, '世界书')).join('\n\n---\n\n')
      : '',
    rules.systemSection,
    worldbookPlan && worldbookCtx
      ? worldbookPlan.systemRuleEntries.map((item) => renderWorldbookSystemEntry(item, worldbookCtx, '提示词')).join('\n\n---\n\n')
      : '',
    `# 写作人称\n\n- 视角：${personLabel}`,
    buildWordCountSection(settings),
    buildCharacterSection(traveler),
    buildPathAwakeningActiveSection(traveler, world, awakeningPhase),
    buildSceneSection(world),
    yitingInjectionOverride?.trim() ?? '',
    knowledge.join('\n\n---\n\n'),
    buildExtraRequirementSection(settings),
    protocol.systemSection,
  ], ctx.chat);
}
