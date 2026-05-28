// 变量模型 service：用独立 API config 把「正文」喂给一个轻量模型。
//
// 新协议：
// - 主输出是 <变量事实> JSON：AI 只提取事实，不直接猜路径、顺序和对象下标。
// - 前端把事实确定性转换成内部变量命令，再复用旧执行器校验/归一化/落库。
// - <变量更新> 继续保留为空块或少量兼容命令，避免旧存档/复杂字段立刻断链。

import type { API配置项 } from '@/models/settings';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { buildVariableRegistryPrompt, type VariableState } from '@/utils/variableRegistry';
import { withRetries } from '@/services/ai/retry';
import { COMPANION_ARCHIVE_WORLDBOOK_CONTENT } from '@/data/companionArchiveWorldbook';
import { VARIABLE_SYSTEM_WORLDBOOK_PROMPT } from '@/data/variableWorldbook';
import { VARIABLE_COT_PROMPT } from '@/prompts/cot/variableCot';

export interface VariableModelRequest {
  /** 主模型刚写完的正文（已抽出 <正文> 块，不带其他标签）。 */
  body: string;
  /** 主剧情模型输出的 <变量草稿>，只作为候选线索，不直接落库。 */
  variableDraft?: string;
  /** 玩家本回合的输入（提供上下文，便于 AI 理解状态变化的来由）。 */
  userInput: string;
  /** 当前游戏回合数。 */
  turnCount: number;
  /** 当前变量状态快照（用来生成登记表）。 */
  state: VariableState;
  /** NSFW 总开关：关闭时不得写 NSFW档案。 */
  nsfwEnabled?: boolean;
  /** 男性 NSFW 档案开关：默认 false，关闭时不得写男性身体档案。 */
  maleNsfwArchiveEnabled?: boolean;
  signal?: AbortSignal;
  retryCount?: number;
}

export interface VariableModelResult {
  /** 模型的完整原始返回（含 <变量事实> 与兼容 <变量更新> 块）。 */
  rawText: string;
}

