# ADR 0003：预置归一化边界与载入相位

- 状态：Accepted
- 日期：2026-09-15
- 依据：`kernelization.md`「预置只在入口加工一次、运行时只合并覆盖层」、issue #27、`CONTEXT.md` 预置载入相关词条
- 关联：ADR 0001（依赖采纳原则与候选登记）；本条关闭 issue #27（`已归一化系统` WeakSet）

## Context

可信预置数据在「读取 → 合并 → 保存」链路上每到一站都要重新证明自己合法：

- `归一化剧情编织系统(input?: Partial<剧情编织系统>)` 收宽泛输入，归一化后的 `X` 本身也满足 `Partial<X>`，所以每个下游函数都无法拒绝脏输入，只能各自再洗一遍。一次启动里每个 canon 系列被 `归一化剧情编织系列` 重建 5–6 遍（`loadCanonSeries` → 聚合 → `hydrate` → `merge` 的逐系列重建 → `buildPersisted` → 下次启动 IDB 读回）。
- `已归一化系统` WeakSet 试图用对象身份缓存掩盖问题：它保留了「函数收宽泛输入」的设计，一 `spread`/`filter` 就失效，IDB 读回是结构化克隆的新图必然 miss，还把「返回值不得原地修改」变成隐式约束（`models/storyWeaving.ts` 旧注释）。
- 载入进度条把网络与加工混为一谈：`Resource.loading.done` 数的是「取回并加工完」的文件数，副作用是「已载入 N/M」把解析/归一化也算成网络进度；网络命中缓存时又会 0→100 闪现。

## Decision

### D1 边界只有三类

| 来源 | 是否边界 | 处置 |
| --- | --- | --- |
| `public/data/story-weaving-canon/*.json` | 否（已定型的仓内产物） | 可信构造，零运行时归一化 |
| `public/zhiku-presets/*.json` | 是（**作者格式**，非运行时形状） | 单文件过边界归一化一次 |
| IDB 存档覆盖层 | 是（可能来自旧版本） | 读回时归一化一次 |
| LLM 输出 | 是 | 各自边界 |

zhiku 作者格式包含分隔字符串形式的 `使用范围`、越界 `重要度`、版本串 `updatedAt`、缺席的数组字段与仅供装配的 `出身`/`性别` 等，归一化在那是**真实职责**，不是防御性编程。

### D2 可信构造与边界归一化是两个概念

- `构造剧情编织系统` / `构造剧情编织系列` / `构造智库系统`：输入已定型，不逐字段清洗、不补默认、不生成 ID，只做允许的派生（系列聚合、进度锚点、运行时默认）。派生职责一律保留。
- `归一化剧情编织系统` / `归一化剧情编织系列` / `归一化智库系统`：只允许在 D1 的边界调用，负责清洗、补默认、去重、生成 ID。

### D3 删除 WeakSet，引用稳定性成为显式契约

- 删除 `已归一化系统`（issue #27）。
- 契约：内容未改变时沿用原引用，只有 IDB 覆盖或真实变更才创建新对象。据此修正了 `autoAlignCanonStoryProgress` 的无变化返回（返回入参引用而非归一化副本）。

### D4 载入相位拆成 network / processing / ready / failed

- `PresetTrack` = `fetch`（网络，响应体读完即上报进度）+ `process`（解析/构造/合并/落盘，静默）。
- `Resource.loading` 不再携带 `done/total`；网络进度只在 `PresetSnapshot.network`。
- 进度条**只投影 network**：网络在首帧前完成（`NETWORK_APPEAR_MS = 300`）则不渲染；已显示则按 `finishDownload 0.1s → stay 0.3s → fade 0.3s` 退场；加工段失败可把进度条以失败样式重新拉回（进度条是 fail-fail 下唯一错误面）。

### D5 裸产物契约测试与运行时消费契约一致

`tests/preset-artifact-contract.test.ts` **直接断言仓内 JSON**（不再「先归一化再断言归一化结果」），并断言 `构造 === 归一化` 在真实产物上逐字段相等。侦察结论：27 个 canon 文件零违规，无需构建期生成步骤；仅修正一处杂散字段（`story_canon_penacony_in_our_time.json` 的 `信息可见性.是否可见`）。

### D6 保存拆成投影与边界包装

`投影持久化剧情编织系统` / `投影持久化智库系统` 只做投影（可信输入）；`buildPersistedStoryWeavingSystem` / `buildPersistedZhikuSystem` 保留为「先归一化再投影」的边界包装，供运行时各处保存入口使用。启动链路直接调用投影。

## Migration

- 无持久化结构变化；IDB 壳格式不变。
- 旧存档读回仍走边界归一化，行为不变。

## Consequences

- 一次启动里 canon 系列的归一化重建从 5–6 遍降为 0 遍；`WeakSet` 及其隐式可变性约束删除（关闭 #27）。
- 真值来源清晰：产物质量由契约测试保证，运行时不再重复证明。
- 行为变化：`story_canon_penacony_in_our_time.json` 的杂散字段被移除；`autoAlignCanonStoryProgress` 无变化时返回入参引用。
- 接受新测试面：`tests/preset-artifact-contract.test.ts`、重写的 `tests/preset-loader.test.ts`、更新后的 gate/boot/zhiku catalog 测试。

## 后续审计（本轮未动，仅登记）

以下 `归一化*` 调用点仍是「可信输入被重证」的候选，本轮不动以避免扩大范围：

- `services/storyProgressService.ts`（`:10/21/32/75/97/348/413/462/519` 等）
- `services/zhikuRuntimeUnlock.ts:16/17/43`
- `services/newGameInitialization.ts:317`
- `hooks/useGame.ts:1062/1084`
- `hooks/useGame/turnSnapshot.ts:22/29`、`saveLoadWorkflow.ts:110/373`、`storyWeavingWorkflow.ts:109`
- `utils/variableExecutor.ts:446`、`utils/saveRuntimeCompactor.ts:82`
- `components/features/GameSystems/ZhikuPanel.tsx:36/128`
- `data/storyWeavingPreset.ts` 的 `alignStoryWeavingToOpeningArchive`（新开局路径，非启动链路）
