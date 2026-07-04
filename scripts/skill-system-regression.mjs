import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const skillModel = fs.readFileSync('models/skill.ts', 'utf8');
const skillIndex = fs.readFileSync('models/index.ts', 'utf8');
const skillPanel = fs.readFileSync('components/features/GameSystems/SkillPanel.tsx', 'utf8');
const skillGenerator = fs.readFileSync('services/ai/skillGenerator.ts', 'utf8');
const promptBuilder = fs.readFileSync('hooks/useGame/systemPromptBuilder.ts', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert(
  skillModel.includes('export const NORMAL_SKILL_SLOT_COUNT = 1'),
  '普通战技槽位必须固定为 1 个。',
);
assert(
  skillModel.includes('export function 计算命途战技槽位数(stage: number): number') &&
    skillModel.includes('return Math.max(1, Math.min(5, stage + 1));'),
  '命途战技槽位解锁逻辑必须保持不变。',
);

assert(!fs.existsSync('data/skillPresets.ts'), '内置普通战技预设文件应删除。');
assert(!skillModel.includes('interface 战技模板'), '战技模型不应再保留内置模板类型。');
assert(!skillIndex.includes('战技模板'), '模型聚合导出不应再导出战技模板。');

for (const source of [skillPanel, promptBuilder]) {
  assert(!source.includes('NORMAL_SKILL_PRESETS'), '战技系统不应再引用 NORMAL_SKILL_PRESETS。');
  assert(!source.includes('skillPresets'), '战技系统不应再导入 skillPresets。');
  assert(!source.includes('普通战技模板'), '战技系统 UI / prompt 不应再出现普通战技模板。');
  assert(!source.includes('普通模板'), '战技系统 UI / prompt 不应再出现普通模板。');
  assert(!source.includes('内置模板'), '战技系统 UI / prompt 不应再出现内置模板。');
  assert(!source.includes('只能从内置'), '战技系统不应再限制普通战技只能选内置。');
  assert(!source.includes('不能自定义'), '战技系统不应再阻止普通战技自定义。');
}

assert(!skillPanel.includes('function NormalSkillReadonly'), '普通战技不应再使用只读展示组件。');
assert(!skillPanel.includes('applyPreset'), '普通战技不应再有预设写入逻辑。');
assert(
  skillPanel.includes("类别: selectedSlot.kind === 'normal' ? '普通' : '命途'") &&
    skillPanel.includes("selectedSlot.kind === 'normal' ? '普通战技自制' : '命途战技自定义'"),
  '保存战技时必须按槽位类型创建普通自制或命途自定义记录。',
);
assert(
  skillPanel.includes('filter(isVisibleSkillRecord)') &&
    skillPanel.includes('function isVisibleSkillRecord') &&
    skillPanel.includes('skill.槽位序号 >= 1 && skill.槽位序号 <= NORMAL_SKILL_SLOT_COUNT'),
  '战技面板必须隐藏旧存档中普通 2/3 槽记录。',
);
assert(
  skillPanel.includes('普通战技保留 1 个自制槽位') &&
    skillPanel.includes('创造普通战技') &&
    skillPanel.includes('普通自制'),
  '战技面板文案必须说明普通战技是 1 个自制槽位。',
);

assert(
  promptBuilder.includes('该槽位由玩家自制，不再使用内置普通战技预设') &&
    promptBuilder.includes('已登记普通自制战技'),
  '主剧情战技注入必须说明普通槽位为玩家自制。',
);
assert(
  promptBuilder.includes("skill.槽位类型 !== 'normal' || (skill.槽位序号 >= 1 && skill.槽位序号 <= NORMAL_SKILL_SLOT_COUNT)"),
  '主剧情战技注入必须过滤旧普通 2/3 槽。',
);

assert(
  pkg.scripts?.['test:skill-system'] === 'node scripts/skill-system-regression.mjs',
  'package.json 必须提供 test:skill-system 回归脚本。',
);

assert(skillPanel.includes('generateSkillDraft(activeApiConfig'), '战技面板必须复用当前主剧情 API 生成 AI 草稿。');
assert(skillPanel.includes('AI 生成') && skillPanel.includes('生成中…'), '战技面板必须提供 AI 生成按钮与加载态。');
assert(skillPanel.includes('生成提示词') && skillPanel.includes('userHint: generationHint'), '战技 AI 生成必须允许玩家填写额外提示词。');
assert(skillPanel.includes('已生成草稿。你可以继续修改，确认后再写入槽位。'), 'AI 生成战技必须只填入草稿，不得自动写入槽位。');
assert(skillPanel.includes('突进、牵制、制造破绽、短暂脱力'), '关键词占位必须使用小说化标签，不能回退到回合制标签。');
assert(skillGenerator.includes('小说化剧情战技草稿'), '战技生成提示词必须定位为小说化剧情战技。');
assert(skillGenerator.includes('禁止输出百分比、倍率、回合数、技能点'), '战技生成提示词必须禁止数值化回合制机制。');
assert(skillGenerator.includes('可以诗意、可以直白贴合技能、可以带轻微网络梗或冷幽默'), '战技名称生成必须支持崩铁式多元命名风格。');
assert(skillGenerator.includes('不要每次都写成四字玄幻招式名'), '战技名称生成必须避免单一玄幻招式名。');
assert(skillGenerator.includes('PATH_STYLE_GUIDE'), '战技生成必须按命途气质提供设计口径。');
assert(skillGenerator.includes('parseJsonWithRepair'), '战技生成结果必须用 JSON 修复解析，兼容模型输出。');

console.log('skill system regression passed');
