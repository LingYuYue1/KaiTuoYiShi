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
const catalogRepair = await fs.readFile(path.join(root, 'services/storage/saveCatalogRepair.ts'), 'utf8');
const compactor = await fs.readFile(path.join(root, 'utils/saveRuntimeCompactor.ts'), 'utf8');

assert(app.includes('lazyWithRetry('), '重型面板必须使用 lazyWithRetry');
assert(chat.includes('const INITIAL_RENDER_TURNS = 20;'), '聊天列表必须限制初始渲染回合数');
assert(chat.includes('function findHistoryWindowStart(messages: 聊天消息[], turnLimit: number): number'), '聊天列表必须按 assistant 回合定位近期历史窗口');
assert(chat.includes('const [renderTurnLimit, setRenderTurnLimit] = useState(INITIAL_RENDER_TURNS);'), '聊天列表必须保存可扩展的回合渲染上限');
assert(chat.includes('const historyWasReplaced = previousHistoryIdentity.length > 0'), '聊天列表必须识别存档或历史被替换');
assert(chat.includes('const effectiveRenderTurnLimit = historyWasReplaced ? INITIAL_RENDER_TURNS : renderTurnLimit;'), '切换存档时必须立即恢复默认回合渲染上限');
assert(chat.includes('visibleMessages.slice(renderedStartIndex)'), '聊天列表必须只渲染近期回合窗口');
assert(chat.includes('setRenderTurnLimit((current) => current + RENDER_TURN_INCREMENT);'), '聊天列表必须支持按回合继续加载更早记录');
assert(albumActions.includes('MAX_IMAGE_IMPORT_BYTES = 12 * 1024 * 1024'), '图片导入必须限制单文件大小');
assert(album.includes("const file = Array.from(files).find((item) => item.type.startsWith('image/'));"), '参考图替换必须选择首张有效图片');
assert(album.includes("setMessage('导入失败：图片未能读取或超过 12MB。');"), '参考图读取失败必须报告不可读或超限');
for (const source of [saveModal, storage]) {
  assert(source.includes("await startSaveCatalogRepair('missing-only')"), '存档界面必须把缺失摘要交给统一后台恢复任务');
  assert(source.includes('subscribeSaveCatalogRepair((state) => {'), '存档界面必须订阅统一恢复状态');
  assert(source.includes("state.phase === 'completed' || state.phase === 'partial-failure'"), '存档界面只能在恢复结束后刷新完整目录');
}
assert(catalogRepair.includes('await delay(0);'), '后台摘要恢复必须逐条让出主线程');
assert(catalogRepair.includes("phase: 'paused-for-write'"), '后台摘要恢复必须在前台写入期间暂停');
assert(catalogRepair.includes('runWithSaveMutationPriority'), '前台存档写入必须拥有高于后台恢复的优先级');
assert(compactor.includes('const compacted = compactDataImages({'), '回滚快照必须先递归移除图片和大型运行数据');
assert(compactor.includes('seen = new WeakMap<object, unknown>()'), '回滚快照压缩必须在单次遍历中安全克隆循环引用');
assert(compactor.includes('return compacted;'), '回滚快照必须直接返回压缩遍历生成的新对象');
assert(!compactor.includes('structuredClone(snapshot)'), '回滚快照不得直接深拷贝含图片的原始状态');

console.log('crash memory regression ok');
