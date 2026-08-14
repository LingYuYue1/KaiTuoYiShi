// 提示词模块数组的纯状态转换：不触碰 settings 全量、onChange、DOM 或 React state。
// 时间戳由调用方以 now 参数传入，保持函数纯、可测试。
import type { 提示词模块, 提示词模块类目, 提示词模块作用域 } from '@/models/prompts';
import { CALIBRATION_BUILTIN_PREFIXES, PROMPT_MODULE_CATEGORY_LABELS, getDefaultModuleFields, isBuiltinPromptModule } from '@/models/prompts';
import { createBuiltinPromptModules } from '@/data/builtinPromptModules';

export const isMainPlotModule = (m: 提示词模块) => !m.scope.includes('calibration');
export const isOtherSystemModule = (m: 提示词模块) => m.scope.includes('calibration');

/** 独立系统分组映射：label=系统中文名（进入模块 title/description），match=归类判断。展示用 emoji 由 UI 层单独维护。 */
export const CALIBRATION_SYSTEM_GROUPS: Record<string, { label: string; match: (id: string) => boolean }> = {
  news: { label: '新闻系统', match: (id) => id.startsWith(CALIBRATION_BUILTIN_PREFIXES.news) || id.startsWith('custom_news_') },
  phone: { label: '手机系统', match: (id) => id.startsWith(CALIBRATION_BUILTIN_PREFIXES.phone) || id.startsWith('custom_phone_') },
  zhiku: { label: '智库系统', match: (id) => id.startsWith(CALIBRATION_BUILTIN_PREFIXES.zhiku) || id.startsWith('custom_zhiku_') },
  yiting: { label: '忆庭系统', match: (id) => id.startsWith(CALIBRATION_BUILTIN_PREFIXES.yiting) || id.startsWith('custom_yiting_') },
  variable: { label: '变量系统', match: (id) => id.startsWith(CALIBRATION_BUILTIN_PREFIXES.variable) || id.startsWith('custom_variable_') },
  companionArchive: { label: '伙伴档案', match: (id) => id.startsWith(CALIBRATION_BUILTIN_PREFIXES.companionArchive) || id.startsWith('custom_companionArchive_') },
  storyWeaving: { label: '剧情编织系统', match: (id) => id.startsWith(CALIBRATION_BUILTIN_PREFIXES.storyWeaving) || id.startsWith('custom_storyWeaving_') },
};
export const CALIBRATION_GROUP_ORDER = ['news', 'phone', 'zhiku', 'yiting', 'variable', 'companionArchive', 'storyWeaving'] as const;

/** 根据模块 id 获取所属的系统分组 key，不属于任何已知系统的归入 'other' */
export function getCalibrationGroupKey(m: 提示词模块): string {
  for (const key of CALIBRATION_GROUP_ORDER) {
    if (CALIBRATION_SYSTEM_GROUPS[key].match(m.id)) return key;
  }
  return 'other';
}

/** 文风模块互斥组：同一时间只能启用一个。 */
export const WRITING_STYLE_MODULE_IDS = new Set([
  'builtin_writing_style',
  'builtin_writing_style_hsr',
  'builtin_writing_style_baimiao',
  'builtin_writing_style_custom',
]);
export const isWritingStyleModule = (m: 提示词模块) =>
  WRITING_STYLE_MODULE_IDS.has(m.id);

/** 判断模块是否为内置预设提示词(关闭时需弹窗确认)。 */
export const isBuiltinPresetModule = (m: 提示词模块) => m.source === 'builtin';

export function patchModule(modules: 提示词模块[], id: string, partial: Partial<提示词模块>, now: number): 提示词模块[] {
  // 文风互斥：启用某个文风模块时，关闭其他文风模块
  if (partial.enabled === true) {
    const target = modules.find((m) => m.id === id);
    if (target && isWritingStyleModule(target)) {
      return modules.map((m) =>
        m.id === id
          ? { ...m, ...partial, updatedAt: now }
          : isWritingStyleModule(m) && m.enabled
            ? { ...m, enabled: false, updatedAt: now }
            : m,
      );
    }
  }
  return modules.map((m) =>
    m.id === id ? { ...m, ...partial, updatedAt: now } : m,
  );
}

