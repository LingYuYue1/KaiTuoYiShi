# 代码质量深度提升：现状与路线图

**文档分层**：执行规则见 [`AGENTS.md`](AGENTS.md)；写作建议见 [`SPEAKING.md`](SPEAKING.md)；目标态架构蓝图见 [`kernelization.md`](kernelization.md)。

**文档定位**：本文档记录代码库的代码质量现状与深度提升路线图，主要服务于**计划与审查代理**和**人类**。本文档描述当前代码质量的真实状态与尚未达成的目标，不编写理想假设冒充已实现事实。

**标记约定**：`[FACT]` 表示当前代码可确认的事实；`[DECISION]` 表示当前裁决；`[TARGET]` 表示尚未实现的目标；`[GAP]` 表示差距、风险或未验证行为；`[HISTORY]` 表示仅用于追溯的历史记录。

**状态图例（每条只取一个状态）**：
✅ 表示系统已经落实该目标。代码与核验程序支持该目标。
🟡 表示系统部分落实该目标，或者开发团队还需要对齐语义。
⏳ 表示该目标属于规划中的目标状态，当前尚未实现。
❌ 表示开发团队已经拒绝该目标。

---

## 0. 代码质量原则

本阶段目标从架构重构转向**代码质量深度提升**。以下六条原则是本阶段工作的统一定义：

| 编号 | 原则 | 说明 |
| --- | --- | --- |
| Q1 | **深模块** | 模块 = 小接口 + 深实现。铲除浅模块与透传层。判定用 deletion test：想象删除该模块，若复杂度随之消失则它是透传；若复杂度扩散到 N 个调用方则它值当。 |
| Q2 | **死代码零容忍** | 三类死代码必须清除：① 未引用导出；② 过度防御/不可能触发的兜底（不可能 `default`、静默 `catch`、刚检查又重复检查）；③ 长段解释注释（叙述临时任务/spec/自我确认，而非解释 why）。 |
| Q3 | **消除 patch/workaround** | 带「临时/暂缓/兜底/补丁/绕过」标记的实现应尽量消除，用正当设计替代，不做表面修补。 |
| Q4 | **依赖方向单向化** | 界面层不直连数据层。`components` 不得直接 import `services/dbService`、`services/ai` 或领域函数。 |
| Q5 | **注释只写 why** | 注释解释「为什么这样设计、为什么不选别的方案」，不写 what（代码复述）、不写 spec（任务叙述）、不写自我确认。 |
| Q6 | **lint 严格通过** | 任何改动不得引入新增 lint 违规；触摸文件必须达到零违规标准。 |

---

## 1. 代码质量现状画像

2026-08-12 对代码库做 9 维扫描，汇总如下；**逐条发现（含文件:行号）见 [`noted_issues.md`](noted_issues.md)**。

| 维度 | 结果 | 严重度 |
| --- | --- | --- |
| 类型安全 | 极干净：`as any` 2、`: any` 2、`@ts-ignore` 0、非空断言 0；`as unknown as` 15 处（dbService 5 处集中） | 🟢 |
| lint | 1 error（`useGameState.ts:570`）+ 2 warning + 47 条 suppression | 🟢 |
| 死代码（未引用导出） | ~~75 处~~ 已清除（71 删 + 4 调试工具保留；残留见 noted_issues.md §3） | ✅ |
| 过度防御/不可能兜底 | ~~16 处~~ 已处置（7 SSE 收窄 + 9 确认保留 + 2 归一化强化另立 #14） | ✅ |
| 长段解释注释 | ~~20+ 处~~ 已清除（13 删 + 7 收敛 + 1 保留） | ✅ |
| patch/workaround 标记 | 1416 命中（data/ JSON 占大头）；代码集中 newsModel 48 / ImageGenerationSettingsTab 36 / AlbumPanel 34 / useGameState 32 / PromptModulesTab 31 | 🟡 |
| 透传层/浅模块 | 12 真透传 + 4 条多层转发链（提示词模块 ×4 最典型） | 🟡 |
| 重复/冗余代码 | ~~6 组复制粘贴~~ 已收敛：chatCompletionClient 7 流函数抽 `readSseTextStream` 骨架、7 处 resolveXxxConfig 抽 `mergeApiOverride`、NPC 关系阈值表统一（#16 核心）；低价值 6 项另立 #19（4 分支/legacy 回退/可见性归一化/重复类型/映射块/UI 格式化） | ✅ |
| 直连耦合 | ~~15 文件~~ type-only 直连已收口（抽出 `contracts/` 契约层 + `models/opening.ts`，`components` 下 `services/ai`、`dbService` 类型直连清零）；运行时耦合留待（PhoneModal/PromptModulesTab/GitHubCloudSaveModal 面板 props 投影） | 🟡 |
| 巨型文件 | 37 文件 >800 行（28 文件 >1000 行）；dbService 2533 / chatCompletionClient 2300 / album-workspaces 2650 / PromptModulesTab 2831 | 🟡 |

