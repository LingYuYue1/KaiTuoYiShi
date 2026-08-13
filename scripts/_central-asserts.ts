// 提示词八区重组集中回归 · 断言入口（生产函数驱动）
// 由 scripts/prompt-assembly-order-central-regression.mjs 编译运行
import { buildSystemPrompt, buildOpeningSystemPrompt, buildPathAwakeningSystemPrompt } from '@/hooks/useGame/systemPromptBuilder';
import { resolveWorldbookInjectionPlan } from '@/utils/worldbook';
import { deriveMainStoryMessageMode, finalizeMainRequest, buildCotPseudoTaskSequence, COT_PSEUDO_USER_TRIGGER } from '@/hooks/useGame/mainRequestFinalizer';
import { 创建默认游戏设置 } from '@/models/settings';
import { 创建聊天消息 } from '@/models/chat';
import {
  buildImmediateStoryReview,
  extractRecentStoryPlanSnippets,
  getPathAwakeningHistoryWindow,
} from '@/hooks/useGame/historyWindow';
import {
  buildPromptMacroContext,
  buildPromptWorldbookContext,
  resolvePromptWorldbookPlan,
} from '@/hooks/useGame/promptAssemblyContext';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const settings = 创建默认游戏设置();
const traveler = {
  姓名: '测试旅人', 别名: '', 性别: '女', 年龄: 20, 生日: '1月1日',
  外貌: '黑发', 性格: '开朗', 背景: '测试背景', 能力: ['调查'], 专长知识: ['推理'],
  命途列表: [], 背包: [], 战技列表: [],
} as any;
const worldState = {
  纪年法: '琥珀纪年', 开拓天数: 3, 当前日期: '2026-08-12', 当前时间: '12:00', 当前地点: '黑塔空间站',
  当前时段: null, 全局事件: ['事件A'], 剧情模式: 'normal' as any, 开局档案: null,
  进行中狭间: null, 待触发狭间: null, 原著主角: '星',
} as any;
const memorySystem = {
  短期记忆: ['短1'], 中期记忆: ['中1'], 长期记忆: ['长1'],
} as any;
const chatMsg = (role: string, content: string, extra?: any) => ({ role, content, ...extra }) as any;

const history = [
  chatMsg('user', '第一回合输入'),
  chatMsg('assistant', '第一回合回复', { parsedResponse: { body: '正文1', memory: '小结1', storyPlan: '规划1', worldEvents: [] } }),
  chatMsg('user', '当前输入'),
];
const plotNodes = [{ 标题: '测试主线', 状态: 'active', 摘要: '推进中', 更新回合: 2 }] as any;

const callMain = (extra: any = {}) => buildSystemPrompt(
  traveler, worldState, memorySystem, settings, 4,
  undefined, undefined, [], [], plotNodes, undefined, undefined, undefined, undefined,
  undefined, undefined, false, undefined, undefined, undefined,
  extra.storyPlanSnippets ?? [], undefined,
);

// ── 14.1 八区顺序 ──
{
  const built = callMain();
  const ids = built.sections.map((s) => s.id);
  const expected = ['zone1-identity', 'zone2-rules', 'zone3-params', 'zone4-player', 'zone5-memory', 'zone6-injection', 'zone7-review', 'zone8-protocol'];
  const coreIds = ids.filter((id) => id !== 'zone-extra-requirements');
  assert(coreIds.join(',') === expected.join(','), `八区顺序必须严格为 zone1→zone8。实际: ${ids.join(',')}`);
  const full = built.systemPrompt;
  assert(full.includes('长期记忆') && full.includes('中期记忆'), '长期/中期记忆必须在区5。');
  assert(full.includes('短期记忆'), '短期记忆必须存在（区6 末尾）。');
  assert(full.includes('# 剧情安排'), '区5 必须包含剧情安排合并段。');
  assert(full.includes('# 主剧情运行锚点'), '区8 必须包含运行锚点。');
  assert(full.includes('# 回复格式'), '区8 必须包含回复格式。');
  assert(full.includes('# 主剧情思维链'), '区8 必须包含主剧情思维链。');
  assert(full.includes('## 天气判断'), '天气必须由 builder 统一组装（区6）。');
  assert(full.includes('# 文风助手'), '区7 必须包含文风助手。');
  const review = buildImmediateStoryReview(history);
  assert(!review.includes('剧情规划'), '即时回顾不得再包含剧情规划字段。');
  const snippets = extractRecentStoryPlanSnippets(history);
  assert(snippets.length === 1 && snippets[0] === '规划1', '必须从回合前历史提取最近 1 条剧情规划。');
  const built2 = callMain({ storyPlanSnippets: snippets });
  assert(built2.systemPrompt.includes('规划1'), '剧情规划必须进入区5 剧情安排备忘。');
}

