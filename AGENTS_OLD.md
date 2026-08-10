# Project memory (OLD — 2026-07-26 之前的历史记录)

> 本文件归档 2026-07-26 之前的所有工作笔记。最新工作笔记请见 `AGENTS.md`。

## 刚完成：v1.2.2 bug 修复线并入 main（2026-07-23 ~ 07-26）

- bug 修复线 v1.2.2 并入 main，含 pnpm 迁移与存档稳定性修复。
- v1.2.1（2026-07-19）：移动端长会话稳定性修复，stabilize long-session saves and chat history。
- v1.2（2026-07-17）：存档稳定与完整云备份修复，统一剧情模式与世界书注入。
- v1.21（2026-07-23）：memory、nai 和智库更新。

## 刚完成：pnpm 迁移与 UI 性能优化（2026-07-14 ~ 07-15）

- 标准化到 pnpm（`chore: standardize on pnpm`），引入 PR #3 性能优化并迁移 pnpm。
- UI 性能优化系列：
  - `perf(album)`: runtime images 存为 Blobs。
  - `perf(ui)`: isolate chat history and coalesce streaming（聊天历史隔离 + 流式合并）。
  - `perf(ui)`: isolate streamingMessage in external store（流式消息隔离到外部 store）。
  - `perf(ui)`: memo chat leaves and lazy system panels（聊天叶子 memo + 系统面板懒加载）。
  - `perf(ui)`: simplify residual paint effects（简化残留绘制效果）。
- v1.1（2026-07-14）：汇总玩家反馈问题，关系与档案稳定性修复。

## 刚完成：黑塔空间站一级航点图标修正（2026-07-13）

- 黑塔空间站一级航点不再使用近似圆盘/行星的旧图标，改为用户选定的 A 方案：前大后小双环、贯穿中央长轴、银白科研舱体和冷蓝能量环。
- 正式资源为 `public/assets/star-map/herta-space-station-ring.webp`，使用独立文件名避免旧图标缓存；透明背景适配现有一级航点光环与缩放效果。
- 黑塔空间站图标依据用户参考图在渲染层单独顺时针旋转 `42deg`，形成左上到右下的明显动态轴线；外层选中光环和其他一级航点不跟随旋转。
- 后续生图提示词默认补充崩铁式科幻美术语言：精致二次元科幻道具渲染、银白与冷蓝材质、清晰剪影、克制金色点缀和游戏 UI 资产完成度，同时保持原创结构而非复制现有官方图。

## 刚完成：罗浮二级地图星槎设计稿背景（2026-07-13）

- 罗浮二级地图保留 12 个官方区域、每页 4 个节点、三页左右切换、右侧详情和现有返回层级，不改布局。
- 原 CSS 洞天轮廓背景替换为本地生成的星槎工程设计稿：`public/assets/star-map/luofu-starskiff-digital-blueprint.webp`；蓝色终稿使用独立文件名，避免浏览器继续命中旧黄色版本缓存。
- 背景铺满左侧地图画布，最终采用浅冰蓝数字工程屏、深蓝星槎线稿与轻量蓝灰边缘压暗；禁止成品材质渲染，避免影响节点和面包屑可读性。
- 后续其他复杂世界的二级地图可以考虑复用“明亮数字屏 + 地域专属技术线稿”的统一方向，本轮只处理罗浮。
- `scripts/luofu-star-map-regression.mjs` 新增资源路径、文件存在性、铺满画布和背景标记检查。

## 刚完成：仙舟罗浮一至三级地图骨架（2026-07-13）

### 地图层级
- 罗浮取消中间的抽象分区层，12 个官方区域直接作为二级地点：星槎海中枢、流云渡、迴星港、长乐天、金人巷、太卜司、工造司、绥园、丹鼎司、鳞渊境、幽囚狱、竞锋舰。
- 12 个正式区域全部默认 `known`，不绑定主线或剧情编织解锁。
- 后续每个官方区域的详细地点进入三级卡片，重点地点再进入四级。

### 视觉与边界
- 罗浮二级地图继续复用其他二级地图的紧凑悬浮节点，仅背景改为罗浮甲板、廊桥、云海与淡化建木枝影，不再使用雷达椭圆、装饰航点或技术标签。
- 12 个区域每页 4 个、共 3 页；左右箭头切页，并随当前地点或右侧选中项自动定位页面。
- 分页根层不拦截空白区域点击，面包屑提升到独立交互层，确保始终可以返回星海航图。
- 本轮明确不添加罗浮四级入口；等待后续地点清单后再设置 `navigationMode` 与场景锚点。

### 验证
- 新增 `scripts/luofu-star-map-regression.mjs`，覆盖 12 个二级区域、临时分区移除、4×3 节点分页、默认可见状态、返回导航、四级入口留空及低噪声主题背景。
- 罗浮专用回归已纳入 `scripts/star-map-regression.mjs`。
- `node scripts/luofu-star-map-regression.mjs`、`node scripts/star-map-regression.mjs`、`npx.cmd tsc --noEmit` 与差异格式检查通过。

## 刚完成：雅利洛-VI 上下层地图与重点地点（2026-07-12）

### 地图层级
- 二级地图新增 `上层区` 与 `下层区` 两个导航分区，作为复杂世界地图的 UI 分组，不改变官方设定中的地点关系。
- 上层区三级地点共 8 个：行政区、城郊雪原、边缘通路、铁卫禁区、残响回廊、永冬岭、造物之柱、旧武器试验场。
- 下层区三级地点共 4 个：磐岩镇、大矿区、铆钉镇、机械聚落。
- 所有雅利洛地点默认 `known`，不绑定当前主线进度或剧情编织状态。

### 四级地点
- 行政区提供克里珀堡、历史文化博物馆、歌德宾馆、机械屋「永动」四个最终地点锚点。
- 磐岩镇提供搏击俱乐部、娜塔莎的诊所、歌德大饭店三个最终地点锚点。
- 四级地点继续复用 NPC、剧情和当前位置锚点联动，不增加第五级室内地图。
- 四级地点卡会读取明确绑定到 `locationId + anchorId` 的 NPC 档案头像，最多显示两枚并用 `+N` 收束；缺少图片时使用姓名首字占位，不为角色写死默认位置。
- `贝洛伯格` 与 `贝洛伯格城外` 已补为上层区、城郊雪原的兼容别名，覆盖现有雅利洛开局地点文本。

### 视觉与验证
- 雅利洛二级地图新增永冬城市剖面背景：地表雪原、贝洛伯格城墙与暖光城区位于上半部，地下矿井、管线与炉火位于下半部，中间以封锁线分隔。
- 行政区和磐岩镇分别使用上层城市街区、地下聚落两套四级构造背景。
- 新增 `scripts/jarilo-star-map-regression.mjs` 并纳入总航图回归，覆盖 2 个分区、12 个三级地点、7 个四级锚点、默认可见状态和专用背景。
- `node scripts/jarilo-star-map-regression.mjs`、`node scripts/star-map-regression.mjs` 与 `npx.cmd tsc --noEmit` 通过。

## 刚完成：黑塔空间站地图联动收束（2026-07-12）

### 范围
- 黑塔空间站一至四级地图保持现有结构：二级舱段图、三级地点卡、黑塔办公室与奇物收藏室两处四级室内图。
- 本轮集中补齐 NPC 地点、剧情节点、当前位置、锁定/空状态及黑塔专用回归，不扩展手机端地图 UI。

### 数据联动
- `NPC记录` 与 `剧情节点` 新增可选 `locationId` / `anchorId`，并兼容 `地图地点ID`、`地点ID`、`地图锚点ID`、`锚点ID` 等中文输入。
- NPC 合并、存档恢复、回合快照和变量提交会保留并归一化地图字段。
- 明确 ID 优先；旧剧情节点仍可按地点名称和别名语义匹配。没有 `locationId` 的同行 NPC 仅在玩家当前地点作为兼容兜底，不猜测具体地点或家具锚点。
- 未设置 `anchorId` 的 NPC 与剧情保留在房间级；设置后会在四级场景锚点显示数量。

### 地图行为
- 当前地点变化会同步选中航点、三级地点和四级锚点；“定位当前坐标”与自动同步共用同一层级解析规则。
- 四级锚点匹配进入对应室内；独立四级子地点进入其父级室内；锁定室内只定位到三级卡片，不能被自动或手动进入。
- 三级卡片显示 `NPC 未标注`、`剧情未关联`，四级房间显示 `暂无明确落点`、`暂无关联剧情`；未登记的当前地点继续进入收件箱流程。
- 黑塔空间站仅保留两个四级室内入口：`herta_master_herta_office` 与 `herta_storage_curio_collection_room`。

### 验证
- 新增 `scripts/herta-star-map-linkage-regression.mjs`，覆盖字段归一化、显式/兼容联动、两处室内、当前位置层级、锁定与空/未知状态。
- `scripts/star-map-regression.mjs` 已纳入黑塔专用回归。
- `node scripts/herta-star-map-linkage-regression.mjs` 通过。
- `node scripts/star-map-regression.mjs` 通过。
- `npx.cmd tsc --noEmit` 通过。

## 刚完成：v1.0 工作笔记与更新公告收束（2026-07-05）

### 背景
牢凌要求补好工作笔记，并把 0.8.1 之后的大量更新整理成一次玩家可读的更新公告，同时将版本提升到 v1.0。这一轮不是新增核心玩法，而是把近期连续修复和功能收口整理成可发布的大版本节点。

### 发布口径
- 对外展示版本：`v1.0`。
- package / Tauri / Cargo 语义版本：`1.0.0`。
- 公告覆盖范围：自 `v0.8.1` 之后的所有关键更新。
- 公告重点：酒馆预设兼容、正文格式保护、上下文 token 收口、独立系统提示词隔离、智库摘要注入、天气氛围、抢话 / 防抢话、AI 战技生成、动画与体验细节、云存档和 API 稳定性。

### 本次整理
`data/releaseAnnouncements.ts`
- 在公告列表顶部新增 `v1.0` 公告。
- 玩家向说明本版本是 0.8.1 之后的大版本收束，重点保证长期游玩稳定性。
- 明确写入 Tavern / SillyTavern 兼容原则：酒馆预设是叠加层，不替代项目原生游戏底座；兼容目标是稳定融入本项目，不是完整复刻 ST。
- 明确写入原生格式保护：ST 表层标签、抗截断/抗空回占位、HTML 注释等会被清理，但项目自己的正文、行动选项、短期记忆、动态世界、变量草稿和剧情规划协议不能被删。
- 明确写入内置预设保护：原生内置预设不改动，内置酒馆预设被玩家调整时走配置副本。

版本文件
- `package.json` / `package-lock.json`：版本改为 `1.0.0`。
- `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml`：桌面端版本改为 `1.0.0`。
- `components/layout/LandingPage.tsx`：首页展示改为 `开拓轶事 v1.0`。

回归脚本
- `scripts/release-announcements-regression.mjs` 改为检查 v1.0 公告位于 v0.8.1 之前。
- 新增公告关键词红线：酒馆预设、智库、天气氛围、抢话、防抢话、AI 生成战技、正文格式保护、token。

### 当前结论
- v1.0 公告已经把 0.8.1 之后的主要改动集中写入。
- 版本号已准备统一到 v1.0 / 1.0.0。
- 发布口径继续强调：新兼容能力不能反客为主，项目原生主剧情格式和功能稳定性优先。

## 刚完成：ST 输出表层格式清理（2026-07-04）

### 背景
牢凌反馈 ST 预设自带 CoT 和输出格式要求，会间歇性把输出变成 ST 风格：例如 `<thinking>` 内是 ST 的问题分析，正文前出现 `### 正文`，或把抗截断、抗空回、多功能标签残留带进正文。项目自己的 CoT 仍会注入给模型读取，但最终正文格式不能被 ST 预设污染。

### 修正
`services/ai/responseParser.ts`
- 新增 `stripStSurfaceNoiseFromBody()`。
- 在 `parseResponse()` 落地 body 前清理 ST 表层噪声：
  - Markdown 正文标题，如 `### 正文`、`正文：`。
  - 代码围栏，如 `\`\`\`markdown` / `\`\`\`html`。
  - ST 辅助标签块，如 `<math>...</math>`、`<Q>...</WF>`、`<Prism>...</Prism>`、`<options>...</options>`、`<current_event>...</current_event>` 等。
  - HTML 元注释 `<!-- ... -->`。
- 清理只作用于已解析出来的正文 body，不改变 thinking、行动选项、短期记忆、动态世界、变量草稿等协议字段。

`scripts/response-parser-surface-cleanup-regression.mjs`
- 新增真实解析回归，覆盖 ST 风格 `<thinking>` + `### 正文` + HTML 注释 + `<math>` + 未闭合协议段。
- 确认正文叙事保留，ST 标题/占位/注释不进入正文，行动选项和短期记忆仍可解析。

`scripts/st-preset-integration-regression.mjs`
- 将新增 parser 表层清理回归纳入 ST 集成检查。
- 新增静态红线：response parser 必须保留 ST 表层噪声清理层。

### 当前结论
- ST 预设可以继续影响写作风格和部分 CoT，但 `### 正文`、抗截断/抗空回残留、多功能辅助标签不应再进入玩家看到的正文。
- 项目原生输出协议仍由 `parseResponse` 和格式保护兜底，Tavern V2 仍是叠加层，不替代原生 systemPrompt。

### 验证
- `node scripts/response-parser-surface-cleanup-regression.mjs` 通过。
- `node scripts/action-options-cleanup-regression.mjs` 通过。
- `node scripts/response-truncation-regression.mjs` 通过。
- `node scripts/tavern-regex-processor-regression.mjs` 通过。
- `node scripts/st-preset-integration-regression.mjs` 通过。
- `npx.cmd tsc --noEmit` 通过。

## 刚完成：内置 Tavern 预设全量表层污染审计（2026-07-04）

### 背景
牢凌要求检查“预设是否还有污染正文的行为”，并特别强调不能只检查打开条目，关闭条目也要检查。原因是玩家后续可能打开关闭条目，且 ST 预设每个功能通常有自己的标签，正好可以用来识别和清理。

### 审计结果
全量扫描双人成行和 Izumi 的所有 `prompts`、`prompt_order` 与 `regex_scripts`，包括未启用条目：
- 双人成行：存在 `Prism`、`thinking/think`、`content`、`summary`、`meow_FM`、`branches`、`quote` 等 ST 标签；关闭条目中也有 `### 正文`、抗空回、抗截断、格式示例等要求。
- Izumi：存在 `options`、`danmu`、`tucao`、`htmlcontent`、`current_event`、`progress`、`details`、`konatan_chat` 等 ST 多功能标签；关闭条目中也有格式示例和防截断相关要求。
- 项目协议标签 `<正文>`、`<行动选项>`、`<短期记忆>`、`<动态世界>`、`<变量草稿>`、`<剧情规划>` 仍在安全层保护列表中，不能被正则或正文清理误删。

### 修正
`services/ai/responseParser.ts`
- 扩展 `stripStSurfaceNoiseFromBody()` 的 ST helper 清理标签：
  - `Prism` / `Prism_Deep`
  - `math` / `Q` / `WF`
  - `current_event` / `progress` / `options`
  - `branches` / `quote` / `meow_FM`
  - `konatan_planning~` / `konatan_chat`
  - `tucao` / `danmu` / `htmlcontent` / `guifan` / `disclaimer` / `details`
- 清理仍只作用于解析后的正文 body；项目自己的行动选项、短期记忆、动态世界等字段不被清理。

`scripts/builtin-tavern-preset-surface-audit.mjs`
- 新增内置 Tavern 预设全量审计脚本。
- 断言必须覆盖关闭条目，而不只是启用条目。
- 断言内置预设中出现的已知 ST helper 标签必须在 parser 清理名单内。
- 断言项目协议标签必须在 regex safety layer 保护名单内。

`scripts/response-parser-surface-cleanup-regression.mjs`
- 新增多功能标签回归：`tucao`、`danmu`、`htmlcontent`、`current_event`、`progress`、`details` 不得进入正文。
- 同时确认项目 `<行动选项>` 与 `<短期记忆>` 仍能正常解析。

`scripts/st-preset-integration-regression.mjs`
- 将 `builtin-tavern-preset-surface-audit.mjs` 纳入 ST 集成回归。

### 当前结论
- 当前清理策略不是只看打开条目，而是按内置预设全量标签族建立防线。
- ST 多功能标签和格式标题不会进入玩家正文。
- 项目协议标签仍受保护，不会被当作 ST 噪声清掉。

### 验证
- `node scripts/builtin-tavern-preset-surface-audit.mjs` 通过。
- `node scripts/response-parser-surface-cleanup-regression.mjs` 通过。
- `node scripts/tavern-regex-processor-regression.mjs` 通过。
- `node scripts/st-preset-integration-regression.mjs` 通过。
- `npx.cmd tsc --noEmit` 通过。

## 刚完成：主剧情截断续写自动重试停用（2026-07-04）

### 背景
牢凌反馈主剧情抗截断过于敏感，会把已经完整输出但缺少部分闭合标签的响应误判为截断，并触发“从中断处续写”。续写请求会把完整上文作为 assistant 回填，再让模型输出缓冲废话，污染当前回合和历史。

### 修正
`hooks/useGame/sendWorkflow.ts`
- 移除主剧情发送流程里的 `isTruncatedResponse` 导入与截断续写分支。
- 主剧情不再向 API 追加“上一段输出被截断，请从中断处直接续写”的系统消息。
- 缺失闭合标签统一交给 `parseResponse` / `repairTags` / `sanitizeParsedResponse` 本地兜底处理。

`services/ai/responseParser.ts`
- 删除 `isTruncatedResponse` 及其专用辅助函数，避免后续误接回主流程。

`scripts/response-truncation-regression.mjs`
- 回归改为红线：解析器不得再导出 `isTruncatedResponse`，主剧情发送流程不得再使用“主剧情工作流·抗截断”续写路径。

### 当前结论
- 主剧情不会再因为缺尾标签或疑似截断自动续写。
- 供应商 `finishReason` 仍可记录，但不会触发截断续写。
- 这不会影响空回重试、重 roll 相似度重试、DeepSeek 协议重试等其他保护。

### 验证
- `node scripts/response-truncation-regression.mjs` 通过。
- `node scripts/tavern-regex-processor-regression.mjs` 通过。
- `node scripts/st-preset-integration-regression.mjs` 通过。
- `npx.cmd tsc --noEmit` 通过。

## 刚完成：Tavern regex_scripts 安全输出清理接入（2026-07-04）

### 背景
牢凌指出：内置酒馆预设里原本就有用来清理输出残留的正则，例如 `HTML注释-去除` 会清理 `<!-- 满足动作改写，补充道谢对白... -->` 这类元注释；`抗截断-清理math`、`抗空回-去除` 等会清理预设为了防截断/防空回注入的占位标签。此前我们只展示/干跑 `regex_scripts`，导致这些清理没有在主剧情落地前生效。

### 修正
`hooks/useGame/tavernRegexProcessor.ts`
- 新增 `applyTavernOutputRegexScripts(rawText, rawPreset)`。
- 只放开“安全输出清理类”正则：
  - HTML 注释 / comment 清理。
  - 抗截断 `<math>...</math>` 占位清理。
  - 抗空回 `<Q>...</WF>` 等占位清理。
  - 全文缩进清理。
- 明确阻止：
  - 会删除/改写项目协议标签的正则（如 `<正文>`、`<行动选项>`、`<变量更新>`、`<天气>`）。
  - 会插入 HTML/CSS/JS/DOM 的美化类正则（如 `<style>`、`<script>`、`<details>` 等）。
  - 无法确认作用域的普通正则。

`hooks/useGame/sendWorkflow.ts`
- Tavern V2 消息链生效后，主模型返回会先经过 `applyTavernOutputRegexScripts`。
- 如果有安全正则实际命中，会用清理后的 `fullText` 重新 `parseResponse`，再进入空回/截断判断、正文落库、变量模型、记忆、新闻、手机等后续流程。
- 这样 `<!-- ... -->` 元注释和抗截断占位不会进入正文、记忆或后台系统。

`components/features/Settings/PromptModulesTab.tsx`
- 正则面板文案从“不会真实执行”改为“主剧情只会执行安全输出清理类正则”。
- 本地审查提示同步说明：高风险脚本仍只展示和干跑，不会改写正文输出。

`scripts/tavern-regex-processor-regression.mjs`
- 新增回归：
  - `HTML注释-去除` 应归类为安全输出后处理。
  - `抗截断-清理math` 应能清理 `<math>...</math>`。
  - 清理后必须保留 `<正文>`、`<行动选项>` 等项目协议标签。
  - CoT 美化 / HTML/CSS 注入类正则必须跳过。

### 当前结论
- 酒馆预设的正则不再是“完全不执行”。
- 只执行安全输出清理层，用于清理元注释和抗截断/抗空回占位。
- 美化、显示层、HTML/CSS/JS、协议标签改写等高风险正则仍不执行。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/tavern-regex-processor-regression.mjs` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。
- `node scripts/st-preset-integration-regression.mjs` 通过。
- `node scripts/response-truncation-regression.mjs` 通过。

## 历史记录：主剧情抗截断误判修正（已被停用方案取代，2026-07-04）

### 背景
牢凌贴出主剧情错误报告：模型输出了完整的 `<thinking>`、`<正文>`、`<行动选项>`、`<短期记忆>`、`<动态世界>`、`<变量草稿>`、`<剧情规划>`，但因为没有显式 `</正文>`，主剧情工作流误判为“缺尾标签，被截断”，触发续写重试。续写请求把完整上文作为 assistant 回填后，模型又输出“检测到持续的截断续写指令、暂无实际被截断正文”的缓冲废话，造成回合内容被污染。

### 后续取代
- 本节记录的是中间方案，已被“主剧情截断续写自动重试停用”取代。
- 当前代码已删除解析器中的截断判断函数，主剧情不再执行任何“从中断处续写”自动重试。
- 缺闭合标签统一交给 `parseResponse`、`repairTags` 和后续正文清洗兜底。

### 当前结论
- 这段旧方案不再代表当前实现。
- 当前实现是不再做截断续写，避免误判污染历史。
- 不影响行动选项解析和 DeepSeek 格式稳定检查。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/response-truncation-regression.mjs` 通过。
- `node scripts/action-options-cleanup-regression.mjs` 通过。
- `node scripts/deepseek-format-stability-regression.mjs` 通过。

## 刚完成：酒馆内置预设单条启停改为玩家配置副本（2026-07-04）

### 背景
牢凌反馈酒馆预设的单独条目无法打开/关闭。复查确认原因是 UI 用 `canEdit = current && !current.isBuiltin` 同时控制“正文编辑”和“顺序项启停”，导致内置双人成行 / Izumi 因为正文只读，连 prompt_order 单条开关也一起被禁用。

### 修正
`components/features/Settings/PromptModulesTab.tsx`
- 保留 `canEdit = Boolean(current && !current.isBuiltin)`，继续限制内置预设正文、role、content 等原始内容只读。
- 新增 `canToggleOrderSlot = Boolean(current)`，顺序项启停不再受内置只读状态影响。
- `patchOrderSlot` 不再拦截 `current.isBuiltin`。
- `patchV2Preset` 在目标是内置预设时，不修改内置 JSON；会自动创建/更新玩家副本：
  - id: `builtin_override_${presetId}`
  - name: `原预设名（自定义配置）`
  - `isBuiltin: false`
  - 自动切换 `currentStPresetIdV2` 到该副本
