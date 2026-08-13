<!-- aux-01 -->
### A1 · 天气判断片段

来源：`data/weatherRules.ts:118` `构建天气Prompt片段`（`sendWorkflow.ts:2167` 无条件追加）
拼接方式：`'\n\n'`（不是 `\n\n---\n\n`）拼在 system prompt 末尾——唯一一个不带 `---` 分隔的段。标题层级是 `##` 而非 `#`。
条件：无条件追加。可用天气来自 `获取地点可用天气(地点)`：地点命中 `地点天气白名单`（雅利洛/贝洛伯格/永冬/冰城/黑塔空间站/螺丝星/空间站/仙舟/罗浮/沙漠/荒漠/火山/匹诺康尼/都市）关键词则用白名单，否则用默认列表（晴/多云/阴/小雨/大雨/以太雾）。

````text
## 天气判断

当前地点：${地点 || '未知'}
上一回合天气：${天气中文名}                    ← 有当前天气时
当前天气：未知（新开局）                        ← 无当前天气时
此地可用天气：${emoji 天气名、emoji 天气名、…}

请根据当前剧情氛围和地点特征，判断本回合天气。
- 如果剧情没有明显天气暗示（如“下雨了”“风雪交加”“星空璀璨”），保持上一回合天气不变
- 不要频繁切换天气（至少持续 3-5 回合）
- 命名必须严格从「此地可用天气」中选择，不要自创天气名
- 你的输出末尾必须包含 `<天气>天气名</天气>` 标签（天气名用中文，如 `<天气>暴风雪</天气>`）
````

14 种天气定义（`data/weatherRules.ts:33-52`）：晴☀️ / 多云⛅ / 阴☁️ / 小雨🌧️ / 大雨⛈️ / 雪❄️ / 暴风雪🌨️ / 星尘暴🌌 / 裂隙风💨 / 以太雾🌫️ / 极光🌠 / 能量雨💠 / 数据风暴🌀 / 星海潮汐🌊。

<!-- aux-02 -->
### A2 · 重roll生成约束

来源：`sendWorkflow.ts:2180-2193`（system prompt 尾部追加）
拼接方式：`'\n'` 连接、以空行接在 system prompt 后。
条件：仅重roll回合，且非开局触发。

````text
# 重roll生成约束
本次请求是玩家对上一版回复的重roll。重roll nonce: ${nonce}
必须基于同一事实起点重新组织镜头、描写、对话和节奏；禁止复用上一版回复的具体段落、句式、变量草稿或行动选项。
开场方式、对白切入、段落顺序和结尾钩子都要换；不要复用上一版前三句、连续短语或相同收束。
可以保留必要事实一致性，但正文展开方式必须明显不同；如果上一版已经处理某事件，本次不得因为重roll而把旧副作用当作已发生事实。
上一版回复摘录（仅用于避重复，不是当前事实）：${compactForRerollInstruction(previousResponse)}   ← 有上一版时
````

> 同一回合还会在 apiMessages 末尾再推一条 `buildRerollGenerationGuard`（见 B5），两块内容语义重复、措辞不同——待修项（第2项内容问题）。

<!-- aux-03 -->
### A3 · ST 方案 B/D 追加

来源：`mainRequestFinalizer.ts:75-93`（`finalizeMainRequest` 内）
条件：`position=0` 的 user/assistant 模块消息（方案 B）以 `'\n\n---\n\n'` 追加到 system prompt 尾部；Claude 下 `position=1` 的 depth 模块也走此通道。内置 53 个模块**全部是 system role**，所以这一块只对导入的 ST 预设生效，主剧情自身不产生内容。

<!-- msg-00 -->
### B0 · CoT 伪装历史

来源：`mainRequestFinalizer.ts:9-25` `MAIN_COT_FAKE_HISTORY`（经 `finalizeMainRequest.leadingMessages` `unshift` 到 apiMessages 队首）
条件：`settings.enableCotFakeHistory && !isOpeningSystemTrigger && !deepSeekMainActive`。

````text
user: 开始任务