// ── 14.2 世界书四路 ──
{
  const alwaysEntry: any = { id: 'always1', title: '常驻设定', content: '常驻内容', type: 'world_lore', injectMode: 'always', keywords: [], priority: 100, enabled: true, scope: ['main'], probability: 0, delay: 5, cooldown: 3 };
  const keywordEntry: any = { id: 'kw1', title: '关键词设定', content: '关键词内容', type: 'world_lore', injectMode: 'keyword_match', keywords: ['测试'], priority: 90, enabled: true, scope: ['main'] };
  const ruleEntry: any = { id: 'rule1', title: '规则条目', content: '规则内容', type: 'system_rule', injectMode: 'keyword_match', keywords: ['测试'], priority: 80, enabled: true, scope: ['main'] };
  const depthEntry: any = { id: 'depth1', title: '深度条目', content: '深度内容', type: 'world_lore', injectMode: 'keyword_match', keywords: ['测试'], priority: 70, enabled: true, scope: ['main'], injectAtDepth: true, depth: 2 };
  const books: any[] = [{ id: 'b1', title: '测试书', enabled: true, entries: [alwaysEntry, keywordEntry, ruleEntry, depthEntry] }];
  const ctx: any = { recentUserInput: '测试输入', recentAIResponse: '', worldName: 'w', travelerName: '旅人', turnCount: 1, currentScope: 'main', messageCount: 10, worldbookTriggerStates: {} };
  const plan = resolveWorldbookInjectionPlan(books, ctx, { random: () => 0 });
  assert(plan.alwaysEntries.length === 1 && plan.alwaysEntries[0].entry.id === 'always1', 'always 条目必须进入区1（常驻），不受 probability=0/delay/cooldown 影响。');
  assert(!plan.triggeredEntryIds.includes('always1'), 'always 条目不写触发状态。');
  assert(plan.keywordEntries.length === 1 && plan.keywordEntries[0].entry.id === 'kw1', '命中关键词的 keyword 条目必须进入区6。');
  assert(plan.systemRuleEntries.length === 1 && plan.systemRuleEntries[0].entry.id === 'rule1', '命中关键词的 system_rule 必须进入区2。');
  assert(plan.depthMessages.length === 1 && plan.depthMessages[0]._injectionDepth === 2, 'injectAtDepth 条目必须进入 depth 消息。');
  assert(plan.triggeredEntryIds.includes('kw1') && plan.triggeredEntryIds.includes('rule1'), 'triggeredEntryIds 只记录 keyword_match 命中。');
  const empty = resolveWorldbookInjectionPlan(books, ctx, { enabled: false });
  assert(empty.alwaysEntries.length === 0 && empty.keywordEntries.length === 0 && empty.systemRuleEntries.length === 0 && empty.depthMessages.length === 0, '关闭世界书总开关后四路必须全空。');
  const missPlan = resolveWorldbookInjectionPlan(books, { ...ctx, recentUserInput: '无关输入' });
  assert(missPlan.keywordEntries.length === 0 && missPlan.systemRuleEntries.length === 0 && missPlan.depthMessages.length === 0, '关键词未命中时 keyword/system_rule/depth 均不注入。');
}

