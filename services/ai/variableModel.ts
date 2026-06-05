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
    '时间、地点、NPC、物品、世界事件、手机来信种子必须优先写进 <变量事实>，不要再用旧命令直接写这些路径。旅人核心档案由玩家手写维护，不由变量系统修改。',
    '',
    '## 变量事实类型',
    '',
    '### 旅人核心档案只读',
    '- 旅人的姓名、别名、性别、年龄、生日、身高、身份、外貌、性格、背景、能力、专长知识、头像和图像档案由玩家手写维护。',
    '- 变量模型不得输出 traveler_profile，也不得在旧 <变量更新> 中 set/push/delete 这些字段。',
    '- 剧情中获得的新身份称呼、临时伪装、别人对玩家能力的认知，写入 NPC.memory、world_event、item 或正文承接；不要改旅人档案本体。',
    '- 玩家服装变化、外观变化若未通过玩家档案编辑确认，不落库；可以在正文和短期记忆中承接。',
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
    '- 字段：id、name、alias、tier、affinityDelta、affinitySet、relation、following、appearance、clothing、speechStyle、personality、intro、playerAddress、memory、recentInteraction、longTermImpression、relationshipStage、sharedExperiences、openItems、unresolvedConflicts、mustRemember、doNotForget、evidence。',
    '- name 是必填字段；即使已经写了 id，也要写中文姓名，例如 `{"id":"npc_march7th","name":"三月七"}`。',
    '- 完整写入规则见下方“变量系统世界书（必须遵守）”中的 `<NPC档案记忆写入法则>`；本节只列事实字段和示例。',
    '',
    'NPC 账本示例：',
    '{"type":"npc","id":"npc_march7th","name":"三月七","memory":"三月七把寻找失踪科员的请求交给玩家，并给了备用通讯码。","recentInteraction":"三月七在主控舱段委托玩家寻找失踪科员，并约定用备用通讯码联系。","relationshipStage":"信任中的同行委托","sharedExperiences":["在主控舱段约定一起追查失踪科员"],"openItems":["帮三月七寻找失踪科员并回传线索"],"mustRemember":["三月七给过玩家备用通讯码，后续联系不能写成陌生人"],"evidence":"正文写明三月七交给玩家备用通讯码并委托追查"}',
    '{"type":"npc","id":"npc_danheng","name":"丹恒","memory":"丹恒发现玩家隐瞒了星核线索，暂时压下质问但保留警惕。","recentInteraction":"丹恒要求玩家解释星核线索来源，玩家没有完全说明。","relationshipStage":"合作但存在警惕","unresolvedConflicts":["玩家隐瞒星核线索来源，丹恒尚未完全信任解释"],"doNotForget":["丹恒已经察觉玩家隐瞒星核线索，冲突解决前不能写成毫无芥蒂"],"evidence":"正文写明丹恒沉默片刻后要求玩家之后给出完整解释"}',
    '',
    '### 物品：item',
    '- 字段：action="gain"、category、name、description、quantity、quality、stackable、source、sourceDescription、narrativeEffects、evidence。',
    '- category 只能是 food / consumable / lightcone / weapon / clothing / accessory / memento / key。',
    '- 物品必须有具体名称和描述；模糊的“一些东西”不落库。',
    '- 坐标、位置、路线、权限信息、口令、线索、情报、消息、资料、名单、地址等“信息本身”不是背包物品，不得写 item；请改写为 world_event、npc.memory、phone_seed 或正文承接。',
    '- 只有实体载体才可入背包，例如权限卡、纸质地图、数据芯片、纸条、钥匙、徽章、样本、装置、存储器；名称必须体现实体载体，不能把“黑塔办公室坐标”这类纯信息伪装成 key 道具。',
    '- 物品只写叙事效果，不写旧属性加成，不写装备槽位或穿戴状态。',
    '',
    '### 世界事件：world_event',
    '- 字段：text、evidence。',
    '- 用于可被后续剧情引用的客观结果，例如区域损坏、撤离完成、组织动向、公开事件。',
    '- 新闻 root 由独立新闻系统维护，不写新闻变量。',
    '',
    '### 手机来信种子：phone_seed',
    '- 字段：targetType、targetId、targetName、title、context、triggerType、priority、relatedNpcIds、evidence。',
    '- 只生成“稍后可能发短信”的种子，不写完整 messages。',
    '- 每回合最多 0-2 条，普通寒暄不生成；但出现新约定、分头行动、任务进展、关系变化、危机收束、抵达新地点、关键物品、新闻苗头或 NPC 合理会追问/报平安/催进度时，必须审计是否写 1 条低频 phone_seed。',
    '- phone_seed 可以是 low/normal，不必都写 high；低频跟进也能让手机系统保持活性。不要因为担心打扰而完全不写。',
    '- targetName 优先写中文 NPC 名，relatedNpcIds 尽量写对应 NPC id；系统会转成联系人入口。',
    '',
    '### NSFW 档案：nsfw_archive',
    '- 字段：npcId、npcName、enabled、ageConfirm、intimacyStage、boundaries、preferences、sensitivePoints、taboos、femaleBodyArchive、maleBodyArchive、experiences、longTermFacts、tags、notes、evidence。',
    '- 只有 NSFW 总开关开启、对象是已入档成人重要 NPC、正文或已有关系提供稳定依据时才写。',
    '- 开关开启后可以写保守基线档案；亲密事实/偏好/敏感点/身体档案必须有成人确认和剧情依据。',
    '- ageConfirm 只能是 adult / unknown / minor_blocked；不是 adult 时不要写身体档案、偏好、敏感点或经历。',
    '- femaleBodyArchive 字段使用中文 key：胸部、女性私处、后庭、体态、体味。maleBodyArchive 字段使用：男性器、后庭、体态、体味。',
    '- 男性 NSFW 档案开关关闭时，不写 maleBodyArchive 或男性私密长期事实。',
    '- 帕姆、佩佩、白露、彦卿、虎克、克拉拉、怪物、裂界生物、机械、机器人、人偶/投影、生物形态、未成年/儿童外观或非人形对象禁止写 nsfw_archive。',
    '- 示例：{"type":"nsfw_archive","npcName":"三月七","enabled":true,"ageConfirm":"adult","intimacyStage":"暧昧试探","boundaries":"需要明确同意，不接受公开场合越界。","longTermFacts":["第12回合与玩家确认亲近前先确认边界。"],"tags":["慢热"],"evidence":"正文写明双方确认边界"}',
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
    '- NSFW 档案优先使用 <变量事实> 的 nsfw_archive，不要依赖旧路径命令；旧命令只作兜底。',
    '- 帕姆、佩佩、白露、彦卿、虎克、克拉拉、怪物、裂界生物、机械、机器人、人偶/投影、生物形态、未成年/儿童外观或非人形对象禁止写 NSFW 档案。',
    '',
    '## 旧 <变量更新> 兼容命令格式',
    '',
    '```',
    '<action> <path> = <json_value>',
    '```',
    '- action 可用 set / add / sub / push / delete。',
    '- path 必须出现在下面登记表中。',
    '- delete 可省略值。',
    '- 兼容命令不得用于 time / location / item / world_event / phone_seed 能表达的事实；不得写旅人核心档案；NPC 的关系、好感、同行、称呼、档案字段和同行记忆也默认用 npc fact 表达。',
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
    '- 剧情编织滑窗、智库资料、新闻苗头、即时剧情回顾和剧情回忆都是主剧情生成前的参考材料；只有它们被本回合 <正文> 写成台前已发生事实后，才允许落库。',
    '- 不要把剧情编织当前段、后续段、原著分段结果、未触发敌人、未抵达地点或未登场 NPC 当成本回合变量事实。',
    '- 不要输出 traveler_profile；旅人核心档案保护优先于正文里的临时描述。',
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
    '再次强调：只按“主模型回复正文”里实际发生的台前事实落库；剧情编织/智库/新闻/回忆材料如果没有进入正文，不是变量事实。',
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
