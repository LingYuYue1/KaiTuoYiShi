import type { 提示词模块, 提示词模块类目 } from '@/models/prompts';

type 独立系统提示词目标 =
  | 'news'
  | 'phone'
  | 'variable'
  | 'zhiku'
  | 'yitingRecall'
  | 'yitingArchive'
  | 'storyWeaving';

const TARGET_ID_MATCHERS: Record<独立系统提示词目标, readonly ((id: string) => boolean)[]> = {
  news: [(id) => id.startsWith('builtin_news_')],
  phone: [
    (id) => id.startsWith('builtin_phone_'),
    (id) => id.startsWith('custom_phone_'),
    (id) => id.startsWith('st_import_phone_'),
  ],
  variable: [
    (id) => id.startsWith('builtin_variable_'),
    (id) => id === 'builtin_companion_archive_worldbook',
  ],
  zhiku: [
    (id) => id.startsWith('builtin_zhiku_'),
    (id) => id.startsWith('custom_zhiku_'),
  ],
  yitingRecall: [(id) => id === 'builtin_yiting_recall'],
  yitingArchive: [(id) => id.startsWith('builtin_yiting_archive_')],
  storyWeaving: [(id) => id.startsWith('builtin_story_weaving_')],
};

interface 独立系统提示词过滤选项 {
  category?: 提示词模块类目;
}

export function filterIndependentPromptModules(
  promptModules: 提示词模块[] | undefined,
  target: 独立系统提示词目标,
  options: 独立系统提示词过滤选项 = {},
): 提示词模块[] {
  if (!promptModules?.length) return [];
  const matchers = TARGET_ID_MATCHERS[target];
  return promptModules
    .filter((module) => {
      if (!module.enabled) return false;
      if (!module.scope?.includes('calibration')) return false;
      if (options.category && module.category !== options.category) return false;
      return matchers.some((matches) => matches(module.id));
    })
    .sort((a, b) => a.order - b.order);
}

export function buildIndependentPromptModulesSection(
  promptModules: 提示词模块[] | undefined,
  target: 独立系统提示词目标,
  options: 独立系统提示词过滤选项 = {},
): string {
  return filterIndependentPromptModules(promptModules, target, options)
    .map((module) => module.content)
    .join('\n\n');
}
