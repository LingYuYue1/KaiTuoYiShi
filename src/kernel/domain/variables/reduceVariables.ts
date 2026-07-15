/**
 * Pure sync variable reducer (Stage 5.1).
 *
 * Applies VariableDomainCommand[] onto KernelVariables without I/O,
 * React setters, or SessionRepository writes.
 *
 * Illegal commands: fail closed per command (skip; record reason).
 * Successful commands accumulate immutably. Caller commits via Turn CAS.
 */

import {
  classifyVariablePath,
  isNumericActionAllowed,
  isScalarActionAllowed,
} from './paths';
import {
  cloneKernelVariables,
  type KernelVariables,
  type NativeVariableScalarPath,
  type VariableCommandResult,
  type VariableDomainCommand,
  type TravelerVariables,
} from './types';

export type ReduceVariablesResult = Readonly<{
  nextVariables: KernelVariables;
  results: readonly VariableCommandResult[];
  /** True when at least one command mutated state. */
  changed: boolean;
}>;

/**
 * Reduce candidate variable commands onto a variables snapshot.
 * Sync pure function — no I/O, no post-return mutation of input.
 */
export function reduceVariables(
  commands: readonly VariableDomainCommand[],
  initial: KernelVariables,
): ReduceVariablesResult {
  let cursor = cloneKernelVariables(initial);
  const results: VariableCommandResult[] = [];
  let changed = false;

  for (const command of commands) {
    const applied = applyOne(cursor, command);
    results.push(applied.result);
    if (applied.result.ok && applied.next) {
      cursor = applied.next;
      changed = true;
    }
  }

  return { nextVariables: cursor, results, changed };
}

function applyOne(
  state: KernelVariables,
  command: VariableDomainCommand,
): { result: VariableCommandResult; next: KernelVariables | null } {
  const classified = classifyVariablePath(command.key);

  if (classified.kind === 'illegal') {
    return {
      result: { command, ok: false, reason: classified.reason },
      next: null,
    };
  }

  if (classified.kind === 'scalar') {
    if (!isScalarActionAllowed(command.action)) {
      return {
        result: {
          command,
          ok: false,
          reason: `${classified.path} 仅支持 set，收到 ${command.action}`,
        },
        next: null,
      };
    }
    if (typeof command.value !== 'string') {
      return {
        result: {
          command,
          ok: false,
          reason: `${classified.path} 的值必须是 string`,
        },
        next: null,
      };
    }
    const nextTraveler = setScalarField(
      state.旅人,
      classified.path,
      command.value,
    );
    if (nextTraveler === state.旅人) {
      return { result: { command, ok: true, reason: '值未变化' }, next: null };
    }
    return {
      result: { command, ok: true },
      next: { 旅人: nextTraveler },
    };
  }

  // numericAttr
  if (!isNumericActionAllowed(command.action)) {
    return {
      result: {
        command,
        ok: false,
        reason: `旅人.数值属性.${classified.attrKey} 仅支持 set/add/sub`,
      },
      next: null,
    };
  }

  const numeric = toFiniteNumber(command.value);
  if (numeric === null) {
    return {
      result: {
        command,
        ok: false,
        reason: `旅人.数值属性.${classified.attrKey} 的值必须是有限数字`,
      },
      next: null,
    };
  }

  const current = state.旅人.数值属性[classified.attrKey] ?? 0;
  let nextValue = current;
  if (command.action === 'set') nextValue = numeric;
  else if (command.action === 'add') nextValue = current + numeric;
  else if (command.action === 'sub') nextValue = current - numeric;

  if (nextValue === current && classified.attrKey in state.旅人.数值属性) {
    return { result: { command, ok: true, reason: '值未变化' }, next: null };
  }

  const nextAttrs = { ...state.旅人.数值属性, [classified.attrKey]: nextValue };
  return {
    result: { command, ok: true },
    next: {
      旅人: {
        ...state.旅人,
        数值属性: nextAttrs,
      },
    },
  };
}

function setScalarField(
  traveler: TravelerVariables,
  path: NativeVariableScalarPath,
  value: string,
): TravelerVariables {
  switch (path) {
    case '旅人.姓名':
      if (traveler.姓名 === value) return traveler;
      return { ...traveler, 姓名: value };
    case '旅人.身份':
      if (traveler.身份 === value) return traveler;
      return { ...traveler, 身份: value };
    case '旅人.外貌':
      if (traveler.外貌 === value) return traveler;
      return { ...traveler, 外貌: value };
    case '旅人.性格':
      if (traveler.性格 === value) return traveler;
      return { ...traveler, 性格: value };
    case '旅人.背景':
      if (traveler.背景 === value) return traveler;
      return { ...traveler, 背景: value };
    default: {
      const _exhaustive: never = path;
      return _exhaustive;
    }
  }
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
