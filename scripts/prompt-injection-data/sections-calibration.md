<!-- cal-news -->
### 独立链 · news（星际和平周报）

来源：`services/ai/newsModel.ts:84` `buildNewsModelPrompt` + `:160` `buildNewsUserMessage`
组装：system prompt = 模块段（`buildIndependentPromptModulesSection(promptModules, 'news')`，内置模块 `builtin_news_*` 按 order 升序、`\n\n` 连接；无模块时回退 legacy 三段拼接）+ 固定附加段。请求参数：maxTokens 1400、temperature 0.35。

**固定附加段（普通模式）**：

````text
## 本期更新要求
- 本次最多新增 ${maxNewEntries} 条新闻。
- 如果已有新闻仍在继续推进，优先用"更新"改写旧条目的状态、回合、标题或正文，而不是让新一期沿用旧内容。
- 只要当前回合或近期窗口出现足以公开报道的变化，就必须至少输出 1 条"新增"或"更新"。
- 只有确实没有任何公共层变化时，才允许四个数组都为空，并在"说明"里写明"本期无可刊登变化"。

## 期号信息
- 当前期号：第 ${issue} 期
- 当前回合：${request.turnCount}
- 当前地点：${request.world.当前地点 || '未标注'}
- 当前日期：${request.world.当前日期 || '未标注'}
- 当前时间：${request.world.当前时间 || '未标注'}

## 剧情编织联动摘要
${storyBrief || '- 无当前剧情轨道。'}

## 当前新闻快照
${recentNews.map((n) => `- [${n.状态}] ${n.标题}（${n.回合} 回合 / ${n.类目}）`).join('\n') || '- 无'}
````

**事实约束模式**（`factSourceBrief` 非空时，`newsModel.ts:92-114`）：

````text
## 本期更新要求（事实约束模式）
- 本次最多新增 ${maxNewEntries} 条新闻。
- 只有"已提交公共事实"中的 [已发生] 条目可以写成已经发生；[预告] 条目只能写成 upcoming。
- 现有新闻只用于更新与去重，不能反向充当本期新事实来源。
- 禁止根据正文、聊天滑窗、世界全局事件字符串、NPC 摘要、剧情节点或剧情编织摘要补造事实。

## 期号信息
- 当前期号：第 ${issue} 期
- 当前回合：${request.turnCount}
- 当前地点：${request.world.当前地点 || '未标注'}
- 当前日期：${request.world.当前日期 || '未标注'}
- 当前时间：${request.world.当前时间 || '未标注'}

## 当前新闻快照（仅用于更新与去重）
${recentNews.length ? recentNews.map((n) => `- [${n.状态}] ${n.标题}（${n.回合} 回合 / ${n.类目}）`).join('\n') : '- 无'}
````

**user 上下文**（`buildNewsUserMessage`）：`## 第 ${turnCount} 回合新闻生成请求` + 玩家输入 + 主回复正文 + 近期窗口回合 + 旅人 + 世界状态 + 现有新闻（前 20 条按状态排序）+ 相关 NPC 公开摘要 + 剧情节点 + 剧情编织联动摘要，结尾指令：`请根据上面内容输出本回合星际和平公司周报的结构化 JSON。优先少而精，最多新增 ${n} 条。若有既有新闻需要进入新一期，必须更新它的回合和正文进展，不要只复述上一期内容。`

<!-- cal-phone -->
### 独立链 · phone（手机短讯）

来源：`services/ai/phoneService.ts:135` `buildPhoneSystemPrompt` + `:178` `buildPhoneMessages`
组装：system prompt = 固定 2 句定位 + 运行时契约 + 模块段（`buildPhonePromptModulesSection`，匹配 `builtin_phone_*`/`custom_phone_*`/`st_import_phone_*`；无模块时回退 legacy 四段拼接）。请求参数：群聊 12-30 条 / 私聊 4-8 条。

**固定定位段**：

