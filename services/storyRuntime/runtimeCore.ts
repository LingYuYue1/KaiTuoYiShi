// G1.3.1 内部共享 DTO（测试专用局部形状，不入冻结领域 schema，不持久化）。
// 按交接包 4.1"如确有必要可在同一目录新增一个内部辅助文件"：本文件集中声明
// TurnCommand（事务输入包装）、RuntimeFactCandidate（分级候选）、Allocator（确定性 ID 分配器）
// 与 TurnResult（事务结果），避免 13 个领域模块之间循环依赖；不新增第二套领域类型定义。
import type { EvidenceRef, EvidenceLevel, FactCreatedBy, GameTime, JsonValue, PublicScope, RuntimeMigrationMeta, StoryFocus, StoryRuntimeState } from '../../models/storyRuntime';
import type { RuntimeCommand, TurnAdjudicationReceipt, TurnCommandSource } from '../../models/storyRuntimeCommands';
import type { ProjectionOutboxItem } from '../../models/storyRuntimeProjection';
import type { StoryAssetCatalogStore } from './storyAssetCatalogStore';

/** 确定性 ID 分配器：namespace + canonical scope + 可选旧 ID。由调用方注入（复用 G1.2.3 stableId 规则）。 */
export type IdAllocator = (namespace: string, scope: unknown, legacyId?: string) => Promise<string>;

/** 单回合事务输入（本阶段局部 DTO）。 */
export interface TurnCommand {
  turnId: string;
  expectedRuntimeRevision: number;
  runtimeBranchId: string;
  idempotencyKey: string;
  command: RuntimeCommand;
  source: TurnCommandSource;
  /** 玩家回合正文（player_turn 时）；world_due/system 可为空 */
  rawBody?: string;
  /** 当前响应身份（narrative_span 证据的 responseId 必须绑定本回合该值） */
  responseId?: string;
  /** 正文声明的完成单元 ID（唯一权威入口：gate、回执、事务读取同一份） */
  claimedCompletedUnitIds?: string[];
  /** 正文发布门重试计数（真实组合入口传入，不硬编码 0） */
  retryCount?: number;
  /** 抽取器输入：已验证系统命令 / 变量候选 / gameplay receipt（receipt 必须绑定 eventInstanceId） */
  auxiliary?: {
    validatedSystemCommands?: Array<{ commandId: string; commandFingerprint: string; scope: { unit?: string } }>;
    variableCandidates?: Array<{ path: string; value: JsonValue; source: string }>;
    gameplayReceipts?: Array<{ receiptId: string; receiptType: string; eventInstanceId: string }>;
  };
}

/** 事实候选（分级但未提交）。 */
export interface RuntimeFactCandidate {
  candidateId: string;
  eventInstanceId: string;
  factType: string;
  payload: Record<string, JsonValue>;
  occurredAt: GameTime;
  publicScope: PublicScope;
  evidenceRefs: EvidenceRef[];
  evidenceLevel: EvidenceLevel;
  playerParticipated: boolean;
  playerObserverVisible: boolean;
  createdBy: FactCreatedBy;
}

/** 事务上下文：当前状态 + 已验证 catalog（G1.3.1.5：store 必须是生产 StoryAssetCatalogStore 实例，不接受 duck-typed/自定义 store）。 */
export interface RuntimeCtx {
  state: StoryRuntimeState;
  catalog?: {
    /** 外部声明 fingerprint（必须与 state.assetCatalogFingerprint 精确一致） */
    catalogFingerprint: string;
    /** G1.2.3 只读 catalog store：类型即生产 StoryAssetCatalogStore（受控 capability/owner），由运行时能力检查确认 */
    store?: StoryAssetCatalogStore;
    eventDefinitions?: Array<{ eventDefinitionId: string; origin: string; definitionFingerprint?: string; replayPolicy?: string }>;
    occurrenceDefinitions?: Array<{ occurrenceDefinitionId: string; eventDefinitionIds: string[] }>;
  };
}

/** 事务结果：成功返回新 state；失败返回旧 state + 错误回执 + 空副作用。 */
export interface TurnSuccessResult {
  ok: true;
  state: StoryRuntimeState;
  receipt: TurnAdjudicationReceipt;
  outbox: ProjectionOutboxItem[];
  sideEffects: ForbiddenSideEffects;
}
export interface TurnFailureResult {
  ok: false;
  state: StoryRuntimeState;
  receipt: TurnAdjudicationReceipt;
  outbox: [];
  sideEffects: ForbiddenSideEffects;
}
export type TurnResult = TurnSuccessResult | TurnFailureResult;

/** 禁止副作用清单（失败与成功都显式携带；成功只含事务内合法 outbox）。 */
export interface ForbiddenSideEffects {
  factLedger: Array<{ factId: string; factType: string; evidenceLevel: string; eventInstanceId: string }>;
  outbox: string[];
  knowledgeGrants: string[];
  narrativePublications: string[];
}

export type { StoryRuntimeState, StoryFocus, RuntimeMigrationMeta };
