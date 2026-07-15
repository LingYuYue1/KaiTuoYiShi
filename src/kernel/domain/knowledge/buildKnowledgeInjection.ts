/**
 * Compose knowledge-domain prompt injection (Stage 5.2).
 *
 * Combines local yiting recall, story archive injection, and unlocked
 * zhiku titles into a single context string for the narrative turn.
 */

import { buildStoryContextInjection } from '../narrative/storyInjection';
import type {
  KernelStoryProgress,
  KernelYitingSystem,
  KernelZhikuSystem,
} from './types';
import { retrieveYitingLocal } from './yitingLocalRecall';

const DEFAULT_YITING_LIMIT = 8;

export type BuildKnowledgeInjectionInput = Readonly<{
  yiting?: KernelYitingSystem;
  zhiku?: KernelZhikuSystem;
  story?: KernelStoryProgress;
  query: string;
  yitingLimit?: number;
}>;

/**
 * Build a combined knowledge injection block from available subsystems.
 * Empty parts are omitted; returns '' when nothing contributes.
 */
export function buildKnowledgeInjection(
  input: BuildKnowledgeInjectionInput,
): string {
  const parts: string[] = [];

  if (input.yiting) {
    const yitingResult = retrieveYitingLocal(
      input.yiting,
      input.query,
      input.yitingLimit ?? DEFAULT_YITING_LIMIT,
    );
    if (yitingResult.injection.trim()) {
      parts.push(yitingResult.injection.trim());
    }
  }

  const storyInjection = buildStoryContextInjection(input.story);
  if (storyInjection.trim()) {
    parts.push(storyInjection.trim());
  }

  const zhikuInjection = buildUnlockedZhikuInjection(input.zhiku);
  if (zhikuInjection.trim()) {
    parts.push(zhikuInjection.trim());
  }

  return parts.join('\n\n').trim();
}

function buildUnlockedZhikuInjection(
  zhiku: KernelZhikuSystem | undefined,
): string {
  if (!zhiku?.entries.length) return '';

  const unlocked = zhiku.entries.filter((entry) => isOpenUnlock(entry));
  if (!unlocked.length) return '';

  const titles = unlocked
    .slice(0, 12)
    .map((entry) => `- ${entry.title}${entry.category ? `（${entry.category}）` : ''}`);

  return [
    '# 智库｜已解锁资料',
    '',
    '以下智库条目当前可用作角色/设定软参考；不得覆盖已发生事实。',
    '',
    ...titles,
  ].join('\n');
}

function isOpenUnlock(entry: {
  unlockStatus: string;
  runtimeUnlockStatus?: string;
}): boolean {
  const status = (entry.runtimeUnlockStatus ?? entry.unlockStatus ?? '').trim();
  if (!status) return false;
  return /默认可用|已解锁|可用|可预热/.test(status) && !/未解锁|锁定|只读/.test(status);
}