**关键结论**：类型安全与 lint 已基本达标；死代码已清（阶段 1）、重复样板已收敛、直连耦合 type-only 已收口（阶段 2 落地）；剩余结构性债务是巨型文件与面板运行时耦合（阶段 3）。

---

## 2. 深度提升路线图

### 阶段 1：全局死代码清除（全库 sweep，无模块边界）

先做——风险最低、见效最快、零行为改变。覆盖维度：死代码、过度防御、长注释。

1. 清除 75 处未引用导出（逐个确认非动态 import、非测试用、非预留 API）
2. 收敛 16 处过度防御：4 个不可能 `default` 改为穷举无 default；12 个静默 `catch` 中，真正吞异常且无日志的补 `devLog`，合理的流式 `// skip` 保留
3. 收敛 20+ 处长段解释注释为「why」式短注释或删除

### 阶段 2：耦合收窄前置（大文件拆分的安全前提）

1. ✅ ~~15 文件直连收口~~ type-only 层已收口（抽出 `contracts/` 契约层 + `models/opening.ts`，components 下 services/ai、dbService 类型直连清零；#17）；**运行时层留待**（面板 props 投影，重点 PhoneModal、PromptModulesTab、GitHubCloudSaveModal）
2. ✅ 剥离：导入封版路径的 queueTasks 剥离补齐（#18，单判据 `isUnsealedHeadSave`）
3. ✅ 统一：三入口恢复（bootRestoreFromNewest / loadLatestSave / 中断恢复）收敛为 hydrate（#10）
4. ✅ 重复样板收敛：chatCompletionClient 7 流函数抽 `readSseTextStream` 骨架、7 处 resolveXxxConfig 抽 `mergeApiOverride`、NPC 关系阈值表统一（#16 核心）；低价值 6 项另立 #19
5. ✅ 新局初始化归一：`createInitialWorkspace` 统一 fresh/restart 两路径 + 补归一化缺口（#15）

### 阶段 3：大文件攻关（按模块根治，逐模块 深模块→patch→类型安全）

按行数 + 耦合度排序，逐模块根治。每模块内顺序：深模块深化 → patch 消除 → 类型安全收敛。

模块清单（行数降序）：

> PromptModulesTab 2831 · ZhikuPanel 2807 · album-workspaces 2650 · dbService 2623 · chatCompletionClient 2519 · PhoneModal 2443 · wizard-steps 2285 · ApiSettings 1526 · PlotPanel 1525 · useGame 1487 · AlbumPanel 1418 · models-settings 1379 · systemPromptBuilder 1374 · SaveLoadModal 1340 · App 1318 · models-npc 1313 · WorldbookManagerModal 1263 · TurnItem 1261 · VariableManager 1256 · …

每模块根治目标：
- **深模块**：拆分上帝对象，透传层收敛（含提示词模块 4 条转发链）
- **patch**：清除 workaround 标记
- **类型安全**：收敛 `as unknown as`

### 阶段 4：收尾

1. lint 清零（1 error + 2 warning + 47 suppression 收敛）
2. 命名收敛（顺带）
3. 测试覆盖（最后）

---

## 3. 验收标准

### 静态验收

- lint 零违规；触摸文件零违规（Q6）
- deletion test 通过：每个模块删除后复杂度不扩散（Q1）
- 深模块评估：接口复杂度显著低于实现复杂度（Q1）
- 全库无未引用导出、无不可能兜底、无长段解释注释（Q2）

### 运行时验收（五项交叉验收）

