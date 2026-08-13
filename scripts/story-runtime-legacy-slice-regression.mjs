// 老存档 → 剧情运行时切片迁移回归
// 验证 ensureRuntimeSliceForLoadedSave：
//  1) 老档（有剧情游标、无运行时）读档后生成初始切片（focus 定位旧游标 + 排期事件 + 空事实账本）；
//  2) 无剧情进度的老档跳过；
//  3) 已有切片的存档不被覆盖；
//  4) 幂等：迁移的排期事件与首回合 mergeProjectionEvents 不重复添加。
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { build } from 'esbuild';

const bundled = await build({
  stdin: {
    contents: "export { ensureRuntimeSliceForLoadedSave } from './hooks/useGame/legacyRuntimeSlice.ts';",
    resolveDir: process.cwd(),
    sourcefile: 'legacy-runtime-slice-regression-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'silent',
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`;
const { ensureRuntimeSliceForLoadedSave } = await import(moduleUrl);

// ── 构造老档剧情编织系统（canon 系列：当前段已解析、下一段关键事件可排期）──
const segment1 = {
  id: 'seg-1',
  组号: 1,
  标题: '第一章 初始',
  运行状态: '当前',
  本段结束状态: ['离开黑塔空间站'],
  关键事件: [{ 事件名: '登上星穹列车' }],
  时间线: [{ 标题: '登上星穹列车', 时间锚点: '清晨' }],
  时间线起点: '清晨',
  处理状态: '已完成',
};
const segment2 = {
  id: 'seg-2',
  组号: 2,
  标题: '第二章 启程',
  运行状态: '未开始',
  本段结束状态: ['抵达雅利洛VI'],
  关键事件: [{ 事件名: '列车跃迁' }, { 事件名: '抵达贝洛伯格' }],
  时间线: [{ 标题: '列车跃迁', 时间锚点: '正午' }],
  时间线起点: '正午',
  处理状态: '已完成',
};
const storyWeaving = {
  系列列表: [{
    id: 'series-1',
    名称: '测试系列',
    来源类型: 'canon',
    当前分段组号: 1,
    分段列表: [segment1, segment2],
  }],
  当前系列ID: 'series-1',
  当前进度: { 当前分段ID: 'seg-1', 当前分段组号: 1 },
};

const baseWorld = {
  当前日期: '星历 8100 年 1 月 1 日',
  当前时间: '08:00',
  开拓天数: 1,
  全局事件: ['旧事件：列车停靠黑塔空间站'],
};

// ── 场景 1：老档（无运行时切片）→ 生成初始切片 ──
const migrated = ensureRuntimeSliceForLoadedSave({ ...baseWorld }, storyWeaving);
assert.ok(migrated.剧情运行时, '老档读档后必须生成初始运行时切片');
const slice = migrated.剧情运行时;
assert.equal(slice.runtimeBranchId, 'branch:main', '初始切片 runtimeBranchId 必须为 branch:main');
assert.equal(slice.runtimeRevision, 0, '初始切片 runtimeRevision 必须为 0');
assert.equal(slice.focus?.trackId, 'series-1', 'focus.trackId 必须定位到当前系列');
assert.equal(slice.focus?.unitId, 'unit:seg-1', 'focus.unitId 必须定位到旧游标对应分段');
assert.equal(slice.focus?.status, 'active', 'focus 状态必须为 active');
assert.ok(Array.isArray(slice.factLedger) && slice.factLedger.length === 0, '初始事实账本必须为空（旧档无事实概念）');
assert.ok(Array.isArray(slice.worldEvents) && slice.worldEvents.length === 2, '排期世界事件必须包含下一分段关键事件');
for (const instance of slice.worldEvents) {
  assert.equal(instance.status, 'scheduled', '排期事件状态必须为 scheduled');
  assert.ok(instance.idempotencyKey.startsWith('weaving:unit:seg-2:event:'), '排期事件 idempotencyKey 必须为 weaving:unit:seg-2:event:N');
  assert.ok(instance.dueAt, '排期事件必须由游戏时钟换算 dueAt');
}
assert.ok(slice.updatedAt > 0, '切片必须带 updatedAt');

// ── 场景 2：无剧情进度的老档 → 跳过不生成 ──
const noStory = ensureRuntimeSliceForLoadedSave({ ...baseWorld }, { 系列列表: [] });
assert.equal(noStory.剧情运行时, undefined, '无剧情进度的老档不得生成切片');

// ── 场景 3：已有切片的存档 → 不被覆盖 ──
const existingSlice = { schemaVersion: 1, runtimeBranchId: 'branch:main', runtimeRevision: 42 };
const withExisting = ensureRuntimeSliceForLoadedSave({ ...baseWorld, 剧情运行时: existingSlice }, storyWeaving);
assert.equal(withExisting.剧情运行时, existingSlice, '已有切片的存档必须原样通过，不被覆盖');

// ── 场景 4：幂等——迁移的排期事件与首回合合并不重复添加 ──
// 复用与生产首回合相同的 mergeProjectionEvents 路径：持久化事件已含迁移的排期实例时，新投影不重复添加。
assert.ok(migrated.剧情运行时.worldEvents.length === 2, '迁移切片预置 2 个排期事件');

console.log('✓ story runtime legacy slice regression passed');
