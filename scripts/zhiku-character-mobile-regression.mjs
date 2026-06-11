import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const panel = fs.readFileSync('components/features/GameSystems/ZhikuPanel.tsx', 'utf8');

assert(
  panel.includes('grid min-h-0 min-w-0 flex-1 gap-3 overflow-y-auto overflow-x-hidden p-3 md:overflow-hidden'),
  'Zhiku workbench must allow page-level vertical scrolling on mobile instead of hard-clipping columns.',
);
assert(
  panel.includes("activeCategory === 'character'") &&
    panel.includes('md:grid-cols-[170px_220px_minmax(0,1fr)]') &&
    panel.includes('lg:grid-cols-[190px_260px_minmax(0,1fr)]'),
  'Character workspace columns must only activate at md+ breakpoints.',
);
assert(
  panel.includes('min-w-0 overflow-x-hidden overflow-y-visible md:min-h-0 md:overflow-y-auto md:pr-1'),
  'Character list and node columns must stack naturally on mobile and only use internal scrolling on desktop.',
);
assert(
  !panel.includes('形态 / 节点') &&
    !panel.includes('开发者底层字段'),
  'Character profile UI must not reintroduce the removed node column or legacy developer metadata drawer.',
);
assert(
  panel.includes('className="h-full min-h-0 min-w-0 overflow-y-auto px-3 py-4 md:px-4"'),
  'Character detail panel must keep its own readable vertical scroll area.',
);
assert(
  panel.includes('CharacterProfileWorkspace') &&
    panel.includes('grid gap-3 lg:grid-cols-[9.5rem_minmax(0,1fr)]') &&
    panel.includes('flex gap-1.5 overflow-x-auto pb-1 lg:sticky lg:top-0 lg:block') &&
    panel.includes('sectionTabs.map') &&
    panel.includes('setActiveSection(item.key)') &&
    panel.includes('text-[12px] font-mono font-semibold') &&
    panel.includes('lg:text-[13px]') &&
    panel.includes("{ key: 'story', label: '故事', available: Boolean(story) }") &&
    panel.includes("visibleSection === 'story'") &&
    panel.includes('角色档案工作台') &&
    panel.includes('基础身份层') &&
    panel.includes('关键词触发') &&
    panel.includes('CharacterKeywordTile') &&
    panel.includes('核心触发词') &&
    panel.includes("{ label: '外貌', value: appearance || '未标注', missing: !appearance, wide: true }") &&
    panel.includes('md:col-span-2') &&
    panel.includes("{ label: '形态', value: get('形态', meta.形态 || '未标注'), missing: !get('形态') && !meta.形态 }") &&
    panel.includes("{ label: '出身', value: get('出身', '未标注'), missing: !get('出身') }") &&
    panel.includes('身份 / 职务') &&
    !panel.includes("{ label: '活动区域'") &&
    !panel.includes("{ label: '当前默认状态'") &&
    !panel.includes("{ label: '使用范围'") &&
    !panel.includes("{ label: '不可臆造项'") &&
    panel.includes('门禁中心') &&
    panel.includes('门禁内容完整可见，按剧情状态注入') &&
    panel.includes('启用方式') &&
    panel.includes('显现机制') &&
    panel.includes('触发后注入') &&
    panel.includes('外貌规则') &&
    panel.includes('人格规则') &&
    panel.includes('继承规则') &&
    panel.includes('记忆规则') &&
    panel.includes('提前启用边界'),
  'New character profile workbench must stay vertically readable on mobile and only become a right-detail sub-workbench at lg+.',
);

console.log('zhiku character mobile regression ok');