/** 变量模型的 system prompt：事实协议 + 登记表 + 兼容命令协议。 */
export function buildVariableModelPrompt(
  state: VariableState,
  nsfwPolicy?: { enabled?: boolean; maleArchiveEnabled?: boolean },
): string {
  const registry = buildVariableRegistryPrompt(state);
  const nsfwEnabled = Boolean(nsfwPolicy?.enabled);
  const maleArchiveEnabled = Boolean(nsfwPolicy?.maleArchiveEnabled);

  return [
    '你是一个变量事实提取与结算模型，不是主剧情叙述者。',
    '你的任务是阅读本回合正文和主模型的 <变量草稿>，提取“已经台前发生、可以落库”的事实。',
    '默认不要直接写底层变量路径命令；路径、顺序、日期/天数对齐、NPC 建档和对象归一化由前端规则层处理。',
    '',
    '## 输出协议（必须严格遵守）',
    '',
    '输出顺序固定为：',
    '1. 一个 <thinking>...</thinking> 调试段；',
    '2. 一个 <变量事实>...</变量事实> JSON 块；',
    '3. 一个 <变量更新>...</变量更新> 兼容块。',
    '',
    '<变量事实> 必须是合法 JSON，推荐格式：',
    '```json',
    '{"facts":[{"type":"location","location":"黑塔空间站·主控舱段","evidence":"正文写明抵达主控舱段"}]}',
    '```',
    '',
    '没有可落库事实时输出：',
    '```json',
    '{"facts":[]}',
    '```',
    '',
    '<变量更新> 是旧协议兼容层：默认留空。只有事实协议无法表达、且登记表明确允许、且正文证据非常清楚的复杂字段，才可以少量写旧命令。',
    '时间、地点、NPC、旅人档案、物品、世界事件、手机来信种子必须优先写进 <变量事实>，不要再用旧命令直接写这些路径。',
    '',
    '## 变量事实类型',
    '',
    '### 旅人档案：traveler_profile',
    '- 用于稳定身份、外貌、性格、背景、能力、专长知识的已确认变化。',
    '- 可用字段：identity、appearance、personality、background、abilityAdd、knowledgeAdd、evidence。',
    '- 玩家服装变化并入 appearance，不存在 `旅人.穿着`。',
    '',
    '示例：',
    '{"type":"traveler_profile","identity":"黑塔空间站临时协助者","abilityAdd":["能稳定读取异常终端回响"],"evidence":"正文确认玩家被授权协助排查异常终端"}',
    '',
    '### 时间：time',
    '- 字段：mode、minutes、targetTime、evidence。',
    '- mode 可用：no_change / elapsed / set_time / overnight / next_day。',
    '- elapsed 只写分钟数，普通回合 1-5 分钟；复杂回合通常不超过 15 分钟；超过 30 分钟必须有正文明确证据。',
    '- 如果正文明确“第二天 / 次日 / 一夜过去 / 睡醒 / 跨夜后凌晨”，用 next_day 或 overnight，并可带 targetTime。',
    '- 如果同日只是“几分钟后”，用 elapsed；不要自己重算日期。',
    '- 不要直接在旧命令里写 `世界.当前日期`、`世界.开拓天数`、`世界.当前时间`，让代码处理。',
    '',
    '示例：',
    '{"type":"time","mode":"elapsed","minutes":4,"evidence":"正文写到几分钟后终端读条结束"}',
    '{"type":"time","mode":"next_day","targetTime":"00:02","evidence":"正文写明一夜过去，场景结束在次日凌晨"}',
    '',
    '### 地点：location',
    '- 字段：location、evidence。',
    '- 只有地点明显变化或正文首次明确当前地点时输出。',
    '',
    '### NPC：npc',
    '- 字段：id、name、alias、tier、affinityDelta、affinitySet、relation、following、appearance、clothing、speechStyle、personality、intro、playerAddress、memory、evidence。',
    '- name 是必填字段；即使已经写了 id，也要写中文姓名，例如 `{"id":"npc_march7th","name":"三月七"}`。',
    '- memory 必须是字符串摘要，不要写对象。系统会自动生成同行记忆 id、回合、来源和关联 NPC。',
    '- 已建档 NPC 本回合与玩家发生有效互动时，必须审计是否需要写 memory，并同步更新有正文证据的关系、好感、称呼、同行状态或稳定档案字段。',
    '- 有效互动包括：对话产生新约定/信任/冲突、共同经历危险或任务、救援、交易、委托、交付情报或物品、离队/同行、手机约定、亲密关系推进；纯寒暄和场景擦肩不写 memory。',
    '- memory 写成“事件 -> NPC 对玩家的认知/关系影响”，保留称呼变化、承诺、亏欠、信任/冲突原因、未兑现约定或私人细节。不要写纯场景描写。',
    '- 新 NPC 与已有 NPC 都只写事实；系统会决定 push 新档案还是更新旧档案。入档前必须按姓名、别名、原著稳定 id 和当前称呼查重，不能重复建档。',
    '- 新出现的原著角色、具名重要角色、任务关键角色、同行角色、直接与玩家互动并留下可承接记忆的角色，tier 写 companion；只露面一次、没有姓名或没有后续承接价值的路人/敌兵才写 extra 或不写 npc。',
    '- 新入档时，如果即时剧情回顾/回忆/登记表显示该 NPC 与玩家已有关键前因，本次 memory 要补上最关键的初遇、承诺或冲突，避免记忆断层。',
    '- 长间隔重登场时只能刷新现有字段：外貌 -> appearance，穿着 -> clothing，称呼 -> playerAddress，关系态度 -> relation/affinityDelta，是否同行 -> following；身份/所属势力/地点/伤势等没有独立 NPC 字段的长期状态，写进 intro、memory 或 world_event，不要编造 age/faction/location/injury/present 字段。',
    '- 原著角色用稳定姓名，能写 id 时写 `npc_march7th`、`npc_danheng` 等。',
    '- 怪物、泛称敌人、一次性路人不写 npc；可写 world_event。',
    '- memory 只写该 NPC 与玩家本回合直接共同经历，不要把 A 的经历写给 B。',
    '',
    '### 物品：item',
    '- 字段：action="gain"、category、name、description、quantity、quality、stackable、source、sourceDescription、narrativeEffects、evidence。',
    '- category 只能是 food / consumable / lightcone / weapon / clothing / accessory / memento / key。',
    '- 物品必须有具体名称和描述；模糊的“一些东西”不落库。',
    '- 装备和道具只写叙事效果，不写旧属性加成。',
    '',
    '### 世界事件：world_event',
    '- 字段：text、evidence。',
    '- 用于可被后续剧情引用的客观结果，例如区域损坏、撤离完成、组织动向、公开事件。',
    '- 新闻 root 由独立新闻系统维护，不写新闻变量。',
    '',
    '### 手机来信种子：phone_seed',
    '- 字段：targetType、targetId、targetName、title、context、triggerType、priority、relatedNpcIds、evidence。',
    '- 只生成“稍后可能发短信”的种子，不写完整 messages。',
    '- 每回合最多 0-2 条，普通寒暄不生成。',
    '',
    '## 变量系统世界书（必须遵守）',
    '',
    VARIABLE_SYSTEM_WORLDBOOK_PROMPT,
    '',
    '## 伙伴档案写作规范',
    '',
    COMPANION_ARCHIVE_WORLDBOOK_CONTENT,
    '',
    '## 变量系统思维链（内部执行，用于 thinking 结构）',
    '',
    VARIABLE_COT_PROMPT,
    '',
    '## NSFW 档案开关',
    `- 当前 NSFW 总开关：${nsfwEnabled ? '开启' : '关闭'}。关闭时禁止写任何 \`NSFW档案\` 字段。`,
    `- 当前男性 NSFW 档案：${maleArchiveEnabled ? '开启' : '关闭'}。关闭时禁止写男性身体档案、男性私密部位和男性长期私密事实。`,
    '- NSFW 档案目前仍属于兼容旧命令范围；只有开关开启、角色成人确认、且正文有稳定长期事实时才少量写入旧 <变量更新>。',
    '',
    '## 旧 <变量更新> 兼容命令格式',
    '',
    '```',
    '<action> <path> = <json_value>',
    '```',
    '- action 可用 set / add / sub / push / delete。',
    '- path 必须出现在下面登记表中。',
    '- delete 可省略值。',
    '- 兼容命令不得用于 time / location / item / world_event / phone_seed / traveler_profile 能表达的事实；NPC 的关系、好感、同行、称呼、档案字段和同行记忆也默认用 npc fact 表达。',
    '- 只有事实协议无法表达、且登记表明确允许的复杂 NPC 子档案（例如 NSFW档案、图像档案等）才少量使用旧命令；不要用旧命令重复写 npc.memory 已能表达的同行记忆。',
    '',
    '## thinking 输出规范',
    '',
    '<thinking> 必须按 6 步写，方便玩家调试：',
    '1. 提取事实：正文中已发生、已确认、可落库的事实。',
    '2. 排除项：纯氛围、猜测、未来计划、智库/忆庭/新闻/旧战斗字段等为什么不落库。',
    '3. 对象合并：NPC、物品、联系人是否已有对象，是否应合并。',
    '4. 时间地点：是否真的耗时、是否跨日、地点是否变化。',
    '5. 事实计划：准备写入哪些 <变量事实>，逐条列出 type。',
    '6. 兼容命令：是否需要旧 <变量更新>；通常写“无，事实协议已覆盖”。',
    '',
    '## 严格约束',
    '',
    '- 禁止在三个标签以外输出解释、正文复述或闲聊。',
    '- <变量事实> 只允许 JSON，不要 Markdown 列表、注释或省略号。',
    '- 只记录正文和变量草稿能相互印证的已发生事实；变量草稿不是命令，不能直接照抄落库。',
    '- 不确定就不写。宁可漏掉轻微变量，也不要写错对象、错日期、错路径。',
    '',
    '---',
    '',
    '## 当前变量路径登记表（仅供兼容命令与对象识别参考）',
    '',
    registry,
  ].join('\n');
}

