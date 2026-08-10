# Known Issues

当前代码确认但未修复的问题台账。每条含根因、影响、规避方式和后续方向。

## KI-1 流式中途读档 → UI 运行态成孤儿（串档假象 + 取消失效）

- **状态**：已确诊，当前代码已有会话身份和活跃工作流管理，但仍需要运行时场景验收。
- **发现**：2026-08-01，五件套验收④。
- **现象**：流式输出中途不点取消、直接读取旧存档 → 旧回合的半截流式文本残留并盖在新读入的存档上显示（看似串档）；loading 卡死，取消按钮点击无效。
- **根因**：UI 运行态是命令式标志位，清理义务分散在各生命周期 transition。读档入口（`hooks/useGame/saveLoadWorkflow.ts:242-244` / `:255-257`）abort 旧 workflow 并置空 ref 后：旧 workflow 走 `sendWorkflow.ts:331` 非当前分支静默退出，`finally`（`:366-385`）的 `setLoading(false)` / `setStreamingMessage('')` / hint / queueTask 清理全部被 `isCurrentWorkflow()` 守卫跳过；读档侧 `applySaveToState` 只重置 Story 切片，不碰 UI 运行态。
- **影响**：仅显示层（loading/streaming/hint 残留 + 取消失效）；未观察到持久化数据被污染。刷新页面可恢复。
- **规避**：流式进行中先点「取消」再读档。
- **后续方向**：继续集中管理 `activeWorkflow` 的会话生命周期，并为流式中断、读取存档和覆盖操作增加运行时验收。当前架构事实见 [`ideal_design.md`](ideal_design.md)。
