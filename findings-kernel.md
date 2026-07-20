# IKernel 与 UI 边界审查

**范围：** 当前工作树的生产源码，重点为 `src/kernel/`、`src/adaptations/`、`hooks/`、`components/` 与 `App.tsx`。

**方法：** 静态依赖链与调用链审查；未运行构建或测试。

## 结论

`NativeKernel` 的命令核心是清晰的：命令通过 `execute` 统一调度，使用 revision/CAS 提交，并由内核维护运行中命令的取消状态。

但当前 `IKernel` 还不是封装清晰的内核边界。它同时是命令内核、偏好设置入口、存档目录入口和旧服务模块的 service locator；`src/adaptations/` 目前主要改变 import 路径，没有形成 presentation-facing use case 的语义边界。

## 发现

### P1：`IKernel` 公开内部服务聚合，边界失焦

- `src/kernel/contract/IKernel.ts:24-34` 公开 `saves`、`services` 与偏好设置方法，除 `execute/read/cancel` 外还有多条公共访问路径。
- `src/kernel/ports/KernelServices.ts:11-42` 将 kernel workflow、domain operation 与既有 `services/*` 的约 30 个模块作为 `KernelServices` 整体导出。
- `src/kernel/adapters/browser/BrowserKernelServices.ts:1-69` 通过 `import *` + `makeAsync` 将这些模块逐个透传；异步包装不等于行为封装。

**影响：** 调用者需要知道并调用内部模块形状，新增 UI 能力倾向于继续把模块挂到 `KernelServices`，而不是定义稳定的 use case。

### P1：hooks 直接跨过 adaptation composition root

- `hooks/useGame.ts:15-29` 直接依赖 `IKernel`、contract、runtime state 与 `getAppKernel`。
- `hooks/useGame.ts:71-75` 直接取得 composition root；`212-215`、`251-264` 直接调用内核取消和 `kernel.saves`。
- `hooks/useGameState.ts:56-58` 直接导入 `getAppKernel`；`374-387` 直接执行 `session.exists` 查询。

**影响：** 若 hooks 属于 presentation/application 边界，当前存在真实的 adaptation bypass；并且 UI 与 kernel 的耦合无法由 adaptation contract 约束。

### P1：React 仍是 runtime graph 的写入者，checkpoint 造成双权威

- `hooks/useGame.ts:493-515` 从多个 React state field 重建完整 `RuntimeGameState`。
- `hooks/useGame.ts:139-155` 将这个图以 `session.checkpoint` 写回 kernel。
- `hooks/useGame.ts:470-491` 反向把 kernel view 拆回多个 React setter。
- 组件仍直接修改领域数据，例如 `components/features/GameSystems/CompanionPanel.tsx:108-113` 的 NPC 更新，及 `components/features/GameSystems/PathPanel.tsx:56-58` 的旅人更新。

**影响：** 当前不是 kernel 独占 runtime authority，而是“UI 先改完整 runtime，边界操作前整图同步”。刷新、并发操作与遗漏字段都可能产生漂移。

### P2：组件层存在 kernel 内部类型依赖

- `components/features/GameSystems/CompanionPanel.tsx:7`
- `components/features/GameSystems/PlotPanel.tsx:9-10`
- `components/features/Settings/ContextInspector.tsx:2`
- `components/features/Settings/SettingsModal.tsx:31`
- `components/features/Settings/PromptSettingsSurface.tsx:18`

这些是 type-only import，不会在运行时触达 DB；但 UI 依赖 `kernel/domain`、`kernel/workflows` 的私有路径，不能算干净的 contract-only 边界。

### 确认：未发现 UI 直接访问原始 DB

审查范围内未发现 `App.tsx`、`components/` 或 `hooks/` 直接 import `services/dbService`、IndexedDB adapter，或使用 `indexedDB/openDB`。

原始 DB 绑定仍在 kernel adapter：

- `src/kernel/adapters/browser/DbSaveCatalog.ts:4-28` 动态导入 `services/dbService` 并实现 `SaveCatalogPort`。
- `src/kernel/adapters/browser/IndexedDbPreferenceStore.ts:3-9` 动态导入同一 DB service 并实现 `PreferenceStore`。

因此，组件调用 `getSaveCatalog` / `getAdaptationServices` 不属于“直接 DB bypass”；但这两项 adaptation 都只是返回 `getAppKernel().saves/services`，并没有隔离 kernel 内部能力。

## 建议整改顺序

