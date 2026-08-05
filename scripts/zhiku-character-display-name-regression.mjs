import fs from 'node:fs';
import { 获取智库人物名, 获取智库人物名列表 } from '../models/zhiku.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const amphoreusPreset = JSON.parse(
  fs.readFileSync('public/zhiku-presets/amphoreus-character-rebuild.json', 'utf8'),
);

for (const id of [
  'JS-059',
  'JS-060',
  'JS-061',
  'JS-062',
  'JS-063',
  'JS-064',
  'JS-065',
]) {
  const entry = amphoreusPreset.entries.find((item) => item.id === id);
  assert(entry, `missing regression fixture: ${id}`);

  const displayName = 获取智库人物名(entry);
  assert(displayName === entry.标题, `${entry.标题}: expected ${entry.标题}, got ${displayName}`);
  assert(
    获取智库人物名列表(entry).includes(entry.关联角色ID ?? ''),
    `${entry.标题}: internal role id must remain available as an alias`,
  );
}

const chineseRelatedRole = {
  标题: '瓦尔特·杨',
  关联角色ID: '瓦尔特·杨',
  关键词: ['角色:瓦尔特'],
};
assert(获取智库人物名(chineseRelatedRole) === '瓦尔特·杨', 'Chinese related-role display name must keep precedence.');

console.log('ZHIKU_CHARACTER_DISPLAY_NAME_REGRESSION_OK');
