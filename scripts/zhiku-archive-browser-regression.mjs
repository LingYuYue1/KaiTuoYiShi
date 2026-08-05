import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const requireText = (source, expected, label) => {
  if (!source.includes(expected)) throw new Error(`${label}: missing ${expected}`);
};

const browser = read('components/features/ZhikuV3/ArchiveBrowser.tsx');
const pageFrame = read('components/features/ZhikuV3/ZhikuPageFrame.tsx');
const header = read('components/features/ZhikuV3/ZhikuHeader.tsx');
const css = read('components/features/ZhikuV3/archive-browser.css');
const fontControl = read('components/features/ZhikuV3/ReaderFontSizeControl.tsx');
const fontControlCss = read('components/features/ZhikuV3/reader-font-size-control.css');
const fontSize = read('components/features/ZhikuV3/readerFontSize.ts');
const story = read('stories/ZhikuArchiveBrowser.stories.tsx');
const referenceStory = read('stories/ZhikuReferenceArchive.stories.tsx');
const retrieval = read('services/zhikuRetrieval.ts');
const formattingModuleUrl = pathToFileURL(
  path.join(root, 'components/features/ZhikuV3/archiveDocumentFormatting.ts'),
).href;
const { formatArchiveParagraphLine } = await import(formattingModuleUrl);