1. 将 `getAppKernel` 的唯一使用点限制在 `src/adaptations/`；hooks 只依赖 adaptation 提供的客户端。
2. 以明确的 UI use case 取代 `IKernel.services` 与 `IKernel.saves` 的泛型出口。
3. 将 UI 必须使用的输出类型定义为 `kernel/contract` DTO，删除对 `kernel/domain` 和 `kernel/workflows` 的 type import。
4. 用细粒度领域 command 替换完整 `RuntimeGameState` checkpoint，逐步移除 UI 对 runtime graph 的直接写入。

## 边界判断

| 问题 | 结果 |
| --- | --- |
| `NativeKernel` 的命令生命周期是否集中清楚 | 是 |
| `IKernel` 是否是封装干净、目的单一的内核接口 | 否 |
| 组件/应用层是否直接访问原始 DB | 未发现 |
| UI 是否越过 adaptation 直接到 kernel composition root | 是，位于 `hooks/useGame.ts` 与 `hooks/useGameState.ts` |
| 组件是否依赖 kernel 内部类型 | 是，5 个文件 |

## 补充发现：运行期状态混入设备偏好，存档隔离仍是过渡方案

当前实现已让 `apiSettings`、主题和部分设备级开关不再进入新存档或导入后的持久化记录；但 `RuntimeGameState` 仍携带这些 live device preferences，workflow 仍通过 runtime state 读取它们。

**影响：**

- runtime state 同时表达剧情/存档事实与本机设备偏好，类型边界仍然不诚实；
- engine 的输入看似仅是“游戏状态”，实际暗含本机 API、模型和界面偏好，导致 workflow 的依赖不可见；
- 后续 checkpoint、导入和 session hydration 仍有机会将两类数据重新混合；
- 当前“保存时剥离偏好”的做法是必要的防线，但仍是写入边界的补丁，而非模型层面的彻底解决。

**建议：** 接受 breaking change，直接把 `RuntimeGameState` 收窄为可存档的剧情状态；将 API 配置、主题及其他设备级开关拆到 `DevicePreferences`，将确属剧情语义的设置单独定义为 `StorySettings`。由 engine/workflow 的显式 execution context（或 preferences port）注入 live preferences，不再从 runtime state 读取。存档导入/迁移脚本负责从旧记录移除遗留设备字段，并只迁移仍属于剧情的字段；无需保留 RuntimeGameState 的兼容桥接层。

**规模判断：** 这是一次中大型内核接口重构，而不是局部清理：涉及 runtime 类型、draft/snapshot、BrowserTurnEngine 与 runtime action engine、context 构建/API 解析、session hydration、存档导入导出及迁移脚本。以当前结构估计约 12–18 个生产文件，完成后可一并删除“读档后偏好覆盖 runtime”的过渡逻辑。

### P1：API 配置的设备权威与可回滚 Session 权威分离不清

`API Profile` 槽位本身由 preference 保存，但方案应用后的 `apiSettings` 及各独立系统 API 路由会进入 React state；随后 `snapshotRuntimeState` 又把它们作为完整 `RuntimeGameState` 的一部分，通过 `session.checkpoint` 写入持久化 kernel Session。内核发起请求时直接从该 Session runtime 的 `state.apiSettings` / `state.gameSettings` 解析模型配置。因此，设备 preference 与 kernel Session 同时持有可影响请求的 API 配置，二者都可能成为实际权威。

现有逻辑依赖 live overlay 缓解冲突：Continue/Load Save 会先保留 React 中的设备偏好，应用 kernel projection 后再调用 setter 覆盖回来；每次正式命令前又以当前 React state checkpoint 整个 runtime。这只是时序上的临时 patch，并没有从状态模型中消除双权威。

**可稳定复现的隐式回滚：**

1. 一个请求开始运行，kernel command 使用启动时 Session runtime 中的旧 API 配置。
2. 请求尚未结束时，User 在设置页应用新的 API Profile；新配置写入 React state 和 preference，但正在运行的 command 仍持有旧 runtime。
3. User 中断请求；rejected 恢复路径将最后一次 committed Session projection 交给 `applySessionView`。
4. `applySessionView` 无差别执行 `setApiSettings(runtime.apiSettings)` 与 `setGameSettings(runtime.gameSettings)`，于是旧配置在没有任何提示的情况下覆盖当前 React 状态。
5. 下一次命令前的 checkpoint 还可能把这个已回滚的旧配置再次写入 kernel Session。此时 preference 可能仍是新配置，形成磁盘 preference、React state 与 Session runtime 三者不一致。

**影响：**

