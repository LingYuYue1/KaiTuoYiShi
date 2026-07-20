import type {
  API设置,
  后台任务模式,
  DeepSeek主剧情模式,
  额外功能设置,
  游戏设置,
  记忆系统设置,
  剧情编织系统设置,
  手机系统设置,
  星轨航图系统设置,
  星际和平周报设置,
  VisualTextSettings,
  文生图系统设置,
  智库系统设置,
  主题预设,
  变量API覆盖,
} from './settings';
import { 创建空API设置, 创建默认游戏设置 } from './settings';
import type { 提示词模块 } from './prompts';
import type { STPresetEntryV2 } from './stTypes';
import type { 世界书 } from './worldbook';

export type StoryPolicy = Readonly<{
  news: Omit<星际和平周报设置, 'api'>;
  phone: Omit<手机系统设置, 'api'>;
  zhiku: Omit<智库系统设置, 'api'>;
  storyWeaving: Omit<剧情编织系统设置, 'api'>;
  memory: Omit<记忆系统设置, '记忆总结API' | '忆庭召回API' | '忆庭精炼API'>;
  image: Omit<文生图系统设置, '普通接口' | '场景接口' | 'NSFW接口' | '词组转化器API' | 'rules' | 'promptTokenizerSystemPrompt' | 'enablePromptTokenizer' | 'useSeparateSceneApi' | 'enableNsfwImageGeneration' | '正文生图'> & {
    narrativeImage: Omit<文生图系统设置['正文生图'], 'parserApi' | 'imageApi'>;
  };
  enableMaleNsfwArchive: boolean;
  extraFeatures: 额外功能设置;
  starMap: 星轨航图系统设置;
}>;

export type ExecutionPolicy = Readonly<{
  wordCountTarget: number;
  narrativePerson: 'first' | 'second' | 'third';
  enableTavernKeeperPersona: boolean;
  enableActionOptions: boolean;
  enableMemoryInjection: boolean;
  enableWorldEvents: boolean;
  enableWorldbookInjection: boolean;
  enableInnerVoice: boolean;
  enableStreaming: boolean;
  devMode: boolean;
  enableClaudeMode: boolean;
  deepSeekMainMode: DeepSeek主剧情模式;
  backgroundTaskMode: 后台任务模式;
  enableCacheDiagnostics: boolean;
  enableVariableUpdate: boolean;
  variableUpdateRequireConfirm: boolean;
  enableCotFakeHistory: boolean;
  cotLanguage: NonNullable<游戏设置['cotLanguage']>;
  autoRetryOnError: boolean;
  autoRetryCount: number;
  enableNsfw: boolean;
  enableNoControl: boolean;
  enablePlayerSpeechExpansion: boolean;
  macroGlobalVars: Readonly<Record<string, string>>;
  currentStPresetIdV2: string | null;
  currentStCharacterId: number | null;
  routes: Readonly<{
    variable: 变量API覆盖;
    news: 星际和平周报设置['api'];
    phone: 手机系统设置['api'];
    zhiku: 智库系统设置['api'];
    storyWeaving: 剧情编织系统设置['api'];
    memorySummary: 记忆系统设置['记忆总结API'];
    yitingRecall: 记忆系统设置['忆庭召回API'];
    yitingRefine: 记忆系统设置['忆庭精炼API'];
    image: Pick<文生图系统设置, '普通接口' | '场景接口' | 'NSFW接口' | '词组转化器API' | 'promptTokenizerSystemPrompt' | 'enablePromptTokenizer' | 'useSeparateSceneApi' | 'enableNsfwImageGeneration'> & {
      narrativeParser: 文生图系统设置['正文生图']['parserApi'];
      narrativeImage: 文生图系统设置['正文生图']['imageApi'];
    };
  }>;
}>;