- 原始内置预设仍保留、不可删除；玩家副本可继续编辑/删除。

`scripts/st-v2-ui-edit-export-regression.mjs`
- 新增红线：顺序项启停必须使用 `canToggleOrderSlot`，不能再被 `canEdit` 锁死。
- 新增红线：内置预设首次修改顺序项时必须生成玩家自定义配置副本。

### 当前结论
- 内置预设内容仍不会被改动。
- 玩家可以关闭/开启内置预设里的单独 prompt_order 条目。
- 第一次改内置条目会生成玩家配置副本，之后真实发送使用该副本的启停状态。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。
- `node scripts/st-preset-integration-regression.mjs` 通过。

## 刚完成：Tavern V2 历史去重、当前输入去重与原生底座去重（2026-07-04）

### 背景
牢凌反馈开启 Tavern 预设后，上下文里预设内容显示在“历史记录”中，并且 token 暴涨到约 4w。复查确认严重问题存在：`sendWorkflow` 构建 Tavern V2 消息链时把 `updatedHistory` 全量传给 `buildTavernMessageChain`，导致 ST 预设里的 `chatHistory` 槽位绕过原生 `getMainHistoryWindow` 近期历史窗口。进一步检查还发现两个可优化重复点：
- `updatedHistory` 包含本轮 `userMsg`，如果直接给 Tavern 的 `chatHistory` 槽位，同时又传 `latestUserInput`，当前输入可能被重复发送。
- Tavern V2 改成叠加模式后，原生 `systemPrompt` 已完整发送；Tavern worldbook 嫁接层不应再重复塞原生世界观/叙述者人格/开发者模式/文风/no-control 这类底座模块。
- 如果存档里残留 V1 `st_import_*` 模块，同时又选中 V2 酒馆预设，同一类 ST 内容可能以“V1 模块 + V2 消息链”两种形态重复注入。

### 修正
`hooks/useGame/sendWorkflow.ts`
- 将 `const recentHistory = getMainHistoryWindow(updatedHistory, state.gameSettings, state.记忆)` 提前到 Tavern V2 构建之前。
- 新增 `const tavernHistory = recentHistory.filter((msg) => msg.id !== userMsg.id)`。
- `buildTavernMessageChain({ chatHistory })` 从 `updatedHistory` 改为 `tavernHistory`。
- 原生 fallback 分支继续复用同一个 `recentHistory`。
- Tavern V2 构建时传 `includeNativeContextInWorldbook: false`。
- 移除 Tavern V2 构建参数里的 `worldbookExtraTexts: [天气片断]`，天气仍只在原生 `systemPrompt` 里发送。
- 结果：Tavern 预设无法再把全量聊天历史塞进请求，只能使用主剧情原生近期窗口（当前默认 20 条，并复用 assistant 历史压缩策略），且当前输入只由 `latestUserInput/userInput` 槽位承载。

`hooks/useGame/contextSnapshot.ts`
- 主剧情快照同样新增 `recentHistory = getMainHistoryWindow(...)`。
- 主剧情快照新增 `tavernHistory`，排除最后一条与 `sourceInput` 相同的当前用户输入。
- Tavern V2 预览从 `state.chatHistory` / `recentHistory` 改为 `tavernHistory`。
- Tavern V2 快照同样传 `includeNativeContextInWorldbook: false`。
- V2 生效时，最后的 request messages 区块不再显示为“历史记录”，而是：
  - id: `tavern_preset_message_chain`
  - title: `酒馆预设消息链（N 条）`
  - category: `酒馆预设`
- 酒馆状态说明补充：`酒馆 chatHistory 槽位只使用原生近期历史窗口，并排除当前用户输入，避免全量历史和本轮输入重复注入。`

`hooks/useGame/tavernMessageChainBuilder.ts`
- `TavernChainParams` 新增 `includeNativeContextInWorldbook?: boolean`。
- 默认行为保持不变；主剧情 Tavern V2 叠加模式传 `false` 时，Tavern worldbook 只保留 ST 预设自己的 `world_info` 等内容，不再重复原生底座模块。
- 仍保留 Tavern 链尾的 CoT / 回复格式 / 行动选项保护，因为这些是压住 ST 预设、保证前端 UI 输出格式稳定的兜底，不属于可删除的普通历史重复。

`hooks/useGame/systemPromptBuilder.ts`
- `effectiveModules` 过滤条件从“仅总开关关闭时过滤 V1 `st_import_*`”扩展为：`settings.enableStPreset === false || Boolean(settings.currentStPresetIdV2)`。
- 也就是：只要选中了 V2 酒馆预设，原生 systemPrompt 构建时就隔离旧 V1 `st_import_*` 残留模块，防止同一份 ST 预设以 V1 模块和 V2 消息链两种形态重复注入。

`scripts/st-v2-send-workflow-guard-regression.mjs`
- 新增红线：
  - sendWorkflow 必须定义 `recentHistory = getMainHistoryWindow(updatedHistory, ...)`。
  - sendWorkflow 必须定义 `tavernHistory = recentHistory.filter((msg) => msg.id !== userMsg.id)`。
  - Tavern V2 构建必须使用 `chatHistory: tavernHistory`。
  - Tavern V2 叠加模式必须传 `includeNativeContextInWorldbook: false`。
  - 禁止重复传 `worldbookExtraTexts: [天气片断]`。
  - 禁止 `chatHistory: updatedHistory` / `chatHistory: state.chatHistory`。
  - 快照必须单独显示 `酒馆预设消息链`，并说明只使用原生近期历史窗口且排除当前用户输入。
  - systemPromptBuilder 在 V2 选中时必须过滤 legacy V1 `st_import_*` 模块。

`scripts/st-preset-integration-regression.mjs`
- 集成检查同步加入：
  - Tavern V2 不得接收全量历史。
  - Tavern V2 不得重复当前用户输入。
  - Tavern V2 不得在 worldbook 嫁接层重复原生底座模块和天气片段。
  - Tavern V2 选中时不得让 legacy V1 `st_import_*` 模块混入原生 systemPrompt。
  - 快照必须拆分酒馆预设消息链展示。

### 冲突检查
- `buildTavernMessageChain` 只在主剧情发送和主剧情上下文快照中调用。
- 未发现手机、变量、新闻、智库、忆庭、剧情编织等独立系统依赖 Tavern V2。
- `regex_scripts` 只放开安全输出清理层；高风险/显示层/协议改写脚本仍只展示、审查和干跑。
- 原生游戏底座 `systemPrompt` 仍完整发送；Tavern V2 只是额外 messages。
- 原生主剧情 fallback 仍按 `recentHistory` 正常发送，不受 Tavern V2 的 `tavernHistory` 过滤影响。
- V2 选中时会隔离 V1 `st_import_*` 残留模块，但不会过滤项目原生内置模块、玩家自定义非 ST 模块、世界书、记忆、智库、忆庭、变量/天气协议。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-v2-send-workflow-guard-regression.mjs` 通过。
- `node scripts/st-preset-integration-regression.mjs` 通过。
- `node scripts/tavern-message-chain-regression.mjs` 通过。
- `rg` 静态检查未发现 Tavern V2 继续传全量历史、未过滤 `recentHistory` 或重复天气片段。

## 刚完成：Tavern V2 改为叠加模式，保留原生游戏底座（2026-07-04）

### 背景
牢凌指出一个关键风险：如果开启 Tavern 预设后，项目内置提示词不再注入，游戏会缺失运行所需的世界状态、角色状态、记忆、NPC、世界书、智库/忆庭、剧情编织、变量/天气协议和输出格式等底座。复查确认此前 V2 成功构建时确实会执行 `systemPrompt = ''`，只发送 Tavern messages；虽然其中补了少量格式保护，但不等于完整游戏上下文。

### 纠偏原则
- Tavern/ST 预设只能作为风格、宏、部分结构的额外层。
- 项目原生 `buildSystemPrompt` 仍是主剧情运行底座，不能被 Tavern V2 替换。
- 预设兼容优先级低于游戏可运行性和输出格式稳定性。

### 改动
`hooks/useGame/sendWorkflow.ts`
- 删除 Tavern V2 成功分支里的 `systemPrompt = ''`。
- 开启并选中 Tavern V2 后，请求结构变为：
  - `systemPrompt`：完整原生游戏底座，继续包含角色/世界/记忆/NPC/世界书/智库/忆庭/剧情编织/格式协议等。
  - `apiMessages`：Tavern V2 由 `prompts + prompt_order` 构建出的额外消息链。
- V2 构建失败时仍回退原生主流程。

`hooks/useGame/contextSnapshot.ts`
- 上下文快照不再在 V2 生效时清空 systemPrompt 分段。
- 酒馆状态说明改为“额外 API messages”，并明确“原生游戏底座 systemPrompt 仍会完整发送”。

`scripts/st-v2-send-workflow-guard-regression.mjs`
- 新增红线断言：`if (tavernV2Messages)` 分支不能包含 `systemPrompt = ''`。
- 快照必须说明 V2 是叠加模式。

`scripts/st-preset-integration-regression.mjs`
- 新增集成红线：Tavern V2 不得替换原生游戏 systemPrompt。

### 当前结论
- 开启酒馆预设后，原生内置提示词和游戏运行上下文仍会完整注入。
- Tavern 预设会作为额外 messages 参与主剧情请求，不再吃掉项目底座。
- 这比“纯 ST 替换模式”更稳，也更符合本项目“不能影响正常游戏体验”的红线。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-v2-send-workflow-guard-regression.mjs` 通过。
- `node scripts/st-preset-integration-regression.mjs` 通过。

## 刚完成：Tavern V2 返回检查与上下文快照修正（2026-07-04）

### 背景
牢凌做返回检查时发现上下文里似乎没有注入当前内置 Tavern 预设。复查后确认真实发送链路和检查/预览链路存在两个容易误导的点：
1. Tavern V2 生效时，真实请求会把 `systemPrompt` 清空，改用 `apiMessages` 承载预设消息链；如果只看旧 `systemPrompt` 预览，会误判为没注入。
2. UI 使用 `enableStPreset ?? true`，但 `sendWorkflow` 使用 `enableStPreset === true`。旧存档没有该字段时，UI 看起来是开启，真实发送却不会尝试 V2。

### 修正
`hooks/useGame/sendWorkflow.ts`
- 将 Tavern V2 分流开关从 `state.gameSettings.enableStPreset === true` 改为 `state.gameSettings.enableStPreset !== false`。
- 语义与 UI、原生模块过滤保持一致：只有显式关闭才不注入；旧存档缺省视为开启。
- 没有改默认选中预设：`currentStPresetIdV2` 仍为 `null`，不会强行改变原生体验。

`hooks/useGame/contextSnapshot.ts`
- 主剧情上下文快照新增 Tavern V2 预览路径。
- 选中有效 V2 预设且总开关未关闭时，快照复用真实 `buildTavernMessageChain` 构建 API messages。
- V2 生效时快照同样显示“无 System Prompt 分段”，并在 API Messages 里显示 Tavern 预设内容。
- 新增“酒馆预设状态”诊断：显示当前预设、是否尝试、快照是否使用 V2 messages、未生效原因。

`scripts/st-v2-send-workflow-guard-regression.mjs`
- 更新红线：发送链路和上下文快照都必须使用 `enableStPreset !== false`。
- 要求上下文快照必须引用 V2 内置预设和 `buildTavernMessageChain`。

`scripts/builtin-tavern-v2-message-chain-regression.mjs`（新建）
- 直接用内置双人成行与 Izumi 跑真实 Tavern message builder。
- 断言选中后能生成 API messages，包含预设内容、最新用户输入、项目回复格式保护和行动选项保护。

`scripts/st-preset-integration-regression.mjs`
- 纳入新增内置 V2 运行时消息链回归。
- 增加快照必须展示 Tavern V2 状态诊断的检查。

### 当前结论
- 内置 Tavern V2 不是默认自动注入，必须在“酒馆预设”页选中双人成行或 Izumi。
- 选中后真实发送会走 Tavern `prompts + prompt_order` 消息链；项目格式保护仍会压轴注入。
- 之前“上下文看不到预设”的主要原因是快照仍在看旧 systemPrompt 视角；现在已能看到真实 V2 API messages。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-v2-send-workflow-guard-regression.mjs` 通过。
- `node scripts/builtin-presets-v2-regression.mjs` 通过。
- `node scripts/tavern-message-chain-regression.mjs` 通过。
- `node scripts/builtin-shuangrenchenghang-format-guard-regression.mjs` 通过。
- `node scripts/builtin-tavern-v2-message-chain-regression.mjs` 通过。
- `node scripts/st-preset-integration-regression.mjs` 通过。

## 刚完成：Izumi 0629 接入内置 Tavern V2 原结构预设（2026-07-04）

### 背景
牢凌要求把桌面文件夹里的另一个预设也接入。延续双人成行的原则：只作为内置 Tavern V2 原结构预设接入，不转成旧 `st_import_*` 模块，不追求 100% ST 兼容；项目自己的回复格式、行动选项、变量/天气协议继续兜底，保证正常游戏体验不被预设破坏。

### 输入预设
来源：`C:\Users\25934\Desktop\崩坏前端剧情\Izumi 0629.json`

原始结构统计：
- `prompts`: 204
- `prompt_order[0].order`: 173
- 启用顺序项：52
- `character_id`: 100001（仍只作为 ST 顺序槽位，不是角色卡系统）
- `world_info`: 0
- `extensions.regex_scripts`: 26

### 改动
`data/builtinPresets/izumi.json`
- 用桌面原始 ST JSON 替换旧的 Izumi 兼容文件。
- 保留原始 `prompts / prompt_order / extensions / regex_scripts / sampling` 字段。

`data/builtinPresets/index.ts`
- 新增 `BUILTIN_IZUMI_PRESET_ID = 'builtin_izumi_v2'`。
- `getBuiltinPresetsV2()` 现在返回两个内置 Tavern V2 预设：
  - 双人成行：`builtin_shuangrenchenghang_v2`
  - Izumi：`builtin_izumi_v2`
- `getBuiltinPresets()` 仍只返回原生内置预设，V1/原生提示词模块不受这两个 ST 预设污染。

`scripts/builtin-presets-v2-regression.mjs`
- 更新为同时检查双人成行和 Izumi：
  - V1 内置列表仍只有原生预设；
  - V2 内置列表必须有两个；
  - Izumi 保留 204 prompts、173 order、52 enabled、26 regex。

`scripts/builtin-shuangrenchenghang-format-guard-regression.mjs`
- 扩展为通用内置 Tavern 格式保护回归：
  - 双人成行和 Izumi 都必须是原始 ST 结构；
  - 两者都不能是旧 `modules` 转换；
  - Tavern message builder 仍保留项目 `format_guard`、回复格式和行动选项压轴保护。

### 不变项确认
- 原生内置预设不动。
- 项目回复格式、行动选项、变量/天气协议不动。
- 正则仅放开安全输出清理层；HTML 注释、抗截断/抗空回占位可在主剧情后处理清理，高风险/显示层/协议改写仍只展示、审查、干跑。
- 角色卡系统不照搬，`character_id` 仍只是 ST prompt_order 顺序槽位。
- 独立系统（新闻/手机/变量/智库/忆庭/剧情编织）不依赖 ST V2。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/builtin-presets-v2-regression.mjs` 通过。
- `node scripts/builtin-shuangrenchenghang-format-guard-regression.mjs` 通过。
- `node scripts/st-preset-integration-regression.mjs` 通过。
- `node scripts/tavern-regex-processor-regression.mjs` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。

## 刚完成：双人成行改为内置 Tavern V2 原结构预设（2026-07-04）

### 背景
牢凌确认当前目标不是 100% 完美兼容 ST，而是先让内置预设稳定可用，兼容 70% 左右即可；最重要红线是不能改变或破坏项目正常游戏输出格式。也就是说，双人成行可以保留 ST 风格、宏和顺序结构，但必须继续由项目自己的回复格式、行动选项、变量/天气协议兜底。

### 输入预设
来源：`C:\Users\25934\Desktop\崩坏前端剧情\双人成行v10.0—青云上 (1).json`

原始结构统计：
- `prompts`: 250
- `prompt_order[0].order`: 250
- 启用顺序项：78
- `character_id`: 100001（仍只作为 ST 顺序槽位，不是角色卡系统）
- `world_info`: 0
- `extensions.regex_scripts`: 41

### 改动
`data/builtinPresets/shuangrenchenghang.json`
- 用桌面原始 ST JSON 替换旧的 `st_import_*` 模块化兼容版。
- 保留原始 `prompts / prompt_order / extensions / regex_scripts / sampling` 字段。
- 不再把双人成行转成旧 V1 模块副本。

`data/builtinPresets/index.ts`
- 新增 `BUILTIN_SHUANGRENCHENGHANG_PRESET_ID = 'builtin_shuangrenchenghang_v2'`。
- `getBuiltinPresets()` 仍只返回原生内置预设，确保 V1/原生提示词模块不被双人成行污染。
- `getBuiltinPresetsV2()` 额外返回内置双人成行 V2：
  - `name: '双人成行v10.0—青云上'`
  - `isBuiltin: true`
  - `characterId: 100001`
  - `preset` 直接引用原始 ST JSON。

`scripts/builtin-presets-v2-regression.mjs`
- 重写为新的内置 V2 注册回归：
  - V1 内置列表仍只有原生预设；
  - 双人成行只存在于 V2 内置预设；
  - 检查 250 prompts、250 order、78 enabled、41 regex。

`scripts/builtin-shuangrenchenghang-format-guard-regression.mjs`
- 新增格式保护红线回归：
  - 双人成行必须是原始 ST 结构，不含旧 `modules`；
  - Tavern message builder 仍保留 `format_guard`；
  - 项目 `response_format` 与 `action_options` 仍可注入；
  - 行动选项保护在后处理前压轴。

`scripts/st-preset-integration-regression.mjs`
- 将新的格式保护回归纳入 ST 集成检查。

### 不变项确认
- 原生内置预设不动。
- 项目回复格式、行动选项、变量/天气协议不动。
- 正则仅放开安全输出清理层；HTML 注释、抗截断/抗空回占位可在主剧情后处理清理，高风险/显示层/协议改写仍只展示、审查、干跑。
- 角色卡系统不照搬，`character_id` 仍只是 ST prompt_order 顺序槽位。
- 独立系统（新闻/手机/变量/智库/忆庭/剧情编织）不依赖 ST V2。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/builtin-presets-v2-regression.mjs` 通过。
- `node scripts/builtin-shuangrenchenghang-format-guard-regression.mjs` 通过。
- `node scripts/st-preset-integration-regression.mjs` 通过。

## 刚完成：按 SillyTavern 官方正则源码补齐嵌套正则提取（2026-07-04）

### 背景
牢凌反馈“双人成行”预设导入后仍然没有正则进入 UI，要求直接对照 SillyTavern 官方文档/源码做兼容，不再靠猜字段。复查后确认：我们之前已经支持了顶层 `regex_scripts` 数组/对象映射和 ST 驼峰字段，但读取层仍只看 `preset.regex_scripts`，如果预设把正则保存在 `extensions` 或酒馆助手相关字段下，导入时原始 JSON 虽然被 `...obj` 保留，UI 统计和面板还是会显示 0。

### 官方依据
- SillyTavern 官方 Regex engine：
  - Global scripts：`extension_settings.regex`
  - Scoped scripts：`characters[this_chid]?.data?.extensions?.regex_scripts`
  - Preset scripts：`presetManager.readPresetExtensionField({ path: 'regex_scripts' })`
  - 保存 preset scripts：`presetManager.writePresetExtensionField({ path: 'regex_scripts', value: scripts })`
- 因此我们只做“读取路径扩展”，不照搬角色卡系统，也不执行正则。

### 改动
`hooks/useGame/tavernRegexProcessor.ts`
- 新增 `extractTavernRegexScripts(rawPreset)` 统一提取器。
- 支持从以下路径合并读取：
  - 顶层 `regex_scripts` / `regexScripts`
  - `extensions.regex_scripts` / `extensions.regexScripts`
  - `extensions.RegexBinding.regexes`
  - `extensions.RegexBinding.regex_scripts`
  - `extensions.RegexBinding.scripts`
  - `extensions.SPreset.RegexBinding.regexes`
  - `extensions.SPreset.RegexBinding.regex_scripts`
  - `extensions.SPreset.RegexBinding.scripts`
  - `extensions.SPreset.regex_scripts`
  - `tavern_helper.scripts`
  - `extensions.tavern_helper.scripts`
- `normalizeTavernRegexScripts` 现在只接受真正带 `find_regex/findRegex/find` 的对象，避免把普通插件脚本误识别为正则。
- `readFindRegex/readReplaceString` 兼容 `find` / `replace` 别名。
- 对多路径提取结果做去重，不重复显示同一条正则。

`components/features/Settings/PromptModulesTab.tsx`
- 导入成功弹窗的 `regex_scripts` 数量改用 `extractTavernRegexScripts(parsedV2.preset)`。
- 酒馆预设面板的正则列表、本地审查统计、风险统计全部改用 `extractTavernRegexScripts(current?.preset)`。
- UI 查找/替换展示兼容 `find` / `replace` 别名。

`scripts/tavern-regex-processor-regression.mjs`
- 新增官方/社区嵌套路径回归：
  - 顶层 `regex_scripts`
  - `extensions.regex_scripts`
  - `extensions.RegexBinding.regexes`
  - `extensions.SPreset.RegexBinding.regexes`
  - `tavern_helper.scripts`
  - `extensions.tavern_helper.scripts`

### 不变项确认
- 正则仅放开安全输出清理层；HTML 注释、抗截断/抗空回占位可在主剧情后处理清理，高风险/显示层/协议改写仍只用于保留、审查、干跑预览。
- 不改正文输出格式、不改 4 标签协议、不改行动选项、不改天气/变量协议。
- 不改内置预设内容，也不影响原生提示词模块和独立系统。
- 不照搬 ST 角色卡系统；只读取预设/扩展里附带的正则数据。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/tavern-regex-processor-regression.mjs` 通过。
- `node scripts/st-preset-import-regression.mjs` 通过（16 项）。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。
- `node scripts/st-preset-integration-regression.mjs` 通过。

## 刚完成：对齐墨色 ST 正则字段兼容（scriptName/findRegex/replaceString）（2026-07-04）

### 背景
牢凌反馈修了对象映射后仍看不到正则，要求参考墨色的兼容方式。对照 `E:\桌面文件\MoRanJiangHu-main` 后确认：
- 墨色内置 `public/tavern-presets/izumi-0503.json` 使用顶层 `regex_scripts`；
- 但单条字段是 ST 原版驼峰形式：
  - `scriptName`
  - `findRegex`
  - `replaceString`
  - `trimStrings`
  - `markdownOnly`
  - `promptOnly`
  - `runOnEdit`
  - `substituteRegex`
  - `minDepth`
  - `maxDepth`
- `findRegex` 还经常使用 `/pattern/g` 这种包裹格式。
我们此前主要读取 `script_name/find_regex/replace_string`，导致正则条目可能已保留，但 UI 与干跑读不到有效标题/正则正文。

