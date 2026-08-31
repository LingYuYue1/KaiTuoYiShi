// 类型层契约：钉住 TurnDeltas 各阶段产出字段的真实形状。
// 本文件由全仓 `tsc --noEmit` 检查（tsconfig include 覆盖 tests/），不参与 vitest 运行时收集。
import { expectTypeOf } from 'vitest';
import type { TurnDeltas } from '@/hooks/useGame/turnTypes';
import type { 忆庭召回结果 } from '@/services/yitingRetrieval';
import type { 智库检索结果 } from '@/services/zhikuRetrieval';
import type { 剧情编织门禁快照, 剧情编织注入诊断 } from '@/services/storyWeaving';
import type { ChatModuleMessage } from '@/hooks/useGame/promptAssembly';
import type { STPresetEntryV2 } from '@/models/stTypes';
import type { VariableCalibrationOverrides } from '@/hooks/useGame/variableWorkflow';
import type { DeepSeek主剧情模式 } from '@/models/settings';

expectTypeOf<TurnDeltas['yitingPreview']>().toEqualTypeOf<忆庭召回结果 | null | undefined>();
expectTypeOf<TurnDeltas['zhikuPreview']>().toEqualTypeOf<智库检索结果 | null | undefined>();
expectTypeOf<TurnDeltas['storyWeavingGate']>().toEqualTypeOf<剧情编织门禁快照 | null | undefined>();
expectTypeOf<TurnDeltas['storyWeavingDiagnostics']>().toEqualTypeOf<剧情编织注入诊断 | null | undefined>();
expectTypeOf<TurnDeltas['chatModuleMessages']>().toEqualTypeOf<ChatModuleMessage[] | undefined>();
expectTypeOf<TurnDeltas['tavernV2Error']>().toEqualTypeOf<Error | null | undefined>();
expectTypeOf<TurnDeltas['currentPresetV2ForStage']>().toEqualTypeOf<STPresetEntryV2 | null | undefined>();
expectTypeOf<TurnDeltas['variableOverrides']>().toEqualTypeOf<VariableCalibrationOverrides | null | undefined>();
expectTypeOf<TurnDeltas['mainRequestMode']>().toEqualTypeOf<'stream' | 'non-stream' | undefined>();
expectTypeOf<TurnDeltas['currentTriggerType']>().toEqualTypeOf<'swipe' | 'opening' | 'normal' | undefined>();
expectTypeOf<TurnDeltas['deepSeekMainMode']>().toEqualTypeOf<DeepSeek主剧情模式 | undefined>();

// 反向钉子：字段不接受任意值。若字段退化为 unknown，赋值成立，
// 未使用的 @ts-expect-error 指令本身会变成编译错误，从而暴露退化。
// @ts-expect-error 阶段产出字段不得弱化为任意类型
export const yitingProbe: NonNullable<TurnDeltas['yitingPreview']> = '任意字符串';
// @ts-expect-error 阶段产出字段不得弱化为任意类型
export const overridesProbe: NonNullable<TurnDeltas['variableOverrides']> = { 不存在的键: 1 };
// @ts-expect-error 请求模式只接受流/非流两种取值
export const modeProbe: NonNullable<TurnDeltas['mainRequestMode']> = 'websocket';
