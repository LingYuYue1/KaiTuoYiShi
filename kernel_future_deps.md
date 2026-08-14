# 内核远期技术选型清单（候选与批注）

**文档定位**：本文档是 `kernelization.md` 第 18 节（Rust 迁移形态）的配套候选清单，记录 2026-08-11 设计讨论中提出的技术选型及评审批注。全部条目标注三种状态之一：

- `[候选]`：方向认可，落地前需按 AGENTS.md 规则核验（依赖至少发布 7 天后才允许采用）。
- `[已否决]`：评审否决，附原因，防止照单抓药。
- `[远期]`：仅在绿地重写内核或 Rust 迁移语境下成立，不适用于当前 TypeScript 增量重构路线。

**总纪律**：不引入大包大揽的框架；不引入全局状态库（Redux/MobX/Zustand）与网络状态库（SWR/React Query)——内核即唯一 Store,writeLeaf/归约器即 Reducer,`useSyncExternalStore` 即 Provider；核心逻辑编译产物必须与 DOM/BOM 无关（K7 的物理防线）。

---

## 一、数据树与指针跃迁

| 条目 | 状态 | 说明 |
| --- | --- | --- |
| TS:`mutative` | [候选] | 实现 writeLeaf 的结构共享突变，替代 immer。落地前核验发布时间与项目现有依赖（当前代码若已有不可变方案，沿用现有）。 |
| Rust:`im` + `Arc` | [候选] | 持久化集合，O(1) 引用计数克隆，等价结构共享。作用于叶子的内存载荷；节点图的持久化仍属存储引擎内部。 |
| Rust:`Arc<RwLock<NewestPointer>>` | [候选] | Tauri 多线程语境成立。WASM 单线程语境下可降级为 `Rc<RefCell<_>>`，届时裁决。 |

## 二、六槽位回合引擎与中间件

| 条目 | 状态 | 说明 |
| --- | --- | --- |
| TS：定制 koa-compose 式 40 行源码 | [候选] | 槽位内洋葱链，内置终局增量检查（`turnOutcome: 'consumed'` 即停止后续 next 并上抛）。不引入 koa 本体。 |
| Rust：手搓极简 `Hook` Trait | [候选] | 原提案否定 tower 的理由成立（tower 偏网络层，且难以内嵌 K14 的终局显式与回程禁写约束）。中间件签名 `(ctx, &mut Draft, next)`，`&mut` 借用天然保证单点可写。 |
| TS:`@xstate/fsm` | [已否决] | 回合引擎是硬编码状态机，三态 turnPhase + 六槽位顺序，原生 switch/enum 足够。FSM 库提供的可视化与动态配置本系统用不到。 |
| Rust：原生 `enum` + `match` 穷举 | [候选] | `TurnPhase` 三态建模，编译期穷举检查即中断恢复的分支完备性证明。 |

## 三、公共目录与投影

| 条目 | 状态 | 说明 |
| --- | --- | --- |
| TS:`proxy-memoize` 自动依赖追踪 | [已否决] | 与蓝图 4.2 直接冲突：投影注册必须显式声明依赖的 public 字段。自动追踪在条件分支读取时漏报依赖（本次未读到的字段变更不重算）。8 节 debugTrail 的读取记录只做诊断，不做失效依据。 |
| TS:`reselect` 式显式声明 | [候选] | 与 4.2 的显式依赖声明一致。亦可手写"字段版本号 + 反向索引"，不引库。 |
| Rust:`salsa` | [已否决] | 投影只有"字段→切片"一层，salsa 的多级派生增量计算无对应需求；且其 DB 模型要求全部状态入库，会反夺内核所有权。备选条件：未来投影出现深层派生链时重新评估。替代：`HashMap<ProjectionId, (FieldVersions, CachedSlice)>`。 |
| React:`useSyncExternalStore` | [候选] | 与"界面无状态、推送即重渲"完全同构，原生 API 无依赖成本。 |
| Rust→UI:`tokio::sync::watch` | [候选] | "只保留最新值"语义契合切片推送。WASM 侧 tokio 无多线程 spawn，运行时为 `futures` channel 还是 tokio 待裁决。 |

## 四、契约声明与 ephemeral 剥离