### 修正
`models/stTypes.ts`
- `STRegexScript` 新增兼容字段：
  - `scriptName`
  - `name`
  - `findRegex`
  - `replaceString`
  - `trimStrings`
  - `markdownOnly`
  - `promptOnly`
  - `runOnEdit`
  - `substituteRegex`
  - `minDepth`
  - `maxDepth`

`hooks/useGame/tavernRegexProcessor.ts`
- 新增读取 helper：
  - `readScriptName`
  - `readFindRegex`
  - `readReplaceString`
- `analyzeTavernRegexScript` 同时读取 snake_case 与 camelCase。
- `dryRunTavernRegexScript` 同时读取 `find_regex/findRegex` 与 `replace_string/replaceString`。
- 新增 `parseRegexSourceAndFlags(source, fallbackFlags)`：
  - 支持 ST 常见 `/.../g` 格式；
  - 合并显式 flags 与默认 `g`；
  - 非包裹格式保持原逻辑。

`components/features/Settings/PromptModulesTab.tsx`
- 正则 UI helper 同时读取：
  - 标题：`script_name` / `scriptName` / `name` / `id`
  - 查找：`find_regex` / `findRegex`
  - 替换：`replace_string` / `replaceString`
- 导入成功弹窗和 console 增加统计：
  - world_info 数量；
  - regex_scripts 数量。

### 回归
`scripts/tavern-regex-processor-regression.mjs`
- 新增驼峰字段测试：
  - `scriptName/findRegex/replaceString` 应可被识别；
  - `/foo/g` 应能干跑并命中两次。

`scripts/st-preset-import-regression.mjs`
- 新增测试 16：
  - V2 解析应原样保留驼峰字段；
  - `normalizeTavernRegexScripts` 应能读到驼峰格式脚本。
- 总测试数更新为 16 项。

`scripts/st-v2-ui-edit-export-regression.mjs`
- 新增断言：正则 UI 必须兼容 `scriptName/findRegex/replaceString`。

### 不变项确认
- 正则仅放开安全输出清理层；高风险/显示层/协议改写仍不执行。
- 只增强导入保留、UI 展示、风险分析和干跑。
- 不改变消息链，不影响正文格式、内置预设和独立系统。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/tavern-regex-processor-regression.mjs` 通过。
- `node scripts/st-preset-import-regression.mjs` 通过（16 项）。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。
- `node scripts/st-preset-integration-regression.mjs` 通过。

## 刚完成：regex_scripts 对象映射导入兼容修正（2026-07-04）

### 背景
牢凌实测反馈导入预设后正则没有进 UI。排查导入链：
- `parseSTPresetV2 -> normalizeSTPreset -> stPresetsV2` 会通过 `...obj` 保留原始未知字段；
- 之前回归只覆盖了 `regex_scripts: []` 数组形式；
- 真实 ST 预设可能导出为 `regex_scripts: { id: script }` 对象映射；
- UI 使用的 `normalizeTavernRegexScripts` 只识别数组，导致对象映射形式虽然保存在 preset 中，但面板读出来是 0。

### 修正
`models/stTypes.ts`
- 将 `STPresetFull.regex_scripts` 与 `STPreset.regex_scripts` 类型从 `STRegexScript[]` 扩展为：
  - `STRegexScript[] | Record<string, STRegexScript>`
- 注释说明：部分导出为数组，部分导出为对象映射。

`hooks/useGame/tavernRegexProcessor.ts`
- `normalizeTavernRegexScripts(raw)` 新增对象映射支持：
  - 数组：保持原逻辑，过滤非对象项；
  - 对象：`Object.entries` 转数组；
  - 若脚本对象缺少 `id`，用对象 key 补为 `id`；
  - 非数组/非对象返回空数组。

`scripts/tavern-regex-processor-regression.mjs`
- 新增对象映射形式测试：
  - 应能从 `{ mapped_prompt_cleanup: {...} }` 得到 1 条脚本；
  - 应把 key 补为脚本 `id`。

`scripts/st-preset-import-regression.mjs`
- 新增测试 15：
  - V2 保留式解析应保留对象映射形式的 `regex_scripts`；
  - 总测试数量从 14 项更新为 15 项。

`scripts/st-v2-ui-edit-export-regression.mjs`
- 新增断言：UI 依赖的 `normalizeTavernRegexScripts` 必须支持对象映射形式。

### 不变项确认
- 正则仅放开安全输出清理层；高风险/显示层/协议改写仍不执行。
- 导入只保留原始字段并用于 UI 审查/干跑。
- 不影响消息链、正文格式、内置预设。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-preset-import-regression.mjs` 通过（15 项）。
- `node scripts/tavern-regex-processor-regression.mjs` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。
- `node scripts/st-preset-integration-regression.mjs` 通过。

## 刚完成：酒馆 V2 导入预设删除按钮（2026-07-04）

### 背景
牢凌反馈当前导入的酒馆预设无法删除，需要新增删除按钮，同时内置预设不能删除。

### 改动
`components/features/Settings/PromptModulesTab.tsx`
- 新增 `deletePresetV2(presetId)`：
  - 只从 `settings.stPresetsV2` 中查找目标；
  - 找不到或 `target.isBuiltin` 时直接返回；
  - 删除前弹确认框，明确说明“只会删除玩家导入的预设，不会影响内置预设和原生提示词模块”；
  - 删除当前激活预设时，同步将 `currentStPresetIdV2` 和 `currentStCharacterId` 置空，回到“不使用酒馆消息链”状态。
- `V2PresetManager` 新增 `onDelete` 参数。
- 在“导出”按钮旁新增“删除”按钮：
  - 仅 `canEdit` 时显示；
  - 也就是当前预设必须存在且不是内置预设；
  - 内置预设不显示删除按钮。

`scripts/st-v2-ui-edit-export-regression.mjs`
- 新增断言：
  - 必须传入 `onDelete={deletePresetV2}`；
  - 必须存在玩家导入预设删除入口；
  - 删除逻辑必须只从 `settings.stPresetsV2` 找目标；
  - 必须检查 `target.isBuiltin`；
  - 删除确认必须说明不会影响内置预设。

### 不变项确认
- 不删除内置预设。
- 不改内置提示词模块。
- 不影响消息链构建、正则审查、world_info、宏处理。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。
- `node scripts/st-preset-integration-regression.mjs` 通过。

## 刚完成：酒馆预设正则面板入口常驻修正（2026-07-04）

### 背景
牢凌反馈“没看见这个面板，是不是没做入口”。排查后确认：
- `SettingsModal.tsx` 的“酒馆预设”页实际通过 `TavernPresetsSettingsTab` 包装 `PromptModulesTab mode="tavern"`，入口没有挂错。
- 但上一版“预设正则脚本”面板被写成 `regexScripts.length > 0` 才渲染；如果当前预设没有 `regex_scripts` 字段，UI 上完全看不到这个区域，像是没有入口。

### 修正
`components/features/Settings/PromptModulesTab.tsx`
- 将“预设正则脚本”面板改为常驻显示。
- 新增 `data-tavern-regex-panel="true"` 标记，方便回归检查。
- 当当前预设没有 `regex_scripts` 时显示空状态：
  - “当前预设没有附带 regex_scripts”
  - 说明导入含正则脚本的 ST 预设后，此处会显示脚本列表、风险类型、协议标签检查和干跑预览。
- 有正则脚本时仍显示原来的左右结构：左侧列表、右侧详情、干跑预览。

`scripts/st-v2-ui-edit-export-regression.mjs`
- 新增断言：
  - 必须存在 `data-tavern-regex-panel="true"`；
  - 必须存在“当前预设没有附带 regex_scripts”空状态文案；
  - 防止以后入口再次被条件隐藏。

### 不变项确认
- 正则仅放开安全输出清理层；高风险/显示层/协议改写仍不执行。
- 不写入预设、不影响消息链、不修改正文。
- 只修 UI 可见入口，不改底层正则安全逻辑。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。
- `node scripts/st-preset-integration-regression.mjs` 通过。

## 刚完成：酒馆预设 regex_scripts UI 面板（查看 + 风险 + 干跑）（2026-07-03）

### 背景
牢凌确认要补正则 UI，并要求延续项目一贯做法：UI 要好看，但不能让高风险正则变成“随手执行”的普通功能。此前 `regex_scripts` 底层已经能保留、分类、风险检测和干跑，但酒馆预设页只在本地审查报告里显示统计，没有独立管理块。

### 改动
`components/features/Settings/PromptModulesTab.tsx`
- 引入 `dryRunTavernRegexScript`。
- 新增正则 UI helper：
  - `DEFAULT_TAVERN_REGEX_DRY_RUN_SAMPLE`
  - `readPresetRegexText`
  - `getPresetRegexTitle`
  - `getPresetRegexKindLabel`
- 在 `V2PresetManager` 中新增状态：
  - `selectedRegexIndex`
  - `regexDryRunSample`
- 新增“预设正则脚本”面板，插在“预设世界书”和“运行诊断”之间：
  - 顶部显示总数、未禁用数、高风险数、阻断数；
  - 左侧独立滚动列表：脚本名、禁用状态、类型标签、协议标签风险、find_regex 预览；
  - 右侧详情：类型/状态/风险/命中摘要、`find_regex`、`replace_string`、安全原因、警告、错误；
  - 右侧干跑预览：可编辑样例文本，默认含 `<正文>` 与 `<行动选项>`，展示替换后结果；
  - 提供“重置样例”按钮；
  - 明确提示“当前仅展示替换结果和风险判断，不会写入预设、不影响消息链，也不会修改玩家正文。”
- 本地审查建议文案同步更新：提示可在正则面板查看风险与干跑预览。

`scripts/st-v2-ui-edit-export-regression.mjs`
- 新增断言：
  - 必须存在“预设正则脚本”面板；
  - 必须接入 `dryRunTavernRegexScript`；
  - 必须存在默认干跑样例；
  - 必须明确提示真实运行只放开安全输出清理类正则。

### 不变项确认
- `regex_scripts` 仍不真实执行。
- 不写入预设，不修改消息链，不改玩家正文。
- 不影响 4 标签格式、COT、行动选项、变量更新、天气协议。
- 不影响内置预设和独立系统。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。
- `node scripts/tavern-regex-processor-regression.mjs` 通过。
- `node scripts/st-preset-integration-regression.mjs` 通过。
- 已启动本地 dev server：`http://127.0.0.1:3000/`。

## 刚完成：ST 预设优化计划最终集成回归补齐（2026-07-03）

### 背景
继续执行“完善预设系统优化计划”的收尾检查。前一轮已完成 `{{char}}` 项目内置兼容、宏顺序执行、ST `world_info` 主剧情注入、`regex_scripts` 安全审查、V1→V2 迁移、酒馆预设 UI 与本地审查。最终审计发现计划中列出的 `scripts/st-preset-integration-regression.mjs` 尚未存在，且少量注释还停留在“world_info 暂不实现/接口预留”的旧状态。

### 改动
`scripts/st-preset-integration-regression.mjs`（新建）
- 串联执行 7 个专项回归：
  - `st-preset-import-regression`
  - `st-preset-migration-regression`
  - `tavern-message-chain-regression`
  - `tavern-regex-processor-regression`
  - `st-v2-ui-edit-export-regression`
  - `st-v2-send-workflow-guard-regression`
  - `builtin-presets-v2-regression`
- 追加静态隔离检查：
  - 不恢复玩家手填角色卡字段 `stCharCardDescription`；
  - `currentStCharacterId` 必须说明为 `prompt_order.character_id` 顺序槽位，不是角色卡；
  - 酒馆预设 UI 必须保留本地审查、world_info 查看/单条管理、regex_scripts 风险提示；
  - `{{char}}` 必须走 `buildTavernCharRuntimeProfile`；
  - 宏必须经过 `processMacros`；
  - ST `world_info` 必须通过 `buildPresetWorldInfoText` 注入主剧情消息链；
  - `regex_scripts` 必须停留在安全/干跑层；
  - 手机、变量、剧情编织、智库、忆庭等独立系统文件不得依赖 `buildTavernMessageChain` / `stPresetsV2`。

`models/stTypes.ts`
- 更新文件头注释：从“Phase 7 接口预留/世界书暂不实现”改为当前事实：V2 会保留 `prompts`、`prompt_order`、`world_info`、`regex_scripts`，并在主剧情酒馆消息链中受限使用。
- 更新 `STPresetFull` 注释：说明 V1 会把 `world_info` 转旧世界书条目，V2 原样保留，由消息链和本地审查受限兼容。

`utils/stPresetParser.ts`
- 更新 `STPresetRaw.world_info` 注释：V1 解析转项目世界书条目，V2 解析原样保留。

`models/settings.ts`
- 更新 `stWorldInfos` 注释：标明它是 V1 迁移/旧存档保留字段；V2 的 `world_info` 存在 `stPresetsV2[].preset`。
- 更新 `currentStCharacterId` 注释：明确这是 ST `prompt_order.character_id` 顺序槽位，不代表本项目角色卡。

### 不变项确认
- 不改内置原生提示词模块内容。
- 不改 4 标签输出格式、COT 骨架、行动选项兜底。
- 不恢复角色卡系统，也不让玩家手写 `{{char}}`。
- 不执行 ST `regex_scripts`。
- ST V2 仍只影响主剧情酒馆消息链，不接入新闻、手机、智库、忆庭、剧情编织、变量模型等独立系统。
- 双人成行/Izumi 这类未发布二创预设不重新注册为内置预设；原生内置预设不动。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-preset-integration-regression.mjs` 通过。
- `node scripts/deepseek-format-stability-regression.mjs` 通过。
- `node scripts/main-injection-window-regression.mjs` 通过。
- `node scripts/settings-save-regression.mjs` 通过。

## 刚完成：ST world_info UI 管理补齐与最终审计推进（2026-07-03）

### 背景
继续执行“完成预设系统优化计划”的最终审计。阶段 7 的运行时与本地审查已完成，但计划还要求 UI 支持查看、单条启停、触发关键词、注入位置/顺序摘要。审计发现当前 UI 只有统计，没有 world_info 条目管理面板；同时顺序槽位下拉仍残留“角色槽位”文案。

### 改动
`components/features/Settings/PromptModulesTab.tsx`
- 新增 world_info 视图 helper：
  - `getPresetWorldInfoViewEntries()`
  - `readPresetWorldInfoText()`
  - `readPresetWorldInfoKeys()`
  - `getPresetWorldInfoTitle()`
- 新增 `patchWorldInfoEntry(entryKey, partial)`：
  - 支持 `world_info` 数组形式；
  - 支持 `world_info` 对象形式；
  - 只在非内置预设上允许编辑；
  - 单条启停只改标准 `enabled` 字段。
- 在酒馆预设 UI 中新增“预设世界书”面板：
  - 显示总数、启用数、常驻数；
  - 展示每条标题、主关键词、次关键词、order、概率、正文预览；
  - 支持单条滑块启停；
  - 明确提示 world_info 只在主剧情酒馆消息链按关键词触发，不写入全局世界书，不影响独立系统。
- 把下拉选项文案从“角色槽位”改为“顺序槽位”，避免继续把 `character_id` 误解成角色卡。

`scripts/st-v2-ui-edit-export-regression.mjs`
- 新增断言：
  - 必须存在“预设世界书”面板；
  - 必须存在 `patchWorldInfoEntry`；
  - 必须提示 world_info 只影响主剧情酒馆消息链；
  - UI 不能再包含“角色槽位”，必须使用“顺序槽位”。

### 不变项确认
- 不把 world_info 写入全局世界书存档。
- 不影响新闻、手机、智库、忆庭、剧情编织、变量模型等独立系统。
- 不执行 regex_scripts。
- 不改内置预设、4 标签格式、COT 骨架和行动选项兜底。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-preset-import-regression.mjs` 通过（14 项）。
- `node scripts/st-preset-migration-regression.mjs` 通过。
- `node scripts/tavern-message-chain-regression.mjs` 通过。
- `node scripts/tavern-regex-processor-regression.mjs` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。
- `node scripts/st-v2-send-workflow-guard-regression.mjs` 通过。

## 刚完成：酒馆预设阶段 10 前一致性审查与修正（2026-07-03）

### 背景
继续执行预设优化计划。阶段 7/8/9 已完成后，进入清理与优化前审查，重点检查是否还有角色卡字段残留、外部 AI 审查残留、正则脚本误接入真实链路、消息链 TODO 简化点。

### 审查发现
- `models/settings.ts` 仍残留 `stCharCardDescription` 字段和默认值，与“角色卡系统不照搬，`{{char}}` 由项目运行时兼容层生成”的方向冲突。
- `hooks/useGame/tavernMessageChainBuilder.ts` 中历史消息序列化和 personaProfile 构建仍是 TODO 简化实现。
- `regex_scripts` 没有误接入真实发送链路，只用于保留、审查和干跑安全层，符合计划。

### 改动
`models/settings.ts`
- 删除 `游戏设置.stCharCardDescription` 字段。
- 删除默认设置里的 `stCharCardDescription: ''`。

`hooks/useGame/tavernMessageChainBuilder.ts`
- `buildTavernChatHistory()` 改为跳过空内容，并对 assistant 历史优先使用 `parsedResponse`：
  - `parsedResponse.body`
  - `parsedResponse.worldEvents`
  - `parsedResponse.memory`
  - 若结构化字段为空再回退 `msg.content`
- 新增 `buildTavernHistoryContent(msg)`。
- `buildTavernPersonaProfile()` 不再只返回姓名，改为拼接完整玩家档案：
  - 姓名、别名、性别、年龄、生日、身高、身份、外貌、性格、背景、专长知识。

`scripts/tavern-message-chain-regression.mjs`
- 基础预设补 `personaDescription` 运行时槽位。
- 增加断言：
  - assistant 历史优先使用 `parsedResponse.body` 且保留世界事件；
  - `personaDescription` 注入完整玩家档案。

`scripts/st-v2-ui-edit-export-regression.mjs`
- 增加断言：`models/settings.ts` 不能再包含 `stCharCardDescription`。

### 不变项确认
- 不删除 V1 预设数据。
- 不自动激活 V2。
- 不执行 `regex_scripts`。
- 不改内置预设、4 标签格式、COT 骨架和行动选项兜底。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/tavern-message-chain-regression.mjs` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。
- `node scripts/st-preset-import-regression.mjs` 通过（14 项）。
- `node scripts/st-preset-migration-regression.mjs` 通过。
- `node scripts/tavern-regex-processor-regression.mjs` 通过。
- `node scripts/st-v2-send-workflow-guard-regression.mjs` 通过。

## 刚完成：ST V1 -> V2 迁移工具补强（2026-07-03）

### 背景
继续执行酒馆预设系统优化计划阶段 9。审计发现现有 `utils/stPresetMigration.ts` 只把 V1 `modules` 反推为 V2 `prompts + prompt_order`，没有迁移 V1 附带的 `worldbookEntries`、采样参数、assistant prefill，也没有返回 V1→V2 id 映射。

### 改动
`utils/stPresetMigration.ts`
- `STPresetMigrationResult` 新增 `idMap: Record<string, string>`。
- `migrateV1PresetToV2()` 继续只生成 V2 副本，不删除 V1。
- 新增 V1 `worldbookEntries` → V2 `preset.world_info` 迁移：
  - `title` → `comment`
  - `content` 原样保留
  - `keywords` → `key`
  - `keySecondary` → `keysecondary`
  - `injectMode === 'always'` → `constant`
  - `injectAtDepth` → `position: 4`
  - 补齐 STWorldInfoEntry 必填默认值：`vectorized/disable/addMemo/displayIndex/group/groupOverride/groupWeight/depth/logic/useGroup`
- 迁移 V1 `assistantPrefill` → V2 `assistant_prefill`。
- 迁移 V1 `samplingParams`：
  - `temperature` → `temperature`
  - `topP` → `top_p`
  - `topK` → `top_k`
  - `maxTokens` → `max_tokens`
  - `frequencyPenalty` → `frequency_penalty`
  - `presencePenalty` → `presence_penalty`
- 重复迁移时继续幂等，不新增重复 V2。

`scripts/st-preset-migration-regression.mjs`
- fixture 补采样参数、assistantPrefill、worldbookEntries。
- 新增断言：
  - `idMap.preset_a === 'preset_a_v2'`
  - 采样参数迁移正确
  - assistant prefill 迁移正确
  - V1 worldbookEntries 迁移成 V2 world_info 且内容/关键词/次关键词保留

### 不变项确认
- 不自动激活 V2：`currentStPresetIdV2` 仍保持 null。
- 不删除 V1 `stPresets`。
- 不自动清理 `promptModules` 中的旧 `st_import_*`。
- 不改内置预设、4 标签格式、COT 骨架和行动选项兜底。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-preset-migration-regression.mjs` 通过。
- `node scripts/st-preset-import-regression.mjs` 通过（14 项）。
- `node scripts/tavern-message-chain-regression.mjs` 通过。
- `node scripts/tavern-regex-processor-regression.mjs` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。

## 刚完成：ST regex_scripts 受限兼容安全基座（2026-07-03）

### 背景
继续执行酒馆预设系统优化计划阶段 8。正则脚本风险高，不能直接照搬执行；本轮只做分类、风险判断和干跑预览的纯函数安全层，并接入本地审查统计，不接入主剧情真实运行。

### 改动
`hooks/useGame/tavernRegexProcessor.ts`（新建）
- 新增 `normalizeTavernRegexScripts(raw)`：
  - 过滤非对象条目；
  - 保留 ST `regex_scripts` 原始结构。
- 新增 `analyzeTavernRegexScript(script)`：
  - 分类为 `prompt_preprocess` / `output_postprocess` / `display_replace` / `blocked`；
  - 显示层、CSS、DOM、全局替换类标为高风险；
  - 触碰 `<正文>`、`<行动选项>`、`<变量更新>`、`<天气>` 等项目协议标签的规则标为阻止。
- 新增 `dryRunTavernRegexScript(script, sampleText)`：
  - 只在样本文本上干跑；
  - 返回命中次数、替换前后、风险提示、错误信息；
  - 如果替换会删除/改写项目协议标签，则 `ok=false`。

`components/features/Settings/PromptModulesTab.tsx`
- 本地审查的 `regex_scripts` 统计改为复用 `normalizeTavernRegexScripts` 与 `analyzeTavernRegexScript`。
- 当前仍只提示风险，不执行正则脚本。

`scripts/tavern-regex-processor-regression.mjs`（新建）
- 覆盖：
  - 非对象条目过滤；
  - prompt 预处理脚本可干跑；
  - display/CSS 类脚本判高风险且不可执行；
  - 删除项目协议标签的脚本被拦截。

`scripts/st-v2-ui-edit-export-regression.mjs`
- 本地审查断言改为检查 `analyzeTavernRegexScript`，确保 UI 使用统一安全规则。

