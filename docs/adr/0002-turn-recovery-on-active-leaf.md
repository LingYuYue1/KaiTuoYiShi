# ADR 0002：恢复现场回归活跃叶子（turnPhase / recoveryContext）

- 状态：Accepted
- 日期：2026-09-12
- 依据：`kernelization.md` §10.1 / §10.2 / §10.3 / §10.4 / §13.1、`CONTEXT.md`「ephemeral 字段」、提交 `f97a054` 的复盘
- 关联：ADR 0001（依赖采纳原则与候选登记）、`docs/unification-plan.md` U1、`known-issues.md` KI-1

## Context

原实现把未完成回合的恢复信息拆在三处：设置键 `activeWorkflowRecoveryV1` 里的独立恢复日志、React 投影 `interruptedWorkflow` / `pendingOpeningTrigger`、以及活跃叶子上的逐字段瞬态值。2026-09-11 的「刷新后开局重开」缺陷（`f97a054` 修复）暴露了多真相源的组合错误：派发方提前清空 React 投影后，叶子上的陈旧值只在封版时才被剥离，水合又把它重新装回。

`kernelization.md` 已给出目标形态：回合只有一个检查点（postLanding），活跃叶子持有三态 `turnPhase` 与缩减后的恢复上下文，两者以 ephemeral 标记声明、封版剥离；系统不再使用独立的恢复日志存储库（§10.4、§13.1 第 3/5 条）。

## Decision

### D1 活跃叶子是恢复信息的唯一载体

- `turnPhase: 'awaitingLanding' | 'settling' | null`（null = 封版后无状态，即三态之三）与 `recoveryContext: { turnAtStart, userInput, userMessageId, assistantMessageId? }` 为 ephemeral 字段，类型定义在 `models/turnRecovery.ts`，生命周期（剥离 / 重置 / 归一化）声明在 `models/leafLifecycle.ts`。
- `commitTurn` 封版时按声明剥离；`resetEphemeralFields` 让新叶子与分叉归零。
- 解析结果不进入 `recoveryContext`：S5 已把 `parsedResponse` 写进 assistant 消息，`chatHistory` 即持久事实；水合一致性与续跑守卫都校验该字段存在（这是对 §10.4 列表的有意收窄，避免重复存储）。

### D2 相位在槽位边界原子落盘

- **S1（input）**：用户消息、`awaitingLanding`、初始 `recoveryContext` 在同一次受保护叶子写入中落盘（§10.2）。正文未落地前的中断现场完全由叶子承载。
- **S5（postLanding）**：落地历史、`turnCount`、`settling` 与 `assistantMessageId` 在同一次叶子写入中落盘（§10.3）。
- commit 成功（stage12）后清空内存投影；未封版回合的叶子即恢复入口。

### D3 派发与恢复入口由相位推导

- 开局派发 = `awaitingLanding` + 无恢复上下文 + 开局未落地（`shouldStartOpening`）。`pendingOpeningTrigger` 从字段、投影、归一化、派发判定全链路删除。
- `awaitingLanding` → 重试 / 撤销（用户消息保持可见、持久）；`settling` → 继续结算 / 放弃。
- 放弃 / 撤销写回清除叶子相位；`awaitingLanding` 的撤销同时剥离残余用户消息。运行时失败与中断恢复共用同一入口。

### D4 崩溃窗口的采纳身份进入 newest 记录

`pendingChildNodeId` 由恢复日志移入 newest 记录（存储内部字段）：`commitTurn` 建叶前登记、指针移动的同一次写入清空；`loadActiveLeaf` / `adoptUnsealedChildLeaf` 按该身份认领子叶，多子叶歧义不再需要树外日志。

### D5 删除独立恢复日志

- 删除 `services/workflowRecovery.ts`、`utils/workflowRecoveryModel.ts` 及全部调用点。
- 启动时一次性删除遗留设置键 `activeWorkflowRecoveryV1`。
- 旧叶子行可能携带的 `pendingOpeningTrigger` 只剥不读（`LEGACY_EPHEMERAL_FIELDS`），首个 commit 后随封版消失；旧检查点行不迁移（不可变历史）。

## Migration

- 无新字段的旧存档：`turnPhase` 归一化为 null，按普通水合进入。
- 携带 `pendingOpeningTrigger` 的旧叶子：不读取、不投影，封版时剥离。
- 遗留设置键：首次启动删除，无其他动作。

## Consequences

- 恢复现场单源：刷新、崩溃、运行失败三条路径共用同一叶子事实与同一投影。
- ADR 0001 D2 中「`utils/workflowRecoveryModel.ts` 的 zod 扩展」候选随文件删除作废。
- 行为变化：停止生成后用户消息不再回滚、输入同时回到输入框；发送新消息会先放弃旧恢复现场（剥离未落地残余）。
- KI-1（流式中途读档的 UI 孤儿）仍开放，与本决策正交。
- 接受新测试面：`tests/leaf-recovery.test.ts` 覆盖相位归一化、S1 原子写入、封版剥离、水合投影与一致性清除、撤销 / 放弃。
