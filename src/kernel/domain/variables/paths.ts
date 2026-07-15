/**
 * Path helpers for the native variable slice (Stage 5.1).
 *
 * Subset of utils/variablePath semantics — only what the formal engine needs.
 * No React, no full registry graph.
 */

import {
  NATIVE_NUMERIC_ATTR_PREFIX,
  NATIVE_VARIABLE_ALLOWED_PATHS,
  type NativeVariableScalarPath,
  type VariableAction,
  type VariableDomainCommand,
} from './types';

export type PathKind =
  | Readonly<{ kind: 'scalar'; path: NativeVariableScalarPath }>
  | Readonly<{ kind: 'numericAttr'; attrKey: string }>
  | Readonly<{ kind: 'illegal'; reason: string }>;

const SCALAR_SET = new Set<string>(NATIVE_VARIABLE_ALLOWED_PATHS);

/**
 * Classify a variable key against the Stage 5.1 whitelist.
 * Unknown roots / player-authored-only full graph paths → illegal.
 */
export function classifyVariablePath(key: string): PathKind {
  const trimmed = key.trim();
  if (!trimmed) {
    return { kind: 'illegal', reason: '空路径' };
  }

  if (SCALAR_SET.has(trimmed)) {
    return { kind: 'scalar', path: trimmed as NativeVariableScalarPath };
  }

  if (trimmed.startsWith(NATIVE_NUMERIC_ATTR_PREFIX)) {
    const attrKey = trimmed.slice(NATIVE_NUMERIC_ATTR_PREFIX.length).trim();
    if (!attrKey || attrKey.includes('.') || attrKey.includes('[')) {
      return {
        kind: 'illegal',
        reason: `非法数值属性路径：${trimmed}`,
      };
    }
    return { kind: 'numericAttr', attrKey };
  }

  // Known full-protocol roots we deliberately do not own yet (Stage 5.2+).
  const root = trimmed.split(/[.\[\]]/)[0] ?? '';
  if (
    root === '旅人' ||
    root === '世界' ||
    root === '记忆' ||
    root === '忆庭' ||
    root === '智库' ||
    root === '手机' ||
    root === 'NPC' ||
    root === '新闻' ||
    root === '剧情'
  ) {
    return {
      kind: 'illegal',
      reason: `路径未在 Stage 5.1 正式变量引擎白名单：${trimmed}`,
    };
  }

  return {
    kind: 'illegal',
    reason: `未知根路径：${trimmed}`,
  };
}

/** Actions allowed on scalar string profile fields. */
export function isScalarActionAllowed(action: VariableAction): boolean {
  return action === 'set';
}

/** Actions allowed on 旅人.数值属性.* */
export function isNumericActionAllowed(action: VariableAction): boolean {
  return action === 'set' || action === 'add' || action === 'sub';
}

export function isAllowedVariableCommand(command: VariableDomainCommand): boolean {
  const classified = classifyVariablePath(command.key);
  if (classified.kind === 'illegal') return false;
  if (classified.kind === 'scalar') return isScalarActionAllowed(command.action);
  return isNumericActionAllowed(command.action);
}