// ── 14.3 五种消息模式 ──
{
  assert(deriveMainStoryMessageMode({ tavernV2Active: true, deepSeekMainActive: true, deepSeekLockFormat: true, enableCotFakeHistory: true }) === 'tavern_v2', 'Tavern V2 必须最优先。');
  assert(deriveMainStoryMessageMode({ tavernV2Active: false, deepSeekMainActive: true, deepSeekLockFormat: true, enableCotFakeHistory: true }) === 'deepseek_prefix', 'DeepSeek lock_format 次优先。');
  assert(deriveMainStoryMessageMode({ tavernV2Active: false, deepSeekMainActive: true, deepSeekLockFormat: false, enableCotFakeHistory: true }) === 'deepseek_standard', 'DeepSeek standard 第三优先。');
  assert(deriveMainStoryMessageMode({ tavernV2Active: false, deepSeekMainActive: false, deepSeekLockFormat: false, enableCotFakeHistory: true }) === 'cot_pseudo', 'cot_pseudo 第四优先。');
  assert(deriveMainStoryMessageMode({ tavernV2Active: false, deepSeekMainActive: false, deepSeekLockFormat: false, enableCotFakeHistory: false }) === 'standard', '兜底 standard。');
  const config: any = { id: 'c', name: '测试', provider: 'openai_compatible', baseUrl: '', apiKey: '', model: 'x', createdAt: 0, updatedAt: 0 };

  const finalizedStandard = finalizeMainRequest({
    config, systemPrompt: 'sys', mode: 'standard',
    preTurnHistory: [chatMsg('user', '旧历史'), chatMsg('assistant', '旧回复', { parsedResponse: { body: '旧正文' } })],
    depthMessages: [], positionZeroCompatMessages: [], turnConstraints: [],
    enforcementBlock: '区E', taskSequence: [chatMsg('user', '当前输入')],
    streaming: false, scope: 'main',
  });
  const contents = finalizedStandard.messages.map((m) => m.content);
  assert(contents.filter((c) => c === '当前输入').length === 1, 'standard 模式当前输入必须只出现一次。');
  assert(contents[contents.length - 1] === '当前输入', 'standard 模式真实输入必须为最后一条。');
  assert(contents.includes('区E') && contents.indexOf('区E') < contents.length - 1, '区E 必须存在且位于任务序列之前。');

  const taskSeq = buildCotPseudoTaskSequence('玩家输入X');
  assert(taskSeq.length === 3, 'cot_pseudo 必须是尾部三连。');
  assert(taskSeq[0].role === 'assistant' && taskSeq[1].role === 'user' && taskSeq[2].role === 'assistant', '三连角色必须为 assistant/user/assistant。');
  assert(taskSeq[0].content.includes('玩家输入X'), 'assistant 包装输入必须包含真实输入。');
  assert(taskSeq[1].content === COT_PSEUDO_USER_TRIGGER, 'user 触发语必须为"开始任务"。');
  assert(!taskSeq[2].content.includes('<正文>') && !taskSeq[2].content.includes('<短期记忆>') && !taskSeq[2].content.includes('<动态世界>'), '最小伪装响应不得包含空正文/空记忆/空动态世界块。');
  assert(taskSeq[2].content.includes('<thinking>'), '最小伪装响应必须建立 thinking 姿态。');
  const finalizedPseudo = finalizeMainRequest({
    config, systemPrompt: 'sys', mode: 'cot_pseudo',
    preTurnHistory: [chatMsg('user', '旧历史')],
    depthMessages: [], positionZeroCompatMessages: [], turnConstraints: [],
    taskSequence: taskSeq, streaming: false, scope: 'main',
  });
  const roles = finalizedPseudo.messages.map((m) => m.role);
  assert(roles.slice(-3).join(',') === 'assistant,user,assistant', `cot_pseudo 末三条角色必须为 assistant/user/assistant。实际: ${roles.slice(-3).join(',')}`);
  assert(!finalizedPseudo.messages.some((m) => m.role === 'user' && m.content === '玩家输入X'), 'cot_pseudo 不得再发送普通 user 真实输入。');

  const finalizedDs = finalizeMainRequest({
    config, systemPrompt: 'sys', mode: 'deepseek_standard',
    preTurnHistory: [], depthMessages: [], positionZeroCompatMessages: [],
    turnConstraints: [chatMsg('user', 'DeepSeek 主剧情格式校验')],
    taskSequence: [chatMsg('user', '输入')], prefixMode: false, streaming: false, scope: 'main',
  });
  assert(finalizedDs.messages.some((m) => m.content.includes('DeepSeek 主剧情格式校验')), 'deepseek_standard 必须含格式守卫。');
  assert(!finalizedDs.prefixMode, 'deepseek_standard 无 prefix。');

  const finalizedPrefix = finalizeMainRequest({
    config, systemPrompt: 'sys', mode: 'deepseek_prefix',
    preTurnHistory: [], depthMessages: [], positionZeroCompatMessages: [],
    turnConstraints: [chatMsg('user', 'DeepSeek 主剧情格式校验')],
    taskSequence: [chatMsg('user', '输入')], prefixMode: true, prefixContent: '<thinking>\n', streaming: false, scope: 'main',
  });
  assert(finalizedPrefix.capabilities.prefixRequested === true, 'deepseek_prefix 必须请求 prefix。');

  const finalizedDepth = finalizeMainRequest({
    config, systemPrompt: 'sys', mode: 'standard',
    preTurnHistory: [chatMsg('user', 'h1'), chatMsg('user', 'h2')],
    depthMessages: [{ role: 'system', content: 'DEPTH_MSG', _injectionPosition: 1, _injectionDepth: 1, _injectionOrder: 0 }],
    positionZeroCompatMessages: [], turnConstraints: [],
    taskSequence: [chatMsg('user', '当前输入')], streaming: false, scope: 'main',
  });
  const idxDepth = finalizedDepth.messages.findIndex((m) => m.content === 'DEPTH_MSG');
  const idxInput = finalizedDepth.messages.findIndex((m) => m.content === '当前输入');
  assert(idxDepth !== -1 && idxInput !== -1 && idxDepth < idxInput, 'depth 消息必须位于历史窗口内部（任务序列之前）。');
}