### 不变项确认
- `regex_scripts` 仍不接入真实消息链、不改模型返回、不改显示层。
- 不影响 `world_info` 嫁接、宏运行时、格式保护层。
- 不改内置预设、4 标签格式、COT 骨架和行动选项兜底。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/tavern-regex-processor-regression.mjs` 通过。
- `node scripts/st-preset-import-regression.mjs` 通过（14 项）。
- `node scripts/tavern-message-chain-regression.mjs` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。

## 刚完成：ST world_info 主剧情嫁接与本地审查补强（2026-07-03）

### 背景
继续执行酒馆预设系统优化计划。本轮推进阶段 7：ST `world_info` 不照搬成外来系统，而是只在主剧情酒馆消息链中按关键词命中后嫁接；`regex_scripts` 当时仅做导入保留和本地风险提示。后续已改为只放开安全输出清理层，高风险/显示层/协议改写仍不执行。

### 改动
`hooks/useGame/tavernMessageChainBuilder.ts`
- 新增 `buildPresetWorldInfoText(params)`：
  - 从 `preset.world_info` 读取数组或对象形式条目；
  - 跳过空内容、禁用条目；
  - `constant` 条目常驻；
  - 普通条目按当前玩家输入与最近 20 条聊天历史关键词命中；
  - `selective + keysecondary` 需要二级关键词命中；
  - `probability` 使用稳定 hash 判定，避免随机导致回归不稳定；
  - 命中条目按 `order` 升序拼成 `# 预设世界书` 文本。
- 将 `presetWorldInfoText` 接入现有 `combinedWorldbookText`，只通过 `worldInfoBefore/worldInfoAfter` 或兜底世界书槽位进入酒馆消息链。
- 关键词默认按普通文本匹配；只有显式 `useRegex` 才按正则匹配，避免和后续 `regex_scripts` 隔离原则冲突。

`components/features/Settings/PromptModulesTab.tsx`
- 本地审查新增 ST `world_info` 统计：
  - 总数、启用数、常驻数；
  - 启用过多或常驻过多时提示可能挤占上下文。
- 本地审查新增 ST `regex_scripts` 统计：
  - 总数、未禁用数、高风险数；
  - 对触碰项目协议标签、显示层、CSS/DOM/全局脚本倾向的规则标记风险；
  - 明确当前只保留和提示，不执行。

`scripts/tavern-message-chain-regression.mjs`
- 新增 world_info 回归：
  - 命中 `匹诺康尼` 的条目进入 `# 预设世界书`；
  - 未命中 `贝洛伯格` 的条目不进入消息链。

`scripts/st-preset-import-regression.mjs`
- 新增测试 14：V2 保留式解析必须保留 `world_info` 与 `regex_scripts` 原始字段。
- 总数从 13 项更新为 14 项。

`scripts/st-v2-ui-edit-export-regression.mjs`
- 增加静态断言，确保本地审查保留 `world_info` / `regex_scripts` 统计与风险提示。

### 不变项确认
- 不把 ST `world_info` 写入全局世界书存档。
- 不影响新闻、手机、智库、忆庭、剧情编织、变量模型等独立系统。
- 不执行 `regex_scripts`。
- 不改内置预设、4 标签格式、COT 骨架和行动选项兜底。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-preset-import-regression.mjs` 通过（14 项）。
- `node scripts/tavern-message-chain-regression.mjs` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。

## 刚完成：酒馆预设 `{{char}}` 兼容层与宏运行时接入（2026-07-03）

### 背景
牢凌确认可以开始按预设系统优化计划执行。本轮先做最靠前且风险较低的链路：不照搬角色卡系统，先把 `{{char}}` 从旧的手填角色卡语义改为项目内置运行时角色集合；同时把已经存在的 `utils/macroEngine.ts` 接入酒馆消息链构建器。

### 改动
`hooks/useGame/tavernMessageChainBuilder.ts`
- 引入 `createMacroContext` 与 `processMacros`。
- 新增 `TAVERN_CHAR_FALLBACK_PROMPT`。
- 新增并导出 `buildTavernCharRuntimeProfile(params)`：
  - 从最新玩家输入、最近 assistant/user 历史中提取可能的 NPC/角色名；
  - 拼接当前剧情焦点候选、最近 AI 叙事片段、项目内置兜底角色集合；
  - 明确只服务 `{{char}}` / `<charname>` 兼容，不引入角色卡系统。
- `replaceTavernVariables` 参数从 `charCardDescription` 改为 `charRuntimeProfile`。
- `{{char}}` / `<charname>` 替换为 `charRuntimeProfile`。
- 为每次消息链构建创建共享 `MacroContext`：
  - 写入 `charName`、`userName`、lastMessage、lastUserMessage、lastCharMessage、messageCount、turnCount；
  - 每个启用顺序项按 `prompt_order` 顺序执行宏；
  - 宏失败时 `console.warn` 并保留原文本。
- 导出 `getSTPresetOrder`，方便回归测试/后续复用。

`models/stTypes.ts`
- 给 `STPresetFull` 补 `regex_scripts?: STRegexScript[]`。
- 新增 `STRegexScript` 原始结构类型。
- 给 `STPreset` 补 `world_info` 与 `regex_scripts` 原始字段；后续已改为只放开安全输出清理层，高风险/显示层/协议改写仍不执行。

`scripts/tavern-message-chain-regression.mjs`
- 临时编译依赖补上 `utils/macroEngine.ts`。
- 移除测试 settings 中旧的 `stCharCardDescription`。
- 新增宏回归断言：
  - 启用项 `setvar` 后，后续启用项可以 `getvar`；
  - 禁用项中的宏不会执行。

### 不变项确认
- 不改任何内置预设内容。
- 不改 4 标签格式、COT 骨架和行动选项兜底。
- 不启用 `world_info` / `regex_scripts` 运行时，只做类型保留。
- 独立系统路径未改动。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/tavern-message-chain-regression.mjs` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。

## 刚完成：完善酒馆预设系统优化计划（2026-07-03）

### 背景
牢凌确认：角色卡系统不需要照搬，项目是崩铁同人多 NPC 剧情系统；酒馆预设的其他能力需要融入我们自己的系统做更好的兼容。尤其是 `{{char}}` 不能交给玩家乱写，而应由项目内置角色集合提示词兜底。

### 改动
`docs/superpowers/specs/2026-07-02-st-preset-message-chain-refactor-design.md`
- 把目标中的 `character_id` 从“多角色卡语义”改为“顺序槽位语义”。
- 新增“最新兼容策略补充（2026-07-03）”：
  - 角色卡系统不照搬；
  - `{{char}}` / `<charname>` 由当前剧情焦点 NPC、同伴、敌对目标、场景叙事主体生成项目角色集合描述；
  - 宏引擎优先接入；
  - ST `world_info` 映射进本项目世界书；
  - ST `regex_scripts` 后置且默认隔离；
  - 审查保留本地扫描，不再依赖外部 AI。
- 删除计划中的 `stCharCardDescription` 设置字段和默认值，避免未来做成玩家手填角色卡。
- 新增 `STWorldInfoEntry` / `STRegexScript` 计划类型，并在 `STPreset` 中保留 `world_info` / `regex_scripts` 原始字段。
- 消息链计划新增 `buildTavernCharRuntimeProfile`，明确 `{{char}}` 只做兼容，不落盘、不开放自由编辑、不覆盖项目 NPC 数据。
- UI 计划把“角色槽位/角色卡”改为“顺序槽位”，`10.8` 改为 `{{char}}` 只读兼容说明。
- 测试、风险、实施阶段补齐：
  - 阶段 3 接入 `utils/macroEngine.ts`；
  - 阶段 7 增加 ST `world_info` 映射；
  - 阶段 8 增加 ST `regex_scripts` 受限兼容；
  - 旧存档迁移、清理、上线顺延为阶段 9-11。

### 不变项确认
- 本次只改计划文档和工作笔记，没有改实现代码。
- 不改任何内置预设内容、内置提示词模块、4 标签格式、COT 骨架。
- 计划继续要求 ST 能力只影响主剧情 ST 模式，不污染新闻、手机、智库、忆庭、剧情编织、变量模型等独立系统。

### 验证
- 已搜索确认计划中不再残留 `stCharCardDescription`。
- 已搜索确认“角色卡描述输入”只以否定说明出现，不再作为计划功能。

## 刚完成：移除外部 AI 审查，酒馆预设只保留本地审查（2026-07-03）

### 背景
牢凌连续测试多个模型后，酒馆预设 AI 审查仍然容易空回，判断外部模型审查链路当前投入产出不合适。本次按要求去掉外部 AI 审查功能，只保留本地结构扫描。后续如果要做两个“检查好的内置模型/内置规则”，再单独设计为项目内置审查能力，不依赖玩家 API。

### 改动
- `models/settings.ts`
  - 删除 `预设审查API覆盖` 与 `创建空预设审查API覆盖()`。
  - 删除 `游戏设置.stAiReviewApi` 默认值和类型字段。

- `components/features/Settings/ApiSettings.tsx`
  - 移除 API 子页 `预设审查`。
  - API 配置包导入/导出不再携带 `预设审查API`。

- `components/features/Settings/PresetReviewApiSettingsTab.tsx`
  - 删除该失败方案新增的独立审查 API 配置页。

- `components/features/Settings/PromptModulesTab.tsx`
  - 移除 `chatCompletionNonStream` 外部请求。
  - 删除 `buildEffectivePresetReviewApiConfig()` 和 API 依赖。
  - 工具栏按钮从 `AI 审查` 改为 `本地审查`。
  - 报告标题从 `AI 审查报告` 改为 `本地审查报告`。
  - 点击后只显示 `buildLocalReviewText()` 的本地扫描结果，并提示当前版本已移除外部 AI 审查。

- `scripts/st-v2-ui-edit-export-regression.mjs`
  - 改为断言纯本地审查：
    - 必须存在 `本地审查` 与 `本地审查报告`；
    - 必须使用 `runLocalReview` / `buildLocalReviewText`；
    - 不得再包含 `chatCompletionNonStream` / `fallbackPrompt`；
    - 不得再依赖 `stAiReviewApi` 或 `PresetReviewApiSettingsTab`。

### 不变项确认
- 不改任何内置预设内容和内置提示词模块。
- 不影响主剧情发送 API。
- 不影响酒馆消息链构建、导入/导出和预设数据结构。
- 本地审查只给结构扫描结果，不自动修改玩家配置。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。
- `node scripts/settings-save-regression.mjs` 通过。
- `node scripts/tavern-message-chain-regression.mjs` 通过。

## 刚完成：AI 审查改为只发送已启用条目（2026-07-03）

### 背景
牢凌反馈“双人成行v10.0—青云上 (1)”这类大型酒馆预设 AI 审查容易空回。该预设本地扫描显示：内容项 226、顺序项 250、启用项 78、宏条目 168（高级宏 167）。判断原因：AI 审查请求把大量未启用/未匹配条目也塞入模型，导致上下文过长且噪声过高。

### 改动
- `components/features/Settings/PromptModulesTab.tsx`
  - AI 审查输入从 `slotViewModels.map(...)` 改为：
    - `enabledSlotViewModels = slotViewModels.filter((item) => item.slot.enabled !== false)`
    - 只把当前真实会进入发送链的启用条目传给 AI。
  - 本地扫描仍保留全量统计：
    - 内容项、顺序项、启用项、运行时槽位、未匹配、高级宏等。
  - AI prompt 中新增说明：
    - “本次只审查当前已启用的 prompt_order 条目”
    - “未启用条目不会进入真实发送链，只保留统计，不参与兼容性判断”
  - 审查报告输入追加压缩统计：
    - 已发送给 AI 的启用条目数量
    - 未发送给 AI 的未启用条目数量
  - prompt 数据段标题改为“已启用 prompt_order 条目压缩数据”。
  - fallbackPrompt 同步只使用已启用条目摘要。

- `scripts/st-v2-ui-edit-export-regression.mjs`
  - 增加断言，确保 AI 审查只发送已启用条目，避免大型预设再次因为全量塞入而空回。

### 不变项确认
- 本地扫描仍能看到全量问题，包括未匹配和高级宏总数。
- AI 审查仍只生成建议，不自动修改玩家配置。
- 未修改酒馆消息链构建逻辑。
- 未修改预设数据结构和导入/导出格式。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。
- `node scripts/tavern-message-chain-regression.mjs` 通过。

## 刚完成：AI 审查空回重试与本地兜底（2026-07-03）

### 背景
牢凌反馈点击酒馆预设 AI 审查后出现“AI 审查未返回内容”。判断为主 API 请求完成但返回正文为空，可能来自供应商空 choices/content、模型过滤长提示词、上下文/输出限制或返回字段不兼容。

### 改动
- `components/features/Settings/PromptModulesTab.tsx`
  - `runAiReview` 内新增 `requestAiReview` 小函数。
  - 第一次仍使用完整 Tavern 兼容审计模板。
  - 如果第一次返回空字符串，自动使用短版 `fallbackPrompt` 再请求一次。
  - 如果短版仍空，不再只显示“未返回内容”，而是展示：
    - 本地扫描报告；
    - “AI 审查空回”说明；
    - 可能原因；
    - 建议换主 API 配置后重试。

- `scripts/st-v2-ui-edit-export-regression.mjs`
  - 增加断言，要求 AI 审查保留 `fallbackPrompt` 和空回本地扫描兜底。

### 不变项确认
- AI 审查仍使用当前主 API 配置。
- AI 审查仍只给建议，不自动改玩家配置。
- 未修改酒馆消息链和预设数据结构。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。
- `node scripts/settings-save-regression.mjs` 通过。

## 刚完成：AI 审查提示词升级为 Tavern 兼容审计模板（2026-07-03）

### 背景
牢凌指出 AI 审查不能只看 CoT/格式冲突，还必须兼顾酒馆预设各层兼容问题，尤其是高级宏之间的直接联动关系、变量读写链、运行时槽位、消息链顺序和项目内置协议。

### 改动
- `components/features/Settings/PromptModulesTab.tsx`
  - 扩展 AI 审查输入摘要：
    - `injectionPosition` / `injectionDepth`
    - `contentLength`
    - `placeholders`：char/user/input/cot/format 占位检测
    - 宏等级和宏样例继续保留
  - AI 审查提示词升级为正式 Tavern 兼容审计模板，覆盖：
    - 消息链层：顺序、重复注入、role 风险
    - 运行时槽位层：chatHistory/userInput/worldInfo/personaDescription
    - CoT/格式层：思维链、输出格式、action_options、正文标签冲突
    - 高级宏层：setvar/getvar/if/random/pick/roll 等前后依赖
    - 变量联动层：变量写入和读取条目必须成组分析
    - 输入与历史层：最新输入/历史重复或错位风险
    - 世界书/上下文层：worldInfoBefore/worldInfoAfter 保护
    - 项目协议层：四标签正文、行动选项、变量事实协议、格式保护
    - 角色语义层：`{{char}}` 多 NPC / 剧情对象集合兼容
    - 缺失/未匹配层：missing 条目是否导致宏链断裂
  - 输出格式固定为：
    - 总体结论
    - 必须保留
    - 建议关闭
    - 谨慎调整
    - 宏联动链
    - 格式与协议风险
    - 运行时槽位检查
    - `{{char}}` 兼容检查
    - 最终开关建议清单

- `scripts/st-v2-ui-edit-export-regression.mjs`
  - 增加断言，防止 AI 审查提示词退化为基础版。
  - 检查高级宏/变量联动、运行时槽位、`{{char}}` 兼容、最终开关清单、占位符摘要等关键能力。

### 不变项确认
- AI 审查仍只生成建议，不自动修改玩家配置。
- 未修改酒馆消息链构建逻辑。
- 未修改原生内置提示词正文。
- 未修改预设导入/导出结构。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。
- `node scripts/tavern-message-chain-regression.mjs` 通过。

## 刚完成：酒馆预设 {{char}} 改为项目内置兼容提示词（2026-07-03）

### 背景
牢凌指出项目没有 SillyTavern 那种单角色卡系统，`{{char}}` 在本项目里不应让玩家手填“角色卡描述”。崩铁同人剧情里同一场景可能有多个 NPC、同伴、敌对角色和剧情焦点，`{{char}}` 更适合作为酒馆预设兼容占位。

### 改动
- `hooks/useGame/tavernMessageChainBuilder.ts`
  - 新增 `TAVERN_CHAR_COMPAT_PROMPT`。
  - `{{char}}` / `<charname>` 统一替换为项目内置兼容语义：
    - 当前剧情中的主要互动对象；
    - 出场 NPC、同伴、敌对角色；
    - AI 负责扮演和调度的剧情角色集合；
    - 要根据最近剧情、玩家输入、聊天历史和世界状态判断当前焦点对象。
  - 不再依赖玩家手填 `stCharCardDescription`，避免旧存档空值把 `{{char}}` 替成空字符串。

- `components/features/Settings/PromptModulesTab.tsx`
  - 移除酒馆预设页显眼的“角色卡描述”可编辑文本框。
  - 改为只读说明，告诉玩家 `{{char}}` 已由项目内置兼容层接管，无需手动填写。

- `scripts/tavern-message-chain-regression.mjs`
  - 更新断言：从检查 `{{char}}` 替换为手填“三月七”，改为检查项目内置兼容语义。

