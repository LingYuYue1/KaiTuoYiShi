import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const requireText = (source, expected, label) => {
  if (!source.includes(expected)) throw new Error(`${label}: missing ${expected}`);
};

const types = read('components/features/ZhikuV2/types.ts');
const screen = read('components/features/ZhikuV2/ZhikuScreen.tsx');
const pageFrame = read('components/features/ZhikuV2/ZhikuPageFrame.tsx');
const header = read('components/features/ZhikuV2/ZhikuHeader.tsx');
const screenCss = read('components/features/ZhikuV2/zhiku-v2.css');
const lab = read('components/features/ZhikuV2/ZhikuDesignLab.tsx');
const categoryNode = read('components/features/ZhikuV2/CategoryNode.tsx');
const story = read('stories/ZhikuDesignLab.stories.tsx');

for (const id of ['character', 'story', 'location', 'faction', 'event', 'enemy', 'aeon', 'path', 'term']) {
  requireText(types, `id: '${id}'`, `category ${id}`);
}
requireText(types, "label: '剧情档案'", 'story archive category');
requireText(types, "label: '敌对生物'", 'enemy category');
requireText(types, "iconSrc: '/assets/zhiku/icon-trace/gold-emblem-trace.svg'", 'character emblem');
requireText(types, "iconSrc: '/assets/zhiku/icon-trace/story-archive-emblem-concept-a.svg'", 'story archive emblem');
requireText(types, "iconSrc: '/assets/zhiku/icon-trace/location-emblem-concept-a.svg'", 'location emblem');
requireText(types, "iconSrc: '/assets/zhiku/icon-trace/faction-emblem-precision-a.svg'", 'faction emblem');
requireText(types, "iconSrc: '/assets/zhiku/icon-trace/event-emblem-concept-a.svg'", 'event emblem');
requireText(types, "iconSrc: '/assets/zhiku/icon-trace/enemy-emblem-precision-h.svg'", 'enemy emblem');
requireText(types, "iconSrc: '/assets/zhiku/icon-trace/aeon-emblem-precision-c.svg'", 'aeon emblem');
requireText(types, "iconSrc: '/assets/zhiku/icon-trace/path-emblem-precision-c.svg'", 'path emblem');
requireText(types, "iconSrc: '/assets/zhiku/icon-trace/term-emblem-precision-a.svg'", 'term emblem');
requireText(types, 'featured: true', 'featured character');
requireText(screen, '<ZhikuPageFrame', 'shared page frame');
requireText(pageFrame, '/assets/zhiku/zhiku-archive-hall-background-concept-v3.webp', 'V3 background');
requireText(pageFrame, 'zhiku-v2-screen__pin--top-right', 'top-right frame pin');
requireText(pageFrame, 'zhiku-v2-screen__pin--bottom-left', 'bottom-left frame pin');
requireText(screenCss, '.zhiku-v2-screen__pin', 'frame pin styling');
requireText(screenCss, 'pointer-events: none', 'non-interactive frame pins');
requireText(header, 'aria-label="关闭智库"', 'close command');
requireText(lab, '<ZhikuScreen', 'real screen component');
requireText(lab, '<CategoryNode', 'real node component');
requireText(lab, 'useDraggable', 'node dragging');
requireText(lab, 'ZHIKU_VIEWPORTS', 'viewport presets');
requireText(lab, 'downloadJson', 'JSON export');
requireText(lab, 'applyJson', 'JSON apply');
requireText(lab, 'resetLayout', 'layout reset');
requireText(lab, "querySelector<HTMLElement>('.zhiku-v2-screen__stage')", 'logical stage drag bounds');
requireText(lab, "ZHIKU_DESIGN_LAYOUT_STORAGE_KEY = 'kaituo.zhiku-v2.design-layout.v1'", 'versioned layout storage key');
requireText(lab, 'window.localStorage.getItem(persistenceKey)', 'saved layout restore');
requireText(lab, 'window.localStorage.setItem(persistenceKey, serializedLayout)', 'layout persistence');
requireText(lab, 'aria-label="保存布局"', 'save layout control');
requireText(categoryNode, "'--zhiku-node-icon': `url(\"${category.iconSrc}\")`", 'category emblem mask source');
requireText(categoryNode, 'className="zhiku-v2-node__icon"', 'category emblem mask');
requireText(story, "title: '开拓轶事/智库 V2/可视化设计台'", 'Storybook path');
requireText(story, "layout: 'fullscreen'", 'fullscreen Storybook layout');

if (lab.includes('ZhikuPanel') || screen.includes('ZhikuPanel')) {
  throw new Error('Zhiku V2 design tooling must not import or render the production ZhikuPanel.');
}
if (header.includes('Search') || header.includes('onSearch') || header.includes('搜索智库') || screen.includes('onSearch')) {
  throw new Error('Zhiku V2 must not expose the retired search command.');
}
if (categoryNode.includes('category.shortLabel') || categoryNode.includes('zhiku-v2-node__glyph')) {
  throw new Error('Zhiku V2 nodes must not render the retired single-character placeholders.');
}
if (screenCss.includes(".zhiku-v2-node[data-featured='true'] .zhiku-v2-node__emblem::after")) {
  throw new Error('The featured character emblem must not receive a unique outer box.');
}
for (const asset of [
  'gold-emblem-trace.svg',
  'story-archive-emblem-concept-a.svg',
  'location-emblem-concept-a.svg',
  'faction-emblem-precision-a.svg',
  'event-emblem-concept-a.svg',
  'enemy-emblem-precision-h.svg',
  'aeon-emblem-precision-c.svg',
  'path-emblem-precision-c.svg',
  'term-emblem-precision-a.svg',
]) {
  if (!fs.existsSync(path.join(root, 'public/assets/zhiku/icon-trace', asset))) {
    throw new Error(`Zhiku V2 category emblem is missing: ${asset}`);
  }
}
if (!fs.existsSync(path.join(root, 'public/assets/zhiku/zhiku-archive-hall-background-concept-v3.webp'))) {
  throw new Error('V3 Zhiku background asset is missing.');
}

console.log('ZHIKU_DESIGN_LAB_REGRESSION_OK');
