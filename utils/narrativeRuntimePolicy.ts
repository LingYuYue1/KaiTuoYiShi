import type { 游戏设置 } from '@/models/settings';
import type { 提示词模块 } from '@/models/prompts';

export type NarrativePerson = 'first' | 'second' | 'third';
export type PlayerSpeechMode = 'no-control' | 'expansion';

export const PERSPECTIVE_MODULE_IDS = {
  first: 'builtin_perspective_first',
  second: 'builtin_perspective_second',
  third: 'builtin_perspective_third',
} as const;

export const PLAYER_SPEECH_MODULE_IDS = {
  'no-control': 'builtin_no_control',
  expansion: 'builtin_player_speech_expansion',
} as const;

const PERSPECTIVE_MODULE_ID_SET = new Set<string>(Object.values(PERSPECTIVE_MODULE_IDS));
const PLAYER_SPEECH_MODULE_ID_SET = new Set<string>(Object.values(PLAYER_SPEECH_MODULE_IDS));

export interface RuntimeNarrativePolicy {
  narrativePerson: NarrativePerson;
  perspectiveModuleId: (typeof PERSPECTIVE_MODULE_IDS)[NarrativePerson];
  playerSpeechMode: PlayerSpeechMode;
  playerSpeechModuleId: (typeof PLAYER_SPEECH_MODULE_IDS)[PlayerSpeechMode];
  playerName: string;
}

/**
 * Resolve the effective player agency mode from the two legacy booleans.
 * No-control wins whenever both flags are true, preserving the strictest boundary.
 */
export function resolvePlayerSpeechMode(settings: Pick<游戏设置, 'enableNoControl' | 'enablePlayerSpeechExpansion'>): PlayerSpeechMode {
  if (settings.enableNoControl !== false) return 'no-control';
  return settings.enablePlayerSpeechExpansion === true ? 'expansion' : 'no-control';
}

export function resolveNarrativePolicy(
  settings: Pick<游戏设置, 'narrativePerson' | 'enableNoControl' | 'enablePlayerSpeechExpansion'>,
  playerName: string,
): RuntimeNarrativePolicy {
  const narrativePerson = settings.narrativePerson ?? 'second';
  const playerSpeechMode = resolvePlayerSpeechMode(settings);
  return {
    narrativePerson,
    perspectiveModuleId: PERSPECTIVE_MODULE_IDS[narrativePerson],
    playerSpeechMode,
    playerSpeechModuleId: PLAYER_SPEECH_MODULE_IDS[playerSpeechMode],
    playerName: playerName.trim(),
  };
}

/**
 * Derive effective built-in module states without mutating persisted settings.
 * The persisted `enabled` flags remain a UI/legacy mirror; runtime policy wins.
 */
export function applyRuntimeNarrativePolicy(
  modules: 提示词模块[],
  policy: RuntimeNarrativePolicy,
): 提示词模块[] {
  const resultById = new Map(modules.map((module) => [module.id, module] as const));
  // Old saves may have deleted or omitted a perspective/agency module. Restore
  // the built-in template in memory only; persistence remains the caller's job.
  for (const id of [...PERSPECTIVE_MODULE_ID_SET, ...PLAYER_SPEECH_MODULE_ID_SET]) {
    if (!resultById.has(id)) {
      resultById.set(id, createFallbackNarrativeModule(id, policy));
    }
  }

  return [...resultById.values()].map((module) => {
    if (PERSPECTIVE_MODULE_ID_SET.has(module.id)) {
      return { ...module, enabled: module.id === policy.perspectiveModuleId };
    }
    if (PLAYER_SPEECH_MODULE_ID_SET.has(module.id)) {
      return { ...module, enabled: module.id === policy.playerSpeechModuleId };
    }
    return module;
  });
}

function createFallbackNarrativeModule(id: string, policy: RuntimeNarrativePolicy): 提示词模块 {
  const now = Date.now();
  const perspectiveContent: Record<string, string> = {
    [PERSPECTIVE_MODULE_IDS.first]: `# 写作人称·第一人称\n- 玩家统一用“我”指代；不要用“你/他/她”指代玩家。`,
    [PERSPECTIVE_MODULE_IDS.second]: '# 写作人称·第二人称\n- 玩家统一用“你”指代；不要切换成“我/他/她”。',
    [PERSPECTIVE_MODULE_IDS.third]: `# 写作人称·第三人称\n- 玩家统一用「${policy.playerName || '玩家'}」或“他/她”指代；禁止用“你”或“我”指代玩家。`,
  };
  const speechContent: Record<string, string> = {
    [PLAYER_SPEECH_MODULE_IDS['no-control']]: '# 角色边界·防抢话\n- 只承接玩家明确输入，不代写未明确表达的台词、动作、心理、感受或决定。',
    [PLAYER_SPEECH_MODULE_IDS.expansion]: '# 角色边界·抢话\n- 允许按玩家意图自然化补写短对白或轻动作，但不强制改写，不代写关键决定、深层心理或长篇独白。',
  };
  const content = perspectiveContent[id] ?? speechContent[id] ?? '';
  return {
    id,
    title: id,
    description: '运行时恢复的内置叙事策略模块。',
    category: id.startsWith('builtin_perspective_') ? 'format' : 'custom',
    content,
    enabled: id === policy.perspectiveModuleId || id === policy.playerSpeechModuleId,
    builtin: true,
    order: id.startsWith('builtin_perspective_') ? 1031 : 1040,
    scope: ['main', 'opening'],
    role: 'system',
    injectionPosition: 0,
    injectionOrder: id.startsWith('builtin_perspective_') ? 1031 : 1040,
    source: 'builtin',
    replaceable: 'builtin_toggleable',
    createdAt: now,
    updatedAt: now,
  };
}

export function isPerspectiveModuleId(id: string): boolean {
  return PERSPECTIVE_MODULE_ID_SET.has(id);
}

export function isPlayerSpeechModuleId(id: string): boolean {
  return PLAYER_SPEECH_MODULE_ID_SET.has(id);
}
