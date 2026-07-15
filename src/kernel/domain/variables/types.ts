/**
 * Kernel Variable Engine domain types (Stage 5.1).
 *
 * Formal ownership is a **narrow traveler slice**, not the full 旅人/NPC/物品 graph.
 * Expansion happens when a native use case owns the path end-to-end (CAS + snapshot).
 *
 * Policy (illegal commands):
 * - Fail closed per command: illegal path / bad action / type mismatch → skipped
 *   (result recorded as rejected; state for that path unchanged).
 * - Narrative still commits when only variable commands are illegal
 *   (legacy-compatible domain isolation; same as Phase 2 travelerName behavior).
 * - Empty narrative still rejects the whole turn (parse layer).
 */

/** Actions supported by the native variable protocol. */
export type VariableAction = 'set' | 'add' | 'sub' | 'push' | 'delete';

/**
 * One candidate domain action produced by parsing (or manual UI apply).
 * Not a formal commit — only becomes formal via reduceTurn / reduceVariables
 * inside a single CAS.
 */
export type VariableDomainCommand = Readonly<{
  action: VariableAction;
  /** Dot path under an allowed root, e.g. "旅人.姓名" / "旅人.身份". */
  key: string;
  value: unknown;
}>;

export type VariableCommandResult = Readonly<{
  command: VariableDomainCommand;
  ok: boolean;
  reason?: string;
}>;

/**
 * Formal traveler variable slice owned by SessionRepository.
 * Keep in sync with travelerName convenience field on GameState.
 */
export type TravelerVariables = Readonly<{
  姓名: string;
  身份: string;
  外貌: string;
  性格: string;
  背景: string;
  /**
   * Numeric counters under 旅人.数值属性.<name> for set/add/sub demos
   * (affinity-style ints). Unknown keys are created on first write.
   */
  数值属性: Readonly<Record<string, number>>;
}>;

/** Formal variables root map. Stage 5.1 owns only 旅人. */
export type KernelVariables = Readonly<{
  旅人: TravelerVariables;
}>;

/** Paths the native engine may mutate (whitelist). */
export const NATIVE_VARIABLE_ALLOWED_PATHS = [
  '旅人.姓名',
  '旅人.身份',
  '旅人.外貌',
  '旅人.性格',
  '旅人.背景',
] as const;

export type NativeVariableScalarPath = (typeof NATIVE_VARIABLE_ALLOWED_PATHS)[number];

/** Prefix for dynamic numeric paths: 旅人.数值属性.<key> */
export const NATIVE_NUMERIC_ATTR_PREFIX = '旅人.数值属性.' as const;

export function createEmptyTravelerVariables(
  overrides?: Partial<TravelerVariables> & {
    数值属性?: Readonly<Record<string, number>>;
  },
): TravelerVariables {
  return {
    姓名: overrides?.姓名 ?? '开拓者',
    身份: overrides?.身份 ?? '',
    外貌: overrides?.外貌 ?? '',
    性格: overrides?.性格 ?? '',
    背景: overrides?.背景 ?? '',
    数值属性: { ...(overrides?.数值属性 ?? {}) },
  };
}

export function createEmptyKernelVariables(
  overrides?: Readonly<{ 旅人?: Partial<TravelerVariables> }>,
): KernelVariables {
  return {
    旅人: createEmptyTravelerVariables(overrides?.旅人),
  };
}

export function cloneTravelerVariables(traveler: TravelerVariables): TravelerVariables {
  return {
    姓名: traveler.姓名,
    身份: traveler.身份,
    外貌: traveler.外貌,
    性格: traveler.性格,
    背景: traveler.背景,
    数值属性: { ...traveler.数值属性 },
  };
}

export function cloneKernelVariables(variables: KernelVariables): KernelVariables {
  return {
    旅人: cloneTravelerVariables(variables.旅人),
  };
}

/** Keep GameState.travelerName aligned with variables.旅人.姓名. */
export function travelerNameFromVariables(variables: KernelVariables): string {
  return variables.旅人.姓名;
}

export function withTravelerName(
  variables: KernelVariables,
  name: string,
): KernelVariables {
  if (variables.旅人.姓名 === name) return variables;
  return {
    旅人: {
      ...cloneTravelerVariables(variables.旅人),
      姓名: name,
    },
  };
}