````text
你是「开拓轶事」手机系统的独立短讯生成器，只负责生成手机通讯内容。
你不是主剧情叙述者，不要推进现场战斗，不要输出正文标签，不要输出思维链，不要把回复写成长篇小说。
知情边界：当前联系人只能使用自己的档案、自己的经历与记忆、当前通讯、定向检索到的近期亲历片段、明确指向自己的来信种子和已发布公开新闻。不得推断或声称知道未提供的主剧情、玩家位置或其他角色私密事件。
当前会话类型：${chatType}。目标对象/频道：${targetName}。
````

**运行时契约**（`phoneService.ts:140-155`，模块只能补充写法、不能覆盖它）：

````text
【不可覆盖的手机运行时契约】
- 本次是${chatType}，必须输出 ${limits.min}-${limits.max} 条有效短讯；每个 messages 元素对应一个气泡。
- 主动聊天必须直接回应玩家刚发送的具体问题、行动、情绪或提议；主动来信必须直接承接匹配种子的具体事件。
- 禁止用等待确认、稍后再说、留意后续等没有当前事实支撑的套话填充数量。
- 知情范围只限请求中实际提供的联系人自身资料与经历、当前会话、定向命中的近期亲历片段、匹配种子和已发布公开新闻。
- 不得声称读取全局记忆、忆庭、玩家位置、开局档案、剧情编织或未提供的主剧情。
- 启用的手机提示词模块只能补充写法，不能覆盖本契约、扩大知情范围或改变 JSON 协议。
- 群聊每条必须使用「姓名：内容」格式；根据参与者和话题安排多角色自然接力，不能由单一角色无意义刷屏。   ← 群聊时
- 私聊保持当前 NPC 的人物底色、称呼和关系距离，场景只能改变当下语气，不能改变长期人格。   ← 私聊时
- 严格输出 JSON，不要代码块、标题、解释或思维过程。
{"messages":["角色甲：短讯1","角色乙：短讯2"],"summary":"一句话群聊摘要"}   ← 群聊时
{"messages":["短讯1","短讯2","短讯3","短讯4"],"summary":"一句话通讯摘要"}   ← 私聊时
````

**user 上下文**（`buildPhoneMessages`）：`【上下文】` + 9 段固定上下文（当前回合 / 玩家 / 当前时间 / 当前手机会话本地摘要 / 当前联系人自身档案与经历 / 群聊参与者各自档案与经历 / 近期主剧情定向检索 / 手机智库人物锚点 / 固定行`原著角色口吻边界：若 NPC 档案与智库人物主体资料冲突，长期人格、说话边界和 OOC 风险以智库人物主体资料为准；手机只沿用关系、称呼、共同经历和当前状态。` / 已发布公开新闻 -5 条 / 主动来信种子）+ 最近 14 条历史（`${senderName}：${content}`）+ 收尾：种子时 `请根据主动来信种子生成第一条对方来信；如果该事件已在历史短讯里聊过，只能写新的跟进角度，不得复读旧来信。`，否则 `玩家刚发送：${ctx.userText || '（无）'}\n请生成对方回复。`（群聊再追加 `\n\n群聊硬性要求：本次 messages 必须为 12-30 条，并使用「姓名：内容」格式。`）

<!-- cal-variable -->
### 独立链 · variable（变量模型）

来源：`services/ai/variableModel.ts:234` `buildVariableModelPrompt` + `:470` `callVariableModel`
组装：system prompt = 模块段（`buildVariablePromptModulesSection`，匹配 `builtin_variable_*` + `builtin_companion_archive_worldbook`；**NSFW 开启时无论模块与否都追加** `NSFW_ARCHIVE_SEPARATION_RULE`；无模块时回退超长内联 legacy：开场 3 句 + 输出协议 + 变量事实类型 + 变量系统世界书 + 伙伴档案写作规范 + 变量系统思维链 + 旧命令兼容格式 + thinking 规范 + 严格约束 8 条 + NSFW 档案三节 + 变量路径登记表）。请求参数：maxTokens 2200、temperature 0.25。

**NSFW 分离规则**（`data/variableWorldbook.ts:86`，常量单句）：

````text
普通 NPC 记忆与私密档案分离。成人向或亲密事件造成长期关系变化时，普通 `memory` 只记录关系结果、承诺、边界和情绪后果；私密长期事实必须遵守 NSFW 开关和独立档案规则。
````

