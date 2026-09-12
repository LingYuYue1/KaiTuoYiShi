import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const variableCommand = fs.readFileSync('models/variableCommand.ts', 'utf8');
const variableFacts = fs.readFileSync('utils/variableFacts.ts', 'utf8');
const variableModel = fs.readFileSync('services/ai/variableModel.ts', 'utf8');
const variablePromptContract = fs.readFileSync('utils/variablePromptContract.ts', 'utf8');
const variableWorldbook = fs.readFileSync('data/variableWorldbook.ts', 'utf8');
const nsfwWorldbook = fs.readFileSync('data/nsfwWorldbook.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const variableRuntime = fs.readFileSync('services/variableRuntime.ts', 'utf8');
const variableTurnAnalysis = fs.readFileSync('services/variableTurnAnalysis.ts', 'utf8');
const enrichment = fs.readFileSync('utils/npcArchiveEnrichment.ts', 'utf8');
const companionPanel = fs.readFileSync('components/features/GameSystems/CompanionPanel.tsx', 'utf8');
const variableManager = fs.readFileSync('components/features/Settings/VariableManager.tsx', 'utf8');
const nsfwPolicy = fs.readFileSync('utils/nsfwArchivePolicy.ts', 'utf8');

// ─── 基础事实类型与字段 ───
assert(variableCommand.includes("'nsfw_archive'"), '变量事实类型必须包含 nsfw_archive。');
assert(variableCommand.includes('NSFW档案变量事实'), '必须定义 NSFW 档案变量事实结构。');
assert(variableFacts.includes("NSFW档案: 'nsfw_archive'"), '事实解析必须识别中文 NSFW档案。');
assert(variableFacts.includes("nsfw_archive: 'nsfw_archive'"), '事实解析必须识别 nsfw_archive。');
assert(variableFacts.includes("fact.type === 'nsfw_archive'"), '事实转命令必须处理 nsfw_archive。');
assert(variableFacts.includes('NPC[id=${existing.id}].NSFW档案'), 'nsfw_archive 必须转为 NPC NSFW档案写入。');
assert(variableFacts.includes('男性身体档案'), 'nsfw_archive 必须支持男性身体档案字段。');
assert(variableFacts.includes('女性身体档案'), 'nsfw_archive 必须支持女性身体档案字段。');

// ─── 硬禁名单：只保留智械/机械/非人形（帕姆、史瓦罗等） ───
assert(variableFacts.includes('getNsfwArchiveBlockReason'), '事实层必须调用集中 NSFW 资格策略。');
assert(!enrichment.includes('getNsfwArchiveBlockReason'), '公共 NPC 档案补全不得参与 NSFW 资格或写入。');
assert(sendWorkflow.includes('linkVariableTurn') && variableRuntime.includes('analyzeVariableTurn') && variableTurnAnalysis.includes('applyNsfwVariablePolicy'), '旧命令层必须经由统一 linker 调用集中 NSFW 资格策略。');
assert(nsfwPolicy.includes('BLOCKED_CANONICAL_NAMES'), '集中策略必须维护原著名屏蔽名单。');
assert(nsfwPolicy.includes('帕姆') && nsfwPolicy.includes('佩佩') && nsfwPolicy.includes('史瓦罗'), '集中策略必须覆盖帕姆、佩佩和史瓦罗。');
assert(nsfwPolicy.includes('怪物') && nsfwPolicy.includes('裂界生物'), '集中策略必须屏蔽怪物和裂界生物。');
assert(nsfwPolicy.includes('机械') && nsfwPolicy.includes('机器人') && nsfwPolicy.includes('人偶'), '集中策略必须屏蔽机械、机器人和普通人偶。');
assert(nsfwPolicy.includes('isHertaIdentity') && nsfwPolicy.includes("=== '黑塔'"), '集中策略必须显式放行黑塔。');
assert(!nsfwPolicy.includes('白露') && !nsfwPolicy.includes('彦卿'), '集中策略不得重新加入白露或彦卿角色名门禁。');

// ─── 年龄门禁解除 ───
// buildConservativeNsfwArchive 已改名为 buildNsfwArchiveUpdate，不再写保守基线。
assert(variableFacts.includes('buildNsfwArchiveUpdate'), 'nsfw_archive 必须使用 buildNsfwArchiveUpdate 合并档案。');
assert(!variableFacts.includes('buildConservativeNsfwArchive'), '不得再使用旧的 buildConservativeNsfwArchive 名称。');
// 检查 buildNsfwArchiveUpdate 函数体不再写入保守基线专属文案（允许注释里出现说明文字）。
{
  const fnStart = variableFacts.indexOf('function buildNsfwArchiveUpdate');
  const fnEnd = variableFacts.indexOf('\n}', fnStart);
  const fnBody = variableFacts.slice(fnStart, fnEnd);
  assert(!fnBody.includes("'保守基线'"), 'buildNsfwArchiveUpdate 函数体不得再写入保守基线标签。');
  assert(!fnBody.includes("'等待剧情事实补充'"), 'buildNsfwArchiveUpdate 函数体不得再写入等待剧情事实补充标签。');
  assert(!fnBody.includes('不代表已发生亲密剧情'), 'buildNsfwArchiveUpdate 函数体不得再写保守基线长期事实文案。');
}
// 年龄门禁解除：年龄确认降级为纯展示信息。
assert(variableFacts.includes('年龄门禁已解除') || variableFacts.includes('不再限制'), 'variableFacts 必须标注年龄门禁已解除。');
assert(!enrichment.includes('年龄门禁已解除') && !enrichment.includes('NSFW档案'), '公共档案补全器不应再包含 NSFW 逻辑。');

// ─── 唯一变量 contract：正式结构、展示字段与硬禁名单 ───
assert(variablePromptContract.includes("factType: 'nsfw_archive'") && variablePromptContract.includes("landing: 'NPC[id].NSFW档案'"), '唯一变量 contract 必须登记 nsfw_archive 正式结构。');
assert(variablePromptContract.includes("field('nsfw_archive', 'ageConfirm'") && variablePromptContract.includes('展示分类，不作为其他字段的自动推断依据'), 'ageConfirm 必须保持可选展示语义。');
assert(variablePromptContract.includes('帕姆、佩佩、史瓦罗等机械、智械、非人形、怪物和投影对象不写'), '唯一变量 contract 必须包含 NSFW 对象禁写名单。');
assert(!/不是 adult 时不要写身体档案/.test(variablePromptContract + variableModel), '变量提示词不得把 ageConfirm 变成其他字段的门禁。');
assert(!variablePromptContract.includes('年龄门禁已解除'), '唯一变量 contract 不应保留无实际写入意义的年龄门禁宣传句。');
assert(variablePromptContract.includes('黑塔 / 大黑塔 / Herta / The Herta'), '唯一变量 contract 必须说明黑塔身份归一规则。');

// ─── 普通回合不做关键词复审 ───
assert(!variableModel.includes('NSFW_INTERACTION_CUE_RE'), '变量模型不得用成人关键词触发第二次 coverage 请求。');
assert(!variableModel.includes('EmptyFactsReview') && !variableModel.includes('nsfwCue'), '不得保留 NSFW 空事实复审状态。');

// ─── NSFW 世界书：禁写名单更新 ───
assert(nsfwWorldbook.includes('帕姆'), 'NSFW 世界书必须禁止帕姆。');
assert(nsfwWorldbook.includes('史瓦罗'), 'NSFW 世界书必须禁止史瓦罗等智械。');
assert(!nsfwWorldbook.includes('佩佩、白露'), 'NSFW 世界书不得再列佩佩/白露等已解禁角色。');
assert(nsfwWorldbook.includes('黑塔 / 大黑塔 / Herta / The Herta'), 'NSFW 世界书必须声明黑塔例外。');

// ─── 变量世界书：NSFW 规则同步 ───
assert(variableWorldbook.includes('NSFW'), '变量世界书必须保留 NSFW 隔离规则。');

// ─── 普通回合不自动补建 NSFW 基线 ───
assert(!enrichment.includes('shouldCreateNsfwBaseline') && !enrichment.includes('buildNsfwBaseline'), 'NPC 公共档案补全不得自动建立 NSFW 空壳。');
assert(!sendWorkflow.includes('nsfwBaselineCandidates') && !variableModel.includes('NSFW 基线档案补建'), '普通变量请求不得携带或提示 NSFW 基线候选。');

// ─── 旧命令屏蔽 ───
assert(sendWorkflow.includes('linkVariableTurn') && variableRuntime.includes('analyzeVariableTurn') && variableTurnAnalysis.includes('applyNsfwVariablePolicy'), '旧 NSFW 变量命令也必须经过 linker 的目标屏蔽。');
assert(nsfwPolicy.includes('智械、机械或非人形对象'), '集中策略的旧命令屏蔽原因必须覆盖智械/机械。');
assert(!sendWorkflow.includes('非人/生物形态/怪物/机械'), '旧命令屏蔽文案不得再引用过宽词。');

// ─── 显示层文案中性化 ───
assert(companionPanel.includes('未标注'), 'formatNsfwAge 必须用中性文案「未标注」。');
assert(!companionPanel.includes("'禁止写入'"), 'formatNsfwAge 不得再用「禁止写入」文案。');

// ─── 变量管理 NSFW 专用编辑器 ───
assert(variableManager.includes('NsfwArchiveEditor'), '变量管理必须提供 NSFW 档案专用编辑器。');
assert(variableManager.includes("label === 'NSFW档案'"), 'TreeNode 必须在 NSFW档案 字段处渲染专用编辑器。');
assert(variableManager.includes('NsfwTagEditor'), 'NSFW 编辑器必须提供标签编辑器。');
assert(variableManager.includes('NsfwSelectField'), 'NSFW 编辑器必须提供年龄下拉。');
assert(variableManager.includes('NsfwBodyArchiveSection'), 'NSFW 编辑器必须提供身体档案分组表单。');

console.log('nsfw archive regression ok');
