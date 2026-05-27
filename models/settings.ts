export type AI提供商 = 'openai' | 'gemini' | 'claude' | 'deepseek' | 'openai_compatible';

import type { 提示词模块 } from './prompts';
import { createBuiltinPromptModules } from '@/data/builtinPromptModules';
import { 默认文生图规则中心, normalizeImageRules } from '@/utils/imagePromptRules';
import type { 剧情编织API覆盖 } from './storyWeaving';

export interface API配置项 {
  id: string;
  name: string;
  provider: AI提供商;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  retryCount?: number;
  createdAt: number;
  updatedAt: number;
}

export interface API设置 {
  activeConfigId: string | null;
  configs: API配置项[];
}

export function 创建空API设置(): API设置 {
  return { activeConfigId: null, configs: [] };
}

/** 变量模型独立 API 覆盖：任一字段留空都会回退到当前主 API 的同名字段。 */
export interface 变量API覆盖 {
  provider: AI提供商;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  retryCount?: number;
}

export function 创建空变量API覆盖(): 变量API覆盖 {
  return {
    provider: 'openai_compatible',
    baseUrl: '',
    apiKey: '',
    model: '',
    retryCount: 2,
  };
}

/** 新闻系统独立 API 覆盖：与变量系统完全分离。 */
export interface 新闻API覆盖 {
  provider: AI提供商;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  retryCount?: number;
}

/** 手机系统独立 API 覆盖：用于私聊、群聊、主动来信生成，留空字段回退主 API。 */
export interface 手机API覆盖 {
  provider: AI提供商;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  retryCount?: number;
}

export function 创建空手机API覆盖(): 手机API覆盖 {
  return {
    provider: 'openai_compatible',
    baseUrl: '',
    apiKey: '',
    model: '',
    retryCount: 2,
  };
}

export function 创建空新闻API覆盖(): 新闻API覆盖 {
  return {
    provider: 'openai_compatible',
    baseUrl: '',
    apiKey: '',
    model: '',
    retryCount: 2,
  };
}

/** 智库系统独立 API 覆盖：用于原著资料整理、条目匹配、摘要压缩，不与主剧情模型绑定。 */
export interface 智库API覆盖 {
  provider: AI提供商;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  retryCount?: number;
}

export function 创建空智库API覆盖(): 智库API覆盖 {
  return {
    provider: 'openai_compatible',
    baseUrl: '',
    apiKey: '',
    model: '',
    retryCount: 2,
  };
}

export type 剧情编织API覆盖设置 = 剧情编织API覆盖;

export function 创建空剧情编织API覆盖(): 剧情编织API覆盖设置 {
  return {
    provider: 'openai_compatible',
    baseUrl: '',
    apiKey: '',
    model: '',
    retryCount: 2,
  };
}

/** 忆庭独立 API 覆盖：用于回忆库检索或精炼，留空字段回退主 API。 */
export interface 忆庭API覆盖 {
  provider: AI提供商 | '';
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  retryCount?: number;
}

export function 创建空忆庭API覆盖(): 忆庭API覆盖 {
  return {
    provider: 'openai_compatible',
    baseUrl: '',
    apiKey: '',
    model: '',
    retryCount: 2,
  };
}

export type 原著约束强度 = 'loose' | 'standard' | 'strict';

