// G1.3.1.6 测试专用共享入口（仅被 scripts/story-runtime-*-regression.mjs 使用，不进生产资产）。
// 目的：让 StoryAssetCatalogStore 构造、isStoryAssetCatalogStore verifier、commandValidator 的
// isTrustedCatalogStore 与 runRuntimeTurn 来自同一份生产模块图（同一个 esbuild bundle），
// 这样模块私有 WeakSet brand 是同一份，正式 store 的正向路径才能通过；
// 跨 bundle（独立 esbuild）构造的 store/复制对象/代理不在同一 brand 中，必须被拒绝。
// 不得因此放宽 verifier 或复制第二套 store。
export { StoryAssetCatalogStore, isStoryAssetCatalogStore } from '../services/storyRuntime/storyAssetCatalogStore';
export { isTrustedCatalogStore, validateCommandStructure, deriveFactsOfInterest } from '../services/storyRuntime/commandValidator';
export { runRuntimeTurn, stateFingerprintOf } from '../services/storyRuntime/runtimeReducer';