// ── 14.5 开局 ──
{
  const openingTraveler = {
    ...traveler,
    战技列表: [{ 名称: '星轨斩', 槽位类型: 'normal', 槽位序号: 1, 已启用: true }],
    背包: [{ id: 'item-ticket', 名称: '登车凭证', 数量: 1, 品质: '普通', 类别: '任务物品' }],
  } as any;
  const openingWorld = {
    ...worldState,
    自定义开局: '敌人突袭，旅人需要使用星轨斩，并出示登车凭证。',
  } as any;
  const openingZhiku = { mainStoryInjection: '# 开局必要智库\n列车资料' } as any;
  const built = buildOpeningSystemPrompt(openingTraveler, openingWorld, settings, 1, undefined, undefined, [], undefined, undefined, undefined, openingZhiku);
  const full = built.systemPrompt;
  assert(full.includes('# 开局档案（长期锚点）'), '开局必须包含完整开局档案。');
  assert(full.includes('# 开局切入说明'), '开局必须包含开局切入说明。');
  assert(!full.includes('# 剧情安排'), '开局不得包含剧情安排。');
  assert(!full.includes('# 主线进度'), '开局不得包含主线进度。');
  assert(!full.includes('# 记忆｜'), '开局不得包含分层记忆。');
  assert(!full.includes('# 已知伙伴与路人'), '开局不得包含 NPC 承接。');
  assert(full.includes('- 普通战技槽位：'), '开局文本明确需要能力时必须注入战技资料段。');
  assert(full.includes('星轨斩（'), '开局战技资料段必须包含被触发的具体战技记录。');
  assert(full.includes('# 背包概览'), '开局文本明确需要物品时必须注入背包资料段。');
  assert(full.includes('# 开局必要智库'), '开局必须能够注入 opening scope 的必要智库。');

  const quietOpening = buildOpeningSystemPrompt(traveler, worldState, settings, 1, undefined, undefined, [], undefined, undefined);
  assert(!quietOpening.systemPrompt.includes('- 普通战技槽位：'), '普通开局不得无条件注入战技资料。');
  assert(!quietOpening.systemPrompt.includes('# 背包概览'), '普通开局不得无条件注入背包资料。');
}

