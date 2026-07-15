/**
 * Pure story-context injection builder (Stage 5.2).
 *
 * Minimal port of the story-weaving injection spirit:
 * prefer a prebuilt injectionHint; otherwise summarize recent archives.
 * No gate matrix, no worldbook context.
 */

import type { KernelStoryProgress } from '../knowledge/types';

const MAX_ARCHIVES_IN_INJECTION = 6;

/**
 * Build a short story-context block for prompt injection.
 * Returns empty string when story is missing or has nothing to inject.
 */
export function buildStoryContextInjection(
  story: KernelStoryProgress | undefined,
): string {
  if (!story) return '';

  const hint = typeof story.injectionHint === 'string' ? story.injectionHint.trim() : '';
  if (hint) return hint;

  const archives = story.archives ?? [];
  if (!archives.length) return '';

  const recent = archives.slice(-MAX_ARCHIVES_IN_INJECTION);
  const lines = recent.map((archive, index) => {
    const title = (archive.segmentTitle || `归档${index + 1}`).trim();
    const summary = (archive.summary || '').trim();
    return summary ? `- ${title}：${summary}` : `- ${title}`;
  });

  return [
    '# 剧情编织｜历史归档',
    '',
    '以下为近期已归档剧情分段摘要，作软参考承接；若与当前已发生事实冲突，以当前剧情为准。',
    '',
    ...lines,
  ].join('\n');
}