export interface 游戏设置 {
  wordCountTarget: number;
  narrativePerson: 'first' | 'second' | 'third';
  enableTavernKeeperPersona: boolean;
  enableActionOptions: boolean;
  enableMemoryInjection: boolean;
  enableWorldEvents: boolean;
  enableWorldbookInjection: boolean;
  enableInnerVoice: boolean;
  enableStreaming: boolean;
  /** 开发者模式：开启后向 AI 注入提示词，AI 会把玩家消息视作开发者测试指令并尽量配合。 */
  devMode: boolean;
  /** 变量自动更新：主模型回完正文后，调用变量模型分析正文并落地变量命令。 */
  enableVariableUpdate: boolean;
  /** 星际和平周报：独立新闻演进系统，和变量系统分离。 */
  新闻系统: 星际和平周报设置;
  /** 手机系统：独立通讯终端，负责私聊、群聊与主动来信。 */
  手机系统: 手机系统设置;
  /** 智库系统：原著资料库、检索与联动服务，使用独立 API。 */
  智库系统: 智库系统设置;
  /** 剧情编织：玩家导入自定义剧情文本，经 AI 分解后以滑窗注入主剧情。 */
  剧情编织系统: 剧情编织系统设置;
  /** 文生图：普通图片、场景图和 NSFW 图片的生成接口配置。 */
  文生图系统: 文生图系统设置;
  /** 记忆系统管理：即时/短期/长期与 NPC 同行记忆的压缩规则。 */
  记忆系统: 记忆系统设置;
  /** 变量模型 API 覆盖：可独立填 baseUrl/apiKey/model，留空字段会回退到主 API。 */
  variableApi: 变量API覆盖;
  /** 应用变量命令前是否需要玩家在面板中手动确认（默认 false，直接落地）。 */
  variableUpdateRequireConfirm: boolean;
  /** @deprecated 用 promptModules 替代。保留字段用于旧存档迁移。 */
  customPrompt: string;
  /** 内置 + 玩家自定义的提示词模块。所有 enabled 模块都恒注入主流程 system prompt。 */
  promptModules: 提示词模块[];
  /** CoT 伪装历史消息注入：在 `user:开始任务` 之后注入一条伪装 assistant 历史消息，用于强化思考段输出习惯。 */
  enableCotFakeHistory: boolean;
  /** 标签修复：在解析 AI 回复前，自动修复常见标签错误（重复开标签、缺失闭标签等）。 */
  enableTagRepair: boolean;
  /** 生成失败自动重试：API 报错或解析失败时自动重试，不弹错误确认弹窗。 */
  autoRetryOnError: boolean;
  /** 自动重试次数上限。 */
  autoRetryCount: number;
  /** 每回合结束自动存档：正文落地与后台队列收尾时都会写入最近自动存档。 */
  enableAutoSaveEveryTurn: boolean;
  /** NSFW 模式：开启后注入独立 NSFW 提示词模块，并允许成人确认后的私密档案写入。 */
  enableNsfw: boolean;
  /** 男性 NSFW 档案：默认关闭。关闭时变量模型不得写入男性身体档案和男性私密字段。 */
  enableMaleNsfwArchive: boolean;
  /** 防止抢话（NoControl）：开启后注入「角色边界」提示词模块，禁止 AI 代写玩家言行与正文内选项菜单。 */
  enableNoControl: boolean;
}

export interface 记忆系统设置 {
  即时转短期阈值: number;
  短期转长期阈值: number;
  NPC记忆压缩阈值: number;
  /** 记忆总结 API：用于即时/短期压缩，留空时回退主 API。 */
  记忆总结API: 忆庭API覆盖;
  /** 忆庭召回总开关：仅控制是否检索并注入回忆档案，入库始终执行。 */
  忆庭启用: boolean;
  忆庭召回最早触发回合: number;
  即时转短期提示词: string;
  短期转长期提示词: string;
  NPC记忆压缩提示词: string;
  忆庭召回API: 忆庭API覆盖;
  忆庭精炼API: 忆庭API覆盖;
  忆庭召回条数: number;
  忆庭召回提示词: string;
  忆庭精炼提示词: string;
  忆庭独立精炼: boolean;
}

export interface 星际和平周报设置 {
  enabled: boolean;
  autoGenerate: boolean;
  api: 新闻API覆盖;
  maxNewEntriesPerTurn: number;
  /** 自动生成间隔：每 N 回合触发一次。新闻模型会读取这段窗口内的近期上下文。 */
  generateIntervalTurns: number;
}

export interface 手机系统设置 {
  enabled: boolean;
  api: 手机API覆盖;
  autoGenerateSeeds: boolean;
  maxSeedsPerTurn: number;
  contactCooldownTurns: number;
  groupCooldownTurns: number;
  privateArchiveThreshold: number;
  groupArchiveThreshold: number;
}

export interface 智库系统设置 {
  enabled: boolean;
  api: 智库API覆盖;
  原著约束: 原著约束强度;
  maxRelatedEntries: number;
  autoSummarizeOnImport: boolean;
}

export interface 剧情编织系统设置 {
  enabled: boolean;
  api: 剧情编织API覆盖设置;
  chaptersPerSegment: number;
  currentWindow: boolean;
}

export type 文生图响应格式 = 'url' | 'b64_json' | 'dataUrl';
export type 文生图默认风格 = 'hsr' | 'anime' | 'realistic' | 'custom';
export type 文生图后端类型 = 'openai_compatible' | 'novelai' | 'sd_webui' | 'comfyui';
export type 文生图接口路径模式 = 'preset' | 'custom';
export type 自动生图场景构图 = '纯场景' | '故事快照' | '剧照';
export type 自动NPC生图构图 = '头像' | '半身' | '立绘';
export type 自动NPC生图性别筛选 = '全部' | '男' | '女';
export type 文生图规则模板类型 = 'npc' | 'scene' | 'scene_judge';
export type 画师串预设适用范围 = 'npc' | 'scene' | 'all';
export type PNG画风预设来源 = 'novelai' | 'sd_webui' | 'comfyui' | 'unknown';
export type 文生图预设接口路径 =
  | 'openai_images'
  | 'novelai_generate'
  | 'sd_txt2img'
  | 'comfyui_prompt';