// ── 14.6 命途狭间 ──
{
  const awState = { ...worldState, 进行中狭间: 'hunt' };
  const built = buildPathAwakeningSystemPrompt(traveler, awState, settings, 5, undefined, undefined, undefined, 'question', undefined, undefined, undefined, undefined);
  const full = built.systemPrompt;
  assert(full.includes('# 命途狭间·出题回合'), '狭间必须包含出题回合协议。');
  assert(!full.includes('# 主剧情思维链'), '狭间不得包含主剧情思维链。');
  assert(full.includes('# 回复格式'), '狭间必须包含回复格式。');
  assert(!full.includes('# 近期新闻'), '狭间不得包含新闻。');
  assert(!full.includes('# 手机通讯摘要'), '狭间不得包含手机。');
  assert(!full.includes('# 剧情编织滑窗'), '狭间不得包含剧情编织。');
  assert(full.includes('# 当前场景'), '狭间必须包含进入前现实场景（11.1 第4项）。');
  const builtNsfwOff = buildPathAwakeningSystemPrompt(traveler, awState, 创建默认游戏设置(), 5, undefined, undefined, undefined, 'question', undefined, undefined, undefined, undefined);
  assert(!builtNsfwOff.systemPrompt.includes('NSFW Runtime Permission'), 'pathAwakening 不注入 NSFW 英文段。');
  const nsfwOn = { ...创建默认游戏设置(), enableNsfw: true } as any;
  const builtMainNsfw = buildSystemPrompt(traveler, worldState, memorySystem, nsfwOn, 4, undefined, undefined, [], [], plotNodes, undefined, undefined, undefined, undefined, undefined, undefined, false, undefined, undefined, undefined, [], undefined);
  assert(builtMainNsfw.systemPrompt.includes('NSFW Runtime Permission'), 'enableNsfw=true 时必须注入 NSFW 英文段。');
  const builtMainOff = buildSystemPrompt(traveler, worldState, memorySystem, 创建默认游戏设置(), 4, undefined, undefined, [], [], plotNodes, undefined, undefined, undefined, undefined, undefined, undefined, false, undefined, undefined, undefined, [], undefined);
  assert(!builtMainOff.systemPrompt.includes('NSFW Runtime Permission'), 'enableNsfw=false 时 NSFW 两段均不存在。');
}

// ── 14.7 狭间历史裁剪 ──
{
  const awakeningHistory = [
    chatMsg('user', '很早以前的主线输入'),
    chatMsg('assistant', '很早以前的主线回复', { parsedResponse: { body: '旧主线', worldEvents: [] } }),
    chatMsg('user', '进入前最后行动'),
    chatMsg('assistant', '进入前最后场景', { parsedResponse: { body: '现实停在门前', worldEvents: [] } }),
    chatMsg('user', '[系统] 踏入命途狭间'),
  ];
  const questionWindow = getPathAwakeningHistoryWindow(awakeningHistory, 'question');
  assert(questionWindow.length === 2, '狭间出题只保留进入前最后一次交互。');
  assert(questionWindow[0].content === '进入前最后行动' && questionWindow[1].content === '进入前最后场景', '狭间出题不得带回更早主线窗口。');

  const judgementHistory = [
    ...awakeningHistory.slice(0, -1),
    chatMsg('assistant', '三道诘问', { parsedResponse: { body: '虚境中传来三问', awakenQuestions: '一问、二问、三问', worldEvents: [] } }),
    chatMsg('user', '我的答案'),
  ];
  const judgementWindow = getPathAwakeningHistoryWindow(judgementHistory, 'judgement');
  assert(judgementWindow.length === 1 && judgementWindow[0].content === '三道诘问', '狭间评判只保留上一回合三问。');
}

// ── 14.8 发送/快照共享上下文与确定性 worldbook plan ──
{
  const ctx = buildPromptWorldbookContext({
    userInput: '触发概率条目',
    history,
    world: worldState,
    travelerName: traveler.姓名,
    turnCount: 4,
    npcNames: [],
    scope: 'main',
    worldbookTriggerStates: { old: 2 },
  });
  assert(ctx.recentMessages?.length === history.length, '共享 worldbook 上下文必须携带近期消息。');
  assert(ctx.messageCount === 4 && ctx.worldbookTriggerStates?.old === 2, '共享 worldbook 上下文必须携带消息数和触发状态。');

  const probabilityBook = [{
    id: 'book', title: '测试书', description: '', enabled: true, createdAt: 0, updatedAt: 0,
    entries: [{
      id: 'chance', title: '概率条目', content: '命中', type: 'world_lore', injectMode: 'keyword_match',
      keywords: ['触发概率条目'], priority: 1, enabled: true, scope: ['main'], probability: 50,
      createdAt: 0, updatedAt: 0,
    }],
  }] as any;
  const firstPlan = resolvePromptWorldbookPlan(probabilityBook, ctx, true);
  const secondPlan = resolvePromptWorldbookPlan(probabilityBook, ctx, true);
  assert(JSON.stringify(firstPlan) === JSON.stringify(secondPlan), '相同回合 fixture 的 worldbook probability 结果必须确定性一致。');

  const macro = buildPromptMacroContext({ history, playerName: '测试旅人', turnCount: 4, modelName: 'test-model', maxContext: 8192 });
  assert(macro.gameState?.lastMessage === '当前输入' && macro.gameState?.modelName === 'test-model', '共享宏上下文必须包含真实回合消息与模型信息。');
}

console.log('\n=== 集中回归断言全部通过 ===');