### 不变项确认
- 未修改原生内置提示词正文。
- 未修改酒馆预设数据结构、导入/导出结构。
- 未修改 `{{user}}`、`{{cot}}`、`{{format}}`、用户输入槽位等兼容逻辑。
- `stCharCardDescription` 字段暂留在设置模型中，作为旧存档字段兼容，不再作为 UI 入口。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/tavern-message-chain-regression.mjs` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。
- `node scripts/settings-save-regression.mjs` 通过。

## 刚完成：酒馆预设左右栏独立滚动优化（2026-07-03）

### 背景
牢凌反馈酒馆预设工作台左右区域没有各自独立滚动，玩家在左侧找下面的预设/顺序项时，右侧详情会跟着页面滚走，需要再拉回来看。

### 改动
- `components/features/Settings/PromptModulesTab.tsx`
  - 酒馆预设 `prompt_order` 工作台外层增加稳定高度：`h-[min(68vh,760px)] min-h-[520px] overflow-hidden`。
  - 左侧顺序项列从固定最小高改为 `min-h-0 overflow-hidden`，内部列表继续独立 `overflow-y-auto`。
  - 右侧详细预览列同样改为 `min-h-0 overflow-hidden`，正文编辑/宏检测区域独立 `overflow-y-auto`。

### 不变项确认
- 未修改酒馆消息链构建逻辑。
- 未修改发送路径、正文格式、宏处理、预设数据结构。
- 未修改原生内置提示词内容。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。

## 刚完成：酒馆预设工作台 UI + 宏检测 + AI 审查入口（2026-07-03）

### 背景
牢凌反馈酒馆预设页整体不好看，条目详情不应在列表下方展开，启用控件应使用滑块，运行诊断应折叠；同时希望增加 AI 审查功能，用于判断玩家配置后的预设是否合格、哪些项建议关闭。还指出大量 Tavern/ST 预设存在高级宏，UI 需要明确提示。

### 改动
- `components/features/Settings/PromptModulesTab.tsx`
  - 酒馆页顶部改为紧凑工具栏：预设选择、角色槽位、后处理、导出、AI 审查。
  - 顺序项区域改成左右工作台：
    - 左侧为 `prompt_order` 列表和筛选。
    - 右侧为固定“详细预览”区域，不再需要点开后往下找正文。
  - 单条启用控件改为 `TogglePill` 滑块样式。
  - 增加筛选：全部 / 启用 / 关闭 / 运行时 / 未匹配 / 含宏。
  - 增加本地扫描统计：运行时、未匹配、宏、高级宏。
  - 增加 `MacroInspector`：
    - 检测基础宏与高级宏。
    - 高级宏条目提示不要轻易关闭。
  - 运行诊断改为默认折叠，可展开查看结构风险、格式保护和宏风险提示。
  - 增加 AI 审查入口：
    - 使用当前主 API 配置调用 `chatCompletionNonStream`。
    - 审查当前预设结构、启用状态、宏风险和格式风险。
    - 只生成报告，不自动修改玩家配置。
    - 没有 API 时回退显示本地扫描报告。

### 不变项确认
- 未修改酒馆消息链构建器。
- 未修改 sendWorkflow 旁路接入逻辑。
- 未修改开拓轶事原生内置提示词正文。
- AI 审查不自动关闭条目，只给建议。
- 内置酒馆预设仍只读，玩家导入预设可编辑。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。
- `node scripts/settings-save-regression.mjs` 通过。
- `node scripts/tavern-message-chain-regression.mjs` 通过。
- `node scripts/builtin-presets-v2-regression.mjs` 通过。
- `node scripts/st-v2-send-workflow-guard-regression.mjs` 通过。

## 刚完成：酒馆预设去 V1 化与单条顺序项管理（2026-07-03）

### 背景
牢凌确认 V1 兼容路线本身属于失败作品，不再需要作为正式酒馆预设功能保留。酒馆预设页应更贴近墨色：以 Tavern/ST 原始 `prompts + prompt_order` 为核心，条目是可管理对象，而不是预览面板。

### 改动
- `components/features/Settings/PromptModulesTab.tsx`
  - 酒馆预设导入改为只使用 `parseSTPresetV2`，只保存 Tavern 原结构到 `stPresetsV2`。
  - 导入时不再生成 V1 `st_import_*` 提示词模块副本。
  - 旧导入兼容 useEffect 改为清理旧 V1/二创残留，不再把 `st_import_*` 自动归档成 V1 预设。
  - 导入新酒馆预设时清理当前 `promptModules` 中的旧 `st_import_*` / `adapted_*` 残留，避免旧 V1 路线继续参与主剧情。
  - 酒馆页状态卡从“V1/V2”改为“总开关 / 酒馆预设 / 发送路径”。
  - 酒馆页不再渲染 `PresetSwitcher` 和 `V1PresetEntriesPanel`。
  - 酒馆页文案统一为“酒馆预设 / 酒馆消息链 / Tavern JSON”，避免继续暴露 V1/V2 产品概念。
  - `prompt_order` 条目列表增加单条启用/关闭开关，导入预设可直接单独管理顺序项。
  - 条目列表最大高度提高到 `58vh`，更接近管理台而不是小预览框。
  - 酒馆预设页外层增加 `overflow-y-auto`，避免内容变长后被设置弹窗裁掉且无法滚动。

### 不变项确认
- 未修改开拓轶事原生内置提示词正文。
- 未修改原生提示词模块页的底座逻辑。
- 未修改酒馆消息链构建器和 sendWorkflow 旁路接入逻辑。
- 未深删 V1 类型和旧辅助函数，暂时只从产品入口废弃，降低本轮风险。
- 内置酒馆预设仍保持只读，玩家导入酒馆预设可编辑/单条启停。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。
- `node scripts/settings-save-regression.mjs` 通过。
- `node scripts/tavern-message-chain-regression.mjs` 通过。
- `node scripts/builtin-presets-v2-regression.mjs` 通过。
- `node scripts/st-v2-send-workflow-guard-regression.mjs` 通过。

## 刚完成：酒馆预设页字号与阅读性优化（2026-07-03）

### 背景
牢凌反馈酒馆预设页虽然已经能查看 V1/V2 条目，但字号太小，阅读成本高。本轮按“阅读优先的双栏工作台”方向继续细化，只做 UI 可读性优化。

### 改动
- `components/features/Settings/PromptModulesTab.tsx`
  - 放大酒馆页顶部标题、说明、导入/导出按钮和状态卡字号。
  - 左侧预设工作区加宽，避免 V1/V2 条目挤成窄栏。
  - 放大运行诊断区标题、说明、诊断卡片与正文说明。
  - 放大 `PresetSwitcher` 的标题、套数统计、重命名/删除/确认/取消按钮和自动保存提示。
  - 放大 `V1PresetEntriesPanel`：条目卡片、id、摘要、展开正文、类目标签与列表高度。
  - 放大 `V2PresetSwitcher`：select/textarea/control、角色卡描述、prompt_order 顺序项、选中 prompt 编辑区。
  - 放大 `V2PresetStructurePreview`：结构预览标题、统计、顺序行和折叠提示。

### 不变项确认
- 未修改原生内置提示词正文。
- 未修改 V1/V2 预设数据结构。
- 未修改导入、切换、保存、导出、删除逻辑。
- 未修改 `sendWorkflow`、`tavernMessageChainBuilder`、`systemPromptBuilder`。
- 提示词模块页中用于密集列表的徽标小字暂未扩散修改，避免撑坏模块列表。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。
- `node scripts/settings-save-regression.mjs` 通过。
- `node scripts/tavern-message-chain-regression.mjs` 通过。
- `node scripts/builtin-presets-v2-regression.mjs` 通过。
- `node scripts/st-v2-send-workflow-guard-regression.mjs` 通过。

## 刚完成：酒馆预设 V1 条目查看面板补齐（2026-07-03）

### 背景
牢凌指出酒馆预设里仍然没法像墨色那样查看预设条目。上一版只增强了 V2 `prompt_order` 明细，但 V1 兼容预设仍只有下拉选择、重命名、删除，没有展示 `preset.modules` 内部条目。

### 改动
- `components/features/Settings/PromptModulesTab.tsx`
  - 新增 `V1PresetEntriesPanel`。
  - 接在 `PresetSwitcher` 下方，读取当前 V1 预设的 `modules`。
  - 展示启用数量、类目统计、条目列表。
  - 每个条目显示序号、标题、id、正文摘要、role、on/off。
  - 点击条目可展开，查看 order、category、system/depth 信息和完整正文预览。
  - 当前为原生内置入口、没有 V1 导入条目时显示空状态。

### 不变项确认
- 该面板只读展示 V1 条目，不改变导入、切换、删除、发送逻辑。
- 未修改 V2 消息链构建器。
- 未修改原生内置提示词正文。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。
- `node scripts/settings-save-regression.mjs` 通过。
- `node scripts/tavern-message-chain-regression.mjs` 通过。
- `node scripts/builtin-presets-v2-regression.mjs` 通过。
- `node scripts/st-v2-send-workflow-guard-regression.mjs` 通过。

## 刚完成：酒馆预设页详细控制台 UI 初版（2026-07-03）

### 背景
牢凌反馈酒馆预设页 UI 还需要更详细，并要求参考墨色那边的酒馆预设设置页。复查墨色 `TavernPresetSettings.tsx` 后，确认其优势是把预设总览、角色槽位、post-process、prompt_order 顺序项和单项编辑放在同一页中，适合作为本页增强方向。

### 改动
- `components/features/Settings/PromptModulesTab.tsx`
  - 在 `mode="tavern"` 顶部新增 4 个状态卡：总开关、V1 兼容预设、V2 消息链、发送路径。
  - 状态卡展示当前是否会尝试 V2、当前 V1/V2 选中情况、prompt 数量、启用顺序项数量和 fallback 边界。
  - 右侧“运行边界”升级为“运行诊断”，拆出 V1 兼容、V2 消息链、当前路径、运行时槽位说明。
  - 增强 V2 `prompt_order` 明细：
    - 增加“仅看启用”筛选。
    - 增加启用数、运行时槽位数、未匹配项统计。
    - 每条顺序项显示序号、名称、identifier、内容摘要、role/runtime/missing 和 on/off 状态。
    - 运行时槽位如 `worldInfo*`、`chatHistory`、`userInput` 会标记为 runtime。

### 不变项确认
- 未修改 sendWorkflow、tavernMessageChainBuilder、systemPromptBuilder。
- 未修改原生内置提示词正文。
- 未修改 `builtin_main_plot_cot` / `builtin_response_format`。
- 未修改 V1/V2 预设的数据结构和发送逻辑。
- 内置 V2 仍只读，玩家导入 V2 仍可编辑。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。
- `node scripts/tavern-message-chain-regression.mjs` 通过。
- `node scripts/settings-save-regression.mjs` 通过。
- `node scripts/builtin-presets-v2-regression.mjs` 通过。
- `node scripts/st-v2-send-workflow-guard-regression.mjs` 通过。

## 刚完成：提示词模块 / 酒馆预设拆分后的严重问题检查（2026-07-03）

### 检查结论
本轮进入检查环节，重点检查“提示词模块只保留原生内置底座”“酒馆预设承载 ST/Tavern 导入与消息链”“未发布二创预设不再作为正式内置入口”这三条红线。当前未发现会影响现有功能、内置预设正文、输出格式协议、变量/天气/行动选项协议或独立系统拼接的严重问题。

### 已确认
- `SettingsModal.tsx` 已拆成两个入口：`提示词模块` 与 `酒馆预设`。
- `TavernPresetsSettingsTab.tsx` 只作为酒馆预设页薄包装，传入 `mode="tavern"`。
- `PromptModulesTab.tsx` 默认 `modules` 模式只展示原生模块：过滤 `st_import_*` 和 `adapted_*`，右侧编辑器也从原生模块池选中。
- `data/builtinPresets/index.ts` 当前只返回 `createBuiltinPresetEntry()`，不再注册《双人成行》或 Izumi/lzumi。
- ST V2 只有在总开关开启且选中有效 V2 预设时才尝试走消息链；失败会 fallback 到原生主流程。
- 源码 UI 中未再发现 `????` 或替换字符乱码；`AGENTS.md` 中仍有历史工作笔记乱码，但不参与应用运行。

### 验证
- `npx.cmd tsc --noEmit` 通过。
- `npm run build` 通过；仅有既有 Vite chunk 体积与动态/静态 import 警告。
- `node scripts/tavern-message-chain-regression.mjs` 通过。
- `node scripts/st-v2-send-workflow-guard-regression.mjs` 通过。
- `node scripts/settings-save-regression.mjs` 通过。
- `node scripts/st-preset-import-regression.mjs` 通过。
- `node scripts/st-preset-migration-regression.mjs` 通过。
- `node scripts/deepseek-format-stability-regression.mjs` 通过。
- `node scripts/main-injection-window-regression.mjs` 通过。
- `node scripts/prompt-context-regression.mjs` 通过。
- `node scripts/builtin-presets-v2-regression.mjs` 通过。
- `node scripts/st-v2-ui-edit-export-regression.mjs` 通过。

### 剩余非严重风险
- `PromptModulesTab.tsx` 里仍有部分历史注释提到“二创成品 / 双人成行 / adapted_*”，实际运行注册表已不加载二创成品；属于维护噪音，不是运行风险。
- `data/builtinPresets/izumi.json`、`data/builtinPresets/shuangrenchenghang.json` 和相关生成脚本仍留在仓库资料区，当前不参与正式注册；后续可单独做归档或删除。
- `AGENTS.md` 旧笔记有乱码，影响阅读但不影响应用。若要清理，建议单独整理工作笔记，避免在本次功能检查中大范围重写历史记录。

## 刚完成：提示词模块页乱码与预设过滤修复（2026-07-03）

### 背景
拆分“提示词模块 / 酒馆预设”后，牢凌反馈提示词模块页仍有问题：该页应该只保留原生内置底座，但页面中出现了 `????` 乱码，并且可能继续显示酒馆导入/二创预设模块。

### 修正
- `components/features/Settings/PromptModulesTab.tsx`
  - 新增 `isNativePromptModule` 过滤：提示词模块页排除 `st_import_*` 和 `adapted_*`。
  - `visibleModules` 改为基于 `nativeSorted`，因此提示词模块页只显示原生提示词模块体系。
  - `selected` 在 `modules` 模式下也从 `nativeSorted` 中选择，避免右侧编辑器选中 ST/二创模块。
  - 修复模块页 UI 文案乱码：
    - `???` → `主剧情`
    - `????` → `独立系统` / `模块列表` / `模块编辑`
    - `?` → `条`
    - `??????` → `重置内置模块`
    - `+ ???????` → `+ 新增自定义模块`
    - 乱码 confirm 文案恢复为中文提示。

### 不变项确认
- 酒馆预设页仍保留 ST 导入、V1 兼容、V2 消息链、V2 编辑/导出。
- 原生内置提示词正文未改。
- `builtin_main_plot_cot` / `builtin_response_format` 未改。
- 独立系统拼接逻辑未改。

### 验证
- `npx.cmd tsc --noEmit` ✅
- `node scripts/prompt-context-regression.mjs` ✅
- `node scripts/builtin-presets-v2-regression.mjs` ✅
- `node scripts/st-v2-ui-edit-export-regression.mjs` ✅

## 刚完成：提示词模块 / 酒馆预设拆页 + 未发布二创预设移除（2026-07-03）

### 背景
牢凌确认原生内置底座不能动；需要处理的是未正式发布的《双人成行》和 Izumi/lzumi 二创预设。同时提示词设置需要拆得更清楚：原生提示词模块和 SillyTavern / Tavern 预设不要继续混在同一个设置页。

### 改动
- 新增设计文档：`docs/superpowers/specs/2026-07-03-prompt-module-tavern-settings-split-design.md`。
- `components/features/Settings/PromptModulesTab.tsx`
  - 增加 `mode: 'modules' | 'tavern'`。
  - 默认 `modules` 模式只显示原生提示词模块管理：主剧情/独立系统、模块列表、模块编辑、新增自定义模块、重置内置模块。
  - `tavern` 模式集中显示 ST/Tavern 功能：ST 总开关、ST 导入、V1 兼容预设、V2 消息链、角色卡描述、post-process、prompt_order、V2 导出/编辑。
  - 从提示词模块页移除 ST 导入、V1/V2 预设切换、酒馆总开关。
- 新增 `components/features/Settings/TavernPresetsSettingsTab.tsx`，作为酒馆预设独立设置页入口。
- `components/features/Settings/SettingsModal.tsx`
  - 新增侧栏 tab：`酒馆预设`。
  - `提示词模块` 和 `酒馆预设` 都使用全高内容布局。
- `data/builtinPresets/index.ts`
  - 从内置预设注册表移除《双人成行》和 Izumi/lzumi。
  - 保留原生内置预设。
  - 对应地不再生成二创内置 V2 副本。
- `scripts/builtin-presets-v2-regression.mjs`
  - 从旧预期“必须生成双人成行/Izumi V2 副本”改为新预期“内置注册表只保留原生预设，二创预设不再注册”。

### 不变项确认
- 没有修改原生内置提示词正文。
- 没有修改 `builtin_main_plot_cot`。
- 没有修改 `builtin_response_format`。
- 没有修改变量协议、行动选项协议、天气协议、世界状态协议。
- 没有修改独立系统提示词拼接逻辑。
- V2 仍不是默认启用；选中有效 V2 且 ST 总开关开启时才尝试走 V2，失败仍 fallback 到旧主流程。
- 《双人成行》和 Izumi/lzumi 文件可继续作为仓库资料存在，但不再作为正式内置预设入口出现。

### 验证
- `npx.cmd tsc --noEmit` ✅
- `npm run build` ✅（仅 Vite 既有 chunk/dynamic import 警告）
- `node scripts/st-v2-ui-edit-export-regression.mjs` ✅
- `node scripts/builtin-presets-v2-regression.mjs` ✅
- `node scripts/tavern-message-chain-regression.mjs` ✅
- `node scripts/st-v2-send-workflow-guard-regression.mjs` ✅
- `node scripts/st-preset-import-regression.mjs` ✅
- `node scripts/st-preset-migration-regression.mjs` ✅
- `node scripts/settings-save-regression.mjs` ✅
- `node scripts/prompt-context-regression.mjs` ✅
- `node scripts/deepseek-format-stability-regression.mjs` ✅
- `node scripts/main-injection-window-regression.mjs` ✅

## ????ST V2 UI ??/???????????2026-07-03?

### ??
??? ST V2 ??????????????????? V2 ?????????????????????V2 ????????????

### ????
- ?? `hooks/useGame/tavernFormatGuard.ts`????? COT/format ???????????????
- `hooks/useGame/tavernMessageChainBuilder.ts`??? `tavernFormatGuard` ???????
- `components/features/Settings/PromptModulesTab.tsx`?V2 ?????????????????????prompt name/role/content ???
- V2 ???????????????? `stPresetsV2` ????????????
- ?? `scripts/st-v2-ui-edit-export-regression.mjs`??????? V2 ????????????????????
- ?? `scripts/tavern-message-chain-regression.mjs` ? `scripts/builtin-presets-v2-regression.mjs` ?????????? `tavernFormatGuard.ts`?

### ?????
- ?? `currentStPresetIdV2: null` ???
- V1 ????/??/???????
- ?? CoT?????????? promptModules ???? V2 ???
- ????????? prompt ???

### ??
- `npx.cmd tsc --noEmit` ?
- `npm run build` ??? Vite ?? chunk/dynamic import ???
- `node scripts\st-v2-ui-edit-export-regression.mjs` ?
- `node scripts\tavern-message-chain-regression.mjs` ?
- `node scripts\builtin-presets-v2-regression.mjs` ?
- `node scripts\st-v2-send-workflow-guard-regression.mjs` ?
- `node scripts\st-preset-import-regression.mjs` ?
- `node scripts\st-preset-migration-regression.mjs` ?
- `node scripts\settings-save-regression.mjs` ?
- `node scripts\prompt-context-regression.mjs` ?
- `node scripts\deepseek-format-stability-regression.mjs` ?
- `node scripts\main-injection-window-regression.mjs` ?
- `node scripts\opening-preset-regression.mjs` ?
- `node scripts\reroll-regression.mjs` ?
- `node scripts\action-options-cleanup-regression.mjs` ?
- `node scripts\phone-main-continuity-regression.mjs` ?
- `node scripts\story-weaving-regression.mjs` ?
- `node scripts\zhiku-character-rebuild-regression.mjs` ?
- `node scripts\inventory-variable-regression.mjs` ?

## 刚完成：ST 预设消息链 V2 旁路计划收尾修复 + 全项目关键检查（2026-07-03）

### 背景
牢凌要求继续执行 `2026-07-02-st-preset-message-chain-refactor-design.md`，但先把上一边未完成导致的错误内容去掉/修好，再按计划做全项目检查。核心红线：不能影响现有功能、内置预设、内置 CoT、内置输出格式、变量/天气/行动选项协议和独立系统。

### 已确认落地
- `models/stTypes.ts`：修复 `STPresetEntry` 重复声明，补齐 V2 类型和 `TavernPostProcessMode`。
- `models/settings.ts`：保留 V1 字段；新增 `stPresetsV2/currentStPresetIdV2/currentStCharacterId/stPostProcessMode/stCharCardDescription`；默认 `currentStPresetIdV2: null`，不自动启用 V2。
- `utils/stSettingsNormalizer.ts`：只做 V2 规范化和当前预设派生，不再落盘 `currentStPreset` 缓存。
- `utils/stPresetParser.ts`：新增 V2 解析，V1 导入逻辑保留。
- `hooks/useGame/tavernMessageChainBuilder.ts`：新增纯旁路 ST V2 消息链构建器，处理 prompt_order、worldInfo、历史、最新输入、`{{cot}}/{{format}}`、行动选项和 post-process。
- `hooks/useGame/sendWorkflow.ts`：仅在 `enableStPreset && currentStPresetIdV2` 且预设有效时尝试 V2；失败回退旧链路；默认旧链路不变。
- `components/features/Settings/PromptModulesTab.tsx`：保留 V1 预设导入和模块编辑，同时增加 V2 选择/角色/postprocess/角色卡描述/结构预览面板。
- `data/builtinPresets/index.ts`：新增内置预设 V2 副本生成，不改原 JSON 和旧内置模块。
- `utils/stPresetMigration.ts`：新增手动 V1→V2 迁移工具，不自动迁移、不删除 V1、不自动激活 V2。

### 本次额外修复
- `hooks/useGame/sendWorkflow.ts`：修复 DeepSeek `lock_format` 被 V1 预设 `assistantPrefill` 覆盖的问题；现在 DeepSeek 锁格式固定从 `<thinking>\n` 起续写，普通请求仍可用预设 prefill。
- `scripts/prompt-context-regression.mjs`：把独立模型开关断言从旧变量名检查改为当前语义检查。
- `scripts/deepseek-format-stability-regression.mjs`：更新断言以覆盖 DeepSeek 锁格式优先级。
- `scripts/story-weaving-regression.mjs`：补齐测试沙盒中的 `data/weatherRules.mjs` stub。

### 不变项确认
- 旧 V1 ST 预设导入、切换、删除、冲突识别仍保留。
- 不自动迁移 V1，不删除 V1 数据，不自动选择 V2。
- `currentStPresetIdV2` 默认 `null`，所以默认仍走旧 `systemPromptBuilder/sendWorkflow` 路径。
- 内置 promptModules、内置 CoT、内置输出格式和世界书内容没有被 V2 替换。
- 独立系统（新闻、手机、智库、忆庭、变量、剧情编织）仍走各自服务层 prompt 构建。

### 验证
- `npx.cmd tsc --noEmit` ✅
- `npm run build` ✅（仅 Vite 既有 chunk/dynamic import 警告）
- `node scripts\st-preset-import-regression.mjs` ✅ 13/13
- `node scripts\tavern-message-chain-regression.mjs` ✅
- `node scripts\st-v2-send-workflow-guard-regression.mjs` ✅
- `node scripts\builtin-presets-v2-regression.mjs` ✅
- `node scripts\st-preset-migration-regression.mjs` ✅
- `node scripts\settings-save-regression.mjs` ✅
- `node scripts\prompt-context-regression.mjs` ✅
- `node scripts\deepseek-format-stability-regression.mjs` ✅
- `node scripts\main-injection-window-regression.mjs` ✅
- `node scripts\opening-preset-regression.mjs` ✅
- `node scripts\reroll-regression.mjs` ✅
- `node scripts\action-options-cleanup-regression.mjs` ✅
- `node scripts\phone-main-continuity-regression.mjs` ✅
- `node scripts\story-weaving-regression.mjs` ✅
- `node scripts\zhiku-character-rebuild-regression.mjs` ✅
- `node scripts\inventory-variable-regression.mjs` ✅

### 注意
- 曾误跑 `node scripts\variableFacts.ts`，该文件不存在，属于命令选择错误，不是项目失败。
- 工作区仍有大量此前已有未提交/未跟踪文件，本次没有回退无关改动。


## 刚完成：天气特效降级为低干扰空气层（2026-07-02）

### 背景
牢凌反馈第二版小雨虽然能看见，但观感诡异、很丑且影响体验。判断原因：把天气层提到 UI 前景后，雨线/粒子从“氛围”变成了“贴在界面上的干扰物”。

### 修正方向
从 A+B 改为 **B+A-mini**：
- 以背景色调和顶部冷色气氛为主；
- 边缘特效只保留极低存在感；
- 不再追求明显雨线；
- 不让天气层盖在文字和按钮上。

### 改动
`styles/global.css`
- `.kaituo-weather-atmosphere` 从 `z-index: 20` 降到 `z-index: 8`，低于主 UI 内容层 `z-10`。
- `.kaituo-weather-top` 降低透明度、增加 blur、放慢动画。
- `.kaituo-weather-edge` 宽度从 `30vw/320px` 降到 `14vw/150px`，透明度从 `0.86` 降到 `0.18`。
- `.kaituo-weather-motes` 中央安全区扩大到 58% 起，整体透明度降到 `0.12`。
- 小雨 `light_rain` 不再使用明显斜向雨线，改为低透明冷蓝灰边缘/顶部湿润感。
- 小雨的第二层雨线 `motes-b` 关闭。
- 移动端整体透明度继续压低，边缘宽度降到 `12vw`。

### 保留
`WeatherAtmosphere.tsx`
- 保留中文天气名兼容：`小雨` 仍会归一化为 `light_rain`。

### 验证
- `npx.cmd tsc --noEmit` ❌ 当前被非天气文件阻断：
  - `hooks/useGame/tavernMessageChainBuilder.ts` 多处类型/import 错误
  - `models/settings.ts`: `TavernPostProcessMode` 未定义
  - `models/stTypes.ts`: `STPresetEntry` 重复声明
- 这些错误不在本次天气特效降级改动文件内。

### 下一步
- 牢凌刷新 `http://127.0.0.1:5173/` 后观察小雨。
- 如果仍然丑，建议直接进入“B-only”：删掉边缘粒子/雨线层，只保留顶部状态栏和背景色调联动。

---

## 刚完成：小雨天气特效不可见修正（2026-07-02）

### 背景
牢凌反馈当前天气是小雨，但界面没有看到天气特效。复查后判断第一版问题主要有两点：
1. 天气层 `z-index: 0`，被聊天/侧栏/topbar 的高不透明 surface 盖在下面。
2. 如果 `世界.当前天气` 存的是中文名「小雨」而不是 ID `light_rain`，`WeatherAtmosphere` 会识别失败并兜底成 `clear`。

### 修正
1. `components/layout/WeatherAtmosphere.tsx`
   - 新增 `WEATHER_NAME_TO_ID`。
   - `normalizeWeatherId` 同时支持天气 ID 和中文天气名。
   - `小雨` 会正确归一化为 `light_rain`。

2. `styles/global.css`
   - `.kaituo-weather-atmosphere` 从 `z-index: 0` 提到 `z-index: 20`，成为真正的前景氛围层。
   - 保持 `pointer-events: none`，不影响点击。
   - 扩大中央阅读安全区 mask，避免雨线穿正文。
   - 提高小雨透明度和边缘雨线强度，并给小雨增加轻微斜向雨线层。
   - 移动端边缘宽度从 `18vw` 提到 `24vw`，避免太弱。

### 验证
- `npx.cmd tsc --noEmit` ❌ 当前被非天气文件阻断：
  - `models/settings.ts(277,23): Cannot find name 'TavernPostProcessMode'`
  - `models/stTypes.ts`: `STPresetEntry` 重复声明
- 这些报错不在本次天气特效改动文件内，暂未处理。

### 下一步
- 牢凌刷新 `http://127.0.0.1:5173/` 后再看小雨。
- 如果仍然太淡，继续提高 `light_rain` 的 `--weather-edge` 或把边缘宽度提高到 `34vw`。

---

## 刚完成：天气特效 A+B 试验版（边缘氛围层 + 背景色调联动）（2026-07-02）

### 背景
牢凌反馈之前天气特效失败点主要是「观感廉价」和「阅读干扰」。本次按确认方向先做 A+B 试验版：不做满屏大粒子，改为边缘/顶部氛围 + 背景色调联动，中央正文保持干净。

### 改动文件
1. `components/layout/WeatherAtmosphere.tsx`（新建）
   - 纯展示组件，只读取 `weatherId`。
   - 根据 `data/weatherRules.ts` 的天气 ID 校验，未知天气兜底为 `clear`。
   - 渲染 wash/top/edge/motes 多层 span，全部 `aria-hidden`。

2. `components/layout/GameView.tsx`
   - 新增 `weatherId?: string | null` prop。
   - 在 `kaituo-app-shell` 内挂载 `<WeatherAtmosphere weatherId={weatherId} />`。
   - topbar 和主内容包到 `relative z-10` 层，保证天气层不挡 UI。

3. `App.tsx`
   - `GameView` 传入 `weatherId={state.世界.当前天气}`。