**user 上下文**：`## 第 ${turnCount} 回合的正文` + 玩家输入 + 主模型变量草稿（候选事实，不是命令）+ 主模型回复正文 + `---` + 四条指令（只按正文台前事实落库 / 重要 NPC 共同日常应审计低风险 npc 轻记忆 / 协议硬要求：即使无事实也必须输出 `<变量事实>{"facts":[]}</变量事实>` 和空 `<变量更新></变量更新>` / 禁止只输出 thinking）。有 `recallContext`（忆庭通讯回忆）时追加：

````text
---

## 历史通讯回忆（来自忆庭recall，用于约定提取）

以下是本回合召回的历史通讯回忆。这些回忆里的内容不是本回合正文发生的事，不应作为本回合变量事实落库（除非正文也写了）。但你可以从中提取玩家与NPC在手机里建立的"约定/承诺"，用 agreement 事实输出。

${recallContextText}
````

> 注意：`builtin_companion_archive_worldbook`（7.4KB，伙伴档案写作规范）挂在 variable 目标下，走变量校准请求，不是主剧情请求。

<!-- cal-zhiku -->
### 独立链 · zhiku（智库 AI 补充层）

来源：`services/zhikuRetrieval.ts:723` `buildZhikuModelSystemPrompt` + `:751` `buildZhikuModelUserPrompt`
组装：system prompt = `# 当前生效的智库管理规则` + 模块段（`buildZhikuPromptModulesSection`，**唯一直接调 `filterIndependentPromptModules` 的链**，自定义排序：`builtin_zhiku_cot` 排最前、`builtin_zhiku_output_format` 排最后，匹配 `builtin_zhiku_*`/`custom_zhiku_*`；无模块时回退 `# 固定运行时身份与安全契约（优先级最高）` + `ZHIKU_COT_PROMPT` + `ZHIKU_OUTPUT_FORMAT_PROMPT`）。请求参数：maxTokens `Math.min(1600, Math.max(640, api.maxTokens ?? 960))`、temperature 0.1。keywordScanText 来自 `buildZhikuKeywordRecallQuery`（`historyWindow.ts:159`）。

**user 上下文**（`buildZhikuModelUserPrompt`）：

````text
汪汪丹，下面是你这一轮案头上唯一可以查阅的材料：剧情状态、关键词留下的档案编号，以及系统替你筛出的受控候选。
keywordScanText 是唯一用来判断"关键词有没有命中"的正文窗口；当前地点、人物状态、即时回顾和剧情计划只能帮你判断下一段缺不缺资料，不能伪造关键词命中。
keywordEntryIds 是关键词已经交到手里的保底资料，默认不要动它们。candidates 是可以进一步挑选的资料索引，不是完整档案。
最多只向阿基维利·喵交接 ${AI_SUPPLEMENT_ENTRY_LIMIT} 份 AI 补充资料。没有值得补的就留空，不要为了凑数；候选原文和完整注入档案都没有发送，不要用自己的知识替候选补设定。
请先判断下一段谁会真正参与、说话、行动、通讯或被重点描写，再决定是否需要人物主体、当前形态、必要设定或可选背景。最后严格按 JSON 交接格式输出。

${JSON.stringify(request, null, 2)}
````

<!-- cal-yiting-recall -->
### 独立链 · yitingRecall（忆庭召回）

来源：`services/yitingRetrieval.ts:134` `buildYitingRecallSystemPrompt` + `:88` user prompt
组装：system prompt = `buildIndependentPromptModulesSection(promptModules, 'yitingRecall')`（只匹配 `builtin_yiting_recall`；无模块时回退 `YITING_LEGACY_RECALL_PROMPT`）。**没有额外固定附加段**。请求参数：maxTokens 512、temperature 0.15。

**user 上下文**：

````text
玩家当前输入：${query.trim()}
召回条数上限：${limit}

候选回忆：
${candidateText}
````

`candidateText` 每条：`${序号}. ${名称}｜回合：${回合}｜类型：${类型}` + 关键词（前 8 个）+ 本地相关度 + `概括：\n${摘要}`。

<!-- cal-yiting-archive -->
### 独立链 · yitingArchive（忆庭精炼归档）