export function reorderPromptModules(modules: 提示词模块[], reordered: 提示词模块[]): 提示词模块[] {
  // 仅替换 order 变化的条目，避免不必要重渲染
  return modules.map((m) => {
    const updated = reordered.find((r) => r.id === m.id);
    return updated && updated.order !== m.order ? updated : m;
  });
}

export function addPromptModule(
  modules: 提示词模块[],
  params: { systemKey: string; category: 提示词模块类目; replaceMode: 'replace' | 'coexist'; now: number },
): { next: 提示词模块[]; newId: string } {
  const { systemKey, category, replaceMode, now } = params;
  const newId = `custom_${systemKey}_${category}_${now}`;
  const isCal = systemKey !== 'main';
  const scope: 提示词模块作用域[] = isCal ? ['calibration'] : ['all'];
  const systemLabel = systemKey === 'main' ? '主剧情' : CALIBRATION_SYSTEM_GROUPS[systemKey].label;
  const catLabel = PROMPT_MODULE_CATEGORY_LABELS[category];

  const targetModules = isCal
    ? modules.filter((m) => CALIBRATION_SYSTEM_GROUPS[systemKey].match(m.id))
    : modules.filter(isMainPlotModule);
  const nextOrder = (targetModules.length > 0 ? Math.max(...targetModules.map((m) => m.order)) : 0) + 10;

  const created: 提示词模块 = {
    ...getDefaultModuleFields(),
    source: 'user',
    replaceable: 'replaceable',
    replaceMode,
    id: newId,
    title: `${systemLabel} · ${catLabel}`,
    description: `${systemLabel} · ${catLabel}`,
    category,
    content: '',
    enabled: true,
    builtin: false,
    order: nextOrder,
    scope,
    createdAt: now,
    updatedAt: now,
  };

  let next = [...modules, created];
  if (replaceMode === 'replace') {
    next = next.map((m) => {
      if (!isBuiltinPromptModule(m.id)) return m;
      const sameSystem = isCal
        ? CALIBRATION_SYSTEM_GROUPS[systemKey].match(m.id)
        : isMainPlotModule(m);
      const sameCategory = m.category === category;
      if (sameSystem && sameCategory && m.enabled) {
        return { ...m, enabled: false, updatedAt: now };
      }
      return m;
    });
  }

  return { next, newId };
}

export function removePromptModule(modules: 提示词模块[], id: string, now: number): 提示词模块[] {
  if (isBuiltinPromptModule(id)) return modules;
  const target = modules.find((m) => m.id === id);
  let next = modules.filter((m) => m.id !== id);
  if (target && target.replaceMode === 'replace') {
    const isCal = target.scope.includes('calibration');
    next = next.map((m) => {
      if (!isBuiltinPromptModule(m.id) || m.enabled) return m;
      const sameSystem = isCal
        ? getCalibrationGroupKey(m) === getCalibrationGroupKey(target)
        : isMainPlotModule(m) && isMainPlotModule(target);
      const sameCategory = m.category === target.category;
      if (sameSystem && sameCategory) {
        return { ...m, enabled: true, updatedAt: now };
      }
      return m;
    });
  }
  return next;
}

export function resetBuiltinModules(modules: 提示词模块[], now: number): 提示词模块[] {
  const fresh = createBuiltinPromptModules();
  const next = modules.map((m) => {
    if (!isBuiltinPromptModule(m.id)) return m;
    const def = fresh.find((f) => f.id === m.id);
    if (!def) return m;
    const isCalibrationBuiltin = def.scope.includes('calibration');
    // 保留玩家当前的主剧情 enabled，覆盖其它字段；独立模型展示模块不作为真实请求开关。
    return {
      ...def,
      enabled: isCalibrationBuiltin ? true : m.enabled,
      createdAt: m.createdAt,
      updatedAt: now,
    };
  });
  // 若某条 builtin 被异常删除，补回
  for (const def of fresh) {
    if (!next.find((m) => m.id === def.id)) next.push(def);
  }
  return next;
}