| 条目 | 状态 | 说明 |
| --- | --- | --- |
| TS:`zod` / `typebox` 声明 fields 双维度标记 | [候选] | meta 标记可见性与生命周期，编译期 `z.infer` 推导类型，writeLeaf 调用时强制校验。 |
| Rust:`serde` + `#[serde(skip)]` 实现剥离 | [已否决] | 机制错误：skip 是"永不序列化"，但活跃叶子本身要持久化（turnPhase、恢复上下文必须撑过刷新才能做中断恢复），剥离只发生在 commitLeaf 封存那一刻。skip 会把恢复上下文一并蒸发。 |
| Rust：类型状态分离 | [候选] | 正确形态：`ActiveLeaf` 与 `SealedCheckpoint` 是两个 struct，后者类型上不存在 ephemeral 字段；封存 = 消费前者产出后者的转换函数。蓝图 K3 的"按标记剥离"在 Rust 终局落地为"按类型分离"。 |
| Rust:`validator` | [候选] | writeLeaf 写入前校验，平替 zod。 |

## 五、流式处理与归约器

| 条目 | 状态 | 说明 |
| --- | --- | --- |
| TS:`eventsource-parser` + Async Generator | [候选] | 承接模型流，供对话管理插件消费。 |
| TS:Tokenizer 级流式过滤（htmlparser2 或手写状态机） | [候选] | 必须维持跨 chunk 缓冲状态（标签可能被截断），纯逐 chunk 正则不可行。归属对话管理插件内部，见蓝图 14.4。 |
| TS:`moo` 重写变量命令词法分析 | [已否决] | 蓝图第 7 节与 19 节：variableExecutor 管线原样搬迁，禁止重写协议层。 |
| Rust:`nom` / `chumsky` | [候选·受限] | Rust 迁移时用于**移植**现有解析逻辑，不是重新设计解析器。 |
| Rust:`tokio-stream` + `futures` | [候选] | 模型流封装为 `Stream<Item = Result<String>>`。WASM 运行时适配同第三节批注。 |

## 六、底层存储与资产服务

| 条目 | 状态 | 说明 |
| --- | --- | --- |
| TS:`idb` / OPFS | [远期] | 蓝图 19 节：不改动增量编码、摘要目录、滚动保留；现有 dbService + MIGRATIONS 经 L11 核验。此项是**期待方向**而非当前冲突——仅在绿地重写内核或 Rust 迁移时成立。OPFS 用于大体积资产的 WASM 场景。 |
| Rust:`redb` | [远期] | 同上。纯 Rust 嵌入式 B-Tree,ACID 事务，可同时承载节点流与 deviceStorage（独立 Table 物理隔离）。排除 rocksdb(C++ 依赖）,sled 维护停滞。 |
| 引用计数 GC：原生 Map/HashMap + fs | [候选] | K6 规则简单（诞生 +1、继承 +1、删除 -1、归零回收），无需库。 |

## 七、跨层通信

| 条目 | 状态 | 说明 |
| --- | --- | --- |
| TS:`nanoevents` / `mitt` | [候选] | 事件只携带字段名的事实广播，百行级库或手写均可。 |
| TS：命令总线 = 原生 `Map<string, Fn>` | [候选] | 蓝图已明确命令是调用壳，无需 RPC 库。 |
| Rust:`tokio::sync::broadcast`（事件）/ `mpsc`（命令） | [候选] | mpsc 多生产者单消费者天然保证"回合即单事务"的串行执行。WASM 运行时适配同第三节批注。 |
| 服务句柄：TS Interface / Rust `dyn Trait` 注入 | [候选] | 不是库能解决的，靠类型签名与注入纪律强制。蓝图 13.5 白名单五项为准。 |

## 八、评审修正记录

1. 原清单引用的"K17（上下文收窄）"不存在。K 系列为 K1–K15，上下文收窄是蓝图第 17 节 SillyTavern 纪律第 2 条。
2. Rust 借用检查防线的论证成立，补一条工程推论：CI 禁用 `unsafe`，即可在编译期斩断模块间共享内存的后门（K15 的物理执行）。
3. tokio 原语在 Tauri 侧直接适用；WASM 侧异步运行时选型（tokio 子集 vs `futures`）属跨宿主决策，蓝图 18 节已声明届时裁决。