assistant:
<thinking>
- 系统就绪。当前任务：等待玩家发送指令后按 4 标签协议输出（thinking / 正文 / 短期记忆 / 动态世界）。
- 在收到首条具体指令前不输出正文，本条仅为格式确认。
</thinking>

<正文>
（待命中：等待玩家发起首回合）
</正文>

<短期记忆>
</短期记忆>

<动态世界>
</动态世界>
````

> 这里写的是「4 标签协议」，但主协议实际有 5 个必输标签（多 `<变量草稿>`），伪装历史里也没有 `<变量草稿>` 块——待修项（第3项内容问题）。

<!-- msg-01 -->
### B1 · 历史窗口（含 assistant 压缩）

来源：`sendWorkflow.ts:2231-2241` + `historyWindow.ts:58` `buildLeanAssistantHistoryContent`
条件：恒定。`getMainHistoryWindow` 取**最近 20 条**（`MAIN_HISTORY_LIMIT_WITH_MEMORY` 与 `MAIN_HISTORY_LIMIT_WITHOUT_MEMORY` 同为 20）。`[系统]` 前缀 user 消息跳过；user 消息原样 push；assistant 走压缩模板。

每条历史 assistant 消息被替换成（块间 `'\n\n'`）：

````text
# 历史 assistant 压缩摘要

- 这是旧回合 assistant 历史压缩，只用于承接最近语气、动作和事实。
- 旧回合思维链已省略；新回合必须重新按当前思维链输出完整 Step。
- 禁止把历史回合号、历史压缩说明或历史标签照抄进新正文。

<正文>
${正文，每行补【旁白】前缀，≤900 字}
</正文>

<短期记忆>
（历史短期记忆已由记忆系统保存，本条 assistant 历史不重复上传。）
</短期记忆>

<动态世界>
（历史动态世界已由世界事件系统保存，本条 assistant 历史不重复上传。）
</动态世界>

<变量草稿>
（历史变量草稿已由变量系统处理，本条 assistant 历史不重复上传。）
</变量草稿>

<狭间问答>${≤360}</狭间问答>      ← 有值时
<狭间评判>${≤220}</狭间评判>      ← 有值时
````

正文为空时写 `【旁白】（历史正文已省略）`。

> **固定开销**：上面 3 行说明 + 4 个占位块 ≈ 240 字节，每条历史各一份 × 20 条 ≈ 4.8KB 纯噪声——待修项（第1项内容问题，最易回收的上下文）。

<!-- msg-02 -->
### B2 · 开局指令 / 狭间踏入指令

来源：`sendWorkflow.ts:1725` `openingInstruction` / `:1738` `awakeningInstruction`
条件：对应触发回合。`[系统]` 前缀 user 消息会被 B1 的过滤器丢掉，所以这两条**必须**作为真实 API 指令另推一次，否则 AI 收到空白消息卡住。

````text
请根据当前角色、当前场景、世界书与内置提示词，直接生成第 0 回合开场叙事。不要等待玩家再次输入。
````

````text
玩家选择踏入「命途狭间」(命途 ID: ${pathId})。请按 pathAwakening 流程生成第一道诘问,不要推进主剧情,不要等玩家再次发言。
````

<!-- msg-03 -->
### B3 · 狭间评判回合提醒

来源：`sendWorkflow.ts:2252-2259`
条件：`awakeningPhase === 'judgement'`。单条 user 消息，把 system prompt 里段 20-D 的「必输标签」规则升到 user 末尾提高遵循率（项目里"升到 user 末尾提高遵循率"的成功先例）。

````text
⚠ 命途狭间·回应回合提醒:你上一回合已出三题,玩家本轮给出了答案。本回合**必须**在所有标签之外、**单独**写一行 `<狭间评判>升阶</狭间评判>`。命途狭间没有失败、滞留或退转;三问只是让玩家明确自己的道路。漏掉这个标签会让玩家永远卡在虚境无法升阶——这是必须避免的错误。同时正文里要让命途意志回应玩家答案、确认其道路,再把旅人从虚境拉回现实场景。
````

