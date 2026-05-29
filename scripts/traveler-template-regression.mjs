import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const service = fs.readFileSync('services/ai/travelerTemplate.ts', 'utf8');
const wizard = fs.readFileSync('components/features/NewGame/NewGameWizard.tsx', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');

assert(service.includes('generateTravelerTemplate'), '必须保留旅人模板生成服务。');
assert(service.includes('chatCompletionNonStream'), '旅人模板必须走主 API 的非流式调用。');
assert(service.includes('只输出 JSON 对象'), '模板提示词必须要求只输出 JSON。');
assert(service.includes('不要让玩家取代星/穹'), '模板提示词必须防止玩家取代原著主角。');
assert(service.includes('不要默认玩家是星穹列车既定成员'), '模板提示词必须防止默认列车成员身份。');
assert(service.includes('不是路人 NPC 模板'), '模板提示词必须避免生成弱路人 NPC 模板。');
assert(service.includes('用户提供了生成偏好'), '模板提示词必须支持玩家生成偏好。');
assert(service.includes('黑塔空间站危机'), '模板提示词必须围绕当前开局锚点。');
assert(service.includes('parseTravelerTemplateJson'), '模板服务必须解析模型 JSON。');
assert(service.includes('normalizeTravelerTemplate'), '模板服务必须归一化输出字段。');
assert(service.includes('existingName') && service.includes('existingGender') && service.includes('existingAge'), '模板生成必须读取已有姓名/性别/年龄锚点。');
assert(service.includes('userPrompt'), '模板生成必须读取玩家输入的生成偏好。');

assert(wizard.includes('onGenerateTravelerTemplate'), '新开局向导必须接收模板生成回调。');
assert(wizard.includes('随机生成模板'), '角色档案页必须显示随机生成模板按钮。');
assert(wizard.includes('templatePrompt'), '角色档案页必须提供模板生成偏好输入框。');
assert(wizard.includes('可填生成偏好'), '角色档案页必须提示玩家可以填写生成偏好。');
assert(wizard.includes('该功能走主 API 模型'), '角色档案页必须提示模板生成走主 API 模型。');
assert(wizard.includes('templateLoading'), '按钮必须有生成中状态。');
assert(wizard.includes('templateError'), '按钮必须有错误提示。');
assert(wizard.includes('onAppearance(draft.appearance)'), '模板生成必须填入外貌。');
assert(wizard.includes('onPersonality(draft.personality)'), '模板生成必须填入性格。');
assert(wizard.includes('onBackground(draft.background)'), '模板生成必须填入背景。');

assert(app.includes('generateTravelerTemplate'), 'App 必须把主 API 模板生成服务传给 NewGameWizard。');
assert(app.includes('请先在设置中配置至少一个 API 接口'), '未配置 API 时必须给玩家明确提示。');

console.log('traveler template regression ok');
