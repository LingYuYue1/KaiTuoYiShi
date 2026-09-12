import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const enrichment = fs.readFileSync('utils/npcArchiveEnrichment.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const canonicalCharacters = fs.readFileSync('data/canonicalCharacters.ts', 'utf8');
const companionPanel = fs.readFileSync('components/features/GameSystems/CompanionPanel.tsx', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');
const promptBuilder = fs.readFileSync('hooks/useGame/systemPromptBuilder.ts', 'utf8');
const phoneService = fs.readFileSync('services/ai/phoneService.ts', 'utf8');

assert(enrichment.includes('export function enrichNpcArchives'), '必须导出伙伴档案补全器。');
assert(enrichment.includes('CANONICAL_ARCHIVE_BASELINES'), '必须有原著角色公共档案补全基线。');
assert(!enrichment.includes('buildZhikuArchiveBaseline'), 'NPC 补档不得复制智库静态正文。');
assert(!enrichment.includes("from '@/models/zhiku'"), 'NPC 补档器不得直接读取完整智库目录。');
assert(!/options:\s*\{[^}]*zhiku\??:/s.test(enrichment), 'NPC 补档参数不得接收智库系统。');
assert(enrichment.includes('shouldPatchArchiveField'), '补全器必须能修复旧存档里的弱字段/占位字段。');
assert(enrichment.includes('isWeakArchiveText'), '必须识别旧档案弱文本，避免“沉默寡言”等占位长期卡住。');
assert(enrichment.includes('shouldPatchArchiveField(updated.外貌, baseline.外貌)'), '外貌必须支持空字段与弱字段补齐。');
assert(enrichment.includes('shouldPatchArchiveField(updated.性格, baseline.性格)'), '性格必须支持空字段与弱字段补齐。');
assert(enrichment.includes('shouldPatchArchiveField(updated.穿着, baseline.穿着)'), '穿着必须支持空字段与弱字段补齐。');
assert(enrichment.includes('shouldPatchArchiveField(updated.说话方式, baseline.说话方式)'), '说话方式必须支持空字段与弱字段补齐。');
assert(enrichment.includes('星:') && enrichment.includes('主动吐槽、接梗、追问'), '星的伙伴档案补全必须包含具体说话方式，避免长期沉默。');
assert(enrichment.includes('穹:') && enrichment.includes('失忆不等于无个性'), '穹的伙伴档案补全必须避免被写成空白沉默工具人。');

assert(!enrichment.includes('NSFW档案'), 'NPC 公共档案补全器不得创建、清理或改写 NSFW 档案。');
assert(!enrichment.includes('nsfwEnabled') && !enrichment.includes('maleNsfwArchiveEnabled'), '公共档案补全器不得接收 NSFW 开关。');

assert(/import\s+\{[^}]*enrichNpcArchives[^}]*\}\s+from\s+['"]@\/utils\/npcArchiveEnrichment['"]/.test(sendWorkflow), 'sendWorkflow 必须引入伙伴档案补全器。');
assert(sendWorkflow.includes('const archiveEnrichment = enrichNpcArchives(npcSource'), '变量校准后必须先补全伙伴档案。');
assert(sendWorkflow.includes('const archiveEnrichment = enrichNpcArchives(npcSource);'), '后台 NPC 补档必须使用纯公共档案接口。');
assert(sendWorkflow.includes('const npcSourceForCompression = archiveEnrichment.records'), 'NPC 记忆压缩必须使用补全后的伙伴档案。');
assert(sendWorkflow.includes('archiveEnrichment.changed'), '补全产生变化时必须写回 NPC state。');
assert(companionPanel.includes('enrichNpcArchives(normalized'), '伙伴面板展示前也必须补全旧档案，避免旧存档空字段一直显示为空。');
assert(!companionPanel.includes('zhikuSystem'), '伙伴面板不得读取完整智库目录来补写 NPC 静态档案。');
assert(companionPanel.includes('onNpcRecordsChange(enriched.records)'), '伙伴面板发现旧档案可补全时必须写回 state。');
assert(!app.includes('maleNsfwArchiveEnabled={ctx.gameSettings.enableMaleNsfwArchive}'), '伙伴面板不再负责 NSFW 补档，不应接收男性档案开关。');
const companionUsage = app.match(/<CompanionPanel([\s\S]*?)\/>/)?.[1] ?? '';
assert(companionUsage && !companionUsage.includes('zhikuSystem'), 'App 不得把完整智库传给伙伴面板。');
assert(promptBuilder.includes('说话方式：${n.说话方式}') && promptBuilder.includes('穿着：${n.穿着}'), '主剧情伙伴注入必须包含说话方式和穿着。');
assert(promptBuilder.includes('不要连续数回合只沉默旁观'), '主剧情伙伴注入必须约束原著角色不要长期沉默旁观。');
assert(phoneService.includes('外貌：${npc.外貌}') && phoneService.includes('说话方式：${npc.说话方式}'), '手机私聊上下文必须注入 NPC 外貌/说话方式。');
assert(phoneService.includes('compileZhikuPhoneView(ctx.zhiku, names).phonePersonaView'), '手机人物锚点必须消费阶段五编译器派生视图。');
assert(!phoneService.includes('isPhoneAllowedZhikuEntry') && !phoneService.includes('比较智库人物节点'), '手机服务不得保留第二套智库门禁或人物选择器。');

assert(canonicalCharacters.includes('熟悉同伴后会自然吐槽和接梗'), '星的原著性格兜底仍必须保留。');
assert(canonicalCharacters.includes('三月七') && canonicalCharacters.includes('丹恒'), '原著角色库必须覆盖列车核心角色。');

console.log('npc archive enrichment regression ok');