<!-- msg-04 -->
### B4 · DeepSeek 主剧情格式校验

来源：`mainRequestFinalizer.ts:27-32` `DEEPSEEK_MAIN_FORMAT_GUARD`（`sendWorkflow.ts:2284` 推入 tailMessages）
条件：`deepSeekMainMode !== 'off'` 且 provider transport 为 deepseek。

````text
DeepSeek 主剧情格式校验：本轮必须从 <thinking> 开始输出，禁止直接从 <正文> 开始。
必须完整输出 <thinking>、<正文>、<短期记忆>、<动态世界>、<变量草稿>；如本回合存在后续承接价值，再输出 <剧情规划>。
<thinking> 内必须按当前生效的思维链 Step 标题，用中文逐步写出实际判断；不允许只写正文，不允许省略 thinking，不允许只写“已思考”。
不要在标签外输出解释、道歉、说明或额外标题。
````

同一份文本还被 `buildDeepSeekProtocolRetryGuard`（`sendWorkflow.ts:166`）复用为协议校验失败后的自动重试守卫，前面加三行：

````text
DeepSeek 主剧情自动重试：上一版输出未通过协议校验。
失败项：${issues.join('；') || '未知格式错误'}。
请完全重写，不要延续上一版残缺输出。
${DEEPSEEK_MAIN_FORMAT_GUARD}
````

<!-- msg-05 -->
### B5 · 重roll末尾强约束

来源：`sendWorkflow.ts:1683` `buildRerollGenerationGuard`（`sendWorkflow.ts:2295-2300` 推入 tailMessages）
条件：重roll回合且非开局。

````text
重roll末尾强约束：本轮是玩家主动要求重写上一版回复。
重roll nonce: ${nonce}
事实起点、玩家输入和可用上下文保持一致，但正文表达路径必须明显不同。
必须更换开场镜头、段落推进顺序、对白切入、收尾钩子和行动选项写法；不得复用上一版前三句、连续短语、变量草稿句式或相同结尾。
如果上一版以旁白开场，本版优先从角色动作或短对白开场；如果上一版以对白开场，本版优先从环境、动作或感官细节切入。
仍必须遵守当前主剧情输出标签和格式要求，不得因为重roll省略 <thinking>、<正文>、<短期记忆>、<动态世界> 或 <变量草稿>。
上一版回复摘录（只用于避重复，不是当前事实）：${compactForRerollInstruction(previousResponse)}   ← 有上一版时
````

> 与 A2 的 system 侧版本对照：两者都说了「事实起点一致 / 换开场镜头 / 不复用前三句 / 不省略标签 / 附上一版摘录」，**上一版摘录还被完整注入两遍**——待修项（第2项内容问题）。合并候选，优先保留这份 user 版（生成点更近）。

<!-- msg-06 -->
### B6 · 区 E 执法块（本回合生成前核对）

来源：`mainRequestFinalizer.ts:137` `buildMainTurnEnforcementBlock`（`sendWorkflow.ts:2287-2294` 推入 tailMessages）
条件：`zhikuRequestScope === 'main'`（普通回合的最后一块 user 消息）。字数与发言归属两条硬约束的唯一生成点兜底（结构轮 D1 删掉了对应的硬编码段，权威改由「回复格式」模块 + 这一块承担）。

````text
# 本回合生成前核对（最高优先级，覆盖上文所有软性描述）
【在场角色锚点】                                   ← 有 character 类智库条目时（zhikuCharacterBrief）
- ${标题}：说话方式：${≤58 字}｜禁止误写：${≤58 字}
【硬性要点】
- 发言归属：【${playerName}】只承载玩家本回合明确说出的原话；NPC 台词、拟声词、环境音绝不挂玩家名。
- 禁止代写玩家的心理、神态、感受或决定；正文内禁止任何选项菜单结构。
- 剧情编织滑窗只按门禁推进；已发生的事件禁止重演，未开始的分段禁止抢跑。
                                                  ← 剧情编织系统启用且有 currentWindow 时