export type NovelAI采样器 = 'k_euler' | 'k_euler_ancestral' | 'k_dpmpp_2m' | 'k_dpmpp_2s_ancestral' | 'k_dpmpp_sde' | 'k_dpmpp_2m_sde';
export type NovelAI噪点表 = 'native' | 'karras' | 'exponential' | 'polyexponential';

export interface 文生图API配置 {
  enabled: boolean;
  backend: 文生图后端类型;
  baseUrl: string;
  apiKey: string;
  model: string;
  pathMode: 文生图接口路径模式;
  presetPath: 文生图预设接口路径;
  customPath: string;
  responseFormat: 文生图响应格式;
  defaultSize: string;
  defaultStyle: 文生图默认风格;
  customStyle: string;
  steps: number;
  cfgScale: number;
  seed: number;
  sampler: NovelAI采样器;
  noiseSchedule: NovelAI噪点表;
  useDefaultComfyWorkflow: boolean;
  comfyWorkflowJson: string;
  negativePrompt: string;
  retryCount: number;
}

export interface 文生图规则中心设置 {
  画师串预设列表: 文生图画师串预设[];
  当前NPC画师串预设ID: string;
  当前场景画师串预设ID: string;
  PNG画风预设列表: 文生图PNG画风预设[];
  当前NPCPNG画风预设ID: string;
  当前场景PNG画风预设ID: string;
  模型词组转化器预设列表: 文生图模型规则集[];
  词组转化器提示词预设列表: 文生图规则模板[];
  当前NPC词组转化器提示词预设ID: string;
  当前场景词组转化器提示词预设ID: string;
  当前场景判定提示词预设ID: string;
  hsrBaseStyle: string;
  compositionRule: string;
  hsrCharacterAnchorRule: string;
  promptTokenizerOutputRule: string;
  modelCompatibilityRule: string;
  artistPresetPositive: string;
  artistPresetNegative: string;
  pngStyleRule: string;
  avatarRule: string;
  portraitRule: string;
  sceneRule: string;
  sceneCharacterRule: string;
  phoneWallpaperRule: string;
  itemIconRule: string;
  itemDisplayRule: string;
  nsfwRule: string;
  nsfwPartRule: string;
  nsfwIsolationRule: string;
  commonNegative: string;
  nsfwNegative: string;
  sizePresetRule: string;
  autoQueueRule: string;
  profileRule: string;
}

export interface 文生图画师串预设 {
  id: string;
  名称: string;
  适用范围: 画师串预设适用范围;
  画师串: string;
  正面提示词: string;
  负面提示词: string;
  createdAt: number;
  updatedAt: number;
}

