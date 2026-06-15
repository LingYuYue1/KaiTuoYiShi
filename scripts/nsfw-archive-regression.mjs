import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const variableCommand = fs.readFileSync('models/variableCommand.ts', 'utf8');
const variableFacts = fs.readFileSync('utils/variableFacts.ts', 'utf8');
const variableModel = fs.readFileSync('services/ai/variableModel.ts', 'utf8');
const variableWorldbook = fs.readFileSync('data/variableWorldbook.ts', 'utf8');
const nsfwWorldbook = fs.readFileSync('data/nsfwWorldbook.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const enrichment = fs.readFileSync('utils/npcArchiveEnrichment.ts', 'utf8');
const companionPanel = fs.readFileSync('components/features/GameSystems/CompanionPanel.tsx', 'utf8');
const variableManager = fs.readFileSync('components/features/Settings/VariableManager.tsx', 'utf8');

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
assert(variableFacts.includes('isNsfwBlockedNpc'), '事实层必须屏蔽智械/机械/非人形 NSFW 目标。');
assert(variableFacts.includes('NSFW_BLOCKED_CANONICAL_NAMES'), '必须有原著名屏蔽名单。');
assert(variableFacts.includes('帕姆'), '屏蔽名单必须覆盖帕姆。');
// 白露/彦卿/虎克/克拉拉/佩佩 已从硬禁移除，断言不得再强制要求它们在屏蔽名单里。
assert(!/NSFW_BLOCKED_CANONICAL_NAMES\s*=\s*new Set\(\[[^\]]*白露/.test(variableFacts), '白露不得再出现在 canonical 屏蔽名单。');
assert(!/NSFW_BLOCKED_CANONICAL_NAMES\s*=\s*new Set\(\[[^\]]*彦卿/.test(variableFacts), '彦卿不得再出现在 canonical 屏蔽名单。');
// 正则不得再含角色名（白露/彦卿），但允许怪物/裂界生物（用户要求禁止）。
assert(!/NSFW_BLOCKED_NAME_RE\s*=.*白露/.test(variableFacts), 'variableFacts 硬禁正则不得再含白露。');
assert(!/NSFW_BLOCKED_NAME_RE\s*=.*彦卿/.test(variableFacts), 'variableFacts 硬禁正则不得再含彦卿。');
assert(variableFacts.includes('怪物') && variableFacts.includes('裂界生物'), 'variableFacts 硬禁正则必须包含怪物/裂界生物（用户要求禁止）。');
assert(variableFacts.includes('佩佩'), 'variableFacts 硬禁正则必须包含佩佩（用户要求禁止）。');
assert(variableFacts.includes('机械') && variableFacts.includes('机器人'), 'variableFacts 硬禁正则必须保留机械/机器人等智械类词。');
assert(!enrichment.match(/NSFW_BLOCKED_NAME_RE\s*=.*白露/), 'enrichment 硬禁正则不得再含白露。');
assert(enrichment.includes('怪物') && enrichment.includes('裂界生物'), 'enrichment 硬禁正则必须包含怪物/裂界生物（用户要求禁止）。');
assert(enrichment.includes('佩佩'), 'enrichment 硬禁正则必须包含佩佩（用户要求禁止）。');
assert(enrichment.includes('机械'), 'enrichment 硬禁正则必须保留机械类词。');

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
// enrichment 的 buildNsfwBaseline 函数体不再写入保守基线文案（允许注释说明）。
{
  const fnStart = enrichment.indexOf('function buildNsfwBaseline');
  const fnEnd = enrichment.indexOf('\n}', fnStart);
  const fnBody = enrichment.slice(fnStart, fnEnd);
  assert(!fnBody.includes("'保守基线'"), 'buildNsfwBaseline 函数体不得再写入保守基线标签。');
  assert(!fnBody.includes("'等待剧情事实补充'"), 'buildNsfwBaseline 函数体不得再写入等待剧情事实补充标签。');
  assert(!fnBody.includes('不代表已发生亲密剧情'), 'buildNsfwBaseline 函数体不得再写保守基线长期事实文案。');
  assert(!fnBody.includes('未确认成人、明确同意与关系边界前'), 'buildNsfwBaseline 函数体不得再写保守基线边界文案。');
}
// 年龄门禁解除：年龄确认降级为纯展示信息。
assert(variableFacts.includes('年龄门禁已解除') || variableFacts.includes('不再限制'), 'variableFacts 必须标注年龄门禁已解除。');
assert(enrichment.includes('年龄门禁已解除') || enrichment.includes('不再限制'), 'enrichment 必须标注年龄门禁已解除。');

// ─── 变量模型提示词：去掉年龄门禁约束、更新硬禁名单、加强输出引导 ───
assert(variableModel.includes('### NSFW 档案：nsfw_archive'), '变量模型提示词必须说明 nsfw_archive。');
assert(variableModel.includes('帕姆'), '变量模型提示词必须禁止帕姆。');
assert(variableModel.includes('史瓦罗'), '变量模型提示词必须禁止史瓦罗等智械。');
assert(variableModel.includes('年龄门禁已解除'), '变量模型提示词必须标注年龄门禁已解除。');
assert(!/不是 adult 时不要写身体档案/.test(variableModel), '变量模型提示词不得再限制只有 adult 才写身体档案。');
assert(!variableModel.includes('佩佩') || variableModel.includes('帕姆、史瓦罗'), '变量模型提示词不得再把佩佩列入硬禁。');

// ─── NSFW 空档案复审 ───
assert(variableModel.includes('NSFW_INTERACTION_CUE_RE'), '必须定义 NSFW 成人互动线索正则用于空档案复审。');
assert(variableModel.includes('nsfwCue'), 'EmptyFactsReview 必须支持 nsfwCue 标记。');
assert(variableModel.includes('NSFW 总开关已开启且正文命中成人互动线索'), '复审提示必须指向 nsfw_archive。');

// ─── NSFW 世界书：禁写名单更新 ───
assert(nsfwWorldbook.includes('帕姆'), 'NSFW 世界书必须禁止帕姆。');
assert(nsfwWorldbook.includes('史瓦罗'), 'NSFW 世界书必须禁止史瓦罗等智械。');
assert(!nsfwWorldbook.includes('佩佩、白露'), 'NSFW 世界书不得再列佩佩/白露等已解禁角色。');

// ─── 变量世界书：NSFW 规则同步 ───
assert(variableWorldbook.includes('NSFW'), '变量世界书必须保留 NSFW 隔离规则。');

// ─── 伙伴补档 NSFW 基线 ───
assert(enrichment.includes('if (!baseline) return false') === false, '伙伴补档的 NSFW 基线不能只覆盖少数手写 baseline。');
assert(enrichment.includes('shouldCreateNsfwBaseline'), '必须保留 NSFW 基线创建门禁。');

// ─── 旧命令屏蔽 ───
assert(sendWorkflow.includes('getNsfwBlockedCommandReason'), '旧 NSFW 变量命令也必须经过目标屏蔽。');
assert(sendWorkflow.includes('智械') || sendWorkflow.includes('机械'), '旧命令屏蔽原因必须覆盖智械/机械。');
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
