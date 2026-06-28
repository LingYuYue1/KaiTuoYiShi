import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const app = fs.readFileSync('App.tsx', 'utf8');
const menu = fs.readFileSync('data/gameMenu.ts', 'utf8');
const promptBuilder = fs.readFileSync('hooks/useGame/systemPromptBuilder.ts', 'utf8');
const variableWorldbook = fs.readFileSync('data/variableWorldbook.ts', 'utf8');
const variableModel = fs.readFileSync('services/ai/variableModel.ts', 'utf8');
const variableOutputFormat = fs.readFileSync('prompts/cot/variableOutputFormat.ts', 'utf8');
const mainCot = fs.readFileSync('prompts/cot/mainCot.ts', 'utf8');
const inventoryPanel = fs.readFileSync('components/features/GameSystems/InventoryPanel.tsx', 'utf8');
const systemPanels = fs.readFileSync('components/features/GameSystems/SystemPanels.tsx', 'utf8');
const inventoryActions = fs.readFileSync('utils/inventoryActions.ts', 'utf8');
const inventoryModel = fs.readFileSync('models/inventory.ts', 'utf8');
const characterModel = fs.readFileSync('models/character.ts', 'utf8');
const variableExecutor = fs.readFileSync('utils/variableExecutor.ts', 'utf8');
const variableRegistry = fs.readFileSync('utils/variableRegistry.ts', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert(!menu.includes("| 'equipment'"), 'GameSystemId 不应再包含 equipment。');
assert(!menu.includes("id: 'equipment'"), '右侧系统菜单不应再显示装备入口。');

assert(!app.includes('EquipmentPanel'), 'App 不应再导入或渲染玩家装备面板。');
assert(!app.includes("case 'equipment'"), 'App 不应再保留 equipment 渲染分支。');
assert(!fs.existsSync('components/features/GameSystems/EquipmentPanel.tsx'), '未引用的装备面板文件应已删除。');
assert(!systemPanels.includes('export function EquipmentPanel'), '系统占位面板不应再保留 EquipmentPanel。');
assert(!fs.existsSync('models/equipment.ts'), '装备模型文件应已删除，新模型不应再声明旧装备槽位。');

assert(!promptBuilder.includes('buildEquipmentSection'), '主剧情 prompt 不应再构建装备注入段。');
assert(!promptBuilder.includes('# 已穿戴装备'), '主剧情真实请求不应再出现已穿戴装备段。');
assert(!promptBuilder.includes('EQUIP_SLOT_LABELS') && !promptBuilder.includes('EQUIP_SLOT_ORDER'), '主剧情 prompt 不应依赖装备槽位标签。');
assert(
  promptBuilder.includes('只作为背包物品类别,不再建立穿戴槽位或已穿戴状态'),
  '背包协议必须明确 lightcone/weapon/clothing/accessory 不再建立穿戴状态。',
);

assert(variableWorldbook.includes('旅人.装备'), '变量系统必须禁止写旅人.装备。');
assert(
  variableWorldbook.includes('背包物品.装备槽位') &&
    variableWorldbook.includes('背包物品.当前装备部位') &&
    variableWorldbook.includes('玩家装备系统已退役') &&
    variableWorldbook.includes('不再由新系统声明、读取或写回'),
  '变量系统必须禁止写装备槽位和当前装备部位。',
);
assert(!variableWorldbook.includes('装备槽位只能是'), '变量世界书不应再提供装备槽位取值规则。');
assert(variableModel.includes('不写装备槽位或穿戴状态') || variableOutputFormat.includes('不写装备槽位或穿戴状态'), '变量模型提示词必须禁止装备槽位和穿戴状态。');
assert(mainCot.includes('背包/物品') && !mainCot.includes('背包/装备'), '主剧情 CoT 状态域应改为背包/物品。');

assert(!inventoryPanel.includes('穿戴物品'), '背包 UI 不应再导入或调用穿戴物品。');
assert(!inventoryPanel.includes('卸下槽位'), '背包 UI 不应再导入或调用卸下槽位。');
assert(!inventoryPanel.includes('已穿戴'), '背包 UI 不应再展示已穿戴状态。');
assert(!inventoryPanel.includes('装备同步'), '背包 UI 不应再展示装备同步点。');
assert(!inventoryPanel.includes('装备槽位'), '背包 UI 不应再展示装备槽位详情。');
assert(!inventoryPanel.includes('EQUIP_SLOT_LABELS') && !inventoryPanel.includes('EQUIP_SLOT_ORDER'), '背包 UI 不应依赖装备槽位配置。');

assert(!inventoryActions.includes('export function 穿戴物品'), '背包服务层不应再暴露穿戴物品。');
assert(!inventoryActions.includes('export function 卸下槽位'), '背包服务层不应再暴露卸下槽位。');
assert(!inventoryActions.includes('读取装备叙事效果'), '背包服务层不应再派生已穿戴装备叙事效果。');
assert(!inventoryActions.includes('ACCESSORY_SLOTS') && !inventoryActions.includes('CLOTHING_SLOTS'), '背包服务层不应再依赖装备槽位族。');
assert(!inventoryActions.includes('装备槽位?:'), '新物品获取入口不应再接受装备槽位。');
assert(!inventoryActions.includes('属性加成?:'), '新物品获取入口不应再接受旧数值属性加成。');
assert(inventoryActions.includes('NARRATIVE_ITEM_CATEGORIES'), '背包服务层应使用叙事物品分类口径。');

assert(!inventoryModel.includes('EQUIPPABLE_CATEGORIES'), '背包模型不应再暴露可穿戴分类。');
assert(!inventoryModel.includes('function 是装备类') && !inventoryModel.includes('function 是已穿戴'), '背包模型不应再暴露穿戴判断函数。');
assert(!inventoryModel.includes('装备槽位?:') && !inventoryModel.includes('当前装备部位?:'), '背包物品模型不应再声明旧装备槽位字段。');
assert(!inventoryModel.includes('装备槽位: input.装备槽位'), '创建新背包物品时不应继续写装备槽位。');
assert(!inventoryModel.includes('属性加成?:') && !inventoryModel.includes('属性加成: input.属性加成'), '背包模型不应再声明或写入旧数值属性加成。');
assert(!inventoryModel.includes("from './equipment'"), '背包模型不应再依赖装备模型。');
assert(!characterModel.includes('type 旧装备槽位ID') && !characterModel.includes('装备:'), '角色模型不应再声明旅人.装备字段。');
assert(!characterModel.includes("from './equipment'"), '角色模型不应再依赖装备模型。');

assert(!variableExecutor.includes('out.装备槽位'), '变量执行器不应再把旧装备槽位落入新物品。');
assert(!variableExecutor.includes('out.属性加成'), '变量执行器不应再把旧数值属性加成落入新物品。');
assert(variableExecutor.includes('玩家装备系统已退役'), '变量执行器应注明忽略旧装备槽位的原因。');
assert(!variableRegistry.includes("'装备槽位'"), '变量登记表不应再推荐装备槽位字段。');
assert(variableRegistry.includes('禁止写装备槽位或穿戴状态'), '变量登记表应禁止装备槽位或穿戴状态。');
assert(!variableRegistry.includes('set 旅人.装备') && !variableRegistry.includes('旅人.背包 / 旅人.装备'), '变量登记表不应再把旅人.装备列为允许路径。');

assert(
  pkg.scripts?.['test:equipment-retirement'] === 'node scripts/equipment-retirement-regression.mjs',
  'package.json 必须提供 test:equipment-retirement 回归脚本。',
);

console.log('equipment retirement regression passed');
