import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) {
    console.error(`[save-tree-ui-regression] ${message}`);
    process.exit(1);
  }
}

const treeView = fs.readFileSync('utils/saveTreeView.ts', 'utf8');
const saveModal = fs.readFileSync('components/features/SaveLoad/SaveLoadModal.tsx', 'utf8');
const storageManager = fs.readFileSync('components/features/Settings/StorageManager.tsx', 'utf8');

assert(treeView.includes('buildSaveTreeGroups'), '必须提供存档树分组工具。');
assert(treeView.includes('buildLegacyRootIdMap') && treeView.includes('buildLegacyNodeIdMap'), '旧存档必须按旅人与时间顺序合并成兼容路线。');
assert(treeView.includes('legacyRootIds') && treeView.includes('currentRootId'), '旧存档节点父子关系必须按当前兼容树计算。');
assert(treeView.includes('parentNodeId') && treeView.includes('parent.children.push(node)'), '树分组必须按 parentNodeId 建立父子关系。');
assert(treeView.includes('depth') && treeView.includes('isLatest'), '树节点必须包含深度与最新节点标记。');
assert(treeView.includes('nodes.sort((a, b) => b.save.timestamp - a.save.timestamp || b.save.id - a.save.id)'), '存档树节点展示必须最新在上。');

assert(saveModal.includes('const visibleSaves = useMemo(') && saveModal.includes('const allTreeGroups = useMemo(() => buildSaveTreeGroups(visibleSaves), [visibleSaves])'), '读档弹窗必须先用当前展示存档列表建立树，并过滤删除中的节点。');
assert(saveModal.includes('buildVisibleSaveTreeGroup(group, tab)'), '读档弹窗必须筛选树内可见节点，不能用筛选节点重建树。');
assert(saveModal.includes("if (tab === 'all') return true"), '读档弹窗的全部视图必须显示全部主树存档。');
assert(!saveModal.includes('const allVisibleSaves = useMemo(() => visibleSaves.filter((s) => s.type !== \'auto\'), [visibleSaves])'), '读档弹窗全部计数不得排除自动存档。');
assert(saveModal.includes('selectedRootId') && saveModal.includes('SaveTreeSelector') && saveModal.includes('selectedTree'), '读档弹窗必须支持先选择一棵存档树再查看路线。');
assert(saveModal.includes('SaveTreeGroup'), '读档弹窗必须渲染选中的存档树。');
assert(saveModal.includes('md:grid-cols-[320px_minmax(0,1fr)_270px]') && saveModal.includes("borderLeft: '1px solid rgba(var(--tj-accent-primary),0.18)'"), '读档弹窗必须把存档树列表放在右侧独立栏。');
assert(!saveModal.includes('col-span-2 min-h-0 px-3 py-3 font-serif md:max-h-[260px]'), '读档弹窗的存档树列表不能继续使用左栏小卡片布局。');
assert(saveModal.includes('treeLabel={node.isRoot ?') && saveModal.includes('分支 +${node.depth}'), '读档弹窗必须标注根节点与分支深度。');
assert(!saveModal.includes('buildSaveTreeGroups(manualSaves)') && !saveModal.includes('buildSaveTreeGroups(autoSaves)') && !saveModal.includes('buildSaveTreeGroups(protectedSaves)'), '读档弹窗不能用标签页筛选后的节点列表重建树。');
assert(!saveModal.includes('visibleSaves.map((s)'), '读档弹窗不能继续直接平铺 visibleSaves。');
assert(saveModal.includes('SAVE TREE CONTROL'), '读档弹窗必须保留控制台标题。');
assert(saveModal.includes('SaveActionButton'), '读档弹窗必须保留左侧控制台操作区。');
assert(saveModal.includes('MiniSaveTreeMap'), '读档弹窗必须保留左侧迷你存档树图。');
assert(saveModal.includes('hidden w-full flex-shrink-0 flex-col md:flex md:min-h-0') && saveModal.includes('md:overflow-y-auto'), '读档弹窗左侧控制栏内容过高时必须独立滚动。');
assert(saveModal.includes('存档树数量不限') && saveModal.includes('每棵树手动节点最多 5 个、自动节点最多 6 个'), '读档弹窗必须提示树数量不限和单树分类节点上限。');
assert(saveModal.includes('历史恢复点') && saveModal.includes('导入存档'), '读档弹窗必须把旧恢复点与导入存档分开。');
assert(saveModal.includes('kaituo-options-scroll relative overflow-x-hidden') && saveModal.includes('md:overflow-y-auto'), '读档弹窗中间存档详情区必须使用同风格内部滚动。');
assert(saveModal.includes('kaituo-options-scroll min-h-0 flex-1 px-3 py-3 pb-5'), '读档弹窗右侧存档树列表必须留出底部滚动余量。');
assert(saveModal.includes('group.nodes.map((node, index)') && saveModal.includes('visualLevel={index}') && saveModal.includes('const visualIndent = Math.min(visualLevel, 5) * 14'), '读档弹窗节点宽度必须按展示顺序递减，保证最新节点最大。');
assert(saveModal.includes('marginLeft: visualIndent') && !saveModal.includes('marginLeft: isLatest ? Math.max(0, Math.min(depth, 5) * 8) : Math.min(depth, 5) * 14'), '读档弹窗节点宽度不得再按分支 depth 反向缩进。');
assert(saveModal.includes("isLatest ? 'p-4 md:gap-4' : 'p-3'") && saveModal.includes("isLatest ? 'text-[17px]' : 'text-[15px]'"), '读档弹窗最新节点仍需保留主节点视觉强调。');
assert(saveModal.includes('linear-gradient(135deg, rgba(var(--tj-accent-primary),1), rgba(var(--tj-accent-secondary),1))'), '读档弹窗主按钮和选中态必须使用 A 方案蓝色渐变。');
assert(saveModal.includes('linear-gradient(90deg, rgba(var(--tj-accent-primary),0.36), rgba(var(--tj-accent-primary),0.05))'), '读档弹窗必须使用时间线树状节点视觉。');

