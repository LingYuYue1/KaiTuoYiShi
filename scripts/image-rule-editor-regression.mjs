import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../components/features/ImageGeneration/ImageRuleTemplateEditor.tsx', import.meta.url),
  'utf8',
);

assert.match(source, /const addNovelAIRule = \(\) => \{/,
  'NAI 规则页必须提供独立的新建规则行为。');
assert.match(source, /const addSnapshotRule = \(\) => \{/,
  '快照解析页必须提供独立的新建规则行为。');
assert.match(source, /<TemplateButton onClick=\{addNovelAIRule\}>新建规则<\/TemplateButton>/,
  'NAI 规则页必须显示“新建规则”入口。');
assert.match(source, /<TemplateButton onClick=\{addSnapshotRule\}>新建规则<\/TemplateButton>/,
  '快照解析页必须显示“新建规则”入口。');
assert.match(source, />复制为自定义<\/TemplateButton>/,
  '复制入口必须明确说明复制后得到可编辑的自定义规则。');
assert.match(source, /setNovelAIEditorId\(next\.id\)/,
  '新建或复制 NAI 规则后必须自动切换到新规则编辑器。');
assert.match(source, /setSnapshotEditorId\(next\.id\)/,
  '新建或复制快照规则后必须自动切换到新规则编辑器。');
assert.match(source, /onClick=\{\(\) => onChange\(\{ 当前NAI规则预设ID: selectedNovelAI\.id \}\)\}/,
  'NAI 自定义规则必须提供明确的“设为当前生效”行为。');
assert.match(source, /onClick=\{\(\) => onChange\(\{ 当前故事快照解析规则预设ID: selectedSnapshot\.id \}\)\}/,
  '快照解析自定义规则必须提供明确的“设为当前生效”行为。');
assert.match(source, /if \(!target \|\| target\.isBuiltin\) return;/,
  '系统内置规则必须继续受到更新函数保护。');
assert.match(source, /disabled=\{selectedNovelAI\.isBuiltin\}/,
  '系统内置 NAI 规则的编辑字段必须继续只读。');
assert.match(source, /disabled=\{selectedSnapshot\.isBuiltin\}/,
  '系统内置快照规则的编辑字段必须继续只读。');

console.log('Image rule editor regression checks passed.');
