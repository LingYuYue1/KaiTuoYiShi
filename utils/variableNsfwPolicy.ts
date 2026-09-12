import type { 变量命令 } from '@/models/variableCommand';
import type { NPC记录 } from '@/models/npc';
import { getNsfwArchiveBlockReason } from './nsfwArchivePolicy';
import { canonicalizeJsonValue } from './jsonValue';

export interface VariableNsfwPolicy {
  nsfwEnabled: boolean;
  maleNsfwArchiveEnabled: boolean;
}

export interface RejectedVariableCommand {
  command: 变量命令;
  ok: false;
  reason: string;
}

function canonicalCommandValue(value: unknown): unknown {
  const source = value === undefined ? '' : value;
  const canonical = canonicalizeJsonValue(source);
  return canonical.ok ? canonical.value : source;
}

function commandValueText(value: unknown): string {
  try {
    return JSON.stringify(canonicalCommandValue(value) ?? '') ?? '';
  } catch {
    return '[非法 JSON 值]';
  }
}

function parseLegacyObject(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function containsObjectKey(value: unknown, keys: Set<string>): boolean {
  if (Array.isArray(value)) return value.some((item) => containsObjectKey(item, keys));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) => keys.has(key) || containsObjectKey(item, keys));
}

function commandTouchesNsfw(command: 变量命令): boolean {
  if (/(NSFW档案|女性身体档案|男性身体档案|女性私处|男性器)/.test(command.key)) return true;
  const value = parseLegacyObject(command.value);
  return containsObjectKey(value, new Set(['NSFW档案', '女性身体档案', '男性身体档案', '女性私处', '男性器']))
    || (typeof command.value === 'string' && /(NSFW档案|女性身体档案|男性身体档案|女性私处|男性器)/.test(command.value));
}

function commandTouchesMaleArchive(command: 变量命令): boolean {
  if (command.key.includes('男性身体档案') || command.key.includes('男性器')) return true;
  const value = parseLegacyObject(command.value);
  return containsObjectKey(value, new Set(['男性身体档案', '男性器', '肉棒']));
}

interface NsfwTargetResolution {
  selector: string;
  npc?: NPC记录;
  error?: string;
}

function stripSelectorQuotes(value: string): string {
  return value.trim().replace(/^(["'])|(["'])$/g, '');
}

function resolveNsfwTarget(command: 变量命令, npcs: NPC记录[]): NsfwTargetResolution {
  const match = command.key.match(/^NPC\[([^\]]+)\]/);
  if (!match) {
    return { selector: '', error: '命令没有可确认的 NPC 目标。' };
  }
  const selector = match[1].trim();
  if (!selector) return { selector, error: 'NPC 选择器为空，无法确认 NSFW 档案目标。' };

  if (/^\d+$/.test(selector)) {
    const index = Number(selector);
    const npc = npcs[index];
    return npc
      ? { selector, npc }
      : { selector, error: `NPC 数组下标 ${selector} 越界，无法确认 NSFW 档案目标。` };
  }

  const equalsIndex = selector.indexOf('=');
  const selectorField = equalsIndex >= 0 ? selector.slice(0, equalsIndex).trim() : '';
  const selectorValue = stripSelectorQuotes(equalsIndex >= 0 ? selector.slice(equalsIndex + 1) : selector);
  if (!selectorValue) return { selector, error: 'NPC 选择器值为空，无法确认 NSFW 档案目标。' };

  const candidates = npcs.filter((npc) => {
    if (selectorField === 'id') return npc.id === selectorValue;
    if (selectorField === 'name' || selectorField === '姓名') return npc.姓名 === selectorValue;
    if (selectorField === 'alias' || selectorField === '别名') return npc.别名 === selectorValue;
    return npc.id === selectorValue || npc.姓名 === selectorValue || npc.别名 === selectorValue;
  });
  if (candidates.length === 1) return { selector, npc: candidates[0] };
  if (candidates.length > 1) return { selector, error: `NPC 选择器“${selector}”存在歧义，匹配了多个 NPC。` };
  return { selector, error: `NPC 选择器“${selector}”没有匹配到真实 NPC。` };
}

function getNsfwBlockedCommandReason(command: 变量命令, npcs: NPC记录[]): string | null {
  const text = `${command.key}\n${commandValueText(command.value)}`;
  const target = resolveNsfwTarget(command, npcs);
  if (target.error) return `NSFW 档案已阻止：${target.error}`;
  const reason = getNsfwArchiveBlockReason(target.npc, target.selector, text);
  return reason ? `NSFW 档案已阻止：${reason}。` : null;
}

function splitMixedMaleArchiveCommand(command: 变量命令): { safe?: 变量命令; male: 变量命令 } | null {
  if (command.action !== 'set' || !/(?:^|\.)NSFW档案$/.test(command.key)) return null;
  const parsedValue = parseLegacyObject(command.value);
  if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) return null;

  const source = parsedValue as Record<string, unknown>;
  const safeValue: Record<string, unknown> = { ...source };
  const maleValue: Record<string, unknown> = {};
  if (Object.hasOwn(source, '男性身体档案')) {
    maleValue.男性身体档案 = source.男性身体档案;
    delete safeValue.男性身体档案;
  }
  if (Object.hasOwn(source, '男性器')) {
    maleValue.男性器 = source.男性器;
    delete safeValue.男性器;
  }
  if (Object.hasOwn(source, '肉棒')) {
    maleValue.肉棒 = source.肉棒;
    delete safeValue.肉棒;
  }
  if (!Object.keys(maleValue).length) return null;

  const safe = Object.keys(safeValue).length
    ? { ...command, value: safeValue }
    : undefined;
  return { safe, male: { ...command, value: maleValue } };
}

export function applyNsfwVariablePolicy(
  commands: 变量命令[],
  policy: VariableNsfwPolicy,
  npcs: NPC记录[] = [],
): {
  allowedCommands: 变量命令[];
  rejectedCommands: RejectedVariableCommand[];
} {
  const allowedCommands: 变量命令[] = [];
  const rejectedCommands: RejectedVariableCommand[] = [];

  for (const command of commands) {
    const touchesNsfw = commandTouchesNsfw(command);
    const touchesMaleArchive = commandTouchesMaleArchive(command);

    if (touchesNsfw && !policy.nsfwEnabled) {
      rejectedCommands.push({
        command,
        ok: false,
        reason: 'NSFW 总开关未开启，已阻止写入 NSFW 档案。',
      });
      continue;
    }

    if (touchesNsfw) {
      const blockedReason = getNsfwBlockedCommandReason(command, npcs);
      if (blockedReason) {
        rejectedCommands.push({ command, ok: false, reason: blockedReason });
        continue;
      }
    }

    if (touchesMaleArchive && !policy.maleNsfwArchiveEnabled) {
      const split = splitMixedMaleArchiveCommand(command);
      if (split?.safe) {
        allowedCommands.push(split.safe);
        rejectedCommands.push({
          command: split.male,
          ok: false,
          reason: '男性 NSFW 档案开关未开启，已阻止写入男性身体档案。',
        });
        continue;
      }
      rejectedCommands.push({
        command,
        ok: false,
        reason: '男性 NSFW 档案开关未开启，已阻止写入男性身体档案。',
      });
      continue;
    }

    allowedCommands.push(command);
  }

  return { allowedCommands, rejectedCommands };
}