4. `styles/global.css`
   - 新增 `.kaituo-weather-atmosphere` 及 14 类天气视觉规则。
   - 天气表现原则：
     - 中央阅读区用 mask 留白；
     - 雨/雪/风主要走左右边缘；
     - 极光/阴云主要走顶部；
     - 星尘暴、数据风暴、星海潮汐用低透明科幻纹理；
     - `pointer-events: none`，不影响点击；
     - 移动端降低透明度；
     - `prefers-reduced-motion: reduce` 下禁用动画。

### 验证
- `npx.cmd tsc --noEmit` ✅ exit 0（跑了两次）

### 注意
- 本次只做视觉试验层，不改天气判断、天气写入、变量事实协议。
- `App.tsx` 和 `styles/global.css` 中存在牢凌此前未提交改动，本次只在其上追加天气特效相关内容，没有回退。
- 下一步建议实机看 3 个天气：`light_rain`、`blizzard`、`star_dust_storm`，重点检查正文阅读和移动端强度。

---

## 刚完成：天气系统承接小修（2026-07-02）

### 背景
牢凌刚新增天气系统后，秋接手做了一轮链路盘点：天气规则数据已接入主剧情 prompt、变量模型、世界状态和顶部状态栏。`npx.cmd tsc --noEmit` 初检通过。

### 本次修正
1. `data/weatherRules.ts`
   - `构建天气Prompt片段` 中的“上一回合天气”从内部 ID（如 `clear`）改为中文天气名（如 `晴`）。
   - 仍保留兜底：如果遇到未知 ID，就原样显示，避免阻断 prompt 构建。

2. `utils/textSanitizer.ts`
   - 新增 `stripInternalProtocolTags(text)`。
   - 在 `sanitizeContaminatedText` 开头统一剥掉 `<天气>...</天气>`，避免天气协议标签落到玩家可见正文、记忆、行动选项等展示字段。

### 验证
- `npx.cmd tsc --noEmit` ✅ exit 0

### 注意
- 本次只修天气协议展示层，不改天气判断规则、不改天气白名单、不改天气写入世界状态的逻辑。
- `utils/textSanitizer.ts` 中 ST 标签块隐藏相关 diff 是此前未提交改动，本次没有回退或重写。

---

## 刚完成：ST 预设 CoT/格式冲突自动识别 + 自动禁用（2026-06-29）

### 背景
ST 预设导入功能已可用，但存在冲突问题：大多数 ST 预设自带思维链和输出格式条目，与我们的内置 `builtin_main_plot_cot` 和 `builtin_response_format` 冲突。由于内置模块在 Tier 3（order 1000+），会压制 ST 预设的 CoT/格式（Tier 2，order 100-999），导致 ST 预设特色丢失。

### 方案选择（用户确认）
**自动识别 + 自动禁用（推荐）**：导入时自动识别 ST 模块的 CoT/格式，自动禁用对应的内置冲突模块 + alert 文案提示，玩家无需操作，识别错了能在设置手动调。

### 识别策略（保守识别，漏/误识别都不崩）
- **CoT 识别**：name 含「思维链/COT/cot/思考模式/思考过程/reasoning」**或** content 含 `<thinking>/<cot>/<think>` 标签
- **格式识别**：name 含「格式/输出格式/回复格式/output format」**或** content 含「输出格式/回复格式/action_options」
- **漏识别**：内置保留，ST CoT 被 order 压制，仅 ST 特色丢失，不崩
- **误识别**：内置被禁用，但 ST 其实没 CoT，输出略差，可手动开回，不崩

### 改动文件（2 个）

#### 1. `utils/stPresetParser.ts`（Step 1）
L27-70 新增：
- `BUILTIN_MAIN_COT_ID = 'builtin_main_plot_cot'` 常量
- `BUILTIN_RESPONSE_FORMAT_ID = 'builtin_response_format'` 常量
- `detectSTCoTModules(modules): string[]` 函数 — CoT 识别
- `detectSTFormatModules(modules): string[]` 函数 — 格式识别

#### 2. `components/features/Settings/PromptModulesTab.tsx`（Step 2-3）

**a. import 扩展（L11-18）**
```typescript
import {
  parseSTPresetWithDetection,
  isSTImportedModule,
  detectSTCoTModules,
  detectSTFormatModules,
  BUILTIN_MAIN_COT_ID,
  BUILTIN_RESPONSE_FORMAT_ID,
} from '@/utils/stPresetParser';
```

**b. 新增 `handleSTCoTFormatConflict` 辅助函数（L323-354，importSTPreset 之前）**
- 入参：incomingStModules（ST 模块）+ preserved（去 ST 后的现有模块）
- 出参：`{ adjusted, conflictNote }`
- 识别到 CoT → 把 preserved 中 `builtin_main_plot_cot` 的 enabled 设为 false
- 识别到格式 → 把 preserved 中 `builtin_response_format` 的 enabled 设为 false
- 生成冲突提示文案：`检测到预设含思维链 / 输出格式，已自动切换为预设版本（如输出异常，可在「提示词设置」中重新启用内置模块）`

**c. `importSTPreset` 改造（L400-404）**
- `preserved` 后调用 `handleSTCoTFormatConflict(newModules, preserved)`
- `activated = [...conflictAdjusted, ...newModules]`
- alert msg 追加 `conflictNote`
- console.info 加 `conflictNote` 字段

**d. `switchPreset` 改造（L435-460）**
- 切到 null（清空预设）：恢复 `builtin_main_plot_cot` / `builtin_response_format` 到 enabled=true（玩家清空预设大概率想回到原生体验）
- 切到非空预设：调用 `handleSTCoTFormatConflict(target.modules, preserved)` 做识别 + 自动禁用
- 注释说明：玩家手动禁用的也会在切 null 时被恢复，可再次手动关闭（可接受代价）

**e. `deletePreset` 改造（L478-498）**
- 删除当前激活预设时（语义等同切 null）：同样恢复内置 CoT/格式到启用状态

### 关键设计决策
1. **保守识别策略**：name + content 双重判断，满足任一即识别。不用过泛的关键词（如单用 "format"），避免误伤
2. **冲突只影响 2 个内置模块**：`builtin_main_plot_cot` 和 `builtin_response_format`，其他内置模块（思维链语言、复合情感协议等）不参与冲突识别
3. **切 null 恢复内置**：玩家清空预设的语义是"回到原生体验"，此时应恢复内置 CoT/格式。代价是玩家手动禁用的也会被恢复，但这是低概率场景，可再次手动关闭
4. **alert 文案透明**：明确告知"已自动切换为预设版本"+ "如输出异常可在设置手动启用"，玩家知道发生了什么 + 兜底方式
5. **不破坏现有 systemPromptBuilder**：本次改动只在 UI 层（importSTPreset/switchPreset/deletePreset），不动 systemPrompt 拼接逻辑

### 验证
- `npx.cmd tsc --noEmit` ✅ exit 0，零错误
- `node scripts/st-preset-import-regression.mjs` ✅ 13/13 全部通过

### 不变项确认
- `utils/stPresetParser.ts` 的 parseSTPreset / parseSTPresetWithDetection / mergeSTImportedModules 等核心解析逻辑不动
- `systemPromptBuilder.ts` 不动（冲突识别只影响 UI 层的模块 enabled 状态，拼接逻辑照常工作）
- 文风互斥逻辑、ST 导入检测、身份标签、滑块开关、拖拽排序全部不动
- 旧导入兼容（useEffect 自动归档 st_import_* 为预设）不动

### 下一步
- 牢凌手动测试：导入含 CoT/格式的 ST 预设，验证自动禁用 + alert 提示
- 若识别准确率不达预期，可调识别关键词或加 source 字段标记

---

## 刚完成：提示词模块 UI 拖拽排序功能实现（2026-06-28）

### 背景
ST 预设 7 Phase 路线图之外，牢凌要求先实现提示词模块的 UI 拖拽排序功能，让玩家可以调整主剧情"可修改"层模块的 order 顺序。项目已装 @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities。

### 改动文件
唯一改动：`components/features/Settings/PromptModulesTab.tsx`

### 改动清单（6 步）

#### 1. 顶部 import 新增 dnd-kit
```typescript
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
```

#### 2. 新增 SortableModuleItem 包装组件（在 ModuleItem 函数前）
- **关键设计**：按任务建议，listeners 只绑到内部"拖拽手柄" span（图标 `⠿`），不绑到外层 div，避免吃掉 ModuleItem 内部的 onSelect 点击 / onToggle 滑块开关事件
- attributes 仍绑到外层 div（提供 a11y/role 语义）
- 拖拽中：opacity 0.5 + zIndex 50
- 外层 div 用 `flex items-stretch`，手柄 span 宽 16px 居中竖排，内部 div `flex-1 min-w-0` 包裹 ModuleItem
- 手柄颜色 `rgba(var(--tj-accent-primary), 0.45)`，cursor: grab → active: grabbing

#### 3. 改造 ModifyLayer 组件
- props 新增 `onReorder?: (reorderedModules: 提示词模块[]) => void`
- 新增 `handleDragEnd(event: DragEndEvent)`：arrayMove 后按 STEP=10 重算 order（10/20/30...），更新 updatedAt
- 渲染分支：
  - `!collapsed && onReorder` → DndContext + SortableContext + SortableModuleItem
  - `!collapsed && !onReorder` → 原始 modules.map → ModuleItem
  - `collapsed` → null
- 标题右侧追加"· 可拖拽"提示（仅 onReorder 传入时显示）

#### 4. 改造 ModuleList 组件
- props 新增 `onReorder?`，透传给"可修改"层 ModifyLayer
- "不可修改"层 ModifyLayer **不传** onReorder（内置只读，不允许拖拽改序）
- 独立系统页面（showModifyLayer=false）走 SystemGroupSection，不涉及 onReorder

#### 5. 主组件新增 reorderModules 函数（patch 函数后）
```typescript
const reorderModules = (reordered: 提示词模块[]) => {
  const next = modules.map((m) => {
    const updated = reordered.find((r) => r.id === m.id);
    return updated && updated.order !== m.order ? updated : m;
  });
  update(next);
};
```
- 只更新 order 变化的条目，避免不必要重渲染
- 不改 scope/category/role/enabled，只改 order + updatedAt

#### 6. 主组件传 onReorder 给 ModuleList
`<ModuleList>` 调用追加 `onReorder={reorderModules}`

### 验证
- `npx.cmd tsc --noEmit` ✅ exit 0，零错误

### 关键设计决策
1. **listeners 绑手柄不绑整项**：避免吃掉 ModuleItem 内部按钮的 onClick（onSelect）和滑块 span 的 onClick（onToggle）。任务说明里明确指出"如果 listeners 绑到整个 div，onClick 会被吃掉"，因此采用手柄方案
2. **手柄是 span 不是 button**：因为 ModuleItem 本身是 `<button>` 元素，HTML 规范不允许 button 嵌套 button，所以手柄用 span + role/aria-label
3. **order 间距 10**：拖拽后重算为 10/20/30...，避免长期使用后 order 值混乱
4. **只更新变化的条目**：reorderModules 用 `updated.order !== m.order` 过滤，order 未变的条目保持原对象引用，减少 React 重渲染
5. **拖拽范围限定**：只在主剧情页面 + "可修改"层生效；不可修改层（内置只读）和独立系统页面都不支持拖拽

### 不变项确认
- ModuleItem 组件本身完全未动（只负责展示，不关心拖拽）
- 文风互斥逻辑、ST 导入检测、身份标签、滑块开关、EditorPanel 编辑器全部不动
- 主剧情 / 独立系统切换、新增/删除/重置模块逻辑全部不动

---

## 刚完成：ST 预设兼容细化分步计划 + 全项目扫描补全（2026-06-28）

### 背景
变量系统归一化（6个独立系统全部完成）后，进入 ST 预设架构兼容阶段。先写了全项目修改对照表文档，再做完整项目扫描补全遗漏文件，最后细化 7 Phase 分步执行计划。

### 产出的文档
1. `docs/2026-06-28-st-preset-architecture-compatibility-matrix.md` — 全项目修改对照表（26源码+27脚本扫描报告）
2. `docs/2026-06-28-st-preset-implementation-phases.md` — 细化分步执行计划（7 Phase）

### 7 Phase 路线图
```
Phase 1 ── 数据模型扩展（零行为变化）        ← 安全基座
Phase 2 ── trigger 过滤（最轻量的行为激活）
Phase 3 ── role 角色分流（核心改造）           ← 最大改造点
Phase 4 ── In-Chat Depth 注入                 ← Claude 暂不支持
Phase 5 ── 宏引擎（setvar/getvar/if）
Phase 6 ── ST 预设导入功能                     ← 依赖 Phase 1-5
Phase 7 ── 世界书/正则 接口预留（暂不实现）
```

### 已确认决策
1. Phase 2 和 3 不合并（分开更安全）
2. Claude 不走 depth（方案 D，后续按需升级）
3. 宏引擎 P0/P1 一起做
4. Phase 6 等 Phase 1-5 全做完
5. 7 个 build 函数 Phase 3 时抽取共用工具
6. replaceable 现有模块先默认 builtin/builtin_toggleable

### 核心原则
- **现有内容不动**：35 条内置模块 + 世界书原封不动保留，等 ST 框架做完后再规划迁移
- **世界书/正则暂不做**：只做数据结构预留 + UI 入口占位
- **每步可验证可回退**

### 兼容完成后与 ST 对比
- 提示词预设核心能力完全一致（content/role/position/depth/order/trigger/宏/导入）
- 我们更强的点：replaceable 4值、source 分类、scope/category 分组
- 暂不做的：世界书导入、正则导入、UI 拖拽排序

### 全项目扫描补全的遗漏项
- NsfwSettingsTab.tsx（有独立的 setModuleEnabled 重复定义）
- variableWorldbook.ts（模块拼接数据流）
- 14 个回归脚本（上次只列 13 个，实际 27 个）

### 下一步
- 牢凌审核分步计划后，从 Phase 1 开始执行


## 以下为工作笔记 ##

## 刚完成：变量系统归一化执行（独立系统样板第六例·终例）（2026-06-28）

### 背景
新闻（第一例）、智库（第二例）、忆庭（第三例）、手机（第四例）、剧情编织（第五例）归一化完成后，做变量系统归一化——最后一个独立系统，也是硬编码量最大的系统。

### 关键决策
- 输出格式全部提取：约135行静态硬编码（输出协议+事实类型+旧命令+thinking规范+严格约束）→ variableOutputFormat.ts
- NSFW条件段（3处）留在 buildVariableModelPrompt 函数体内动态拼接，不进模块系统（开关控制不变）
- 3本世界书死代码全部删除：variableSystemBook + companionArchiveBook + nsfwArchiveBook
- 伙伴档案独立分组：builtin_companion_archive_worldbook (order=55, scope=[calibration])
- NSFW_ARCHIVE_SEPARATION_RULE 条件追加：buildVariablePromptModulesSection 中 nsfwEnabled 时追加世界书末尾
- 方案B 单数据源
- callVariableModel 通过 VariableModelRequest 对象传 promptModules
- 16条回归断言需改双检查（variableModel.includes || variableOutputFormat.includes）

### 归一化后变量模型 systemPrompt 结构
```
[模块拼接]  变量世界书(50) → 伙伴档案(55) → CoT(56) → 输出格式(66)
[函数体内]  NSFW档案类型(条件) + NSFW开关(条件) + NSFW基线补建(条件) + 登记表(动态)
```

### 改动清单

#### 1. prompts/cot/variableOutputFormat.ts（新建）
- 导出 VARIABLE_OUTPUT_FORMAT_PROMPT 常量（~135行：输出协议+事实类型6种+旧命令格式+thinking规范+严格约束）

#### 2. data/builtinPromptModules.ts（新增4模块 + 修正1模块）
- import 追加 VARIABLE_OUTPUT_FORMAT_PROMPT + VARIABLE_SYSTEM_WORLDBOOK_PROMPT + COMPANION_ARCHIVE_WORLDBOOK_CONTENT
- 修正 VARIABLE_COT_CONTENT：从模板字符串改为直接 VARIABLE_COT_PROMPT
- 新增4常量：VARIABLE_WORLDBOOK_CONTENT / VARIABLE_OUTPUT_FORMAT_CONTENT / COMPANION_ARCHIVE_CONTENT
- 新增 builtin_variable_worldbook 模块：category=cot, order=50, scope=[calibration]
- 新增 builtin_variable_output_format 模块：category=format, order=66, scope=[calibration]
- 新增 builtin_companion_archive_worldbook 模块：category=cot, order=55, scope=[calibration]
- builtin_variable_cot order 从 60 改为 56

#### 3. models/prompts.ts（白名单）
- BUILTIN_PROMPT_MODULE_IDS 加入3个ID

#### 4. services/ai/variableModel.ts（核心改造）
- import 重命名3个别名 + 新增 variableOutputFormat import + type 提示词模块
- VariableModelRequest 类型新增 promptModules?: 提示词模块[]
- buildVariableModelPrompt 新增第三参数 promptModules?, 走模块拼接 + legacy 回退
- 新增 export buildVariablePromptModulesSection 函数（含 nsfwEnabled 条件追加 NSFW_ARCHIVE_SEPARATION_RULE）
- callVariableModel 传 request.promptModules

#### 5. sendWorkflow.ts 调用点
- callVariableModel 调用追加 promptModules: state.gameSettings.promptModules

#### 6. contextSnapshot.ts
- buildVariableModelPrompt 调用追加第三参数 state.gameSettings.promptModules

#### 7. PromptModulesTab.tsx
- variable 分组追加 builtin_variable_worldbook + builtin_variable_output_format
- 新增 companionArchive 分组
- CALIBRATION_GROUP_ORDER 追加 'companionArchive'

#### 8. 死代码清理
- builtinWorldbookConfig.ts：删除3本世界书定义（~60行）+ 返回数组移除 + BUILTIN_BOOK_IDS 移除3个ID + 迁移注释
- 送删3个无引用 import

#### 9. 回归测试修复（9个脚本）
- inventory-variable: 循环数组加 variableOutputFormat
- story-weaving: 3条断言双检查 + stub
- phone-memory-seed: 1条断言双检查
- affinity-gender-neutral: 2条断言双检查
- equipment-retirement: 1条断言双检查
- traveler-profile-guard: 5条断言双检查
- npc-profile-ledger: 3条断言双检查
- npc-memory-continuity: 1条断言双检查
- deepseek-format-stability: 1条断言双检查
- nsfw-archive + nsfw-archive-completion: 0条改动（NSFW条件段留在函数体内）
- power-system-worldbook: 返回数组断言更新

#### 10. 验证
- tsc --noEmit ✅ 零错误
- 14个回归脚本：13通过，1已有问题（traveler-profile-guard L91 忆庭断言）
- 全局 grep ✅ variableSystemBook/companionArchiveBook/nsfwArchiveBook 0处残留

### 归一化后变量系统分组
```
⚙️ 变量系统 3 条
  ├── 变量系统世界书    (order 50, cot)     [new]
  ├── 变量系统思维链    (order 56, cot)     [order从60→56]
  └── 变量系统输出格式  (order 66, format)  [new]

👥 伙伴档案 1 条
  └── 伙伴档案写作规范  (order 55, cot)     [new独立分组]
```

### 全6个独立系统归一化完成
```
📰 新闻系统     3 条  ✅
📱 手机系统     3 条  ✅
🧠 智库系统     2 条  ✅
🌀 忆庭系统     2 条  ✅
📖 剧情编织系统 3 条  ✅
⚙️ 变量系统     3 条  ✅
👥 伙伴档案     1 条  ✅
```

---

## 刚完成：剧情编织系统归一化执行（独立系统样板第五例）（2026-06-28）

### 背景
新闻（第一例）、智库（第二例）、忆庭（第三例）、手机（第四例）归一化完成后，做剧情编织系统归一化。

### 关键决策
- 归一化范围：仅分解路径（AI调用→结构化资产），注入路径不动（动态数据驱动，走主剧情 systemPrompt）
- 世界书提取：从 builtinWorldbookConfig.ts 行内拼接提取为 data/storyWeavingWorldbook.ts
- 输出格式：新建 prompts/cot/storyWeavingOutputFormat.ts（特别要求+JSON schema约35行）
- storyWeavingBook：死代码删除（与 phoneSystemBook/newsWeeklyBook/zhikuBook 同理）
- 方案B 单数据源
- decomposeStorySegment 用对象参数模式（与 generatePhoneReply 位置参数不同）

### 逐字对比验证（4处差异已确认可接受）
- D1: 模块顺序→世界书(50)→CoT(56)→输出格式(66)
- D2: 分隔标签遗失→模块自带 markdown 标题替代
- D3: CoT去掉外层标题→直接用 STORY_WEAVING_COT_PROMPT
- D4: 世界书模块增量→与CoT无功能重叠

### 改动清单

#### 1. data/storyWeavingWorldbook.ts（新建）
- 导出 STORY_WEAVING_WORLD_BOOK_PROMPT 常量（4段世界书内容）

#### 2. prompts/cot/storyWeavingOutputFormat.ts（新建）
- 导出 STORY_WEAVING_OUTPUT_FORMAT_PROMPT 常量（特别要求12条+JSON输出格式）

#### 3. data/builtinPromptModules.ts（新增2模块 + 修正1模块）
- import 追加 STORY_WEAVING_OUTPUT_FORMAT_PROMPT + STORY_WEAVING_WORLD_BOOK_PROMPT
- 修正 STORY_WEAVING_COT_CONTENT：从模板字符串改为直接 STORY_WEAVING_COT_PROMPT
- 新增 STORY_WEAVING_WORLDBOOK_CONTENT / STORY_WEAVING_OUTPUT_FORMAT_CONTENT
- 新增 builtin_story_weaving_worldbook 模块：category=cot, order=50, scope=[calibration]
- 新增 builtin_story_weaving_output_format 模块：category=format, order=66, scope=[calibration]
- builtin_story_weaving_cot order 从 59 改为 56

#### 4. models/prompts.ts（白名单）
- BUILTIN_PROMPT_MODULE_IDS 加入 builtin_story_weaving_worldbook + builtin_story_weaving_output_format

#### 5. services/storyWeaving.ts（核心改造）
- import 重命名：STORY_WEAVING_COT_PROMPT→SW_LEGACY_COT_PROMPT
- 新增 import STORY_WEAVING_OUTPUT_FORMAT_PROMPT as SW_LEGACY_OUTPUT_FORMAT_PROMPT
- 新增 import type 提示词模块
- decomposeStorySegment params 加 promptModules?: 提示词模块[]
- buildStoryWeavingSystemPrompt 新增参数 promptModules?, 走模块拼接 + legacy 回退
- 新增 export buildStoryWeavingPromptModulesSection 函数
- legacy 回退中 STORY_WEAVING_COT_PROMPT 改为 SW_LEGACY_COT_PROMPT

#### 6. PlotPanel.tsx 调用点
- 2处 decomposeStorySegment 调用追加 promptModules: gameSettings.promptModules

#### 7. PromptModulesTab.tsx
- storyWeaving 分组 match 追加 builtin_story_weaving_worldbook + builtin_story_weaving_output_format

#### 8. 死代码清理
- builtinWorldbookConfig.ts：删除 storyWeavingBook 定义（~29行）+ 返回数组移除 + BUILTIN_BOOK_IDS 移除 + 注释迁移说明

