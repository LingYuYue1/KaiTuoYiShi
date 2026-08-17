import fs from 'node:fs';

const builder = fs.readFileSync('hooks/useGame/systemPromptBuilder.ts', 'utf8');
const contextSnapshot = fs.readFileSync('hooks/useGame/contextSnapshot.ts', 'utf8');
const turnItem = fs.readFileSync('components/features/Chat/TurnItem.tsx', 'utf8');
const textService = fs.readFileSync('services/ai/text/index.ts', 'utf8');
const mainCot = fs.readFileSync('prompts/cot/mainCot.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const requestFinalizer = fs.readFileSync('hooks/useGame/mainRequestFinalizer.ts', 'utf8');
const variableExecutor = fs.readFileSync('utils/variableExecutor.ts', 'utf8');
const worldEvents = fs.readFileSync('utils/worldEvents.ts', 'utf8');
const promptModel = fs.readFileSync('models/prompts.ts', 'utf8');
const worldbookModel = fs.readFileSync('models/worldbook.ts', 'utf8');
const promptModulesTab = fs.readFileSync('components/features/Settings/PromptModulesTab.tsx', 'utf8');
const contextViewer = fs.readFileSync('components/features/Settings/ContextViewer.tsx', 'utf8');
const settingsModal = fs.readFileSync('components/features/Settings/SettingsModal.tsx', 'utf8');
const worldbookManager = fs.readFileSync('components/features/Worldbook/WorldbookManagerModal.tsx', 'utf8');
const gameState = fs.readFileSync('hooks/useGameState.ts', 'utf8');
const builtinPromptModules = fs.readFileSync('data/builtinPromptModules.ts', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// 结构轮(D1, 2026-07-26): 硬编码字数段已删除——权威在「回复格式」模块,生成点兜底在区E执法块。
assert(!builder.includes('function buildResponseLengthSection'), '硬编码字数段必须保持已删除状态(权威在回复格式模块)。');
assert(builtinPromptModules.includes('字数不少于 {wordCountTarget} 字'), '回复格式模块必须是字数约束的权威之一。');
assert(builtinPromptModules.includes('禁止因为思维链、记忆、剧情编织、行动选项或模型默认习惯而压缩正文'), '回复格式模块字数约束必须覆盖压缩正文的常见借口。');
assert(sendWorkflow.includes('buildMainTurnEnforcementBlock({') && sendWorkflow.includes('finalizeMainRequest({'), 'sendWorkflow 必须通过共享最终化器在生成点前注入区E执法块。');
assert(requestFinalizer.includes('# 本回合生成前核对') && requestFinalizer.includes('不少于 ${input.wordCountTarget} 字'), '共享最终化器的区E执法块必须包含字数兜底行。');
// ── 2026-08-12 八区重组：顺序断言更新为八区语义 ──
assert(builder.includes("pushSection('zone1-identity'"), '八区组装必须显式构建区1身份区。');
assert(builder.includes("pushSection('zone2-rules'"), '八区组装必须显式构建区2规则区。');
assert(builder.includes("pushSection('zone3-params'"), '八区组装必须显式构建区3参数区。');
assert(builder.includes("pushSection('zone4-player'"), '八区组装必须显式构建区4玩家档案区。');
assert(builder.includes("pushSection('zone5-memory'"), '八区组装必须显式构建区5记忆区。');
assert(builder.includes("pushSection('zone6-injection'"), '八区组装必须显式构建区6注入区。');
assert(builder.includes("pushSection('zone7-review'"), '八区组装必须显式构建区7回顾区。');
assert(builder.includes("pushSection('zone8-protocol'"), '八区组装必须显式构建区8协议区。');
// 区6：时间锚点→场景→天气 顺序（环境定位在注入区开头）
assert(builder.indexOf('buildCurrentTimeAnchorSection(worldState)') < builder.indexOf('buildSceneSection(worldState)'), '区6 时间锚点必须先于当前场景。');
assert(builder.indexOf('buildSceneSection(worldState)') < builder.indexOf('buildWeatherSection(worldState)'), '区6 当前场景必须先于天气判断。');
// 天气由 builder 统一组装（不再由发送侧/快照追加）
assert(builder.includes('构建天气Prompt片段'), 'builder 必须统一组装天气（区6 第3项）。');
// 区5 记忆拆分：长/中在前、短在区6 末尾
assert(builder.includes('buildLayeredMemorySectionsSplit'), '必须使用分层记忆拆分函数。');
// 区5 剧情安排（主线进度+storyPlan）与编织
assert(builder.includes('buildStoryArrangementSection'), '区5 必须包含剧情安排合并段。');
assert(builder.indexOf("const arrangement = buildStoryArrangementSection(plotNodes, storyPlanSnippets)") < builder.indexOf("const weaving = buildStoryWeavingInjection(storyWeaving, worldbookCtx)"), '区5 剧情安排必须先于剧情编织。');
// 区6：NPC 在智库前、短期记忆在智库后（区6 末尾）
assert(builder.indexOf('buildNpcContinuitySection') < builder.indexOf('zhikuCompilation?.mainStoryInjection'), 'NPC 承接必须先于智库。');
assert(builder.indexOf('zhikuCompilation?.mainStoryInjection') < builder.indexOf('if (settings.enableMemoryInjection && shortMemCached)'), '智库必须先于短期记忆（区6 末尾）。');
// 区7 回顾（即时回顾/忆庭/文风助手）晚于区6
assert(builder.indexOf("pushSection('zone7-review'") > builder.indexOf("pushSection('zone6-injection'"), '区7 回顾区必须晚于区6 注入区。');
// 区8 协议（运行锚点/回复格式/COT）压轴
assert(builder.indexOf("pushSection('zone8-protocol'") > builder.indexOf("pushSection('zone7-review'"), '区8 协议区必须晚于区7 回顾区。');
// 额外要求区位于区7 与区8 之间
assert(builder.includes('buildExtraRequirementSection'), '必须存在额外要求区构建函数。');
assert(builtinPromptModules.includes('<Role>') && builtinPromptModules.includes('</Role>'), '叙述者人格必须使用明确 Role 声明。');
assert(builtinPromptModules.includes('当前互动的核心玩家角色为「{playerName}」'), '叙述者人格必须以运行时玩家角色为叙事中心。');
assert(builtinPromptModules.includes('原著 NPC 必须按已注入档案和当前信息域行动'), '叙述者人格必须把智库/档案作为 NPC 人设校准依据。');
// 2026-08-01: 叙述者人格(builtin_narrator_persona)含 RP 场景需要的豁免声明(停用平台限制/违法路径),
// 属有意保留内容,此黑名单断言已按项目决定移除。若未来要重新启用,先确认内置叙述者人格不引入 jailbreak 模板。
// 结构轮: 顺序断言更新为当前变量名(旧断言因 bottomModules 更名早已空转);基调段已删除。
assert(!builder.includes('buildToneSection'), '基调段必须保持已删除状态(剧情模式世界书为唯一出处)。');
// 区6：时间/场景/天气为环境定位（在注入区开头），NPC 与智库在区6 后部
assert(builder.indexOf("const timeAnchor = buildCurrentTimeAnchorSection(worldState);") < builder.indexOf('const scene = buildSceneSection(worldState);'), '区6 时间锚点必须先于当前场景。');
assert(builder.indexOf('const scene = buildSceneSection(worldState);') < builder.indexOf('const weather = buildWeatherSection(worldState);'), '区6 当前场景必须先于天气判断。');
assert(builder.indexOf('const weather = buildWeatherSection(worldState);') < builder.indexOf('const awakening = buildPathAwakeningSection'), '区6 天气必须先于命途狭间状态。');
// 区8 协议压轴：运行锚点/回复格式/COT 在 zone8
assert(builder.indexOf("pushSection('zone8-protocol'") > builder.indexOf("pushSection('zone7-review'"), '区8 协议区必须晚于区7 回顾区。');
assert(builder.indexOf('const injection = buildWorldbookInjection(worldbooks, worldbookCtx);') < builder.indexOf('const npcLedgerSelection = npcLedgerSelectionOverride'), '普通世界书资料应早于尾部 NPC 高波动承接块。');
assert(builder.indexOf('const npcPresence = buildNpcPresenceSection') < builder.indexOf('const companions = buildCompanionsSection'), '区6 NPC 顺序：在场状态必须先于伙伴。');
assert(builder.indexOf('const companions = buildCompanionsSection') < builder.indexOf('zhikuCompilation?.mainStoryInjection'), '区6 伙伴（NPC 尾部）必须先于智库，NPC 块只做最终关系兜底。');
// 工作包A：builder 消费世界书 plan 四路（不再重复调用旧 buildWorldbookInjection）
assert(builder.includes('worldbookPlan?.alwaysEntries') && builder.includes('worldbookPlan?.keywordEntries'), 'builder 必须消费世界书 plan 的常驻/关键词两路。');
assert(builder.includes('worldbookPlan?.systemRuleEntries') && builder.includes('worldbookPlan?.depthMessages'), 'builder 必须消费世界书 plan 的规则/depth 两路。');
assert(builder.includes('RECENT_WORLD_EVENT_PROMPT_LIMIT = 12'), '近期事件必须有注入上限，避免世界全局事件无限膨胀。');
assert(builder.includes('function buildRecentWorldEventsSection'), '近期事件必须通过统一瘦身函数注入。');
assert(builder.includes('normalizeWorldEventFingerprint'), '近期事件必须做文本指纹去重。');
assert(!builder.includes('worldState.全局事件.map((e) => `- ${e}`).join'), '近期事件不得继续全量注入世界全局事件。');
assert(worldEvents.includes('WORLD_EVENT_STORAGE_LIMIT = 30'), '世界全局事件存档层必须默认只保留最近 30 条。');
assert(worldEvents.includes('function compactWorldEvents'), '世界全局事件必须有统一压缩/去重函数。');
assert(sendWorkflow.includes('appendWorldEvents(worldAfter.全局事件'), '正文动态世界事件追加必须走 30 条存档上限。');
assert(variableExecutor.includes("root === '世界' && rest === '全局事件' && cmd.action === 'push'"), '变量命令 push 世界.全局事件 也必须走 30 条存档上限。');
assert(!sendWorkflow.includes('全局事件: [...worldAfter.全局事件, ...parsedForDisplay.worldEvents]'), '正文动态世界事件不得继续无限追加进存档。');

// 结构轮: 字数硬约束改由回复格式模块(scope=all,主剧情与开局都注入)+区E兜底承担,不再有硬编码调用。
assert(contextSnapshot.includes('splitPromptSections(systemPrompt)'), '上下文查看必须展示 system prompt 分段，才能看到字数硬约束。');
assert(contextSnapshot.includes('uploadEstimatedTokens'), '上下文查看必须单独统计真实上传 token。');
assert(contextSnapshot.includes('diagnosticEstimatedTokens'), '上下文查看必须单独统计诊断参考 token。');
assert(contextSnapshot.includes('buildLeanAssistantHistoryContent(msg)'), '上下文预览的历史 assistant 消息必须与真实发送链路一样瘦身。');
assert(contextSnapshot.includes("category: '诊断'"), '主剧情本地辅助分析块必须标记为诊断类。');
assert(contextSnapshot.includes('upload: false') && contextSnapshot.includes('diagnostic: true'), '本地诊断块不得计入真实上传顺序。');
assert(contextSnapshot.includes('formatMainRequestOrderOverview'), '上下文查看必须提供主剧情真实请求顺序总览。');
assert(contextSnapshot.includes('main_request_order_overview'), '主剧情真实请求顺序总览必须作为独立区块展示。');
assert(contextSnapshot.includes('System Prompt 分段') && contextSnapshot.includes('API Messages'), '真实请求顺序总览必须同时列出 system 分段和 API messages。');
assert(contextViewer.includes('devMode: boolean'), '上下文查看必须显式接收开发者模式，不能让普通玩家看到诊断区块。');
assert(settingsModal.includes('devMode={gameSettings.devMode}'), '设置页必须把现有开发者模式传给上下文查看。');
assert(contextViewer.includes('section.upload !== false && !section.diagnostic'), '普通玩家上下文必须只保留真实上传区块。');
assert(contextViewer.includes('devMode ? snapshot.sections : uploadSections'), '只有开发者模式可以查看包含诊断区块的完整列表。');
assert(contextViewer.includes('snapshot.uploadEstimatedTokens'), '普通玩家的全部内容 Token 必须使用真实上传统计。');
assert(contextSnapshot.includes("id: 'phone_story_progress_diagnostic'") && contextSnapshot.includes("title: '剧情编织进度诊断'"), '手机剧情编织预览必须明确标记为诊断区块。');
assert(contextSnapshot.includes("id: 'zhiku_local_diagnostics'") && contextSnapshot.includes("title: '智库本地召回诊断'"), '智库本地召回信息必须从真实请求正文拆到诊断区块。');
assert(!contextSnapshot.includes("id: 'zhiku_actual_saved_preview',\n    title: '上一回合真实保存的召回诊断',\n    category: '实际',\n    content: actualRecallPreview || '（上一条 AI 回复没有保存召回诊断；请从新增诊断后的新回合开始查看。）',\n  });"), '上一回合智库召回诊断不得继续伪装成上传区块。');
assert(promptModel.includes("calibration: '独立模型'"), '提示词模块 calibration 作用域必须显示为独立模型，不能继续误标为变量校准。');
// 2026-08-15：聊天详情必须把真实 API 请求与本地诊断拆开，避免把诊断误认为请求正文。
assert(turnItem.includes("type ToolKey = 'edit' | 'thinking' | 'usage' | 'storyPlan' | 'summary' | 'raw' | 'context' | 'diagnostics';"), '聊天详情必须提供独立的诊断面板入口。');
assert(turnItem.includes('{devMode && (') && turnItem.includes('devMode && openTool === \'diagnostics\''), '聊天诊断入口和内容必须受开发者模式门禁保护。');
assert(turnItem.includes('label="真实请求（发送给主剧情）"') && turnItem.includes('label="本地诊断（不会发送给主剧情）"'), '聊天详情必须明确标注真实请求与本地诊断的发送边界。');
const actualRequestStart = turnItem.indexOf('function formatActualRequestContext');
const diagnosticsStart = turnItem.indexOf('function formatDebugDiagnostics');
assert(actualRequestStart >= 0 && diagnosticsStart > actualRequestStart, '真实请求格式化函数必须位于诊断格式化函数之前并保持独立。');
const actualRequestFormatter = turnItem.slice(actualRequestStart, diagnosticsStart);
const diagnosticsFormatter = turnItem.slice(diagnosticsStart);
assert(actualRequestFormatter.includes('debug.systemPrompt') && actualRequestFormatter.includes('debug.messages'), '真实请求面板必须只读取保存的 System Prompt 与 API messages。');
assert(!actualRequestFormatter.includes('DeepSeek 主剧情诊断') && !actualRequestFormatter.includes('缓存前缀诊断') && !actualRequestFormatter.includes('NPC账本注入诊断') && !actualRequestFormatter.includes('智库召回诊断'), '真实请求面板不得拼入 DeepSeek、缓存、NPC 或智库诊断文本。');
assert(diagnosticsFormatter.includes('DeepSeek 主剧情诊断') && diagnosticsFormatter.includes('缓存前缀诊断') && diagnosticsFormatter.includes('NPC账本注入诊断'), '诊断面板必须保留本地诊断内容，供开发者核对。');
assert(textService.includes("const apiMessages = request.messages.map((m) => ({ role: m.role, content: m.content }));"), '主剧情发送层必须只提取 role/content，禁止把 debugContext 等本地字段序列化给模型。');

assert(worldbookModel.includes("calibration: '独立模型'"), '世界书 calibration 作用域必须显示为独立模型，不能继续误标为变量校准。');
assert(promptModel.includes('独立模型 / 校准模型提示词展示'), '提示词模块类型注释必须说明 calibration 是独立模型提示词展示。');
assert(worldbookModel.includes('独立模型 / 校准模型资料展示'), '世界书类型注释必须说明 calibration 是独立模型资料展示。');
assert(promptModulesTab.includes('独立模型提示词展示：新闻、手机、智库、变量、剧情编织等真实请求由对应服务层共享 prompt 构建'), '提示词模块 UI 必须说明独立模型真实请求由服务层共享 prompt 构建。');
assert(promptModulesTab.includes('可在“上下文”页核对实际发送内容'), '提示词模块 UI 必须引导玩家到上下文页核对独立模型真实请求。');
assert(promptModulesTab.includes('不会进入主剧情 system prompt'), '提示词模块 UI 必须说明独立模型作用域不会进入主剧情 system prompt。');
assert(promptModulesTab.includes('const toggleDisabled = isCalibrationModule'), '独立模型提示词展示模块必须用独立模型作用域派生开关禁用状态。');
assert(promptModulesTab.includes('disabled={toggleDisabled}'), '独立模型提示词展示模块不得继续显示为可操作开关。');
assert(promptModulesTab.includes("title={toggleDisabled ? '独立模型展示模块不是真实请求开关'"), '独立模型提示词展示模块必须说明不是真实请求开关。');
assert(promptModulesTab.includes("{toggleDisabled ? '独立模型展示'"), '独立模型提示词列表状态必须显示为展示而不是普通启用/关闭。');
assert(promptModulesTab.includes('enabled: isCalibrationBuiltin ? true : m.enabled'), '重置内置提示词时必须强制独立模型展示模块保持展示状态。');
assert(gameState.includes('enabled: isCalibrationBuiltin ? true : hit.enabled'), '旧存档迁移必须强制独立模型提示词模块保持展示状态。');
assert(gameState.includes('function isCalibrationWorldbook(book: 世界书)'), '内置独立模型世界书必须有迁移识别函数。');
assert(gameState.includes('if (isCalibrationWorldbook(builtin)) return builtin;'), '旧存档里的独立模型世界书编辑稿不得覆盖源码真实展示。');
assert(worldbookManager.includes('独立模型资料仅作真实请求展示'), '世界书 UI 必须说明独立模型资料只作真实请求展示。');
assert(worldbookManager.includes('独立模型资料展示：真实请求不读取这里的 enabled 或编辑稿'), '世界书 UI 必须说明独立模型真实请求不读取这里的开关或编辑稿。');
assert(worldbookManager.includes('disabled={calibrationDisplay}'), '独立模型世界书展示条目的开关和编辑控件必须只读。');
assert(worldbookManager.includes("title={calibrationDisplay ? '独立模型展示条目不是真实请求开关'"), '独立模型世界书展示条目必须说明不是真实请求开关。');
assert(!promptModel.includes("calibration: '变量校准'"), '提示词模块 calibration 标签不得继续显示变量校准。');
assert(!worldbookModel.includes("calibration: '变量校准'"), '世界书 calibration 标签不得继续显示变量校准。');

assert(mainCot.includes('每个 Step 必须产出会影响本回合正文、短期记忆、动态世界、变量草稿或剧情规划的判断'), '主剧情 COT 必须要求每步产出有用判断。');
assert(mainCot.includes('无触发及原因'), '主剧情 COT 必须允许无关步骤短路并说明原因。');
assert(mainCot.includes('禁止为了凑步骤重复同一句安全口号'), '主剧情 COT 必须禁止空泛凑步骤。');
assert(mainCot.includes('当前事实层(玩家输入/当前时间地点/在场人物/最近正文/即时剧情回顾/短期记忆)'), '主剧情 COT 必须明确当前事实层读取范围。');
assert(mainCot.includes('连续性记忆层(NPC账本/剧情回忆/中长期记忆)'), '主剧情 COT 必须明确记忆层用于连续性承接。');
assert(mainCot.includes('资料校准层(智库/世界书/角色档案/设定资料)'), '主剧情 COT 必须明确资料校准层。');
assert(mainCot.includes('智库、世界书和角色档案主要作为写作参考、人格口吻、设定事实、能力边界和 OOC 校准'), '主剧情 COT 必须声明智库等资料只作写作参考与设定校准。');
assert(mainCot.includes('不得把资料召回本身写成角色已在场、事件已发生、玩家已知情或剧情必须这样推进'), '主剧情 COT 必须禁止资料召回直接变成正文事实。');
assert(mainCot.includes('中长期记忆只用于防失忆、关系连续、背景连续和旧承诺承接'), '主剧情 COT 必须保留记忆防失忆职责。');
assert(mainCot.includes('Step12: 文风、正文骨架与格式思考'), '主剧情 COT Step12 必须先做正文骨架与文风思考。');
assert(mainCot.includes('Step13: <剧情规划> 输出内容思考'), '主剧情 COT Step13 必须后做剧情规划输出思考。');
assert(mainCot.indexOf('Step12: 文风、正文骨架与格式思考') < mainCot.indexOf('Step13: <剧情规划> 输出内容思考'), '主剧情 COT 必须先正文骨架后剧情规划。');
assert(mainCot.includes('Step12 正文骨架、Step13 剧情规划'), '主剧情 COT 最终自检必须同步 Step12/13 新职责。');
assert(mainCot.includes('本回合已注入智库角色档案') && mainCot.includes('人格、口吻和能力边界校准依据'), 'Step7 必须把已注入智库角色档案标记为 Step8 的人格口吻校准依据。');
assert(mainCot.includes('会怎么做 / 不会怎么做 / 常用说话方式 / 对玩家当前行为的合理反应'), 'Step8 必须读取智库角色档案校准 NPC 行为和说话方式。');
assert(mainCot.includes('不得让 NPC 突然知道未公开信息') && mainCot.includes('不得为了贴档案而覆盖当前镜头里的情绪、立场、伤势、任务压力或信息差'), 'Step8 必须防止智库档案覆盖当前信息域和镜头事实。');
assert(mainCot.includes('身份、履历、组织头衔和过去经历只作为角色气质、判断方式与行动边界参考'), '主剧情 COT 必须禁止把角色背景资料直接当正文事实标签。');
assert(mainCot.includes('不得让旁白直接写“这位前XX”“曾经XX”“身为XX的他/她”等百科式身份标签'), '主剧情 COT 必须禁止百科式旁白直贴角色身份标签。');
assert(mainCot.includes('背景优先通过动作、称呼、对话、现场物件或后续追问自然露出'), '主剧情 COT 必须要求角色背景通过场景自然露出。');
assert(mainCot.includes('NPC 信息域不得自动继承智库角色档案、旁白资料或玩家不可见背景'), '主剧情 COT 必须禁止 NPC 自动继承智库档案形成全知台词。');
assert(mainCot.includes('不能在台词里直接点破他人隐秘身份、旧组织头衔、过去履历或档案称号'), '主剧情 COT 必须禁止 NPC 台词直接点破未公开档案身份。');
assert(mainCot.includes('NPC 对他人的称呼、质问和判断必须来自其自身信息域'), '主剧情 COT 必须约束 NPC 称呼和质问来源。');
assert(mainCot.includes('不要直接喊出档案里的隐秘头衔、旧组织身份或未公开关系'), '主剧情 COT 必须禁止 NPC 直接喊出智库隐秘头衔。');

console.log('prompt context regression ok');
