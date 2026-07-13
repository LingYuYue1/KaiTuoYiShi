import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const wizard = fs.readFileSync('components/features/NewGame/NewGameWizard.tsx', 'utf8');
const service = fs.readFileSync('services/ai/skillGenerator.ts', 'utf8');

assert(service.includes('generateSkillDraft'), '战技生成服务必须保留 generateSkillDraft。');
assert(service.includes('玩家额外提示词'), '战技生成服务必须支持玩家额外提示词。');
assert(service.includes('不是生成回合制数值技能'), '战技生成提示词必须保持小说化战技口径。');

assert(wizard.includes("import { generateSkillDraft } from '@/services/ai/skillGenerator'"), '开局向导必须导入战技生成服务。');
assert(wizard.includes('openingSkillGenerationHint'), '开局战技生成必须提供玩家提示词输入。');
assert(wizard.includes('openingSkillGenerating'), '开局战技生成必须有生成中状态。');
assert(wizard.includes('openingSkillGenerationMessage'), '开局战技生成必须有结果/错误提示。');
assert(wizard.includes('generateOpeningSkillWithAI'), '开局向导必须提供 AI 生成开局战技函数。');
assert(wizard.includes('openingArchiveApiConfig'), '开局战技生成必须复用主 API 配置。');
assert(wizard.includes('AI 生成战技'), '开局战技页必须显示 AI 生成战技按钮。');
assert(wizard.includes('生成结果只会写入下方草稿'), '开局战技页必须说明生成不会自动写入槽位。');
assert(wizard.includes('setOpeningSkillNameDraft(generated.名称)'), 'AI 生成结果必须回填战技名称草稿。');
assert(wizard.includes('setOpeningSkillDescDraft(generated.描述)'), 'AI 生成结果必须回填战技描述草稿。');
assert(wizard.includes('setOpeningSkillKeywordsDraft(generated.关键词.join'), 'AI 生成结果必须回填关键词草稿。');
assert(wizard.includes('onGenerateOpeningSkill={generateOpeningSkillWithAI}'), '开局战技步骤必须绑定生成函数。');

console.log('opening skill generation regression ok');