- API 切换会受到命令成功、失败、中断、恢复和 projection 应用时序影响，而不是只由设置操作决定；
- API Key、endpoint 和模型选择被纳入 Session 的 CAS、回滚与导出语义，存在不必要的秘密持久化和导出风险；
- 任何绕过“命令前 checkpoint”的内核调用，都可能读取旧 Session API；
- 当前 UI 没有显示配置被旧 projection 覆盖，问题表现为下一次请求悄然使用错误模型或 endpoint。

**建议：** API 配置及其他设备偏好必须只有一个独立于 Session 的权威源。将它们从 `RuntimeGameState`、Session projection、CAS snapshot、回滚和 Session export 中彻底移除；在 command 开始时把不可变的 live execution configuration 显式注入该次执行。请求一旦开始，该 command 使用其捕获的配置直到完成或取消，但 command 的 projection/rejected 恢复绝不能回写全局设备配置。

## 补充发现：回合过程事件未投影，导致聊天与状态 UI 滞后

### P1：用户输入已写入 draft，但 UI 直到最终 commit 才看到它

- `src/kernel/workflows/sendWorkflow.ts:1597-1598` 在主模型调用前将 `userMsg` 加入 `updatedHistory` 并写入 draft。
- `src/kernel/adapters/browser/BrowserTurnEngine.ts:49-65` 不会在该时点发送包含 draft 的 frame；它只转发 `onStreamProgress`，并在整个 workflow 完成后才 yield `completed` 的完整 runtime。
- `src/kernel/application/executeTurn.ts:30-46` 只把 engine 的 `progress` 转成 narrative delta，随后直接提交最终 runtime。

**可见表现：** 发送后，玩家消息不会立即出现在聊天列表；它会与最终模型消息一起，在回合正式提交后出现。

### P1：召回、插入、错误与重试状态存在于 draft，但没有阶段事件

- `src/kernel/workflows/sendWorkflow.ts:1530-1536` 将加载状态、`workflowHint` 和“智库/记忆召回中”写入 draft。
- `src/kernel/workflows/sendWorkflow.ts:1768-1792` 在忆庭/智库完成后，将召回摘要、完整注入内容和“已注入”提示写入 draft。
- `services/ai/retry.ts:15-36` 在独立模型调用内部重试，但不输出“本次失败 / 第 N 次重试 / 已恢复”的可消费事件。
- `src/kernel/workflows/sendWorkflow.ts:2806-2828` 的最终失败/清理同样只影响 draft，随后才进入 command 的 rejected 或 committed 边界。

**可见表现：**

- 正常情况下，消息框上方状态栏不能在主模型回复前显示“检索中”及“已插入”的实时进展。
- 召回模型的中间失败与自动重试对 UI 不可见；只有重试耗尽后的整回合失败可被上层捕获。
- 上一回合遗留的错误提示可能在下一回合执行期间继续显示；即使新的召回在内部重试成功，UI 仍收不到“已恢复、已插入”的阶段状态。

### P1：流式预览与正式 assistant 消息没有交接帧，产生完成瞬间的闪烁

- `src/kernel/workflows/sendWorkflow.ts:2401-2419` 先在 draft 中加入正式 assistant 消息，随后立即 `streamMessageSetter.flush('')` 清空预览，并继续启动记忆等收尾工作。
- `components/features/Chat/ChatList.tsx:235-275` 在 `streamingMessage` 为空而 React `loading` 仍为真时，显示“正在沉思……”。
- 由于正式 assistant 消息仍要等待 `BrowserTurnEngine` 在 workflow 结束后输出 `completed`，UI 在此期间没有可以显示的最终消息。

**可见表现：** 主模型正文生成完毕后会出现“流式正文消失 → 正在沉思…… → 正式消息出现”的短暂空窗与布局抖动。这不是模型继续生成，而是 UI 在等待最终 runtime 提交。

### 建议：以过程 frame 取代“仅正文 progress + 最终 runtime”的协议

为 `TurnEngine` / `IKernel` 增加显式、可取消且按 command 隔离的过程 frame，至少覆盖：

1. `prepared`：立即投影用户消息与初始加载状态。
2. `status`：召回、插入、主模型、后台结算的开始、成功、失败、重试与恢复。
3. `assistant-ready`：正式 assistant 消息已经可显示，但后台记忆/变量/新闻任务仍可继续。
4. `completed`：仅用于最终持久化状态提交；不得作为聊天内容首次可见的唯一时点。

这样既能保持 kernel 的正式状态提交语义，也能让 UI 从 kernel 接收真实过程状态，而不是在 React 层猜测或乐观伪造。
