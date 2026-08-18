# 延后搬运依赖

记录已从提示词优化批次中刻意拆出、需等对应系统落地后再搬的 main 侧改动。

## Zhiku V3 runtime（来源 `9e633ea`）

以下三处与智库运行时编译/追踪耦合，等 Zhiku V3 批次再搬：

- `services/zhikuRuntimeCompiler.ts`
- `services/zhikuStage6Runner.ts`
- `services/zhikuRunTrace.ts`
