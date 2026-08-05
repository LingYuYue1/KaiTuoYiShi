import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const requireText = (source, expected, label) => {
  if (!source.includes(expected)) throw new Error(`${label}: missing ${expected}`);
};

const reader = read('components/features/ZhikuV3/StoryArchiveReader.tsx');
const css = read('components/features/ZhikuV3/story-archive-reader.css');
const story = read('stories/ZhikuStoryArchive.stories.tsx');

requireText(reader, 'export function StoryArchiveReader', 'dedicated story reader component');
requireText(reader, 'volumes: StoryArchiveVolume[]', 'archive volume reader contract');
requireText(reader, 'chapters: StoryArchiveChapter[]', 'in-volume chapter contract');
requireText(reader, '剧情卷宗与章节目录', 'archive and chapter catalog semantics');
requireText(reader, '卷宗目录', 'archive catalog label');
requireText(reader, 'zhiku-v3-story-reader__archive-group', 'two-level archive tree');
requireText(reader, 'selectedVolume.chapters', 'in-volume chapter navigation boundary');
requireText(reader, 'CHAPTER_STATUS_LABELS', 'chapter reading states');
requireText(reader, "'read' | 'current' | 'unread' | 'locked'", 'read/unread/locked contract');
requireText(reader, 'getAvailableSibling', 'same-page chapter navigation');
requireText(reader, '上一章', 'previous chapter command');
requireText(reader, '下一章', 'next chapter command');
requireText(reader, 'selectedVolume?.title', 'archive filename heading');
requireText(reader, 'zhiku-v3-story-reader__reading-pane', 'scrolling novel reader');
requireText(reader, '<ReaderFontSizeControl', 'shared story font size control');
requireText(reader, 'buildZhikuReaderStyle(readerFontSize)', 'story reader font variables');
requireText(reader, '<ZhikuPageFrame', 'shared Zhiku page frame');
requireText(reader, '返回分类大厅', 'category hub back command');
requireText(reader, '关闭智库', 'page close command');
requireText(css, 'grid-template-columns: minmax(236px, 28%) minmax(0, 1fr)', 'desktop left-right story layout');
requireText(css, 'width: min(100%, 760px)', 'constrained reading measure');
requireText(css, "font-family: 'Noto Serif SC'", 'novel serif typography');
requireText(css, 'line-height: 2.05', 'desktop prose leading');
requireText(css, 'text-indent: 2em', 'novel paragraph indentation');
requireText(css, 'var(--zhiku-reader-font-size, 17px)', 'adjustable story prose size');
requireText(css, 'var(--zhiku-reader-lead-font-size, 18px)', 'adjustable leading paragraph size');
requireText(css, 'var(--zhiku-reader-dropcap-font-size, 39px)', 'adjustable story drop cap size');
requireText(css, '.zhiku-v3-story-reader__archive-button', 'archive filename row');
requireText(css, '.zhiku-v3-story-reader__chapter-title', 'chapter nickname heading');
requireText(css, '@media (max-width: 520px)', 'narrow story reader layout');
requireText(story, "title: '开拓轶事/智库 V3/二级页面'", 'Storybook secondary page path');
requireText(story, 'export const 剧情档案阅读页', 'story reader candidate');
requireText(story, '翁法罗斯英雄纪其一-黄金裔的黎明', 'archive filename sample');
requireText(story, "initialChapterId: 'story-demo-03'", 'representative middle chapter');
requireText(story, "status: 'locked'", 'locked chapter example');

for (const forbidden of ['注入内容', '触发关键词', 'injectionPreview', 'buildZhikuEntryInjectionPreview', 'onOpenDetail', '三级页面']) {
  if (reader.includes(forbidden) || story.includes(forbidden)) {
    throw new Error(`Story archive reader must remain read-only and non-injectable: ${forbidden}`);
  }
}

console.log('ZHIKU_STORY_READER_REGRESSION_OK');