export type AppearancePreferences = Readonly<{ theme: 主题预设; visualTextSettings: VisualTextSettings }>;
export type ContentLibrary = Readonly<{
  promptModules: readonly 提示词模块[];
  stPresetsV2: readonly STPresetEntryV2[];
  imageRules: 文生图系统设置['rules'];
  worldbooks: readonly 世界书[];
}>;
export type SavePolicy = Readonly<{ autosaveOnTurn: boolean }>;
export type DevicePreferencePlanes = Readonly<{
  apiProfiles: API设置;
  execution: ExecutionPolicy;
  appearance: AppearancePreferences;
  content: ContentLibrary;
  save: SavePolicy;
}>;

export function createDefaultSettingsPlanes(theme: 主题预设 = 'deepspace'): DevicePreferencePlanes & { story: StoryPolicy } {
  return splitSettings(创建默认游戏设置(), 创建空API设置(), theme);
}

export function assertStoryPolicy(value: unknown): asserts value is StoryPolicy {
  if (!isRecord(value)) throw new Error('Story policy must be an object');
  for (const field of ['news', 'phone', 'zhiku', 'storyWeaving', 'memory', 'image', 'extraFeatures', 'starMap'] as const) {
    if (!isRecord(value[field])) throw new Error(`Story policy requires ${field}`);
  }
  if (typeof value.enableMaleNsfwArchive !== 'boolean') {
    throw new Error('Story policy requires enableMaleNsfwArchive');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function splitSettings(settings: 游戏设置, apiProfiles: API设置, theme: 主题预设): DevicePreferencePlanes & { story: StoryPolicy } {
  const image = settings.文生图系统;
  const { parserApi, imageApi, ...narrativeImage } = image.正文生图;
  const {
    普通接口, 场景接口, NSFW接口, 词组转化器API, rules,
    promptTokenizerSystemPrompt, enablePromptTokenizer, useSeparateSceneApi,
    enableNsfwImageGeneration, 正文生图: _narrative, ...storyImage
  } = image;
  const { api: newsApi, ...news } = settings.新闻系统;
  const { api: phoneApi, ...phone } = settings.手机系统;
  const { api: zhikuApi, ...zhiku } = settings.智库系统;
  const { api: storyWeavingApi, ...storyWeaving } = settings.剧情编织系统;
  const { 记忆总结API, 忆庭召回API, 忆庭精炼API, ...memory } = settings.记忆系统;
  return {
    apiProfiles,
    execution: {
      wordCountTarget: settings.wordCountTarget, narrativePerson: settings.narrativePerson,
      enableTavernKeeperPersona: settings.enableTavernKeeperPersona, enableActionOptions: settings.enableActionOptions,
      enableMemoryInjection: settings.enableMemoryInjection, enableWorldEvents: settings.enableWorldEvents,
      enableWorldbookInjection: settings.enableWorldbookInjection, enableInnerVoice: settings.enableInnerVoice,
      enableStreaming: settings.enableStreaming, devMode: settings.devMode, enableClaudeMode: settings.enableClaudeMode,
      deepSeekMainMode: settings.deepSeekMainMode, backgroundTaskMode: settings.backgroundTaskMode,
      enableCacheDiagnostics: settings.enableCacheDiagnostics, enableVariableUpdate: settings.enableVariableUpdate,
      variableUpdateRequireConfirm: settings.variableUpdateRequireConfirm, enableCotFakeHistory: settings.enableCotFakeHistory,
      cotLanguage: settings.cotLanguage ?? 'zh', autoRetryOnError: settings.autoRetryOnError,
      autoRetryCount: settings.autoRetryCount, enableNsfw: settings.enableNsfw,
      enableNoControl: settings.enableNoControl, enablePlayerSpeechExpansion: settings.enablePlayerSpeechExpansion,
      macroGlobalVars: settings.macroGlobalVars ?? {}, currentStPresetIdV2: settings.currentStPresetIdV2 ?? null,
      currentStCharacterId: settings.currentStCharacterId ?? null,
      routes: {
        variable: settings.variableApi, news: newsApi, phone: phoneApi, zhiku: zhikuApi,
        storyWeaving: storyWeavingApi, memorySummary: 记忆总结API,
        yitingRecall: 忆庭召回API, yitingRefine: 忆庭精炼API,
        image: {
          普通接口, 场景接口, NSFW接口, 词组转化器API,
          promptTokenizerSystemPrompt, enablePromptTokenizer, useSeparateSceneApi,
          enableNsfwImageGeneration, narrativeParser: parserApi, narrativeImage: imageApi,
        },
      },
    },
    appearance: { theme, visualTextSettings: settings.visualTextSettings },
    content: { promptModules: settings.promptModules, stPresetsV2: settings.stPresetsV2 ?? [], imageRules: rules, worldbooks: [] },
    save: { autosaveOnTurn: settings.enableAutoSaveEveryTurn },
    story: {
      news, phone, zhiku, storyWeaving, memory,
      image: { ...storyImage, narrativeImage },
      enableMaleNsfwArchive: settings.enableMaleNsfwArchive,
      extraFeatures: settings.额外功能,
      starMap: settings.星轨航图系统,
    },
  };
}

export function composeSettings(planes: DevicePreferencePlanes & { story: StoryPolicy }): 游戏设置 {
  const execution = planes.execution;
  const routes = execution.routes;
  const story = planes.story;
  const { narrativeImage, ...storyImage } = story.image;
  const { narrativeParser, narrativeImage: narrativeImageApi, ...imageRoutes } = routes.image;
  return {
    wordCountTarget: execution.wordCountTarget, narrativePerson: execution.narrativePerson,
    enableTavernKeeperPersona: execution.enableTavernKeeperPersona, enableActionOptions: execution.enableActionOptions,
    enableMemoryInjection: execution.enableMemoryInjection, enableWorldEvents: execution.enableWorldEvents,
    enableWorldbookInjection: execution.enableWorldbookInjection, enableInnerVoice: execution.enableInnerVoice,
    enableStreaming: execution.enableStreaming, devMode: execution.devMode, enableClaudeMode: execution.enableClaudeMode,
    deepSeekMainMode: execution.deepSeekMainMode, backgroundTaskMode: execution.backgroundTaskMode,
    enableCacheDiagnostics: execution.enableCacheDiagnostics, enableVariableUpdate: execution.enableVariableUpdate,
    新闻系统: { ...story.news, api: routes.news }, 手机系统: { ...story.phone, api: routes.phone },
    智库系统: { ...story.zhiku, api: routes.zhiku },
    剧情编织系统: { ...story.storyWeaving, api: routes.storyWeaving },
    记忆系统: { ...story.memory, 记忆总结API: routes.memorySummary, 忆庭召回API: routes.yitingRecall, 忆庭精炼API: routes.yitingRefine },
    文生图系统: {
      ...storyImage, ...imageRoutes, rules: planes.content.imageRules,
      正文生图: { ...narrativeImage, parserApi: narrativeParser, imageApi: narrativeImageApi },
    },
    variableApi: routes.variable, variableUpdateRequireConfirm: execution.variableUpdateRequireConfirm,
    promptModules: [...planes.content.promptModules], macroGlobalVars: { ...execution.macroGlobalVars },
    stPresetsV2: [...planes.content.stPresetsV2], currentStPresetIdV2: execution.currentStPresetIdV2,
    currentStCharacterId: execution.currentStCharacterId, cotLanguage: execution.cotLanguage,
    enableCotFakeHistory: execution.enableCotFakeHistory, autoRetryOnError: execution.autoRetryOnError,
    autoRetryCount: execution.autoRetryCount, enableAutoSaveEveryTurn: planes.save.autosaveOnTurn,
    visualTextSettings: planes.appearance.visualTextSettings, enableNsfw: execution.enableNsfw,
    enableMaleNsfwArchive: story.enableMaleNsfwArchive, enableNoControl: execution.enableNoControl,
    enablePlayerSpeechExpansion: execution.enablePlayerSpeechExpansion,
    额外功能: story.extraFeatures, 星轨航图系统: story.starMap,
  };
}