#### 9. 回归测试修复
- story-weaving-regression.mjs：新增2个 writeStub + 新增 storyWeavingOutputFormat 读取 + 3条断言改双检查
- power-system-worldbook-regression.mjs：L52 断言从 storyWeavingBook 改为 companionArchiveBook

#### 10. tsc + 回归验证
- tsc --noEmit ✅ 零错误
- story-weaving ✅ | power-system-worldbook ✅ | phone-memory-seed ✅
- deepseek-format-stability ✅ | story-weaving-ui ✅ | validate-story-weaving-canon ✅
- opening-preset ✅ | zhiku-character-rebuild ✅

#### 11. 全局 grep 检查 ✅
- STORY_WEAVING_WORLD_BOOK_PROMPT 3处 ✅ | STORY_WEAVING_OUTPUT_FORMAT_PROMPT 4处 ✅
- builtin_story_weaving_worldbook/output_format 均有白名单+match+模块定义 ✅
- storyWeavingBook 0处（完全清除）✅ | buildStoryWeavingPromptModulesSection 2处 ✅

### 归一化后剧情编织系统分组
```
📖 剧情编织系统 3 条
  ├── 剧情编织世界书    (order 50, cot)     [new]
  ├── 剧情编织思维链    (order 56, cot)     [order从59→56]
  └── 剧情编织输出格式  (order 66, format)  [new]
```

### 备注
- 注入路径（buildStoryWeavingInjection）未归一化——纯动态数据注入主剧情，不走独立AI调用
- contextSnapshot 不需要改——只有门禁预览和进度快照，不涉及分解模型 systemPrompt
- CoT与输出格式有1处内容重叠（"保持星穹铁道..."），改前就存在

---

## 刚完成：手机系统归一化执行（独立系统样板第四例）（2026-06-28）

### 背景
新闻（样板第一例）、智库（第二例）、忆庭（第三例）归一化完成后，按牢凌指示做手机系统归一化。

### 关键决策
- 写法要求+JSON格式：群聊/私聊动态分支合并为静态字符串 PHONE_OUTPUT_FORMAT_PROMPT
- 归属：新建 phoneOutputFormat.ts（用户确认）
- phoneSystemBook：死代码删除（与 newsWeeklyBook/zhikuBook 同理）
- buildPhoneMessages L201/L224：不改（user 消息层，非 system prompt）
- 方案B 单数据源

### 逐字对比验证（6处差异已确认可接受）
- D1: 模块顺序→修正为 世界书(50)→CoT(56)→输出格式(66)，与改前一致
- D2: 分隔标签遗失→接受（模块自带标题已足够，新闻/智库也无标签）
- D3: CoT 双重标题→修正 PHONE_COT_CONTENT 为直接用 PHONE_COT_PROMPT
- D4/D5: 写法要求/JSON格式变为全量→已确认（AI靠上下文区分，与世界书§5+§6、CoT Step3+Step4一致）
- D6: 通用约束加标题→接受

### 改动清单（10步完成）

#### 1. prompts/cot/phoneOutputFormat.ts（新建）
- 导出 PHONE_OUTPUT_FORMAT_PROMPT 常量（私聊/群聊写法要求 + 通用约束 + JSON输出格式）

#### 2. data/builtinPromptModules.ts（新增2模块 + 修正1模块）
- import 追加 PHONE_OUTPUT_FORMAT_PROMPT + PHONE_WORLD_BOOK_PROMPT
- 修正 PHONE_COT_CONTENT：从 \`# 手机系统思维链\n\n${PHONE_COT_PROMPT}\` 改为直接 PHONE_COT_PROMPT（消除双重标题）
- 新增 PHONE_WORLDBOOK_CONTENT = PHONE_WORLD_BOOK_PROMPT
- 新增 PHONE_OUTPUT_FORMAT_CONTENT = PHONE_OUTPUT_FORMAT_PROMPT
- 新增 builtin_phone_worldbook 模块：category=cot, order=50, scope=[calibration]
- 新增 builtin_phone_output_format 模块：category=format, order=66, scope=[calibration]
- builtin_phone_cot order 从 58 改为 56

#### 3. models/prompts.ts（白名单）
- BUILTIN_PROMPT_MODULE_IDS 加入 builtin_phone_worldbook + builtin_phone_output_format

#### 4. services/ai/phoneService.ts（核心改造）
- import 重命名：PHONE_COT_PROMPT→PHONE_LEGACY_COT_PROMPT, PHONE_WORLD_BOOK_PROMPT→PHONE_LEGACY_WORLD_BOOK_PROMPT
- 新增 import type 提示词模块
- generatePhoneReply 新增参数 promptModules?: 提示词模块[]
- buildPhoneSystemPrompt 新增参数 promptModules?, 走模块拼接 + legacy 回退
- 新增 export buildPhonePromptModulesSection 函数

#### 5. PhoneModal.tsx 调用点
- 2处 generatePhoneReply 调用追加 gameSettings.promptModules 参数

#### 6. PromptModulesTab.tsx
- phone 分组 match 追加 builtin_phone_worldbook + builtin_phone_output_format

#### 7. 死代码清理 + contextSnapshot
- builtinWorldbookConfig.ts：删除 phoneSystemBook 定义（~21行）+ 删除无引用 import + 返回数组移除 + 添加注释
- contextSnapshot.ts：import 追加 buildPhonePromptModulesSection, phone_system section 改为 buildPhonePromptModulesSection(...) || buildPhoneSystemPrompt(ctx)

#### 8. 回归测试修复
- phone-memory-seed-regression.mjs：新增 phoneOutputFormat 读取, L55-56 断言从 phoneService.includes 改为 phoneOutputFormat/phoneService 双检查
- power-system-worldbook-regression.mjs：L52 断言从 pathsBook, powerSystemOverviewBook, phoneSystemBook 改为 powerSystemOverviewBook, storyWeavingBook

#### 9. tsc + 回归验证
- tsc --noEmit ✅ 零错误
- phone-memory-seed ✅ | power-system-worldbook ✅ | phone-main-continuity ✅
- deepseek-format-stability ✅ | background-task-mode ✅ | npc-archive-enrichment ✅
- story-weaving ✅ | zhiku-character-rebuild ✅ | opening-preset ✅

#### 10. 全局 grep 检查 ✅
- PHONE_OUTPUT_FORMAT_PROMPT 3处 ✅ | PHONE_WORLD_BOOK_PROMPT 5处 ✅
- builtin_phone_worldbook/output_format 均有白名单+match+模块定义 ✅
- phoneSystemBook 0处（完全清除）✅ | buildPhonePromptModulesSection 4处 ✅

### 归一化后手机系统分组
```
📱 手机系统 3 条
  ├── 手机系统世界书    (order 50, cot)     [new]
  ├── 手机系统思维链    (order 56, cot)     [order从58→56]
  └── 手机系统输出格式  (order 66, format)  [new]
```

---

## 刚完成：智库系统归一化执行（独立系统样板第二例）（2026-06-27）

### 背景
新闻系统归一化（样板第一例）完成后，按牢凌指示做智库系统归一化。计划文件审核通过后执行，采用方案B（单数据源）修正新闻系统遗留的双份硬编码技术债。

### 改动清单（8步完成）

#### 1. prompts/cot/zhikuCot.ts（单数据源）
- 新增3个召回上限常量：CHARACTER_KEYWORD_RECALL_LIMIT=15 / AI_SUPPLEMENT_ENTRY_LIMIT=8 / NORMAL_KEYWORD_RECALL_LIMIT=5
- 新增 ZHIKU_OUTPUT_FORMAT_PROMPT 常量（约30行静态规则，剔除 sceneHints 动态行）
- 单数据源：zhikuRetrieval.ts(legacy) 和 builtinPromptModules.ts(模块化) 都从此 import

#### 2. data/builtinPromptModules.ts（新增模块）
- import 追加 ZHIKU_OUTPUT_FORMAT_PROMPT
- 新增 ZHIKU_OUTPUT_FORMAT_CONTENT 常量 = ZHIKU_OUTPUT_FORMAT_PROMPT
- 新增 builtin_zhiku_output_format 模块：category=format, order=67, scope=[calibration]

#### 3. models/prompts.ts（白名单）
- BUILTIN_PROMPT_MODULE_IDS 加入 'builtin_zhiku_output_format'

#### 4. services/zhikuRetrieval.ts（核心改造）
- import 重命名：ZHIKU_COT_PROMPT as ZHIKU_LEGACY_COT_PROMPT + 新增 ZHIKU_OUTPUT_FORMAT_PROMPT + 3个召回上限常量 import
- 删除3个本地常量定义（已迁至 zhikuCot.ts），保留 CHARACTER_ANCHOR_ENTRIES_PER_ROLE
- retrieveZhikuContextWithModel 新增第9个参数 promptModules
- 调用点改为 buildZhikuModelSystemPrompt(sceneHints, promptModules)
- 重写 buildZhikuModelSystemPrompt：传 promptModules 时走模块拼接，未传时走 legacy 回退
- 新增 buildZhikuPromptModulesSection：过滤 scope=calibration 且 enabled，按 order 排序拼接

#### 5. hooks/useGame/sendWorkflow.ts（调用点传参）
- L1876-1885 的 retrieveZhikuContextWithModel 调用追加第9个参数 state.gameSettings.promptModules

#### 6. components/features/Settings/PromptModulesTab.tsx（UI分组）
- zhiku match 函数加入 'builtin_zhiku_output_format'

#### 7. data/builtinWorldbookConfig.ts（死代码清理）
- 删除 BUILTIN_BOOK_IDS 中的 'builtin_zhiku'
- 删除 zhikuBook 常量定义（~20行，含 builtin_zhiku_guideline entry）
- 返回数组移除 zhikuBook
- 替换为迁移说明注释

#### 8. 回归测试断言修复
- scripts/power-system-worldbook-regression.mjs:52 — zhikuBook → phoneSystemBook
- scripts/zhiku-character-rebuild-regression.mjs — 约13条断言修复：
  - 调用签名：buildZhikuModelSystemPrompt(sceneHints) → (sceneHints, promptModules)
  - import 别名：ZHIKU_COT_PROMPT, → ZHIKU_LEGACY_COT_PROMPT,
  - 3个召回上限常量：retrieval → zhikuCot（已迁移）
  - 10条提示词文本片段：retrieval → zhikuCot（已迁移到 ZHIKU_OUTPUT_FORMAT_PROMPT）

### 验证结果
- npx.cmd tsc --noEmit 通过（exit 0）
- power-system-worldbook-regression.mjs 通过
- zhiku-character-rebuild-regression.mjs 通过

### 全局 grep 检查
- ZHIKU_OUTPUT_FORMAT_PROMPT 引用：11处，全部正常（源定义/import/模块定义/白名单/match/legacy回退/函数调用）
- retrieveZhikuContextWithModel / buildZhikuModelSystemPrompt 引用：13处，全部正常
- contextSnapshot.ts:1011 调用 buildZhikuModelSystemPrompt 不传 promptModules，走 legacy 回退（上下文快照预览，与新闻系统一致）
- zhikuBook / builtin_zhiku_guideline 死代码已清理，仅剩注释

### 不变项确认
- 智库 on/off 开关、maxRelatedEntries、retryCount、关键词召回逻辑、同步兜底检索、运行时解锁、主剧情职责描述均不动
- AI 收到内容逐字一致（legacy 回退路径和新管线路径输出内容一致，只换管线来源）
- sceneHints 动态行仍由函数运行时尾部追加（不模块化）

### 最终独立系统页面（智库系统分组）
```
📚 智库系统       2 条
  ├── 智库查缺补漏思维链      [内置] [滑块：开]  (order 60, cot)
  └── 智库输出与筛选规则      [内置] [滑块：开]  (order 67, format)
```

### 下一步
- 按同样模式处理其他独立系统：手机 → 变量 → 剧情编织
- 最后处理主剧情世界书归一化

## 刚完成：智库系统归一化计划（独立系统样板第二例）（2026-06-27）

### 背景
新闻系统归一化（样板第一例）完成后，全局检查无遗漏。按牢凌指示下一步做智库系统归一化。

### 调查发现
- 智库AI调用入口：`services/zhikuRetrieval.ts` 的 `retrieveZhikuContextWithModel`（新闻是 `services/ai/newsModel.ts`）
- 智库没有独立workflow文件（嵌在sendWorkflow.ts），新闻有独立 `newsWorkflow.ts`
- 智库已注册 `builtin_zhiku_cot` 模块但AI调用直接import源文件，未走promptModules管线（UI与行为不一致）
- 输出格式硬编码在 `zhikuRetrieval.ts:615-646` 约30行，完全未模块化
- `zhikuBook` 世界书是死代码（`builtin_zhiku_guideline` entry id无检索逻辑读取），与newsWeeklyBook一致

### 决策点确认
1. 输出格式硬规则→模块化（剔除sceneHints动态行）
2. zhikuBook→删除（死代码）
3. cot模块改造→修复UI与行为不一致
4. systemPromptBuilder同步兜底→不动

### 关键技术决策：方案B（单数据源修正新闻遗留技术债）
- 新闻系统遗留双份硬编码：`NEWS_LEGACY_OUTPUT_FORMAT`(newsModel.ts) vs `NEWS_OUTPUT_FORMAT_CONTENT`(builtinPromptModules.ts)，两份独立硬编码，将来改规则容易不一致
- 智库用方案B：新增 `ZHIKU_OUTPUT_FORMAT_PROMPT` 常量（在 `prompts/cot/zhikuCot.ts`），`zhikuRetrieval.ts`(legacy) 和 `builtinPromptModules.ts`(模块化) 都从此源import，保证两处不可能不一致

### 回归脚本挑战
- `zhiku-character-rebuild-regression.mjs` 断言了 `buildZhikuModelSystemPrompt` 函数体内多条硬编码文本（约10条）
- 方案B使函数体不再包含这些文本，需同步修复断言（8条需改，2条不用改）
- 避免方案A的双份硬编码技术债

### 计划文件
`docs/superpowers/specs/2026-06-27-zhiku-system-prompt-normalization-design.md`

### 改动清单（7+1）
1. prompts/cot/zhikuCot.ts 新增 `ZHIKU_OUTPUT_FORMAT_PROMPT` 常量
2. builtinPromptModules.ts 新增 `builtin_zhiku_output_format` 模块
3. models/prompts.ts 白名单
4. zhikuRetrieval.ts 核心改造（import+函数签名+模块拼接+legacy回退）
5. sendWorkflow.ts 调用点传promptModules
6. PromptModulesTab.tsx UI分组
7. builtinWorldbookConfig.ts 死代码清理（删zhikuBook）
8. zhiku-character-rebuild-regression.mjs 回归测试断言修复（约8条）

### 不变项
- 智库on/off开关、maxRelatedEntries、retryCount、关键词召回逻辑、同步兜底检索、运行时解锁、主剧情职责描述均不动

### 下一步
待牢凌审核计划文件后执行

## 刚完成：新闻系统归一化全局检查（2026-06-27）

### 背景
新闻系统归一化10步计划+2个bug修复完成后，牢凌要求全局检查有无遗漏。

### 检查项与结果

#### 1. NEWS_WORLD_BOOK_PROMPT 引用点（5处，全部正常）
- newsModel.ts:13 → legacy兼容别名import ✅
- builtinPromptModules.ts:6,554 → 新模块import+赋值 ✅
- newsWorldbook.ts:5 → 源定义保留（legacy路径在用）✅
- story-weaving-regression.mjs:162 → 回归测试stub ✅

#### 2. builtin_starrail_weekly_news（死代码已清理）
- 仅剩 builtinWorldbookConfig.ts:1434 一行注释说明"不再生成"，无代码引用 ✅

#### 3. newsWeeklyBook（已完全删除）
- 全项目搜索 0 匹配 ✅

#### 4. buildNewsModelPrompt 调用点（2处，全部走legacy回退，正常）
- contextSnapshot.ts:857 → 不传promptModules，走legacy回退（上下文快照预览，非真正调AI）✅
- story-weaving-regression.mjs:893 → 不传promptModules，走legacy回退（回归测试，断言检查剧情编织注入）✅

#### 5. 新增模块引用（7处，全部正常）
- builtin_news_worldbook: builtinPromptModules.ts:671定义 / prompts.ts:48白名单 / PromptModulesTab.tsx:16 match / newsWorldbook.ts:1废弃注释 / builtinWorldbookConfig.ts:1432迁移注释 ✅
- builtin_news_output_format: builtinPromptModules.ts:684定义 / prompts.ts:49白名单 / PromptModulesTab.tsx:16 match ✅

#### 6. buildNewsPromptModulesSection 函数（2处，正常）
- newsModel.ts:87 调用 / newsModel.ts:119 定义 ✅

### 结论
新闻系统归一化**无遗漏**，所有引用点均已正确处理。死代码清理干净，legacy兼容路径正常兜底。

### 下一步
按牢凌指示，接下来做**智库系统**归一化（同样是轻量系统），先讨论方向。

## 刚完成：新闻系统提示词归一化（独立系统样板第一例）（2026-06-27）

### 计划文件
`docs/superpowers/specs/2026-06-27-news-system-prompt-normalization-design.md`

### 改动概要
把新闻系统散落的世界书和输出格式硬编码归一到提示词模块系统。归一后 AI 收到的内容**逐字一致**，只是来源从 worldbook 管线换到 prompt 模块管线。

### 改动清单

#### 1. data/builtinPromptModules.ts（新增 2 个模块）
- 新增 import `NEWS_WORLD_BOOK_PROMPT`
- 新增 `NEWS_WORLDBOOK_CONTENT` 常量 = `NEWS_WORLD_BOOK_PROMPT`
- 新增 `NEWS_OUTPUT_FORMAT_CONTENT` 常量 = 原 newsModel.ts 的 JSON 格式硬编码段
- 新增模块 `builtin_news_worldbook`：category=custom, order=65, scope=[calibration]
- 新增模块 `builtin_news_output_format`：category=format, order=66, scope=[calibration]

#### 2. models/prompts.ts（白名单）
- `BUILTIN_PROMPT_MODULE_IDS` 加入 `builtin_news_worldbook` 和 `builtin_news_output_format`

#### 3. services/ai/newsModel.ts（核心改造）
- 移除 `import { NEWS_WORLD_BOOK_PROMPT }` 和 `import { NEWS_COT_PROMPT }`
- `NewsModelRequest` 接口加 `promptModules?: 提示词模块[]`
- `buildNewsModelPrompt` 改为调用 `buildNewsPromptModulesSection(request.promptModules)`
- 新增 `buildNewsPromptModulesSection(promptModules)`：从模块列表过滤 scope=calibration 且 enabled，按 order 排序拼接 content
- 新增 legacy 兼容回退：未传 promptModules 时用 `NEWS_LEGACY_WORLD_BOOK_PROMPT + NEWS_LEGACY_COT_PROMPT + NEWS_LEGACY_OUTPUT_FORMAT`（重命名 import 避免污染）

#### 4. hooks/useGame/newsWorkflow.ts
- `callNewsModel` 调用点加 `promptModules: state.gameSettings.promptModules`

#### 5. components/features/Settings/PromptModulesTab.tsx
- CALIBRATION_SYSTEM_GROUPS.news.match 加 `builtin_news_worldbook` 和 `builtin_news_output_format`

#### 6. data/builtinWorldbookConfig.ts（死代码清理）
- 删除 `import { NEWS_WORLD_BOOK_PROMPT }`
- 删除 `BUILTIN_BOOK_IDS` 中的 `builtin_starrail_weekly_news`
- 删除 `newsWeeklyBook` 常量定义（~20 行）
- 返回数组中移除 `newsWeeklyBook`

#### 7. data/newsWorldbook.ts（标记废弃）
- 顶部加注释说明内容已迁移到 builtin_news_worldbook 模块
- 文件内容保留（newsModel.ts legacy 兼容路径仍在用）

### 验证
- `npx.cmd tsc --noEmit` 通过（exit 0）
- `node scripts/news-update-regression.mjs` 通过：`news-update regression passed.`

### 不变项确认
- 新闻 on/off 开关仍在 sendWorkflow.ts 判断 `settings.新闻系统.enabled`
- 生成间隔回合数仍在 sendWorkflow.ts 用 `settings.新闻系统.generateIntervalTurns`
- 最多新增条数仍作为 `{maxNewEntries}` 写入 prompt（继续硬编码在 newsModel.ts）
- 期号/新闻快照/剧情编织摘要仍是动态硬编码
- 提示词模块内容文本与原世界书/原硬编码内容逐字一致

### 最终独立系统页面（新闻系统分组）
```
🗞️ 新闻系统       3 条
  ├── 星际和平周报思维链    [内置] [滑块：开]  (order 56, cot)
  ├── 星际和平周报世界书    [内置] [滑块：开]  (order 65, custom)
  └── 星际和平周报输出格式  [内置] [滑块：开]  (order 66, format)
```

### 下一步
- 按同样模式处理其他独立系统：手机 → 智库 → 变量 → 剧情编织
- 最后处理主剧情世界书归一化


## 刚完成：独立系统 UI 分组（SystemGroupSection 组件补全）（2026-06-27）

### 背景
- 牢凌反馈：独立模型页面应改名"独立系统"，且各子系统（新闻/手机/智库/变量/剧情编织）的提示词要像主剧情一样分隔展示
- 上轮断网未完成：`SystemGroupSection` 被引用但未定义，编译失败

### 本轮改动（均在 PromptModulesTab.tsx）

#### 已完成（上轮）
1. 顶部按钮文字：`独立模型` → `独立系统` ✅
2. 新增 `CALIBRATION_SYSTEM_GROUPS` 映射常量：5 个子系统 + match 函数（id === 'builtin_xxx_cot' || id.startsWith('st_import_xxx_')）✅
3. 新增 `CALIBRATION_GROUP_ORDER` 数组：['news','phone','zhiku','variable','storyWeaving'] ✅
4. 新增 `getCalibrationGroupKey(m)` 函数：遍历 GROUP_ORDER 找归属，找不到归入 'other' ✅
5. `ModuleList` 的 `!showModifyLayer` 分支改为按系统分组渲染 ✅

#### 本轮补全
6. **新增 `SystemGroupSection` 组件**（在 ModifyLayer 之前）
   - props: `{ group, items, selected, onSelect, onToggle }`
   - group 类型：`{ label: string; icon: string; emoji: string; match: (id: string) => boolean }`
   - 折叠标题：▼ + emoji + 系统名 + 计数（默认展开）
   - 标题样式参考 ModifyLayer：`text-sm font-serif tracking-[0.16em]` + accent-primary 色
   - 内部复用 ModuleItem 渲染模块列表
7. 'other' 兜底分组：未归类模块显示为"⚡ 其他系统"

### 分组结构（独立系统页面）
```
🗞️ 新闻系统       1 条
  └ ModuleItem (builtin_news_cot)
📱 手机系统       1 条
  └ ModuleItem (builtin_phone_cot)
📚 智库系统       1 条
  └ ModuleItem (builtin_zhiku_cot)
⚙️ 变量系统       1 条
  └ ModuleItem (builtin_variable_cot)
📖 剧情编织系统   1 条
  └ ModuleItem (builtin_story_weaving_cot)
