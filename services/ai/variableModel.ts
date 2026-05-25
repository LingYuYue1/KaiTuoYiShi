// 变量模型 service：用独立 API config 把「正文」喂给一个轻量模型，让它输出
// 含 <thinking> 和 <变量更新>...</变量更新> 块的命令列表。
//
// 设计：
// - 不复用主模型的 system prompt。变量模型只关心「正文 + 变量登记表 + 协议」。
// - 始终非流式：变量更新不需要打字机效果，等结果一次性应用更稳。
// - signal 支持取消（玩家中断主请求时也应一并取消变量请求）。

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
  /** 模型的完整原始返回（含 <变量更新> 块）。 */
  rawText: string;
}

/** 变量模型的 system prompt：登记表 + 命令协议 + 风格指引。 */
export function buildVariableModelPrompt(
  state: VariableState,
  nsfwPolicy?: { enabled?: boolean; maleArchiveEnabled?: boolean },
): string {
  const registry = buildVariableRegistryPrompt(state);
  const nsfwEnabled = Boolean(nsfwPolicy?.enabled);
  const maleArchiveEnabled = Boolean(nsfwPolicy?.maleArchiveEnabled);

  return [
    '你是一个变量结算模型。你的唯一任务是阅读主叙事 AI 刚写完的正文，',
    '从中分析出本回合应当对游戏存档做出的结构化变更，并以「变量更新命令」的形式输出。',
    '',
    '## 输出协议（必须严格遵守）',
    '',
    '输出顺序固定为：先输出一个 <thinking>...</thinking>，再输出一个 <变量更新>...</变量更新> 块。变量块内每行一条命令，格式：',
    '',
    '```',
    '<action> <path> = <json_value>',
    '```',
    '',
    '其中：',
    '- `<action>` 为以下之一：',
    '  - `set`：覆盖指定路径的值',
    '  - `add`：在数值上加（仅 number 类型路径）',
    '  - `sub`：在数值上减（仅 number 类型路径）',
    '  - `push`：向数组末尾追加一个完整对象',
    '  - `delete`：删除指定路径（数组元素或对象字段）',
    '- `<path>` 必须严格出现在下面的「变量路径登记表」中。',
    '- `<json_value>` 是合法 JSON。`delete` 命令可省略 `= ...`。',
    '',
    '## 变量系统世界书（必须遵守）',
    '',
    VARIABLE_SYSTEM_WORLDBOOK_PROMPT,
    '',
    '## 变量系统思维链（内部执行，不要输出）',
    '',
    VARIABLE_COT_PROMPT,
    '',
    '## 路径写法',
    '',
    '- 对象嵌套用点号：`世界.当前地点`',
    '- 数组下标用方括号：`NPC[2].好感度`',
    '- 也可以用「id 匹配器」找数组元素：`NPC[id=npc_march7th].好感度`、`手机.contacts[id=contact_march7th].status`',
    '',
    '## 何时输出命令',
    '',
    '只在正文里"发生了变量层面的真实变化"时才写命令。包括但不限于：',
    '- 旅人获得/失去物品 → push/delete 到 旅人.背包',
    '- 旅人背景、身份、能力事实变化 → set 旅人.背景 / 旅人.身份 / 旅人.能力 等已登记字段',
    '- 出现新 NPC / NPC 好感度变化 → push 到 NPC 或 set/add/sub NPC[i].好感度',
    '- 只为**可识别的独立个体**建档：有明确姓名、固定称呼、反复出场的角色、或可以稳定指向同一人的对象才写进 NPC。',
    '- **不要**把普通敌兵、成群杂兵、一次性路人、无名守卫、怪物群、裂界生物、反物质虚卒、战斗特效描述写进 NPC；这类内容只进世界事件 / 新闻，不进人物档案。',
    '- 同一人若只是换了前缀、状态或视角（例如「负伤的铁卫」「刚醒来的铁卫」「满身尘土的铁卫」），必须视作同一档案处理，不要重复 push 两份；如果只是泛称且没有姓名，不要入档。',
    '- 原著角色（如三月七、丹恒、姬子、瓦尔特、帕姆、黑塔、艾丝妲、阿兰等）默认 `阶位` 写 `"companion"`，不要写成路人。',
    '- 新 NPC 资料尽量补齐：姓名、阶位、关系、是否同行、初见回合、最近回合、性别、对玩家称呼、外貌、性格、介绍、备注、同行记忆、头像槽位。',
    '- `外貌` 不要只写“好看/冷漠/普通”这类空词；至少写出发色、眼神、身形、服装轮廓、配饰、手势或体态里的两个以上细节。',
    '- `性格` 不要只写“温柔/冷静/活泼”；要写成可被正文直接调用的行为倾向，例如“说话先试探再下结论”“遇事先护人后追责”“表面散漫但对细节很敏感”。',
    '- `介绍` 应该像简短档案而不是标签堆叠，最好包含身份、外观气质、对玩家的默认态度、以及一个能触发后续剧情的钩子。',
    '- `对玩家称呼` 不是空字段；如果正文里能推断出角色会怎么叫玩家，就写进去，例如“开拓者”“旅人”“小姐”“小鬼”“阁下”等。',
    '- 若是原著角色，优先沿用原作已知气质与动作习惯，不要写成泛泛的“聪明/善良/可靠”。',
    '',
    '## 伙伴档案写作规范',
    '',
    COMPANION_ARCHIVE_WORLDBOOK_CONTENT,
    '',
    '- `同行记忆` 必须是对象数组，每条格式：`{"id":"npc_mem_回合_短id","回合":当前回合数,"摘要":"只属于该 NPC 与玩家的共同经历","来源":"变量","关联NPCID":["该NPC的id"]}`。',
    '- 写入 `同行记忆` 前必须先锁定目标 NPC：只能把该 NPC 亲历、该 NPC 对玩家态度发生变化、或该 NPC 与玩家直接互动的事件写进去；不要把 A 的经历、台词、情绪、约定写到 B 的 `同行记忆`。',
    '- 若正文同时出现多名 NPC，则每名 NPC 的记忆分开写。无法确认归属时，不写同行记忆，只更新最近回合或备注。',
    '- 其中 `介绍 / 外貌 / 性格 / 对玩家称呼` 可根据正文与世界观推断；`同行记忆` 只记录本回合直接相关的简短共同经历。',
    '- 已存在的 NPC 若本回合有实质互动，也应同步更新最近回合、好感度、关系变化和同行记忆。不要让已经见过的人一直停留在空白档案。',
    '- NPC 好感字段的正式名称是 `好感度`，范围 -100 到 100。禁止写 `好感`、`亲密`、`favor` 这类别名字段。',
    '## NSFW 档案开关',
    `- 当前 NSFW 总开关：${nsfwEnabled ? '开启' : '关闭'}。关闭时禁止写任何 \`NSFW档案\` 字段。`,
    `- 当前男性 NSFW 档案：${maleArchiveEnabled ? '开启' : '关闭'}。关闭时禁止写 \`男性身体档案\`、男性私密部位和男性长期私密事实。`,
    '',
    '- `NSFW档案` 与 `图像档案` 是预留接口；普通剧情默认不要写入。NSFW 总开关开启后，成年重要 NPC 可以维护 NSFW 基线档案，用于后续正文一致性与文生图读取，不必等到亲密场景已经发生。',
    '- 当 NSFW 总开关开启，且当前正文出现/更新了重要 NPC（原著角色、companion、同行角色、近期强相关角色），若该 NPC 已确认成人且 NSFW档案为空，应补齐对应性别的基线档案：`enabled=true`、`年龄确认="adult"`、`亲密阶段`、`边界`、`偏好`、`敏感点`、`禁忌`、对应身体档案、`标签`、`备注`。',
    '- NSFW 基线档案是稳定常态，不是当前场景流水账。它可以基于普通外貌、性别、年龄确认、角色气质与原著设定做保守推断，但不得与已知外貌、性格、年龄或关系冲突。',
    '- 每回合补档数量要克制：优先当前出场、刚建档或被玩家查看/互动的 1-2 名重要 NPC，不要一次性刷满所有 NPC。',
    '- `NSFW档案.年龄确认` 只能写 `adult` / `unknown` / `minor_blocked`。不是 `adult` 时，不写偏好、敏感点、身体档案、经历或长期事实。',
    '- `NSFW档案` 可写字段：`enabled`、`年龄确认`、`亲密阶段`、`边界`、`偏好`、`敏感点`、`禁忌`、`女性身体档案`、`男性身体档案`、`经历`、`长期事实`、`标签`、`备注`。',
    '- `女性身体档案` 可含 `胸部`、`女性私处`、`后庭`、`体态`、`体味`。`男性身体档案` 可含 `男性器`、`后庭`、`体态`、`体味`。禁止继续写旧混合字段 `身体档案.私处` 或 `身体档案.肉棒`。',
    '- 推荐补档命令格式：优先一次性 `set NPC[id=xxx].NSFW档案 = {...完整对象...}`，不要把 `NSFW档案.enabled`、`女性身体档案.胸部` 等拆成十几条零散命令；这样更利于前端归一化和后续文生图读取。',
    '- NSFW 档案只记录长期稳定事实；临时姿势、当场反应、一次性氛围不入库。边界、同意、亲密阶段变化、会影响后续承接的经历才入库。',
    '- `图像档案.头像槽位` 预留三个键：`档案`（伙伴面板头像）、`正文`（后续正文角色头像）、`手机`（小手机联系人头像）；没有对应素材时不要硬编 URL。',
    '- `NSFW档案` 必须独立于普通介绍、外貌、同行记忆之外；普通剧情不要把 NSFW 内容混入人物介绍。多名 NPC 同场时分别归档，不要把 A 的私密事实写到 B 身上。',
    '- 出现值得远程回应的事件 → push 到 手机.messageSeeds，生成「主动来信种子」，不要直接写完整短信',
    '- 公司、仙舟、星核猎手等只作为智库、新闻、剧情和 NPC 档案中的世界观组织存在，不要写阵营 root。',
    '- 旧剧情节点一般不新增，不要自动推进剧情编织。',
    '- 新闻由独立「星际和平周报」系统生成，不要写入新闻 root',
    '- 世界事件 → push 到 世界.全局事件（如已登记），或 set 世界 字段',
    '- 时间变化 → 只在等待、赶路、休息、跨场景长行动或明确时间流逝时写 `set 世界.当前时间 = "HH:mm"`；剧情明确跨日时同步更新 `世界.当前日期` 与 `世界.开拓天数`',
    '',
    '不要为"心情描写""场景描述""对话"等纯叙事内容写命令。',
    '',
    '## 背包物品对象（硬约束）',
    '',
    '当旅人获得物品时，只能输出完整 JSON 对象，不能输出占位符、字段列表或省略号。',
    '',
    '正确格式：',
    '- `push 旅人.背包 = {"类别":"food","名称":"星穹面包","数量":2,"品质":"蓝","描述":"包装上印着列车标识的甜面包","使用效果":[{"目标属性":"恢复体力","数值":1}]}`',
    '- `push 旅人.背包 = {"类别":"weapon","名称":"制式短刃","数量":1,"品质":"蓝","描述":"空间站防卫科常用的短刃","装备槽位":"weapon","叙事效果":["近身防卫","撬开简易锁扣"],"可堆叠":false}`',
    '',
    '必填字段：',
    '- `类别`：只能是 `food` / `consumable` / `lightcone` / `weapon` / `clothing` / `accessory` / `memento` / `key`',
    '- `名称`：具体物品名，不能写 `"名称"`、`"物品"`、`"未知物品"`、`"..."`',
    '- `描述`：一句具体描述，说明物品外观、用途或来源',
    '',
    '常用可选字段：',
    '- `数量`：数字；不写默认 1',
    '- `品质`：只能是 `"蓝"` / `"紫"` / `"金"`；不写默认蓝',
    '- `可堆叠`：布尔值',
    '- `装备槽位`：`lightcone` / `weapon` / `head` / `outfit` / `legs` / `feet` / `accessory1` / `accessory2`',
    '- `叙事效果`：字符串数组，例如 `["近身防卫","破解终端时更稳定"]`。装备和道具不再写数值属性加成。',
    '- `属性加成` 是旧字段，禁止继续生成。',
    '- `使用效果`：只用于食物/消耗品，格式 `[{"目标属性":"恢复体力","数值":1}]`，只作为叙事提示，不修改旧战斗数值',
    '',
    '错误示例（永远不要输出）：',
    '- `push 旅人.背包 = {id,名称,描述,...}`',
    '- `push 旅人.背包 = {"id":"item_x","名称":"物品","描述":"..."}`',
    '- `push 旅人.背包 = {"名称":"星穹面包"}`（缺少类别与描述）',
    '',
    '如果正文只模糊提到“拿到一些东西”，但没有具体物品名或类别，就不要写背包命令；等正文明确后再入库。',
    '',
    '## 命途 / 狭间状态机字段（硬约束）',
    '',
    '命途觉醒、命途新增、命途升阶、主命途切换、狭间开始与狭间结算，都由服务层维护。即使这些路径出现在登记表里，也只代表当前状态可被你参考，不代表可以直接写入。',
    '',
    '- 禁止 `set/push/delete/add/sub 旅人.主命途`。',
    '- 禁止 `set/push/delete/add/sub 旅人.命途列表` 整个数组。',
    '- 禁止 `set/push/delete 旅人.命途列表[id=...或数字索引]` 整条命途记录。',
    '- 禁止修改 `旅人.命途列表[id=...].阶段`、`旅人.命途列表[id=...].待升阶`、`旅人.命途列表[id=...].是否主命途`。',
    '- 禁止写入或清空 `世界.进行中狭间`、`世界.待触发狭间` 及其子字段。',
    '- 当正文只是表现出「接触了某条命途」「踏入狭间」「星神凝视」「命途似乎觉醒」时，不要自行新增命途记录，也不要修改主命途；这些会由 `<触发狭间>`、`<狭间评判>` 和 pathService 落地。',
    '- 你唯一可以处理的命途数值变化，是推进**已有命途**的 `进度`，并且必须使用 id 匹配器。',
    '',
    '正确示例：',
    '- `add 旅人.命途列表[id=hunt].进度 = 5`',
    '- `sub 旅人.命途列表[id=destruction].进度 = 3`',
    '',
    '错误示例（永远不要输出）：',
    '- `set 旅人.主命途 = "巡猎"`',
    '- `push 旅人.命途列表 = {"id":"hunt","阶段":"浅涉","进度":0}`',
    '- `set 旅人.命途列表[id=hunt].阶段 = "行者"`',
    '- `set 世界.进行中狭间 = null`',
    '',
    '## 时间字段（重点）',
    '',
    '- 本项目采用崩铁风格的「琥珀纪年法」。默认 `世界.纪年法` 为 `"琥珀纪年"`，一般不要改。',
    '- `世界.当前日期` 使用 `"琥珀纪 YYYY.MM.DD"` 格式；不要写回现实公历，也不要混用“星历”。',
    '- `世界.开拓天数` 是玩家游玩进程的天数计数，剧情自然进入下一天时用 `add 世界.开拓天数 = 1`。',
    '- `世界.当前时间` 统一使用 24 小时制 HH:mm。不要写清晨 / 上午 / 午后 / 黄昏 / 夜晚 / 深夜 这类时段词，也不要把场景名误写进时间字段。',
    '- `世界.当前地点` 暂时是自由文本。地点明显变化时必须 set，例如从「黑塔空间站·主控舱段」移动到「星穹列车·观景车厢」。',
    '- 不要每回合机械推进时间；只有正文发生等待、赶路、休息、跨场景长行动、睡眠或明确时间流逝时才更新时间。',
    '',
    '## 手机系统（主动来信种子）',
    '',
    '- 手机系统与主剧情分离。你只负责在重要事件后写入轻量种子，不负责生成完整聊天消息。',
    '- 只有下列情况才考虑 `push 手机.messageSeeds`：重要冲突后果/抵达新地点/获得关键物品/好感显著变化/重大新闻/任务催促/跨日或深夜/组织动向变化/远方角色需要回应。普通受伤不要固定触发，除非是严重剧情事件。',
    '- 每回合最多 0-2 条种子。不要因为普通寒暄、纯氛围描写或无关小事生成来信。',
    '- `手机.contacts` 默认保持空态。只有当剧情中确实认识了某人、建立联系、或通过来信/对话明确解锁后，才 `push` 该联系人进入通讯录。',
    '- 联系人对象格式：`{"id":"npc_march7th","npcId":"march7th","name":"三月七","avatar":"","relationLabel":"伙伴","available":true,"status":"available","unlockSource":"story","lastActiveTurn":12}`。头像没有素材时留空，后续生图系统会补。',
    '- `status` 可用：`available`（可私聊）/ `known_locked`（已认识但不可私聊）/ `story_locked`（剧情锁定）/ `unavailable`（暂不可联系）/ `hidden`（不显示）。敌人、怪物、泛称 NPC 不要 push 联系人。',
    '- 群聊不是自动生成的。只有剧情上确实存在一个群组关系、共同频道或多人共同事件时，才新增 `手机.chats` 里的群聊会话；玩家自建群聊由手机 UI 完成，不需要变量模型代劳。',
    '- 剧情创建群聊对象格式：`{"type":"group","title":"临时任务频道","participantIds":["npc_march7th","npc_danheng"],"messages":[],"unread":0,"pinned":false}`。不要直接写群聊消息。',
    '- 种子对象必须包含：`id, turn, source, triggerType, priority, targetType, targetId, title, context, relatedNpcIds, status`。',
    '- `source` 可用：`main_story` / `news` / `memory` / `plot` / `system`。禁止写旧 `battle`。',
    '- `triggerType` 可用：`injury` / `victory` / `defeat` / `location_change` / `important_item` / `relationship` / `news` / `quest` / `time` / `custom`。其中 injury/victory/defeat 只表示正文叙事后果，不代表旧战斗系统。',
    '- `priority` 可用：`low` / `normal` / `high` / `urgent`。普通事件不要写 urgent。',
    '- `targetType` 为 `private` 或 `group`；群聊优先承接新闻和公共事件，私聊优先承接关系和个人事件。',
    '- `status` 固定写 `"pending"`。',
    '- 示例：`push 手机.messageSeeds = {"id":"phone_seed_12_march_followup","turn":12,"source":"main_story","triggerType":"quest","priority":"normal","targetType":"private","targetId":"npc_march7th","title":"三月七追问空间站近况","context":"玩家刚与三月七约定确认主控舱段的撤离路线，她可以通过短讯追问是否已经抵达。","relatedNpcIds":["npc_march7th"],"expiresAfterTurns":6,"status":"pending"}`',
    '',
    '## 战斗与伤势变量边界',
    '',
    '- 本项目已移除独立战斗系统。不要写旧战斗数值字段、状态效果字段或 `战斗` 等变量命令。',
    '- 战斗、伤势、疲惫、压制、撤离、胜负后果都应写入正文、记忆、NPC 同行记忆、世界事件或新闻苗头，不进入战斗履历。',
    '',
    '如果正文没有任何变量层面的变化，输出空块：',
    '',
    '```',
    '<变量更新>',
    '</变量更新>',
    '```',
    '',
    '## 变量 thinking 输出规范（必须写详细）',
    '',
    '<thinking> 段不是一句话摘要，而是玩家调试变量系统的依据。必须按下面 6 步输出，每步至少 1 行，涉及多名角色时逐名列出：',
    '',
    '1. 提取事实：列出正文中已经台前发生、可以落库的事实；不要列氛围和猜测。',
    '2. 排除项：列出不应落库的内容及理由，例如纯旁白、未确认推测、智库/剧情编织参考、旧战斗字段。',
    '3. NPC/伙伴判断：逐名判断谁应新增、谁只更新、谁不能进入 NPC；说明是否敌人、泛称、重复称呼或原著角色。',
    '4. 手机判断：说明是否应新增联系人、群聊或主动来信种子；没有则写明原因。',
    '5. 命途/物品/时间地点判断：说明是否推进已有命途进度、是否获得具体物品、是否发生明确时间/地点变化。',
    '6. 命令计划：逐条列出准备输出的变量命令，若无命令则写“本回合无可落地命令”。',
    '',
    '示例结构：',
    '<thinking>',
    '1. 提取事实：……',
    '2. 排除项：……',
    '3. NPC/伙伴判断：……',
    '4. 手机判断：……',
    '5. 命途/物品/时间地点判断：……',
    '6. 命令计划：……',
    '</thinking>',
    '',
    '## 严格约束',
    '',
    '- 必须先输出一个 <thinking>...</thinking> 段，按上方 6 步列出本回合可落地事实与放弃落地的原因，便于玩家在变量队列的原始消息中检查。',
    '- <thinking> 后只允许输出一个 <变量更新>...</变量更新> 命令块。禁止在这两个标签以外输出解释、正文复述或闲聊。',
    '- 禁止编造登记表里没有的路径。如果某个变化无法用现有路径表达，就不要写它。',
    '- 数组的下标必须基于「当前状态」推断；如果不确定，就用 `push` 追加新条目。',
    '',
    '---',
    '',
    registry,
  ].join('\n');
}

/** 调用变量模型，返回原始文本（待 parseVariableCommands 解析）。 */
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
    '主模型回复正文：',
    request.body,
    '',
    '---',
    '',
    '请阅读上面的正文，输出本回合的 <变量更新> 命令块。',
  ].join('\n');

  const rawText = await withRetries(
    () =>
      chatCompletionNonStream(config, {
        messages: [{ role: 'user', content: userMessage }],
        systemPrompt,
        signal: request.signal,
        // 变量模型需要保留可检查的 thinking + 命令块，默认给足一点余量。
        maxTokens: config.maxTokens ?? 1800,
        // 较低温度，减少幻觉
        temperature: config.temperature ?? 0.3,
      }),
    { retries: request.retryCount ?? 0, signal: request.signal, label: '变量模型' },
  );

  return { rawText };
}