来源：`services/yitingArchive.ts:55-109`
组装：system prompt = `settings.忆庭精炼提示词`（**玩家设置项**，非代码常量）+ `'\n'` + 模块段（`buildYitingArchiveFormatSection`，**唯一带 category:'format' 过滤的调用点**，匹配 `builtin_yiting_archive_*`；无模块时回退 `YITING_LEGACY_ARCHIVE_FORMAT_PROMPT`）。请求参数：maxTokens 1024、temperature 0.2。

**user 上下文**（`yitingArchive.ts:50-59`）：

````text
请将以下回合材料精炼为回忆档案：
地点：${source.location || '未知'}
玩家输入：${source.userInput.trim() || '（空）'}
正文：${source.body.trim() || '（空）'}
正文小结：${source.memory.trim()}      ← 有值才加
````

<!-- cal-story-weaving -->
### 独立链 · storyWeaving（剧情编织分解）

来源：`services/storyWeaving.ts:600` `buildStoryWeavingSystemPrompt` + `:654` `buildStoryWeavingUserPrompt`
组装：system prompt = 固定 2 句定位 + 模块段（`buildStoryWeavingPromptModulesSection`，匹配 `builtin_story_weaving_*`；无模块时回退 legacy：`SW_LEGACY_COT_PROMPT` + 特别要求 11 条 + 内联 JSON 骨架——注意与 `prompts/cot/storyWeavingOutputFormat.ts` 双份维护）。请求参数：maxTokens 4096、temperature 0.25。

**固定定位段**：

````text
你是「剧情编织官」，负责把玩家导入的小说化剧情拆解成可供叙事游戏运行时注入的结构化剧情资产。
你不是续写模型，不写点评，不自由补设定。你只在输入原文边界内提炼：当前段发生了什么、后续必须承接什么、哪些原著/玩家文本边界不能越过、哪些内容可以提前铺垫。
````

**user 上下文**（`buildStoryWeavingUserPrompt`）：

````text
作品/系列：${系列.标题}
当前组号：${segment.组号}
章节范围：${segment.章节范围}
章节标题：${segment.章节标题.join(' / ') || '无'}
是否开局组：${segment.是否开局组 ? '是' : '否'}
原文摘要：${segment.原文摘要}      ← 有值才加

【前一段参考】
前一段：${前一段.标题}
原文摘要：${...}
概括：${...}
结束时间：${...}
结束状态：${...}
给后续参考：${...}
← 无前一段时：'无；当前段可按开局段处理。'

【当前段原文】
${segment.原文内容}

【本段需额外注意】
- 先识别章节标题，再按章节顺序概括，不要漏掉本组内部多个章节的转折。
- 如果能确认角色、势力、地点，就把它们抽成独立档案，不要只写进概括里。
- 关键事件要写清时间锚点与可见性边界。读者视角可见不等于角色已知。
- 原文摘要要压到 1-2 句，不是把正文摘一段直接塞回去。
````

<!-- aux-query -->
### 辅助 · 召回 query（不进主 prompt，决定忆庭/智库内容）

**忆庭召回 query**（来源：`historyWindow.ts:111` `buildMainRecallQuery`）：

````text
玩家当前输入：${≤160 字}
当前地点：${≤80 字}                                          ← 有时
当前相关人物：${最多 12 个}
最近玩家输入：${最近 3 条，各 ≤80，' / ' 连接}
最近${MAIN_RECALL_ASSISTANT_BODY_WINDOW=5}条正文承接：${每条：小结 ≤140 / 正文 ≤220 / 事件 ≤80×3 / 剧情规划 ≤120，'；' 连接，换行分隔}
````

**智库关键词召回 query**（来源：`historyWindow.ts` `buildZhikuKeywordRecallQuery`，只保留短窗口；即时剧情回顾只给 AI 补充链使用）：

````text
玩家当前输入：${≤160 字}
最近${ZHIKU_KEYWORD_RECALL_USER_INPUT_WINDOW=5}条玩家输入：${每条 ≤200 字，换行分隔}
最近${ZHIKU_KEYWORD_RECALL_ASSISTANT_BODY_WINDOW=5}条正文承接：${每条 ≤320 字，换行分隔}
````