requireText(browser, 'export function ArchiveBrowser', 'shared archive browser component');
requireText(browser, 'items: ZhikuArchiveItem[]', 'flat archive item contract');
requireText(browser, 'items = []', 'runtime-safe empty item fallback');
requireText(browser, 'setSelectedItemId(item.id)', 'same-page item selection');
requireText(browser, 'renderArchiveDocument(selectedInjectionVariant?.body || selectedItem.body)', 'same-page document rendering with multi-form preview');
requireText(browser, '.map(formatArchiveParagraphLine)', 'voice corpus display formatting');
requireText(browser, 'zhiku-v3-browser__catalog', 'left character catalog');
requireText(browser, 'zhiku-v3-browser__detail', 'right archive detail');
requireText(browser, 'category.id.toUpperCase()', 'category-specific archive kicker');
requireText(browser, 'item.subtitle ?? item.meta ?? category.label', 'category-aware item fallback');
requireText(browser, 'aria-label={`${category.label}内容视图`}', 'category-aware detail view label');
requireText(browser, 'avatarSrc?: string', 'optional avatar source');
requireText(browser, "const showItemVisual = category.id === 'character'", 'character-only list avatar policy');
requireText(browser, "data-has-visual={showItemVisual ? 'true' : 'false'}", 'category visual layout state');
requireText(browser, '{showItemVisual && (', 'conditional avatar rendering');
requireText(browser, "@/components/ui/ResilientImage", 'shared resilient avatar import');
requireText(browser, '<ResilientImage', 'real avatar rendering with local failure fallback');
requireText(browser, '<UserRound', 'missing avatar fallback');
requireText(browser, 'aria-pressed={active}', 'selected character semantics');
requireText(browser, 'data-status={item.status', 'entry status styling');
requireText(browser, '暂无可阅读档案', 'empty state');
requireText(browser, '<ZhikuPageFrame', 'shared visual frame');
requireText(browser, "import './zhiku-v3.css'", 'standalone shared page styling');
requireText(browser, 'zhiku-v3-browser__catalog-identity', 'navigation integrated into catalog header');
requireText(browser, 'aria-label="返回分类大厅"', 'integrated back command');
requireText(browser, 'zhiku-v3-browser__close', 'page-level close command');
requireText(browser, 'aria-label="关闭智库"', 'accessible page close command');
requireText(browser, "useState<ZhikuArchiveView>('archive')", 'archive preview as default detail view');
requireText(browser, 'role="tablist"', 'semantic detail view switch');
requireText(browser, '档案预览', 'archive preview tab');
requireText(browser, '注入内容', 'injection content tab');
requireText(browser, '形态召回关键词', 'single form-aware trigger keyword section');
requireText(browser, 'injectionPreview?: string', 'read-only injection preview contract');
requireText(browser, 'triggerKeywords?: string[]', 'trigger keyword contract');
requireText(browser, 'export interface ZhikuArchiveInjectionVariant', 'multi-form injection preview contract');
requireText(browser, 'injectionVariants?: ZhikuArchiveInjectionVariant[]', 'optional per-character form variants');
requireText(browser, 'secondaryKeywords: string[]', 'per-form secondary keyword contract');
requireText(browser, 'secondaryKeywordLogic?: 智库辅助关键词逻辑', 'per-form secondary keyword logic contract');
requireText(browser, 'const displayKeywords = Array.from(new Set([', 'deduplicated form-aware keyword display');
requireText(browser, "secondaryKeywordLogic === 'AND_ANY' || secondaryKeywordLogic === 'AND_ALL' ? secondaryKeywords : []", 'positive form keywords merged into the single keyword list');
requireText(browser, 'SECONDARY_KEYWORD_LOGIC_LABELS', 'human-readable secondary keyword logic labels');
for (const logicLabel of ['主关键词 + 任一形态限定词', '主关键词 + 全部形态限定词', '主关键词，且排除其他形态词', '主关键词，且不同时出现全部排除词']) {
  requireText(browser, logicLabel, `secondary keyword logic label: ${logicLabel}`);
}
if (browser.includes('<h3>副关键词条件</h3>') || browser.includes('SECONDARY KEYWORDS')) {
  throw new Error('Form preview must not render primary and secondary keywords as two large tables.');
}
requireText(browser, "useState('')", 'local-only form preview selection state');
requireText(browser, 'aria-label="选择注入形态"', 'accessible read-only form switch');
requireText(browser, 'setSelectedInjectionVariantId(variant.id)', 'form preview changes only local component state');
requireText(browser, 'injectionVariants.length > 1', 'single-form characters must not show an empty form switch');
requireText(browser, "event.key === 'ArrowRight'", 'keyboard-operable detail tabs');
requireText(pageFrame, 'zhiku-v3-screen__pin--top-right', 'shared top-right frame pin');
requireText(pageFrame, 'zhiku-v3-screen__pin--bottom-left', 'shared bottom-left frame pin');
requireText(pageFrame, '/assets/zhiku/archive-hall-background.webp', 'shared V3 background');
requireText(header, 'aria-label="返回分类大厅"', 'back to category hub command');
requireText(css, 'grid-template-columns: minmax(236px, 28%) minmax(0, 1fr)', 'desktop left-right archive layout');
requireText(css, 'inset: 0', 'full-viewport page-level archive workspace');
requireText(css, '.zhiku-v3-browser .zhiku-v3-screen__pin--bottom-left', 'non-occluding bottom frame pin');
requireText(css, '.zhiku-v3-browser__catalog ol', 'scrolling character catalog');
requireText(css, '.zhiku-v3-browser__catalog ol button', 'catalog item styles scoped away from navigation');
requireText(css, '.zhiku-v3-browser__avatar img', 'avatar image treatment');
requireText(css, 'grid-template-columns: 24px minmax(0, 1fr) 14px', 'non-character text-only catalog column');
requireText(css, 'grid-template-columns: 24px 48px minmax(0, 1fr) 14px', 'desktop square avatar column');
requireText(css, 'width: 48px', 'desktop square avatar width');
requireText(css, 'height: 48px', 'desktop square avatar height');
requireText(css, 'border-radius: 6px', 'desktop rounded avatar corners');
requireText(css, 'grid-template-columns: 19px 42px minmax(0, 1fr) 12px', 'narrow square avatar column');
requireText(css, '.zhiku-v3-browser__document', 'in-page document reader');
requireText(css, '.zhiku-v3-browser__view-tabs', 'compact detail view switch styling');
requireText(css, '.zhiku-v3-browser__trigger-keywords', 'non-pill trigger keyword layout');
requireText(css, '.zhiku-v3-browser__keyword-rule', 'secondary keyword rule styling');
requireText(css, '.zhiku-v3-browser__form-preview > span,\n.zhiku-v3-browser__injection-heading > span,\n.zhiku-v3-browser__keyword-rule > span {\n  color: rgba(var(--zhiku-gold), 0.82);', 'high-contrast warm metadata labels');
requireText(css, 'white-space: pre-wrap', 'wrapped injection payload');
requireText(browser, '<ReaderFontSizeControl', 'shared archive font size control');
requireText(browser, 'buildZhikuReaderStyle(readerFontSize)', 'archive reader font variables');
requireText(css, 'var(--zhiku-reader-font-size, 17px)', 'adjustable archive body size');
requireText(css, 'var(--zhiku-reader-injection-font-size, 16px)', 'adjustable injection payload size');
requireText(fontControl, '减小档案字号', 'accessible decrease font command');
requireText(fontControl, '增大档案字号', 'accessible increase font command');
requireText(fontControlCss, 'width: 116px', 'stable font control width');
requireText(fontControlCss, '@media (max-width: 640px)', 'mobile font control placement');
requireText(fontSize, "'kaituo-zhiku-reader-font-size'", 'persisted reader font preference');
requireText(fontSize, 'ZHIKU_READER_FONT_SIZE_MIN = 14', 'reader minimum size');
requireText(fontSize, 'ZHIKU_READER_FONT_SIZE_MAX = 24', 'reader maximum size');
requireText(fontSize, 'ZHIKU_READER_FONT_SIZE_DEFAULT = 17', 'larger default reader size');
requireText(css, '@media (max-width: 520px)', 'narrow viewport layout');
requireText(story, "title: '开拓轶事/智库 V3/二级页面'", 'Storybook secondary page path');
requireText(story, 'const characterItems: ZhikuArchiveItem[]', 'flat character fixture');
requireText(story, 'getDefaultBuiltinAvatar', 'existing local avatar reuse');
requireText(story, '获取智库核心触发词(entry)', 'curated core trigger keywords');
requireText(story, 'buildZhikuEntryInjectionPreview(entry)', 'production-format injection preview');
requireText(story, 'character-rebuild-core.json', 'real character fixture');
requireText(story, 'export const 人物最终页', 'final secondary page story');
requireText(referenceStory, "title: '开拓轶事/智库 V3/其他二级页面'", 'other category Storybook path');
for (const storyName of ['地点最终页', '派系最终页', '事件最终页', '星神最终页', '命途最终页', '专有名词最终页', '敌对生物空状态']) {
  requireText(referenceStory, `export const ${storyName}`, `${storyName} story`);
}
for (const fixture of ['location-core.json', 'term-core.json', 'paths-core.json', 'aeons-core.json', 'worldview-core.json', 'xianzhou-history.json']) {
  requireText(referenceStory, fixture, `${fixture} real fixture`);
}
requireText(referenceStory, 'id: entry.id ?? `zhiku-v3-${categoryId}-${index + 1}`', 'stable fixture entry identity');
requireText(referenceStory, 'buildZhikuEntryInjectionPreview(normalizedEntry)', 'shared injection preview for reference categories');
requireText(referenceStory, 'const enemyItems: ZhikuArchiveItem[] = []', 'honest enemy empty state');
if (referenceStory.includes('avatarSrc:') || referenceStory.includes('avatarAlt:')) {
  throw new Error('Non-character secondary pages must not render character-style avatar frames.');
}
if (referenceStory.includes('剧情档案最终页') || referenceStory.includes("getCategory('story'")) {
  throw new Error('Story archives must remain separate until their special read-only structure is confirmed.');
}
requireText(retrieval, 'export function buildZhikuEntryInjectionPreview', 'pure entry injection preview formatter');
requireText(retrieval, 'return renderZhikuEntryStaticInjection(entry)', 'preview reuses production entry formatter');

