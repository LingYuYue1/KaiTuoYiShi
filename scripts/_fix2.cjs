const fs = require('fs');
const f = 'e:/桌面文件/崩坏星穹铁道前端/docs/2026-07-01-二创融合对照表.md';
let c = fs.readFileSync(f, 'utf8');
let n = 0;
const reps = [
  // 1. 更新 ⚫ ┏/⚫ ┗ 描述（id 改为 adapted_placeholder_lore_open/close）
  ['这两个按上述方案改造为占位说明模块。',
   '这两个已改造为占位说明模块，id 为 `adapted_placeholder_lore_open` / `adapted_placeholder_lore_close`（与其他占位模块一致）。'],
  // 2. adapted 模块描述：locked=true → 弹窗确认
  ['id 前缀 `adapted_`，`locked=true`，`enabled=true`，`source=\'builtin\'`）。玩家无法关闭/删除/编辑。',
   'id 前缀 `adapted_`，`enabled=true`，`source=\'builtin\'`）。玩家可关闭（关闭时弹窗确认），不可删除/编辑。'],
  // 3. 删除 🟪 条目（已合并到 🟣）
  ['- 🟪 **占位说明（改造）**：已存在的双人成行 ⚫ ┏/⚫ ┗ lore 包裹标签改造为占位说明（id 前缀仍为 `st_import_`，content 改为占位文本）',
   ''],
  // 4. 统计表：211 → 209
  ['| 🟢 双人成行保留 | 211 | 原样保留的双人成行模块（含 2 个 🟪 改造的 ⚫ ┏/⚫ ┗） |',
   '| 🟢 双人成行保留 | 209 | 原样保留的双人成行模块 |'],
  // 5. adapted 统计：locked → 弹窗
  ['| 🟦 新增内置（adapted） | 22 | 全部 locked=true，enabled=true；含 2 个已融合内容 |',
   '| 🟦 新增内置（adapted） | 22 | enabled=true（关闭时弹窗确认）；含 2 个已融合内容 |'],
  // 6. 🟣 占位：12 → 14
  ['| 🟣 占位说明 | 12 | ST marker 改造/新增占位 |',
   '| 🟣 占位说明 | 14 | ST marker 改造/新增占位（含 ⚫ ┏/⚫ ┗ lore 包裹标签） |'],
  // 7. 注释更新
  ['> 注：🟢 含 2 个 🟪 改造（⚫ ┏ 680 / ⚫ ┗ 780），id 仍为 `st_import_*` 前缀但 content 已改为占位文本。故 🟢 211 = 209 纯保留 + 2 改造。',
   '> 注：⚫ ┏/⚫ ┗ lore 包裹标签已从 🟢 st_import 改为 🟣 adapted_placeholder（id: `adapted_placeholder_lore_open/close`），与其他占位模块一致。'],
  // 8. adapted 清单标题：locked → 弹窗
  ['### 🟦 adapted_* 内置模块清单（22 个，全部 locked=true）',
   '### 🟦 adapted_* 内置模块清单（22 个，enabled=true，关闭时弹窗确认）'],
];
for (const [old, nw] of reps) {
  if (old && c.includes(old)) {
    c = c.replace(old, nw);
    n++;
  } else if (old) {
    console.log('SKIP:', old.substring(0, 50));
  }
}
fs.writeFileSync(f, c, 'utf8');
console.log('replaced:', n, '/', reps.length);