/** 调用变量模型，返回原始文本（待 parseVariableFacts / parseVariableCommands 解析）。 */
export async function callVariableModel(
  config: API配置项,
  request: VariableModelRequest,
): Promise<VariableModelResult> {
  const systemPrompt = buildVariableModelPrompt(request.state, {
    enabled: request.nsfwEnabled,
    maleArchiveEnabled: request.maleNsfwArchiveEnabled,
  });

  const userMessage = [
    `## 第 ${request.turnCount} 回合的正文`,
    '',
    '玩家输入：',
    request.userInput || '（无）',
    '',
    '主模型变量草稿（候选事实，不是命令）：',
    request.variableDraft?.trim() || '（无）',
    '',
    '主模型回复正文：',
    request.body,
    '',
    '---',
    '',
    '请阅读上面的正文，输出 <thinking>、<变量事实> JSON 和兼容 <变量更新> 块。默认让 <变量更新> 留空。',
  ].join('\n');

  const rawText = await withRetries(
    () =>
      chatCompletionNonStream(config, {
        messages: [{ role: 'user', content: userMessage }],
        systemPrompt,
        signal: request.signal,
        // 变量模型需要保留可检查的 thinking + facts + 少量兼容命令。
        maxTokens: config.maxTokens ?? 2200,
        // 较低温度，减少幻觉。
        temperature: config.temperature ?? 0.25,
      }),
    { retries: request.retryCount ?? 0, signal: request.signal, label: '变量模型' },
  );

  return { rawText };
}
