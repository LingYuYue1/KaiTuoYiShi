// 由 scripts/story-runtime-domain-model-regression.mjs 的 generateDomainModels 从
// scripts/fixtures/story-v3/story-runtime-contract.fixture.json 生成（contractRevision 2）
// fixture fingerprint: sha256:f19a297c9176d5fe84e79c95135ecc92ea2155b696c123820bd7b8b0b8755bf6
// 本文件只声明领域类型，不实现任何运行逻辑；禁止被现有生产运行流程 import。
// 类型唯一来源为冻结 fixture；任何字段/枚举/联合变化必须走 schema revision。

// 本文件为 G1.2.1 边界占位：fixture 中 job/outbox 相关数据形状由 ProjectionOutboxItem 承担，
// 归属 storyRuntimeProjection.ts。fixture 无独立 job ledger 类型；后续若出现独立 job ledger
// 或 outbox 类型，在此声明数据形状并同步 schema revision（仍不实现 lease/retry/worker 逻辑）。