```

### 关键设计决策
1. **分组判断靠 id 前缀**：`builtin_<system>_cot` 和 `st_import_<system>_` 双前缀检测
2. **SystemGroupSection 默认展开**：独立系统模块少（每个系统 1 条），不需要默认折叠
3. **复用 ModuleItem**：保持与主剧情一致的模块项展示（身份标签/互斥标记/滑块开关）
4. **group.icon 字段未使用**：保留为接口一致性，实际显示用 emoji

### 已验证
- `npx.cmd tsc --noEmit` 通过（exit 0）

### 下一步
- 牢凌手动验证 UI 效果
- 后续：独立系统提示词归一化计划（数据层分离，将硬编码 worldbook 模块化）


## 刚完成：系统工作流全景图文档（2026-06-26）

### 文件位置
`docs/2026-06-26-system-workflow-map.md`

### 内容概要
逐个系统与牢凌确认后，编写了完整的系统工作流全景图，包含：
1. 主回合工作流时间线（6步：开局预处理→上下文召回→正文生成→变量校准→后台任务→存档收尾）
2. 系统总览表（7个系统的权重/触发/调AI/写state/模块化现状）
3. 各系统详情（7个系统各自的职责/工作原理/输入/输出/提示词/联动/特殊机制）
4. 系统间数据依赖图（ASCII）
5. 跨回合双向循环说明
6. 变量系统写入领域详图
7. 提示词分布现状（已模块化21个 / 独立文件4份 / 硬编码6处）
8. 关键发现 + 归一化优先级（P1智库→P2新闻→P3变量→P4手机→P5剧情编织）

### 逐系统确认记录

| 系统 | 确认内容 | 特殊发现 |
|------|---------|---------|
| 智库 | 职责/两阶段检索/不写state/提示词/联动 ✅ | 门禁体系因崩铁角色多形态设计，待优化 |
| 新闻 | 职责(不只是新闻，是剧情推进器)/开局预处理/每N回合/联动 ✅ | 不和变量/忆庭联动 |
| 变量 | 职责(全局变量维护)/写8领域/不写新闻忆庭智库/协议保障三层 ✅ | 忆庭不写（排除项，之前误读为写）；内容复审NSFW分支是后期补丁；phone_seed多重校验是原设计 |
| 手机 | 职责/14项输入/4项输出/联动7个数据源 ✅ | 手机写回记忆（行128）；原著角色口吻边界（智库优先）；半成品待优化 |
| 剧情编织 | 职责/三阶段流程/5维门禁/状态机 ✅ | 自动推进机制有问题（原设计应自动推进但实现有缺陷，待优化） |

### 待优化项（非归一化范围）
- 剧情编织自动推进机制
- 智库条目解锁门禁体系
- 手机系统整体优化
- sendWorkflow.ts 132KB 边界模糊
- 主剧情28个硬编码动态段落模块化评估

### 下一步
- 基于此文档构建独立系统提示词归一化计划


## 刚完成：导入酒馆预设按钮移到右上角（2026-06-26）

### 改动
- **删除**：左侧栏底部"◈ 导入酒馆预设"按钮（原位置在"+ 新增自定义模块"和"重置内置"之间）
- **新增**：右侧编辑器区域顶部 header 条
  - 左侧：`◆ 模块编辑` 标题（text-xs font-serif tracking-[0.2em] accent-primary 色）
  - 右侧：`◈ 导入酒馆预设` 按钮（粉色系，和 ST 导入模块标签同色系）
- 右侧容器结构从 `overflow-y-auto` 改为 `flex flex-col`，header 固定 + 内容区滚动

### 按钮新位置
```
┌─────────────────────────────┐
│ ◆ 模块编辑    [◈ 导入酒馆预设] │ ← header 条
├─────────────────────────────┤
│                             │
│  EditorPanel 内容           │ ← 滚动区
│                             │
└─────────────────────────────┘
```

### 左侧栏底部按钮（保留）
- `+ 新增自定义模块`（金蓝渐变）
- `重置内置为初始`（透明底）

### 已验证
- npx.cmd tsc --noEmit 通过（exit 0）


## 刚完成：左侧栏加导入酒馆预设按钮（Phase 3 占位）（2026-06-26）

### 改动
- 主组件新增 `importSTPreset` 函数：Phase 3 占位，弹 alert 提示功能开发中
- 左侧栏底部按钮区新增"◈ 导入酒馆预设"按钮，位置在"+ 新增自定义模块"和"重置内置为初始"之间
- 按钮样式：ui-nsfw 粉色系（和 ST 导入模块标签同色系），淡渐变底 + 粉色描边 + 切角

### 按钮顺序（从上到下）
1. `+ 新增自定义模块`（金蓝渐变，主操作）
2. `◈ 导入酒馆预设`（粉色系，ST 导入入口）
3. `重置内置为初始`（透明底，次要操作）

### 已验证
- npx.cmd tsc --noEmit 通过（exit 0）

### 下一步
- Phase 3 实现真实的 ST 预设导入逻辑（文件选择 + 解析 + 生成 st_import_ 前缀模块）


## 刚完成：左侧模块项加滑块开关（2026-06-26）

### 改动
- 主组件新增 `onToggle` 回调：`patch(id, { enabled: !target.enabled })`，走 patch 自动触发文风互斥逻辑
- `onToggle` 从主组件 → ModuleList → ModifyLayer → ModuleItem 全链路传递
- ModuleItem 里把"● 启用/○ 关闭"文字替换为小滑块开关（h-4 w-7）
- 滑块点击 `stopPropagation` 避免触发模块选中
- 独立模型模块（isCal）滑块禁用（opacity 0.6 + cursor not-allowed）

### 滑块样式
- 尺寸：h-4 w-7（比 EditorPanel 的 h-6 w-11 小）
- 启用态：金蓝渐变背景 + 切角
- 禁用态：bg-secondary 半透明 + 内描边
- 圆点：h-3 w-3，启用时右移，禁用时左移

### 已验证
- npx.cmd tsc --noEmit 通过（exit 0）


## 刚完成：提示词模块 UI 调整 — 系统切换 + 可修改性分层（2026-06-26）

### 牢凌反馈的两点问题
1. **其他系统提示词混在左侧列表** → 需要顶部按钮切换不同系统
2. **category 分组字太小、分层逻辑不对** → 主剧情只按"可修改/不可修改"分层，适配 ST 酒馆预设

### 改动清单（均在 PromptModulesTab.tsx）

#### 1. 顶部系统切换 Segmented Control
- 新增 `activeSystem` state（'main' | 'calibration'）
- 新增 `visibleModules` 按系统过滤
- 顶部按钮组：`◆ 主剧情` / `◈ 独立模型`，选中态金蓝渐变 + 切角，未选中透明底
- 字号 `text-sm`（比原分组标题 text-[10px] 大很多）

#### 2. 去掉 category 分组，改为可修改性分层
- **删除**：`groupByCategory` 函数 + `CATEGORY_ORDER` 常量 + `ModuleGroup` 组件
- **新增**：`ModuleList`（入口，根据 showModifyLayer 决定分层 or 扁平）
- **新增**：`ModifyLayer`（可修改/不可修改分层，带折叠）
- **新增**：`ModuleItem`（单个模块项，从 ModuleGroup 内联提取）
- **新增**：`isModifiableModule` 判断（非内置 / 自定义文风槽 / ST导入 = 可修改）

#### 3. 分层标题放大
- 标题字号：`text-[10px]` → `text-sm font-serif tracking-[0.16em]`
- 三角图标：`text-[8px]` → `text-xs`，▼/▽ 区分展开/折叠
- 计数：`text-[8px]` → `text-xs`

#### 4. 互斥标记位置调整
- **改前**：style 分组标题右侧的"互斥"徽章
- **改后**：每个文风模块项右上角的"互斥"徽章（在标题和状态之间）

#### 5. 分层默认状态
- 可修改层：默认展开（defaultCollapsed=false）
- 不可修改层：默认折叠（defaultCollapsed=true）
- 独立模型系统：不分层，扁平展示

### 关键设计决策
1. **两档系统切换**：主剧情/独立模型，不预留第三类（现有代码只有这两类）
2. **可修改性判断**：`!isBuiltinPromptModule(id) || id === 'builtin_writing_style_custom' || isSTImportedModule(m)` —— 自定义文风槽虽是内置 id 但内容可改，ST 导入模块 builtin=false 自然可改
3. **独立模型不分层**：都是内置展示模块，没有可修改性差异
4. **左侧栏宽度**：260px → 280px（容纳更大的按钮和标题）

### 已验证
- npx.cmd tsc --noEmit 通过（exit 0）

### 下一步
- 牢凌手动指导调整其他 UI 细节


## 刚完成：提示词模块分层改造 Step 4-6 — UI 准备全部完成（2026-06-26）

### 当前进度：6/6 全部完成 ✅
- ✅ Step 1：主剧情 vs 其他系统拆分（接手前完成）
- ✅ Step 2：左侧按 category 分组 + 折叠展开（接手前完成）
- ✅ Step 3：选中高亮增强 + 分层标记 Layer X（接手前完成）
- ✅ Step 4：文风互斥单选（本轮完成）
- ✅ Step 5：标签颜色语义化（本轮完成）
- ✅ Step 6：ST导入替换关系提示（本轮完成）

### 本轮改动（Step 4-6，均在 PromptModulesTab.tsx）

#### Step 4：文风互斥单选
| 改动 | 说明 |
|------|------|
| 顶部新增 `WRITING_STYLE_MODULE_IDS` 集合 | 4 个内置文风模块 id + `st_import_writing_style_` 前缀（为 Phase 3 ST 导入预留） |
| 顶部新增 `isWritingStyleModule(m)` | 判断模块是否属于文风互斥组 |
| `patch` 函数增强 | 启用文风模块时，自动关闭其他已启用的文风模块（互斥逻辑） |
| `ModuleGroup` 分组标题 | style 类目标题右侧加"互斥"徽章（accent-secondary 配色 + 切角） |
| `EditorPanel` 启用开关描述 | 文风模块显示"单选互斥"说明文案 |

#### Step 5：标签颜色语义化
| 改动 | 说明 |
|------|------|
| 顶部新增 `CATEGORY_COLOR_VAR` 映射 | 6 类目→语义色变量：cot→sage-soft绿 / format→accent-secondary / persona→amber-soft / devmode→danger红 / style→accent-primary / custom→text-secondary |
| `ModuleGroup` 分组标题类目名 | 颜色从统一 accent-primary 改为类目语义色 |
| 模块列表项描述行 | 类目名着色（`[思维链 · order 10]` 中的"思维链"用语义色） |
| `EditorPanel` Layer 标记 | 类目名从 text-secondary 改为类目语义色 |

#### Step 6：ST导入替换关系提示
| 改动 | 说明 |
|------|------|
| 顶部新增 `isSTImportedModule(m)` | 检测 id 是否以 `st_import_` 前缀开头 |
| 顶部新增 `getSTImportTargetCategory(m)` | 从 id 解析 ST 导入模块替换的内置类别（writing_style→style 等） |
| 模块列表项身份标签 | 从二分支（内置/自定义）改为三分支：ST导入(nsfw粉) / 内置(金蓝渐变) / 自定义(透明底) |
| `EditorPanel` ST 导入提示条 | 仅 ST 导入模块显示：粉色左边框 + "此模块从 SillyTavern 预设导入，归类于[类目名]分类..." |

### 关键设计决策
1. **文风互斥只管启用，不管关闭**：关闭当前文风时不会自动启用其他文风，允许"无文风"状态
2. **ST 导入检测靠 id 前缀**：Phase 3 数据模型扩展（source/replaceable 字段）后可改为字段检测，当前 id 前缀方案不阻塞 UI
3. **语义色全部用 CSS 变量**：保证开拓金辉/星海青辉两个主题兼容，无硬编码 RGB
4. **ST 导入模块可编辑可删除**：readonly 逻辑不变（只读=内置且非自定义文风槽），ST 导入模块 builtin=false 所以可编辑

### 关键文件
- **唯一改动文件**: `components/features/Settings/PromptModulesTab.tsx`
- **未改动**: models/prompts.ts（数据模型扩展留待 Phase 3）/ data/builtinPromptModules.ts / styles/global.css

### 已验证
- npx.cmd tsc --noEmit 通过（exit 0，3 次验证）

### 下一步
- 牢凌手动指导调整 UI 细节
- Phase 3（ST 导入功能实现）+ Phase 1（数据模型扩展 layer/replaceable/source 字段）待计划启动


## 刚完成：提示词模块分层改造 — 进度写入（2026-06-26）

### 当前进度：3/6 已完成
- ✅ Step 1：主剧情 vs 其他系统拆分
- ✅ Step 2：左侧按 category 分组 + 折叠展开
- ✅ Step 3：选中高亮增强 + 分层标记 Layer X
- ⏳ Step 4：文风互斥单选（待续）
- ⏳ Step 5：标签颜色语义化（待续）
- ⏳ Step 6：ST导入替换关系提示（待续）

### 关键文件位置
- **实际操作文件**: `components/features/Settings/PromptModulesTab.tsx`
- **数据模型**: `models/prompts.ts`
- **内置数据**: `data/builtinPromptModules.ts`
- **全局样式**: `styles/global.css`
- **预览版参考**: `docs/2026-06-26-prompt-modules-ui-preview.html`
- **预览版备份**: `docs/2026-06-26-prompt-modules-ui-preview.bak`
- **记忆文件**: `prompt-modules-refactor-progress`

### 设计原则
- 所有颜色用 CSS 变量（--tj-*），保证两个主题兼容
- 不改动文件结构（只改 PromptModulesTab.tsx + global.css）
- 每步完成后 tsc --noEmit 验证
- 只有牢凌说上传才 push GitHub


## 刚完成：修复 GLM5.2 变量模型回填导致"tool 输出又触发同一次调用"的重复工作问题（2026-06-26）

### 问题诊断
- 牢凌反馈：自定义供应商 GLM5.2 下出现重复工作，参考 OpenStarry 文档"失败 7：tool 输出又触发了同一次调用"
- **根因**：变量模型（variableModel.ts）的协议修复 + 内容复审采用"双重回填上一版输出"模式：
  1. 把上一版残缺 rawText 作为 `assistant` 消息回填
  2. 修复 prompt 里又附带"上一版输出摘录"excerpt
- GLM5.2 看到自己上一版的残缺/空 facts 输出，被带跑再次输出类似内容 → 重复工作 + token 浪费
- 注：GLM5.2 不触发 DeepSeek 协议校验（isDeepSeekMainConfig 只匹配 provider/baseUrl 含 deepseek）

### 修复（variableModel.ts，共4处）
| # | 位置 | 改前 | 改后 |
|---|------|------|------|
| 1 | 协议修复调用处（原466-473） | assistant 回填完整残缺 rawText | assistant 回填中性占位符"（上一版输出协议不完整…从零重新输出）" |
| 2 | 内容复审调用处（原482-489） | assistant 回填完整空 facts rawText | assistant 回填中性占位符"（上一版输出空 facts…从零重新输出）" |
| 3 | buildVariableProtocolRepairPrompt（原514-526） | 含 previousRawText 参数 + excerpt 摘录 | 移除参数 + 移除 excerpt，改为"请从零开始重新输出，不要延续上一版残缺结构" |
| 4 | buildVariableContentReviewPrompt（原192-222） | 含 previousRawText 参数 + excerpt 摘录（NSFW/日常两分支） | 移除参数 + 移除两处 excerpt，改为"请从零开始重新输出，不要延续上一版内容" |

### 设计要点
- 保留 `assistant` 消息槽位（维持 user/assistant 交替，避免中转拒绝连续 user）
- 但不回填残缺内容，避免 GLM5.2 被带跑
- 修复指令已足够说明重写要求，模型不需要看到上一版残缺输出
- 重试上限不变（retries:1），ensureVariableProtocolFallback 兜底不变

### 关键教训
- **"tool 输出又触发同一次调用"的本质**：把上一版输出回填给模型，模型模仿它再次输出类似内容
- **修复策略**：保留消息槽位结构，但用中性占位符替代残缺输出，切断"模仿源"
- **GLM5.2 与 DeepSeek 的差异**：DeepSeek 能从回填的残缺输出中认识到错误并修复；GLM5.2 会被残缺输出带跑。因此移除回填对 DeepSeek 影响小，对 GLM5.2 是净收益
- **isDeepSeekMainConfig 判定**：只看 provider/baseUrl 是否含 "deepseek"，GLM5.2 不会触发 DeepSeek 协议校验

### 已验证
- npx.cmd tsc --noEmit 通过（exit 0）


## 刚完成：UI预览高级感优化 — prompt-modules-ui-preview.html（2026-06-26）

### 操作
- **备份**：原文件 → `.bak`
- **优化项目**（共5项）：

| # | 修改项 | 改前 | 改后 |
|---|--------|------|------|
| 1 | right-panel 深度层 + 毛玻璃 | blur(1px)，仅2层径向渐变 | blur(4px)，新增linear-gradient深度层，噪声纹理从0.025→0.035，新增顶部渐变分割线 |
| 2 | footer-btn-primary 渐变 | tech-cyan→accent-primary | btn-primary-start→btn-primary-end ✅ 真正渐变 |
| 3 | scope-chip.active 渐变 | tech-cyan→accent-primary | btn-primary-start→btn-primary-end ✅ 真正渐变 |
| 4 | input/textarea 聚焦动效 | 仅box-shadow变化 | 新增background过渡0.2s + accent-glow外发光16px呼吸 + 内发光加强 |
| 5 | editor-empty 空状态装饰 | 纯居中布局 | 新增clip-path切角 + 内描边 + 径向渐变背景 + 顶部渐变分割线(::after) + 光晕扩大到240px |
| 6 | 微交互点击波纹 | 无 | 新增ripple关键帧 + JS监听所有按钮/开关/标签点击产生波纹 + kaituo-btn/footer-btn添加overflow:hidden |

### 关键教训
- 多轮edit_file用 multi_edit 工具更稳妥（原子提交，失败不污染文件）
- 渐变修复后，需确认HTML中所有 text-cyan→accent-primary 都已改为 btn-primary-start→btn-primary-end
- 备份文件很重要（牢凌说的！）


## 刚完成：记忆保存 —UI高级感修复项目状态写入项目AGENTS.md（2026-06-26）

### 当前任务状态
- 项目路径：`E:\桌面文件\崩坏星穹铁道前端\`
- 目标文件：`docs\2026-06-26-prompt-modules-ui-preview.html`
- 目标：提升UI预览版高级感 → 修复毛玻璃/深度层/渐变/动效/装饰细节
- 来源计划：参考 2026-06-26-st-preset-compatibility-design.md

### 三阶段计划
1. Phase 1（诊断）：识别当前预览版缺少的高级感要素 → 已完成（基于上一轮分析）
2. Phase 2（修复）：逐个应用毛玻璃/深度层/渐变/动效/装饰细节 → 待重新开始（需先read_file）
3. Phase 3（清单）：输出变更清单供用户审核

### 关键教训（避免重蹈覆辙）
1. **上一轮所有edit_file失败**：未先read_file确认实际HTML结构，猜测的CSS类名均不存在
2. **必须先用read_file读取目标文件**，确认实际内容后再编辑
3. **bash读中文文件会乱码**→只用read_file读中文文件
4. **edit_file失败后**：先用read_file确认内容，构造含2行上下文的old_string再改


## 刚完成：按钮渐变根因修复 — tech-cyan≠accent-primary + btn-primary变量替换（2026-06-25）

### 根因
保存按钮等大量按钮使用 	ech-cyan → accent-primary 渐变，但在星海青辉下 	ech-cyan = accent-primary = 142,215,255（完全一样！），渐变两端颜色相同，看起来就是纯色。开拓金辉下也有同样问题（	ech-cyan = accent-primary = 245,217,122）。

### 修复
- 16个组件中所有高透明度(0.8+)的 	ech-cyan → accent-primary 按钮渐变 → tn-primary-start → btn-primary-end
  - 开拓金辉：金(245,217,122) → 蓝(142,215,255) = 金蓝渐变 ✅
  - 星海青辉：青蓝(142,215,255) → 淡紫(160,140,220) = 蓝淡紫渐变 ✅
- 
oot-theme.css 中 tn-primary-end 从暗金(196,163,90) → 青蓝(142,215,255)，与 themes.ts 同步
- 低透明度的 tech-cyan/accent-primary 保留不改（是背景纹理/网格线，不是按钮）

### 关键教训
- **当两个CSS变量值相同时，渐变就是纯色** — 这是最常见的"纯色按钮"根因
- **按钮渐变应该用专门的 btn-primary-start/end 变量**，不要用 tech-cyan/accent-primary
- **修改 themes.ts 时，root-theme.css 的默认值也必须同步更新**

### 已验证
- 
px.cmd tsc --noEmit 通过

## 刚完成：全局按钮渐变修复 — 所有accent-primary高透明度背景改渐变（2026-06-25）

### 问题
星海青辉下大量按钮/标签/色块用 accent-primary 做高透明度纯色背景(0.8~0.95)，在星海青辉下看起来是纯青蓝色，没有蓝淡紫渐变效果。只有10个按钮用了 kaituo-btn-primary 类（已渐变），其他29个文件里的按钮/色块全是纯色。

### 修复
- 29个tsx文件中 
gba(var(--tj-accent-primary), 0.78~0.95) 纯色背景 → linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.8X), rgba(var(--tj-accent-secondary), 0.7X)) 渐变
- global.css 中 .panel-btn.strong 的渐变从两端accent-primary → accent-primary→accent-secondary
- SaveLoadModal 中 
gb(var(--tj-accent-primary)) 纯色按钮 → accent-primary→accent-secondary 渐变

### 关键教训
- **按钮渐变不只靠 kaituo-btn-primary 类**，大量行内style直接用 accent-primary 做背景
- **高透明度的纯色背景（0.8+）在视觉上就是"纯色按钮"**，必须改成渐变才能有蓝淡紫效果
- **修改 themes.ts 变量值时必须用完整重写**，PowerShell -replace 会误改另一个主题的同名变量

### 已验证
- 
px.cmd tsc --noEmit 通过

## 刚完成：按钮渐变修复 — 开拓金辉金蓝 + 星海青辉蓝淡紫（2026-06-25）

### 问题
1. 开拓金辉按钮变成纯金色（btn-primary-end=金，缺蓝色端）
2. 星海青辉按钮变成纯蓝色（accent-secondary深蓝，缺紫色端）
3. 大量按钮用 accent-primary→accent-secondary 渐变，不是 btn-primary-start/end

### 修复
- **开拓金辉**：tn-primary-end 从暗金(196,163,90) → 青蓝(142,255)，形成金→蓝渐变
- **星海青辉**：ccent-secondary 从深蓝(100, → 淡紫蓝(140,120,210)，mber-de 淡紫,220)
  - 所有 accent-primary→accent-secondary 渐变自动变成 青蓝→淡紫蓝
  - 所有 accent-primary→amber-deep 渐变自动变成 青蓝→淡紫
  - btn-primary-start/end = 青蓝→淡紫

### 关键教训
- **PowerShell -replace替换**，会同时改两个主题的同名变量！修改 themes.ts 时必须：
  - 方法1：用完整重写文件代替 -replace
  - 方法2：先确认两个主题中该变量值不同，再替换
  - 方法3：用更精确的正则匹配上下文
- **按钮渐变不只靠 btn-primary 变量**，大量组件用 accent-primary→accent-secondary 做渐变

### 已验证
- 
px.cmd tsc --noE 通过
