import fs from 'node:fs/promises';
import path from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const app = await fs.readFile(path.join(root, 'App.tsx'), 'utf8');
const chat = await fs.readFile(path.join(root, 'components/features/Chat/ChatList.tsx'), 'utf8');
const album = await fs.readFile(path.join(root, 'components/features/GameSystems/AlbumPanel.tsx'), 'utf8');
const albumActions = await fs.readFile(path.join(root, 'utils/albumActions.ts'), 'utf8');
const saveModal = await fs.readFile(path.join(root, 'components/features/SaveLoad/SaveLoadModal.tsx'), 'utf8');
const storage = await fs.readFile(path.join(root, 'components/features/Settings/StorageManager.tsx'), 'utf8');
const compactor = await fs.readFile(path.join(root, 'utils/saveRuntimeCompactor.ts'), 'utf8');

assert(app.includes('lazyWithRetry('), '重型面板必须使用 lazyWithRetry');
assert(chat.includes('const [renderLimit, setRenderLimit] = useState(80);'), '聊天列表必须限制初始渲染数量');
assert(chat.includes('const historyWasReplaced = previousHistoryIdentity.length > 0'), '聊天列表必须识别存档或历史被替换');
assert(chat.includes('const effectiveRenderLimit = historyWasReplaced ? 80 : renderLimit;'), '切换存档时必须立即恢复近期 80 条渲染上限');
assert(chat.includes('visibleMessages.slice(Math.max(0, visibleMessages.length - effectiveRenderLimit))'), '聊天列表必须只渲染近期记录');
assert(albumActions.includes('MAX_IMAGE_IMPORT_BYTES = 12 * 1024 * 1024'), '图片导入必须限制单文件大小');
assert(album.includes("const file = Array.from(files).find((item) => item.type.startsWith('image/'));"), '参考图替换必须选择首张有效图片');
assert(album.includes("setMessage('导入失败：图片未能读取或超过 12MB。');"), '参考图读取失败必须报告不可读或超限');
for (const source of [saveModal, storage]) {
  assert(source.includes('(guard + 1) % 4 === 0'), '存档摘要重建必须节流完整列表刷新');
  assert(source.includes('globalThis.setTimeout(resolve, 120)'), '存档摘要重建必须主动让出主线程');
}
assert(compactor.includes('const compacted = compactDataImages({'), '回滚快照必须先递归移除图片和大型运行数据');
assert(compactor.includes('return cloneCompactedSnapshot(compacted);'), '回滚快照只能在压缩后执行深拷贝');
assert(!compactor.includes('structuredClone(snapshot)'), '回滚快照不得直接深拷贝含图片的原始状态');

console.log('crash memory regression ok');