0. **静态链路检查**：语法检查命令不得报告新增违规项；关闭压制规则后触摸文件零违规。
1. **构建装配检查**：构建命令通过，项目成功编译。
2. **新链路初始化检查**：正确加载新局初始参数，正确触发开局预置事件。
3. **核心推演与续贯性检查**：完整回合推演正确；中途刷新页面断点续跑不丢数据。
4. **防回滚与标识更新检查**：局部修改后重新生成不异常回退数据；活动节点分配全新 nodeId。
5. **前向兼容检查**：导入旧数据结构存档快照，成功归一化并正常加载。

---

## 4. 实施准则

1. **维持合理的变更作用域**：一次提交只解决一个维度的技术问题。
2. **抵制过度抽象**：出现两个以上明确使用场景之前，不构建泛化接口。
3. **死代码清除不改行为**：纯删除操作，不掺重构；行为改变与结构清理分开提交。
4. **注释只写 why**：删除代码复述、spec 叙述、自我确认类注释。
5. **果断重置错误**：大面积依赖崩溃时重置重做，不叠加补丁。
6. **不盲信自动化工具**：人工验收拥有最终解释权。
7. **规范专业术语**：易失运行状态称「状态快照」，持久化结果称「存档数据」。

---

## 5. 封存清单

以下条目在本阶段封存，不做（code quality 深度提升完成后再议）：

- URL 表现层（wouter 路由）
- 目录重组（内核层/业务管线层/视图展现层三级结构）
- 存档界面重写（树形结构展示）
- 界面层交互收敛（命令注册表 / 投影精确失效）
- 资产引用计数与手动整理入口
- AI 请求插件化（modelCall 扩展点）

---

## 修订记录

- **2026-08-14 阶段 2 落地**：耦合收窄前置全部落地——type-only 直连收口（`contracts/` 契约层 + `models/opening.ts`，#17）、queueTasks 剥离补齐（#18）、hydrate 收敛（#10）、重复样板收敛（#16 核心 + #19 低价值）、新局初始化归一（`createInitialWorkspace`，#15）。阶段 2 完成，进入阶段 3 大文件攻关。
- **2026-08-12 目标转向：code quality 深度提升**：本文档整篇重写为「代码质量深度提升：现状与路线图」；架构事实彻底删除（蓝图见 kernelization.md，历史见 git）；9 维质量扫描登记现状画像，逐条发现见 noted_issues.md；确立 Q1–Q6 原则与四阶段路线图（全局死代码 → 耦合收窄 → 大文件攻关 → 收尾）。
- **2026-08-11 路线图审计与术语清理**：审计 14 项路线图完成度；澄清「读取」（叶子水合）与「分支」（检查点分叉）两动词；「顶替」判为伪动词，全库清除。
- **2026-08-11 reroll 可用性加固与断链修复**：canRerollWithTree 改响应式（activeTreeMeta + rerollParentStatus 主动验证）；取消自动轮转删除，新增 repairDanglingSaveTreeParents 兜底悬垂父链。
- **2026-08-11 子任务 B（重roll 树操作化）**：handleReroll 从快照回滚改为父节点分叉语义。
- **2026-08-11 子任务 A 偏差修复（片 5f）**：移除手动存档；读取按节点类型分派；queueTasks 以叶子为唯一恢复入口。
- **2026-08-11 方向登记（kernelization 第五版）**：登记界面交互/恢复/资产回收方向，裁决 URL 保留 wouter。
- **[HISTORY] 2026-08-09 现状登记（panel-p1 回归排查）**：确认两处 p1 前既有缺陷，修复提示词模块嵌套按钮。
- **2026-08-09 现状对齐（面板用例化）**：登记面板层审计与迁移顺序。
- **2026-08-09 现状对齐（lint-clean）**：eslint 压制 2226→212。
- **2026-08-10 现状对齐（deviceSettings 分离）**：设备设置由 useDeviceSettings 聚合，删除机械核验脚本。
- **2026-08-09 现状对齐（5e）**：commitTurn 剥离 queueTasks，activeWorkflow 迁移。
- **2026-08-08 现状对齐（5d-2）**：读取流程接入分叉 API。
- **2026-08-07 现状对齐（5d 系列）**：存档树基础设施、分叉 API、数据库第九版。
- **2026-08-07 第三版更新**：文档定位改现状与路线图，确立 D4/D6/D7。
- **2026-08-05**：核准统一标识符格式，迁移注册表入 L11。
- **2026-08-01**：审计界面无状态缺口，确立 activeWorkflow。
