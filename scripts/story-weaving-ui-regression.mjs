import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const plotPanel = fs.readFileSync('components/features/GameSystems/PlotPanel.tsx', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');

assert(plotPanel.includes('const handlePreviewSeries = (series: 剧情编织系列) =>'), '剧情编织顶部轨道卡片应使用只读预览函数。');
assert(!plotPanel.includes('const handleSelectSeries = async'), '顶部/左侧系列选择不得再使用会保存当前轨道的 handleSelectSeries。');
assert(!plotPanel.includes('切换当前剧情系列：${series.标题}'), '点击系列卡片不得直接写入当前剧情系列。');
assert(plotPanel.includes("onClick={() => handlePreviewSeries(series)}"), '顶部轨道卡片点击应只更新预览。');
assert(plotPanel.includes("onSelectSeries={handlePreviewSeries}"), '左侧系列树点击应只展开/预览。');
assert(plotPanel.includes('const viewing = series.id === viewSeries?.id'), '顶部轨道卡片必须区分正在注入 active 和正在查看 viewing。');
assert(plotPanel.includes("{active ? 'INJECTING' : viewing ? 'VIEWING' : 'VIEW'}"), '非当前轨道点击预览后应显示 VIEWING 选中态，未选中时仍是 VIEW。');
assert(plotPanel.includes('onSetCurrent={() => void handleSetCurrent(viewSeries, selectedSegment.组号)}'), '详情页必须继续把“设为当前”接到手动切换函数。');
assert(plotPanel.includes('<button className="panel-btn" onClick={onSetCurrent}>设为当前</button>'), '详情页必须保留显式“设为当前”按钮。');
assert(plotPanel.includes('handleExportCustomJson'), '剧情编织必须提供自制轨道单独导出。');
assert(plotPanel.includes("series.来源类型 !== 'canon'"), '自制轨道导出必须排除内置原著 canon 轨道。');
assert(plotPanel.includes('handleExportAllJson'), '完整系统备份必须使用单独导出入口。');
assert(plotPanel.includes('导出自制') && plotPanel.includes('导出全部备份'), 'UI 必须区分自制导出和完整备份导出。');
assert(plotPanel.includes('customOnly') && plotPanel.includes('已并入自制轨道'), '导入自制轨道 JSON 时必须并入现有系统，而不是覆盖内置原著。');

assert(sendWorkflow.includes("loadSetting<剧情编织系统>('storyWeavingSystem')"), '后台写剧情编织前必须读取最新本地剧情编织，避免旧回合快照覆盖面板导入/分解。');
assert(sendWorkflow.includes('resolveStoryWeavingForBackgroundWrite'), 'sendWorkflow 必须通过并发保护解析剧情编织写入。');
assert(sendWorkflow.includes('storyWeavingConcurrentChange'), '检测到面板并发更新时必须跳过后台覆盖。');
assert(sendWorkflow.includes('本回合后台未覆盖最新导入/分解结果'), '并发保护应给出队列提示，方便排查自制轨道消失问题。');

console.log('story weaving ui regression ok');