assert(storageManager.includes('const visibleSaves = useMemo(') && storageManager.includes('const allTreeGroups = useMemo(() => buildSaveTreeGroups(visibleSaves), [visibleSaves])'), '设置存储管理必须先用当前展示存档列表建立树，并过滤删除中的节点。');
assert(storageManager.includes('buildVisibleSaveTreeGroup(group, filter)'), '设置存储管理必须筛选树内可见节点，不能用筛选节点重建树。');
assert(storageManager.includes("if (filter === 'all') return true"), '设置存储管理的全部视图必须显示全部主树存档。');
assert(!storageManager.includes('const allVisibleSaves = useMemo(() => visibleSaves.filter((s) => s.type !== \'auto\'), [visibleSaves])'), '设置存储管理全部计数不得排除自动存档。');
assert(storageManager.includes('selectedRootId') && storageManager.includes('StorageTreeSelector') && storageManager.includes('selectedTree'), '设置存储管理必须支持先选择一棵存档树再查看路线。');
assert(storageManager.includes('StorageSaveTreeGroup'), '设置存储管理必须渲染选中的存档树。');
assert(storageManager.includes('kaituo-options-scroll min-h-0 min-w-0 flex-1 overflow-y-auto') && storageManager.includes('pb-5 pr-1'), '设置存储管理存档区必须使用同风格内部滚动并保留底部余量。');
assert(storageManager.includes('kaituo-options-scroll min-h-0 p-3 pb-5'), '设置存储管理树列表必须使用同风格内部滚动。');
assert(storageManager.includes('group.nodes.map((node, index)') && storageManager.includes('const indent = Math.min(index, 5) * 14'), '设置存储管理节点宽度必须按展示顺序递减，保证最新节点最大。');
assert(!storageManager.includes('const indent = Math.min(node.depth, 5) * 14'), '设置存储管理节点宽度不得再按分支 depth 反向缩进。');
assert(storageManager.includes("isLatest ? 'p-4 lg:gap-4' : 'p-3'") && storageManager.includes("isLatest ? 'text-[17px]' : 'text-[15px]'"), '设置存储管理最新节点仍需保留主节点视觉强调。');
assert(storageManager.includes('treeLabel={node.isRoot ?') && storageManager.includes('分支 +${node.depth}'), '设置存储管理必须标注根节点与分支深度。');
assert(!storageManager.includes('buildSaveTreeGroups(grouped.manual)') && !storageManager.includes('buildSaveTreeGroups(grouped.auto)') && !storageManager.includes('buildSaveTreeGroups(grouped.protectedItems)'), '设置存储管理不能用标签页筛选后的节点列表重建树。');
assert(!storageManager.includes('visible.map((save)'), '设置存储管理不能继续直接平铺 visible。');
assert(storageManager.includes('linear-gradient(135deg, rgb(var(--tj-btn-primary-start)), rgb(var(--tj-btn-primary-end)))'), '设置存储管理必须同步新版蓝色按钮风格。');
assert(!storageManager.includes('rgba(212, 177, 90, 0.95)'), '设置存储管理不能保留旧黄色主按钮渐变。');
assert(storageManager.includes('历史恢复点') && storageManager.includes('导入存档'), '设置存储管理必须把旧恢复点与导入存档分开。');

console.log('[save-tree-ui-regression] ok');