- <正文> 不少于 ${wordCountTarget} 字；<thinking>/<正文>/<短期记忆>/<动态世界> 标签齐全。
逐项核对以上约束后再动笔；与上文任何描述冲突时，以本块为准。
````

> 「标签齐全」只列了 4 个，漏了 `<变量草稿>`，与 B4 列的 5 个不一致——待修项（第3项内容问题）。段头自称「覆盖上文所有软性描述」，等于声明自己的优先级高于段 1 的六层仲裁表和段 3 的回复格式模块。

<!-- msg-07 -->
### B7 · depth 注入

来源：`mainRequestFinalizer.ts:80-93`（`finalizeMainRequest` 内）
条件：非 Claude 且有 `position=1` 模块（ST 预设 / 世界书 `injectAtDepth` 条目），按 depth 降序 `splice` 进 apiMessages（depth=0 = 历史末尾之后）。**主剧情自身完全不使用这条通道**。Claude 下整条通道跳过，回退到 A3。

<!-- msg-08 -->
### B8 · 重roll相似度自动换写

来源：`sendWorkflow.ts:1697` `buildRerollSimilarityRetryGuard`（`sendWorkflow.ts:2459` 触发，相似度超阈值时追加并重发）
条件：重roll结果与被替换回复相似度超阈值。

````text
重roll自动换写：上一版重roll结果与被替换回复过于相似。
相似度：${n}%。
请完全换一种写法重写本回合：
- 保留事实起点和玩家输入，但更换开场镜头、行动顺序、对白切入、句式和收束钩子。
- 不得复用上一版连续短语、段落结构、对白顺序或相同结尾。
- 若上一版以旁白开场，本版优先以 NPC 动作或一句短对白开场；若上一版以对白开场，本版优先以环境或动作开场。
- 仍必须遵守当前主剧情输出标签和格式要求，不得省略 <thinking>、<正文>、<短期记忆>、<动态世界> 或 <变量草稿>。
被替换回复摘录（只用于避重复）：${compactForRerollInstruction(previousResponse)}   ← 有上一版时
````

> 这是重roll路径上的**第三份**同义约束（A2 / B5 / B8）——待修项（第2项内容问题）。

<!-- msg-09 -->
### C · assistant prefill

来源：`sendWorkflow.ts:2278-2281`
条件：DeepSeek `lock_format` 模式强制 `'<thinking>\n'`；否则用预设 `assistantPrefill`（有则用）。两者互斥，`deepSeekLockFormat` 优先。经 `finalizeMainRequest.prefixMode/prefixContent` 传给 provider（仅支持 assistant prefill 能力的 provider 生效）。

<!-- open-01 -->
### 开局分支 · 开局切入说明

来源：`systemPromptBuilder.ts:728` `buildOpeningCutInSection`
条件：开局回合，`worldState.原著主角` 或 `worldState.自定义开局` 非空时。无内容时整段不出现。

````text
# 开局切入说明

- 原著主角选择：${原著主角}                                          ← 有原著主角时
- 双原著主角提醒：星与穹是两个独立存在的原著主角，不可写成同一人、互相替代或混合性别设定。若开局镜头只聚焦其中一位，另一位也必须作为并列存在的原著线索被保留；涉及封存舱、星核载体或原著主角线索时，不得默认只选星。   ← 星穹双主角时
- 原著主角门禁：当前为单主角「星」，穹不是本周目默认原著主角；不得召回或表现「穹」为并列原著主角，也不要把开局苏醒场景写成穹的视角。   ← 星时
- 原著主角门禁：当前为单主角「穹」，星不是本周目默认原著主角；不得召回或表现「星」为并列原著主角。涉及封存舱、星核载体或原著主角线索时优先写穹，开局苏醒场景应以穹的视角和性别推进，不要默认写成星。   ← 穹时
- 切入说明：${自定义开局}                                          ← 有自定义开局时
- 使用方式：把以上内容视为开局已经成立的私有设定，融入道具、通讯、来历或行动动机中；不要原文复读，也不要当成还需要玩家确认的说明。
````

> 这是**第三处**原著主角门禁（与段 16、段 23 并列）——待修项（第4项内容问题）。
