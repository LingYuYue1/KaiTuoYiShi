import fs from 'node:fs';
import { build } from 'esbuild';

async function importBundled(entryPoint) {
  const result = await build({
    absWorkingDir: process.cwd(),
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    alias: { '@': process.cwd() },
    logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const foundation = fs.readFileSync('components/features/GameSystems/album/foundation.ts', 'utf8');
const panel = fs.readFileSync('components/features/GameSystems/AlbumPanel.tsx', 'utf8');
const taskWorkspace = fs.readFileSync('components/features/GameSystems/album/taskWorkspace.tsx', 'utf8');
const workspacesSource = fs.readFileSync('components/features/GameSystems/album/workspaces.tsx', 'utf8');
const workspaces = await importBundled('components/features/GameSystems/album/workspaces.tsx');

assert(foundation.includes("{ id: 'tasks', label: '任务', members: ['queue'] }"), '任务组必须只保留统一图片任务入口。');
assert(!foundation.includes("id: 'history'"), '独立历史入口必须被统一图片任务流替代。');
assert(foundation.includes("{ id: 'queue', label: '生成任务', desc: '图片任务流与记录'"), '任务入口必须明确表达图片任务流语义。');
assert(panel.includes('<ImageTaskWorkspace'), '相册面板必须渲染统一图片任务工作区。');
assert(!panel.includes("activeTab === 'history'"), '相册面板不得继续渲染平行历史页。');
assert(taskWorkspace.includes('buildImageTaskFeed(album, includeNsfw)'), '任务工作区必须以相册条目和任务记录共同构建时间流。');
assert(taskWorkspace.includes("task.status === 'success' && !orphaned"), '已关联结果的成功任务必须避免再显示为第二条任务记录。');
assert(taskWorkspace.includes("kind: 'image' as const") && taskWorkspace.includes("kind: 'task' as const"), '时间流必须同时承载图片结果和未完成或异常任务。');
assert(taskWorkspace.includes("'导入 / 收录'") && taskWorkspace.includes('generationSourceLabel(item.task.source)'), '导入图片和生成图片必须在同一时间流中标明来源。');
assert(taskWorkspace.includes('includeNsfw || !entry.nsfw') && taskWorkspace.includes('includeNsfw || !task.nsfw'), '任务流必须统一遵循 NSFW 可见性规则。');
assert(foundation.includes('source?: 图片生成任务来源;'), '生成覆盖参数必须允许调用方声明任务来源。');
assert(workspacesSource.includes("source: input.source ?? 'manual'"), 'createTask 必须保留 manual 兼容默认值并接受显式来源。');
assert(panel.includes("source: override?.source ?? 'manual'"), '普通生成必须默认记录为 manual。');
assert(panel.includes("source: override?.source ?? (storySnapshotSource === 'manual' ? 'manual' : 'auto')"), '故事快照必须按正文来源或手动片段标记来源。');
assert((panel.match(/source: 'retry'/g) ?? []).length >= 2, '普通任务和故事快照的玩家重试都必须记录为 retry。');

const baseTask = {
  prompt: 'test',
  nsfw: false,
  backend: 'openai_compatible',
  slot: 'scene',
  targetType: 'scene',
};
assert(workspaces.createTask(baseTask).source === 'manual', '未传来源的旧调用必须继续默认为 manual。');
assert(workspaces.createTask({ ...baseTask, source: 'auto' }).source === 'auto', '正文自动任务必须保留 auto 来源。');
assert(workspaces.createTask({ ...baseTask, source: 'retry' }).source === 'retry', '玩家重新发起的任务必须保留 retry 来源。');

console.log('image task feed regression ok');