export interface 文生图PNG画风预设 {
  id: string;
  名称: string;
  来源: PNG画风预设来源;
  画师串: string;
  正面提示词: string;
  负面提示词: string;
  原始正面提示词?: string;
  原始负面提示词?: string;
  参数?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface 文生图模型规则集 {
  id: string;
  名称: string;
  模型专属提示词: string;
  锚定模式模型提示词?: string;
  是否启用: boolean;
  NPC词组转化器提示词预设ID: string;
  场景词组转化器提示词预设ID: string;
  场景判定提示词预设ID: string;
  createdAt: number;
  updatedAt: number;
}

export interface 文生图规则模板 {
  id: string;
  名称: string;
  类型: 文生图规则模板类型;
  提示词: string;
  角色锚定模式提示词?: string;
  场景角色锚定模式提示词?: string;
  无锚点回退提示词?: string;
  输出格式提示词?: string;
  createdAt: number;
  updatedAt: number;
}

export interface 文生图系统设置 {
  enabled: boolean;
  普通接口: 文生图API配置;
  场景接口: 文生图API配置;
  useSeparateSceneApi: boolean;
  NSFW接口: 文生图API配置;
  enableNsfwImageGeneration: boolean;
  enablePromptTokenizer: boolean;
  promptTokenizerSystemPrompt: string;
  rules: 文生图规则中心设置;
  enableAutoSceneGeneration: boolean;
  autoSceneIntervalTurns: number;
  autoSceneComposition: 自动生图场景构图;
  autoSceneSize: string;
  enableAutoNpcGeneration: boolean;
  autoNpcGenderFilter: 自动NPC生图性别筛选;
  autoNpcImportantOnly: boolean;
  autoNpcComposition: 自动NPC生图构图;
  autoNpcSize: string;
  enableAutoItemGeneration: boolean;
  autoItemSize: string;
}

export function 创建默认文生图API配置(): 文生图API配置 {
  return {
    enabled: false,
    backend: 'openai_compatible',
    baseUrl: '',
    apiKey: '',
    model: '',
    pathMode: 'preset',
    presetPath: 'openai_images',
    customPath: '',
    responseFormat: 'url',
    defaultSize: '1024x1024',
    defaultStyle: 'hsr',
    customStyle: '',
    steps: 28,
    cfgScale: 7,
    seed: -1,
    sampler: 'k_euler_ancestral',
    noiseSchedule: 'karras',
    useDefaultComfyWorkflow: true,
    comfyWorkflowJson: '',
    negativePrompt: '',
    retryCount: 2,
  };
}

export function 创建默认文生图系统设置(): 文生图系统设置 {
  return {
    enabled: false,
    普通接口: 创建默认文生图API配置(),
    场景接口: 创建默认文生图API配置(),
    useSeparateSceneApi: false,
    NSFW接口: {
      ...创建默认文生图API配置(),
      backend: 'comfyui',
      responseFormat: 'url',
      defaultStyle: 'anime',
    },
    enableNsfwImageGeneration: false,
    enablePromptTokenizer: true,
    promptTokenizerSystemPrompt: [
      '你是「开拓轶事」的图片提示词转化器。',
      '请把角色档案、场景摘要或 NSFW 档案转化为适合图片生成模型的提示词。',
      '必须优先保留可视觉化信息：外貌、发型、服饰、材质、配色、姿态、表情、镜头、光线、环境、崩坏：星穹铁道式科幻奇幻质感。',
      '不要把剧情解释、心理分析、抽象情绪塞进提示词；需要情绪时转成可见表情、动作和环境反馈。',
      '普通生图不得包含成人内容；NSFW 生图必须只在 NSFW 接口启用时使用，并严格依据对应性别与部位档案生成。',
    ].join('\n'),
    rules: 默认文生图规则中心,
    enableAutoSceneGeneration: false,
    autoSceneIntervalTurns: 5,
    autoSceneComposition: '故事快照',
    autoSceneSize: '1280x720',
    enableAutoNpcGeneration: false,
    autoNpcGenderFilter: '全部',
    autoNpcImportantOnly: true,
    autoNpcComposition: '头像',
    autoNpcSize: '1024x1024',
    enableAutoItemGeneration: false,
    autoItemSize: '1024x1024',
  };
}

export function 归一化文生图API配置(input?: Partial<文生图API配置>): 文生图API配置 {
  const defaults = 创建默认文生图API配置();
  if (!input) return defaults;
  return {
    ...defaults,
    ...input,
    enabled: input.enabled === true,
    backend: input.backend ?? defaults.backend,
    responseFormat: input.responseFormat ?? defaults.responseFormat,
    defaultSize: String(input.defaultSize || defaults.defaultSize),
    defaultStyle: input.defaultStyle ?? defaults.defaultStyle,
    pathMode: input.pathMode === 'custom' ? 'custom' : 'preset',
    presetPath: input.presetPath ?? defaults.presetPath,
    customPath: String(input.customPath ?? defaults.customPath),
    steps: Math.max(1, Math.min(80, Math.trunc(Number(input.steps ?? defaults.steps) || defaults.steps))),
    cfgScale: Math.max(0, Math.min(30, Number(input.cfgScale ?? defaults.cfgScale) || defaults.cfgScale)),
    seed: Number.isFinite(Number(input.seed)) ? Math.trunc(Number(input.seed)) : defaults.seed,
    sampler: input.sampler ?? defaults.sampler,
    noiseSchedule: input.noiseSchedule ?? defaults.noiseSchedule,
    useDefaultComfyWorkflow: input.useDefaultComfyWorkflow !== false,
    comfyWorkflowJson: String(input.comfyWorkflowJson ?? ''),
    negativePrompt: String(input.negativePrompt ?? ''),
    retryCount: Math.max(0, Math.trunc(Number(input.retryCount ?? defaults.retryCount) || 0)),
  };
}

export function 归一化文生图系统设置(input?: Partial<文生图系统设置>): 文生图系统设置 {
  const defaults = 创建默认文生图系统设置();
  if (!input) return defaults;
  return {
    ...defaults,
    ...input,
    enabled: input.enabled === true,
    普通接口: 归一化文生图API配置(input.普通接口),
    场景接口: 归一化文生图API配置(input.场景接口),
    useSeparateSceneApi: input.useSeparateSceneApi === true,
    NSFW接口: {
      ...归一化文生图API配置(defaults.NSFW接口),
      ...(input.NSFW接口 ? 归一化文生图API配置(input.NSFW接口) : {}),
    },
    enableNsfwImageGeneration: input.enableNsfwImageGeneration === true,
    enablePromptTokenizer: input.enablePromptTokenizer !== false,
    promptTokenizerSystemPrompt: String(input.promptTokenizerSystemPrompt ?? defaults.promptTokenizerSystemPrompt),
    rules: normalizeImageRules(input.rules),
    enableAutoSceneGeneration: input.enableAutoSceneGeneration === true,
    autoSceneIntervalTurns: Math.max(1, Math.min(20, Math.trunc(Number(input.autoSceneIntervalTurns ?? defaults.autoSceneIntervalTurns) || defaults.autoSceneIntervalTurns))),
    autoSceneComposition: input.autoSceneComposition ?? defaults.autoSceneComposition,
    autoSceneSize: String(input.autoSceneSize || defaults.autoSceneSize),
    enableAutoNpcGeneration: input.enableAutoNpcGeneration === true,
    autoNpcGenderFilter: input.autoNpcGenderFilter ?? defaults.autoNpcGenderFilter,
    autoNpcImportantOnly: input.autoNpcImportantOnly !== false,
    autoNpcComposition: input.autoNpcComposition ?? defaults.autoNpcComposition,
    autoNpcSize: String(input.autoNpcSize || defaults.autoNpcSize),
    enableAutoItemGeneration: false,
    autoItemSize: String(input.autoItemSize || defaults.autoItemSize),
  };
}

export function 创建默认记忆系统设置(): 记忆系统设置 {
  return {
    即时转短期阈值: 25,
    短期转长期阈值: 40,
    NPC记忆压缩阈值: 15,
    记忆总结API: {
      provider: '',
      baseUrl: '',
      apiKey: '',
      model: '',
      retryCount: 2,
    },
    忆庭启用: true,
    忆庭召回最早触发回合: 10,
    即时转短期提示词: [
      '你是叙事游戏的记忆整理器。请把本批「即时记忆」压缩为适合放入「短期记忆」的摘要。',
      '即时记忆是每回合刚发生的原始记录，可能重复、琐碎或含有未定细节。请合并同类事件，保留最近剧情推进、玩家明确选择、重要对话、获得/失去的物品、状态变化、NPC 态度变化、地点与当前目标。',
      '不要写成流水账，不要保留无意义寒暄，不要添加原文没有的信息。输出 3-6 条要点，每条包含「谁/在哪里/做了什么/造成什么变化」，必要时标明未解决的悬念或待办。',
    ].join('\n'),
    短期转长期提示词: [
      '你是叙事游戏的长期记忆管理员。请把多条「短期记忆」压缩为稳定、可长期注入 AI 上下文的「长期记忆」。',
      '长期记忆只保留不应被遗忘的事实：主线转折、已确认设定、玩家身份与能力变化、重要承诺、组织关系、关键 NPC 关系、不可逆后果、长期目标和反复出现的伏笔。',
      '请删除一次性场景细节、重复描述、临时情绪和已经解决的小事件。输出 4-8 条结构化要点，优先写清「事实」「影响」「后续牵引」。不要改写成小说段落，也不要添加没有依据的新设定。',
    ].join('\n'),
    NPC记忆压缩提示词: [
      '你是伙伴系统的同行记忆整理器。请把某一名 NPC 的「与你同行的记忆」压缩为更凝练但有情感连续性的记录。',
      '必须保留：玩家与该 NPC 的初遇/关键共同经历、称呼变化、约定与亏欠、信任或冲突的原因、好感变化依据、对玩家的独特看法、正在等待兑现的承诺，以及会影响之后互动的私人细节。',
      '删除重复寒暄和纯场景描写。输出 3-6 条要点，每条尽量说明「事件 -> NPC 对玩家的认知/关系影响」。不要把其他 NPC 的记忆混进来，不要让关系突然跳变。',
    ].join('\n'),
    忆庭召回API: 创建空忆庭API覆盖(),
    忆庭精炼API: 创建空忆庭API覆盖(),
    忆庭召回条数: 8,
    忆庭独立精炼: false,
    忆庭召回提示词: [
      '你是「忆庭」的回忆检索器。你的任务不是写正文，而是根据玩家当前输入，从回忆库中筛出最相关的回忆档案，供主剧情继续承接。',
      '检索时优先按“时间最近 + 语义最相关”排序。优先匹配：人物、地点、目标、未结事项、冲突对象、承诺、伤势、物品、战斗后果、组织态度、命途变化、正在延续的事件线。',
      '回忆库中的摘要是主要检索材料。遇到多条近似回忆时，优先保留更近、更完整、和当前问题直接相关的条目；不要让措辞华丽或篇幅更长的条目压过真正的承接回忆。',
      '请严格区分强回忆与弱回忆：强回忆是会直接影响当前回合理解、推进行动、人物判断或结果处置的记忆；弱回忆只是背景补充，可以概括带过。',
      '如果同一事件存在连续链条、同一对象多轮互动、同一任务或约定的多个关键节点、或多段冲突与后果串联，请优先把这些条目归入强回忆，必要时可返回 3-6 条甚至更多，只要它们都真正相关。',
      '不要为了精简而漏掉仍在生效的关键前因、承诺、旧伤、旧账、未结事项、上一轮明确结论或会直接改变当前态度的证据。',
      '若回忆条目带有“精炼纪要”或长期纪要标记，请视为跨回合整合后的有效回忆来源；只要内容命中当前输入，就要正常参与强弱判断。',
      '严格只输出两行，不要输出解释、标题、推理过程或多余文本：',
      '强回忆：【回忆序号】|【回忆序号】',
      '弱回忆：【回忆序号】|【回忆序号】',
      '若某类为空，写“无”，例如：强回忆:无',
    ].join('\n'),
    忆庭精炼提示词: [
      '你是「忆庭」的回忆精炼器。你的任务是把多条回合原文压成一份可检索、可回看的历史纪要，而不是写新剧情。',
      '输出必须固定分成三段：<<<TIME>>>、<<<SUMMARY>>>、<<<BODY>>>。TIME 只写一个最早到最晚的时间范围，不要解释。',
      'SUMMARY 只写 3-6 条短句，每条一行，以 - 开头，尽量保持“时间，人物/地点/行动/结果”的索引格式。这里是后续检索的核心，所以要短、准、具体，不能写成长段叙述；每条尽量包含人物、地点、行动、结果、未结事项中的至少三项。',
      'BODY 是备用详细纪要，不是原文层；系统会自行保存真实原文。BODY 可以比 SUMMARY 稍微展开，但只补充已发生事实，不新增事件，不改变因果，不把摘要改写成小说。',
      '必须保留：人物关系变化、称呼变化、关键承诺、重要物品得失、战斗或伤势、未结任务、剧情转折、以及会影响后续选择的事实。',
      '删除重复寒暄、纯氛围描写、已经解决的小细节、以及与当前回忆链无关的噪音。',
    ].join('\n'),
  };
}

export function 创建默认星际和平周报设置(): 星际和平周报设置 {
  return {
    enabled: true,
    autoGenerate: true,
    api: 创建空新闻API覆盖(),
    maxNewEntriesPerTurn: 3,
    generateIntervalTurns: 5,
  };
}

export function 创建默认手机系统设置(): 手机系统设置 {
  return {
    enabled: true,
    api: 创建空手机API覆盖(),
    autoGenerateSeeds: true,
    maxSeedsPerTurn: 2,
    contactCooldownTurns: 3,
    groupCooldownTurns: 5,
    privateArchiveThreshold: 8,
    groupArchiveThreshold: 12,
  };
}

export function 创建默认智库系统设置(): 智库系统设置 {
  return {
    enabled: true,
    api: 创建空智库API覆盖(),
    原著约束: 'standard',
    maxRelatedEntries: 6,
    autoSummarizeOnImport: true,
  };
}

export function 创建默认剧情编织系统设置(): 剧情编织系统设置 {
  return {
    enabled: true,
    api: 创建空剧情编织API覆盖(),
    chaptersPerSegment: 1,
    currentWindow: true,
  };
}

export function 归一化星际和平周报设置(input?: Partial<星际和平周报设置>): 星际和平周报设置 {
  const defaults = 创建默认星际和平周报设置();
  if (!input) return defaults;
  return {
    ...defaults,
    ...input,
    maxNewEntriesPerTurn: Math.max(1, Math.min(5, Math.trunc(Number(input.maxNewEntriesPerTurn ?? defaults.maxNewEntriesPerTurn)) || defaults.maxNewEntriesPerTurn)),
    generateIntervalTurns: Math.max(5, Math.min(10, Math.trunc(Number(input.generateIntervalTurns ?? defaults.generateIntervalTurns)) || defaults.generateIntervalTurns)),
    api: {
      ...defaults.api,
      ...(input.api ?? {}),
      retryCount: Math.max(0, Math.trunc(Number(input.api?.retryCount ?? defaults.api.retryCount ?? 2)) || 0),
    },
  };
}

export function 归一化手机系统设置(input?: Partial<手机系统设置>): 手机系统设置 {
  const defaults = 创建默认手机系统设置();
  if (!input) return defaults;
  return {
    ...defaults,
    ...input,
    api: {
      ...defaults.api,
      ...(input.api ?? {}),
      retryCount: Math.max(0, Math.trunc(Number(input.api?.retryCount ?? defaults.api.retryCount ?? 2)) || 0),
    },
    maxSeedsPerTurn: Math.max(0, Math.trunc(Number(input.maxSeedsPerTurn ?? defaults.maxSeedsPerTurn))),
    contactCooldownTurns: Math.max(0, Math.trunc(Number(input.contactCooldownTurns ?? defaults.contactCooldownTurns))),
    groupCooldownTurns: Math.max(0, Math.trunc(Number(input.groupCooldownTurns ?? defaults.groupCooldownTurns))),
    privateArchiveThreshold: Math.max(3, Math.trunc(Number(input.privateArchiveThreshold ?? defaults.privateArchiveThreshold))),
    groupArchiveThreshold: Math.max(6, Math.trunc(Number(input.groupArchiveThreshold ?? defaults.groupArchiveThreshold))),
  };
}

export function 归一化智库系统设置(input?: Partial<智库系统设置>): 智库系统设置 {
  const defaults = 创建默认智库系统设置();
  if (!input) return defaults;
  return {
    ...defaults,
    ...input,
    api: {
      ...defaults.api,
      ...(input.api ?? {}),
      retryCount: Math.max(0, Math.trunc(Number(input.api?.retryCount ?? defaults.api.retryCount ?? 2)) || 0),
    },
    maxRelatedEntries: Math.max(1, Number(input.maxRelatedEntries ?? defaults.maxRelatedEntries) || defaults.maxRelatedEntries),
  };
}

export function 归一化剧情编织系统设置(input?: Partial<剧情编织系统设置>): 剧情编织系统设置 {
  const defaults = 创建默认剧情编织系统设置();
  if (!input) return defaults;
  return {
    ...defaults,
    ...input,
    api: {
      ...defaults.api,
      ...(input.api ?? {}),
      retryCount: Math.max(0, Math.trunc(Number(input.api?.retryCount ?? defaults.api.retryCount ?? 2)) || 0),
    },
    chaptersPerSegment: Math.max(1, Math.trunc(Number(input.chaptersPerSegment ?? defaults.chaptersPerSegment) || 1)),
    currentWindow: input.currentWindow !== false,
  };
}

const 旧版默认记忆系统提示词 = {
  即时转短期提示词: '请把本批即时记忆整理成 1-2 条客观摘要，只保留发生了什么，不写感受。',
  短期转长期提示词: '请把多条短期记忆归纳为更稳定的长期记忆，保留关系、转折和不可逆事实。',
  NPC记忆压缩提示词: '请把与你同行的记忆整理得更凝练，保留称呼、约定、关系变化和关键事件。',
};

export function 归一化记忆系统设置(input?: Partial<记忆系统设置>): 记忆系统设置 {
  const defaults = 创建默认记忆系统设置();
  if (!input) return defaults;

  const merged: 记忆系统设置 = {
    ...defaults,
    ...input,
    记忆总结API: {
      ...defaults.记忆总结API,
      ...(input.记忆总结API ?? {}),
      retryCount: Math.max(0, Math.trunc(Number(input.记忆总结API?.retryCount ?? defaults.记忆总结API.retryCount ?? 2)) || 0),
    },
    忆庭召回API: {
      ...defaults.忆庭召回API,
      ...(input.忆庭召回API ?? {}),
      retryCount: Math.max(0, Math.trunc(Number(input.忆庭召回API?.retryCount ?? defaults.忆庭召回API.retryCount ?? 2)) || 0),
    },
    忆庭精炼API: {
      ...defaults.忆庭精炼API,
      ...(input.忆庭精炼API ?? {}),
      retryCount: Math.max(0, Math.trunc(Number(input.忆庭精炼API?.retryCount ?? defaults.忆庭精炼API.retryCount ?? 2)) || 0),
    },
    忆庭召回条数: Math.max(1, Number(input.忆庭召回条数 ?? defaults.忆庭召回条数) || defaults.忆庭召回条数),
    忆庭独立精炼: input.忆庭独立精炼 === true,
    忆庭启用: input.忆庭启用 !== false,
    忆庭召回最早触发回合: Math.max(
      1,
      Math.trunc(Number(input.忆庭召回最早触发回合 ?? defaults.忆庭召回最早触发回合) || defaults.忆庭召回最早触发回合),
    ),
  };
  const 使用旧版默认提示词 =
    !input.即时转短期提示词 ||
    (
      input.即时转短期提示词 === 旧版默认记忆系统提示词.即时转短期提示词 &&
      input.短期转长期提示词 === 旧版默认记忆系统提示词.短期转长期提示词 &&
      input.NPC记忆压缩提示词 === 旧版默认记忆系统提示词.NPC记忆压缩提示词
    );

  if (使用旧版默认提示词) {
    return {
      ...defaults,
      即时转短期阈值: input.即时转短期阈值 === 10 ? defaults.即时转短期阈值 : merged.即时转短期阈值,
      短期转长期阈值: input.短期转长期阈值 === 10 ? defaults.短期转长期阈值 : merged.短期转长期阈值,
      NPC记忆压缩阈值: input.NPC记忆压缩阈值 === 10 ? defaults.NPC记忆压缩阈值 : merged.NPC记忆压缩阈值,
      记忆总结API: merged.记忆总结API,
      忆庭召回最早触发回合: merged.忆庭召回最早触发回合,
      忆庭召回API: merged.忆庭召回API,
      忆庭精炼API: merged.忆庭精炼API,
      忆庭召回条数: merged.忆庭召回条数,
      忆庭独立精炼: merged.忆庭独立精炼,
      忆庭启用: merged.忆庭启用,
    };
  }

  return merged;
}

export function 创建默认游戏设置(): 游戏设置 {
  return {
    wordCountTarget: 500,
    narrativePerson: 'second',
    enableTavernKeeperPersona: true,
    enableActionOptions: false,
    enableMemoryInjection: true,
    enableWorldEvents: true,
    enableWorldbookInjection: true,
    enableInnerVoice: true,
    enableStreaming: true,
    devMode: false,
    enableVariableUpdate: false,
    新闻系统: 创建默认星际和平周报设置(),
    手机系统: 创建默认手机系统设置(),
    智库系统: 创建默认智库系统设置(),
    剧情编织系统: 创建默认剧情编织系统设置(),
    文生图系统: 创建默认文生图系统设置(),
    记忆系统: 创建默认记忆系统设置(),
    variableApi: 创建空变量API覆盖(),
    variableUpdateRequireConfirm: false,
    customPrompt: '',
    promptModules: createBuiltinPromptModules(),
    enableCotFakeHistory: true,
    enableTagRepair: true,
    autoRetryOnError: true,
    autoRetryCount: 2,
    enableAutoSaveEveryTurn: true,
    enableNsfw: false,
    enableMaleNsfwArchive: false,
    enableNoControl: true,
  };
}

export type 主题预设 = 'deepspace' | 'morningInk';
export type 存档类型 = 'manual' | 'auto' | 'backup' | 'imported';

export interface 存档数据 {
  id: number;
  type: 存档类型;
  timestamp: number;
  旅人: import('./character').角色数据结构;
  世界: import('./world').世界状态;
  chatHistory: import('./chat').聊天消息[];
  记忆: import('./memory').记忆系统;
  忆庭?: import('./yiting').忆庭系统;               // 可选：兼容旧存档（忆庭系统独立化）
  智库?: import('./zhiku').智库系统;                // 可选：兼容旧存档（智库资料库）
  手机?: import('./phone').手机系统;               // 可选：兼容旧存档（手机系统）
  NPC?: import('./npc').NPC记录[];                 // 可选：兼容旧存档（v1 加入）
  相册?: import('./imageGeneration').相册系统;      // 可选：图片资产、挂载与生成任务
  /** @deprecated 旧独立战斗系统字段。当前版本不再读取或写入，仅允许旧存档携带后被忽略。 */
  战斗?: unknown;
  新闻?: import('./news').新闻条目[];               // 可选：兼容旧存档（v1 加入）
  剧情?: import('./plot').剧情节点[];                // 可选：兼容旧存档（v1 加入）
  剧情编织?: import('./storyWeaving').剧情编织系统;   // 可选：自定义剧情编织系统
  /** @deprecated 旧独立阵营系统字段。当前版本不再读取或写入，仅允许旧存档携带后被忽略。 */
  阵营?: unknown;
  variableBatches?: import('./variableCommand').变量命令批次[]; // 可选：兼容旧存档（v1 加入）
  queueTasks?: import('./queueTask').队列任务记录[]; // 可选：后台队列展示记录
  gameSettings: 游戏设置;
  apiSettings: API设置;
  theme: 主题预设;
}