const forbiddenGroupingReferences = [
  'ZhikuArchiveGroup',
  'activeGroupId',
  'initialGroupId',
  'selectGroup',
  'zhiku-v3-browser__groups',
  'zhiku-v3-browser__item-track',
];
for (const reference of forbiddenGroupingReferences) {
  if (browser.includes(reference) || css.includes(reference)) {
    throw new Error(`Zhiku V3 character page must not retain location grouping: ${reference}`);
  }
}

if (css.includes('inset: 15.5% 4.2% 7.8%') || css.includes('inset: 16% 4% 8%')) {
  throw new Error('Character archive workspace must not return to a framed inset panel.');
}
if (browser.includes('<ZhikuHeader') || browser.includes('角色索引')) {
  throw new Error('Character archive must integrate navigation into the left catalog instead of reserving a separate header band.');
}

if (story.includes('toGroup(') || story.includes('characterGroups') || story.includes('groups:')) {
  throw new Error('Character Storybook data must be flattened instead of grouped by location.');
}
if (browser.includes('onOpenItem') || browser.includes('onOpenDetail') || browser.includes('三级')) {
  throw new Error('Zhiku V3 archive pages must render final content in place without a tertiary page contract.');
}
for (const forbiddenFormMutation of ['onSelectForm', 'onChangeForm', 'setCurrentForm', '关联形态ID: selectedInjectionVariant']) {
  if (browser.includes(forbiddenFormMutation)) {
    throw new Error(`Form preview must not mutate runtime or persisted character state: ${forbiddenFormMutation}`);
  }
}
if (browser.includes('onSearch') || browser.includes('搜索智库') || header.includes('搜索智库')) {
  throw new Error('Zhiku V3 must not restore the retired search command.');
}
if (browser.includes('ZhikuMaintenancePanel') || story.includes('ZhikuMaintenancePanel')) {
  throw new Error('Zhiku V3 archive page must not embed the maintenance panel.');
}

const aglaeaGreeting = '### 初次见面 「远道而来的贵客，风儿顺着金丝捎来了你的讯息。我名阿格莱雅，奥赫玛的改衣师，翁法罗斯的黄金裔之一。愿我们坦诚相待。」';
const formattedAglaeaGreeting = '初次见面 ：「远道而来的贵客，风儿顺着金丝捎来了你的讯息。我名阿格莱雅，奥赫玛的改衣师，翁法罗斯的黄金裔之一。愿我们坦诚相待。」';
if (formatArchiveParagraphLine(aglaeaGreeting) !== formattedAglaeaGreeting) {
  throw new Error('Aglaea greeting must display a colon between the corpus label and the official voice line.');
}
if (formatArchiveParagraphLine(formattedAglaeaGreeting) !== formattedAglaeaGreeting) {
  throw new Error('Already formatted voice lines must remain stable.');
}
if (formatArchiveParagraphLine('她停下脚步 「请稍等。」') !== '她停下脚步 「请稍等。」') {
  throw new Error('Narrative prose must not receive voice-corpus punctuation.');
}

console.log('ZHIKU_ARCHIVE_BROWSER_REGRESSION_OK');
