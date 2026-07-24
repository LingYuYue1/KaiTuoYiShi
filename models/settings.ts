export type AI提供商 = 'openai' | 'gemini' | 'claude' | 'claude_compatible' | 'deepseek' | 'baidu' | 'opencode' | 'mimo' | 'ark' | 'openai_compatible';

import type { 提示词模块 } from './prompts';
import { createBuiltinPromptModules } from '@/data/builtinPromptModules';
import { 默认文生图规则中心, normalizeImageRules } from '@/utils/imagePromptRules';
import type { 剧情编织API覆盖 } from './storyWeaving';
import type { STWorldInfoEntry, STPresetEntry, STSamplingParams, STPresetEntryV2, TavernPostProcessMode } from './stTypes';

export interface API配置项 {
  id: string;
  name: string;
  provider: AI提供商;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  /** 核采样概率阈值（0-1）。仅 OpenAI 兼容 / DeepSeek / Claude / Gemini 支持。 */
  topP?: number;
  /** 保留概率最高的前 K 个候选词。仅 Gemini 原生支持。 */
  topK?: number;
  /** 动态阈值采样（基于相对概率）。当前无 provider 实际消费，预留字段。 */
  topA?: number;
  /** 丢弃概率低于「最高概率 × min_p」的词（0-1）。当前无 provider 实际消费，预留字段。 */
  minP?: number;
  /** 重复惩罚系数（1=不生效，>1 惩罚）。OpenAI 兼容 / DeepSeek / Gemini 支持。 */
  repetitionPenalty?: number;
  /** 按 token 出现次数线性惩罚（-2 到 2）。OpenAI 兼容 / DeepSeek / Gemini 支持。 */
  frequencyPenalty?: number;
  /** 只要出现过就惩罚（-2 到 2）。OpenAI 兼容 / DeepSeek / Gemini 支持。 */
  presencePenalty?: number;
  /** 最大上下文窗口（tokens）。各 provider 均支持。 */
  maxContext?: number;
  retryCount?: number;
  enableClaudeMode?: boolean;
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

/** 文生图词组转化器 API 覆盖：用于角色锚点/档案到图片 prompt 的文本整理，留空字段回退主 API。 */
export interface 文生图词组转化器API覆盖 {
  provider: AI提供商 | '';
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  retryCount?: number;
}

export function 创建空文生图词组转化器API覆盖(): 文生图词组转化器API覆盖 {
  return {
    provider: '',
    baseUrl: '',
    apiKey: '',
    model: '',
    maxTokens: 1600,
    temperature: 0.45,
    retryCount: 2,
  };
}

export type 原著约束强度 = 'loose' | 'standard' | 'strict';
export type DeepSeek主剧情模式 = 'off' | 'standard' | 'lock_format';
export type 后台任务模式 = 'sequential' | 'parallel';

export interface VisualTextSettings {
  narrationFontSize: number;
  dialogueFontSize: number;
  playerFontSize: number;
}

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
  enableClaudeMode: boolean;
  /** DeepSeek 主剧情专用模式：只在主 API 是 DeepSeek 时生效，用于降低续聊污染、reasoning 泄漏和格式漂移。 */
  deepSeekMainMode: DeepSeek主剧情模式;
  /** 后台任务执行模式：主剧情与变量落库之后，控制新闻、忆庭入库、手机种子和正文插图的收尾顺序。 */
  backgroundTaskMode: 后台任务模式;
  /** 缓存前缀诊断：开启后在响应详情中记录本回合请求与上一回合请求的前缀变化位置。 */
  enableCacheDiagnostics: boolean;
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
  /** 记忆系统管理：即时/短期/中期/长期与 NPC 同行记忆的压缩规则。 */
  记忆系统: 记忆系统设置;
  /** 变量模型 API 覆盖：可独立填 baseUrl/apiKey/model，留空字段会回退到主 API。 */
  variableApi: 变量API覆盖;
  /** 应用变量命令前是否需要玩家在面板中手动确认（默认 false，直接落地）。 */
  variableUpdateRequireConfirm: boolean;
  /** @deprecated 用 promptModules 替代。保留字段用于旧存档迁移。 */
  customPrompt: string;
  /** 内置 + 玩家自定义的提示词模块。所有 enabled 模块都恒注入主流程 system prompt。 */
  promptModules: 提示词模块[];
  /** ST 预设兼容：宏变量持久化。跨回合保留的全局变量。 */
  macroGlobalVars?: Record<string, string>;
  /** ST 预设兼容：已保存的预设库。玩家可导入多套预设，通过下拉切换。 */
  stPresets?: STPresetEntry[];
  /** ST 预设兼容：当前激活的预设 id。null=未激活任何预设。 */
  currentStPresetId?: string | null;
  /** ST 预设兼容：总开关。关闭后所有 st_import_* 模块不注入 systemPrompt，但保留预设库数据。 */
  enableStPreset?: boolean;
  /** ST 预设参数同步：激活带 samplingParams 的预设前，当前 API 采样参数的原始备份。
   *  切回无参数预设/null 时按此值恢复。null=当前无预设覆盖参数。 */
  stPresetApiBackup?: STSamplingParams | null;
  /** 提示词模块 order 版本号（用于旧存档迁移）。
   *  - 0/缺省：旧版 order 区间（内置 5-90 + ST 50+，会冲突）
   *  - 1：方案 A 三层 order 区间（Tier 1: 1-99 / Tier 2: 100-999 ST / Tier 3: 1000+ 压轴） */
  promptModuleOrderVersion?: number;
  /** ST 预设兼容：V1 预设迁移/旧存档保留的世界书条目。V2 预设的 world_info 保存在 stPresetsV2[].preset 中。 */
  stWorldInfos?: STWorldInfoEntry[];
  /** 世界书条目触发状态表（Phase 7.1 升级，随存档持久化）。
   *  key = 条目 id，value = 最近触发回合（messageCount 值）。
   *  用于世界书条目的 delay / cooldown 判断。 */
  worldbookTriggerStates?: Record<string, number>;

  // === 新增：保留式 ST 预设字段 ===

  /** ST 预设兼容 V2：保留原始结构的预设列表 */
  stPresetsV2?: STPresetEntryV2[];

  /** ST 预设兼容 V2：当前激活的预设 id */
  currentStPresetIdV2?: string | null;

  /** ST 预设兼容 V2：当前选中的 prompt_order.character_id 顺序槽位，不代表本项目角色卡。 */
  currentStCharacterId?: number | null;

  /** ST 预设兼容 V2：消息角色后处理模式 */
  stPostProcessMode?: TavernPostProcessMode;

  // === 保留但标记废弃的旧字段 ===

  /** @deprecated V1 转译式预设列表，迁移后不再使用 */
  // stPresets?: STPresetEntry[];

  /** @deprecated V1 当前激活预设 id */
  // currentStPresetId?: string | null;  // 复用此字段，迁移后指向 V2 条目

  /** @deprecated V1 总开关，V2 复用 */
  // enableStPreset?: boolean;

  /** @deprecated V1 采样参数备份，V2 复用 */
  // stPresetApiBackup?: STSamplingParams | null;
  /** 思维链输出语言（参考 Izumi，P2 可选）。
   *  - 'zh'（默认）：中文思考段
   *  - 其他值：在主剧情思维链末尾追加"请用 X 语言输出 <think> 思考段"提示
   *  可选值：'zh' / 'en' / 'ja' / 'fr' / 'ru' / 'de' / 'es' / 'it' */
  cotLanguage?: 'zh' | 'en' | 'ja' | 'fr' | 'ru' | 'de' | 'es' | 'it';
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
  visualTextSettings: VisualTextSettings;
  /** NSFW 模式：开启后注入独立 NSFW 提示词模块，并允许成人确认后的私密档案写入。 */
  enableNsfw: boolean;
  /** 男性 NSFW 档案：默认关闭。关闭时变量模型不得写入男性身体档案和男性私密字段。 */
  enableMaleNsfwArchive: boolean;
  /** 防止抢话（NoControl）：开启后注入「角色边界」提示词模块，禁止 AI 代写玩家言行与正文内选项菜单。 */
  enableNoControl: boolean;
  /** 抢话模式：开启后注入「适度代写玩家对白」模块，允许 AI 少量扩写玩家话语；与 enableNoControl 互斥。 */
  enablePlayerSpeechExpansion: boolean;
  /** 额外功能：用于承载不属于核心叙事/API/系统面板的小型修复与玩法增强。 */
  额外功能: 额外功能设置;
}

export interface 污染词清理设置 {
  enabled: boolean;
  words: string[];
}

/** 标签块隐藏设置：用于隐藏 ST 预设中的"注入+清理"配对标签块（如抗空回的 <Q>...</WF>、抗截断的 <math>...</math>）。
 *  这些标签块让 AI 生成特定内容起作用，但显示给玩家前需要整段移除，否则污染正文格式。 */
export interface 标签块隐藏设置 {
  enabled: boolean;
}

export interface 额外功能设置 {
  污染词清理: 污染词清理设置;
  标签块隐藏: 标签块隐藏设置;
}

export interface 记忆系统设置 {
  即时转短期阈值: number;
  短期转中期阈值: number;
  中期转长期阈值: number;
  /** @deprecated 旧版字段。新版本使用 短期转中期阈值 / 中期转长期阈值。 */
  短期转长期阈值: number;
  NPC记忆压缩阈值: number;
  /** 记忆总结 API：用于即时/短期压缩，留空时回退主 API。 */
  记忆总结API: 忆庭API覆盖;
  /** 忆庭召回总开关：仅控制是否检索并注入回忆档案，入库始终执行。 */
  忆庭启用: boolean;
  忆庭召回最早触发回合: number;
  即时转短期提示词: string;
  短期转中期提示词: string;
  中期转长期提示词: string;
  /** @deprecated 旧版字段。新版本使用 短期转中期提示词 / 中期转长期提示词。 */
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
  详细画风预设列表: 文生图详细画风预设[];
  当前NPC详细画风预设ID: string;
  当前场景详细画风预设ID: string;
  质量增强预设列表: 文生图质量增强预设[];
  当前质量增强预设ID: string;
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

export interface 文生图详细画风预设 {
  id: string;
  名称: string;
  适用范围: 画师串预设适用范围;
  风格定位: string;
  构图镜头: string;
  光影色彩: string;
  材质细节: string;
  正面提示词: string;
  负面提示词: string;
  createdAt: number;
  updatedAt: number;
}

export interface 文生图质量增强预设 {
  id: string;
  名称: string;
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

export interface 正文生图解析API配置 {
  provider: AI提供商 | '';
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  retryCount?: number;
}

export interface 正文生图设置 {
  /** 总开关 */
  enabled: boolean;
  /** 模式：自动每回合触发 / 手动按钮触发 */
  mode: 'auto' | 'manual';
  /** 玩家出镜：关闭 / 正文在场时自动 / 强制尽量出镜 */
  playerAppearanceMode: 'off' | 'auto' | 'force';
  /** @deprecated 正文生图固定为故事快照，仅保留字段兼容旧存档。 */
  preference: 'scene_only' | 'character_only' | 'both';
  /** 生成时机：立即阻塞 / 回合内排队 / 纯异步 */
  timing: 'immediate' | 'queue_current' | 'queue_async';
  /** 提示词解析模型 API 配置（独立，不走主剧情模型） */
  parserApi: 正文生图解析API配置;
  /** 生图接口 API 配置 */
  imageApi: 文生图API配置;
}

export const 参考图注入选择加入版本 = 1;

export interface 文生图参考图设置 {
  /** 总开关：关闭时参考图只作为相册素材保存，不参与生成。 */
  enabled: boolean;
  /** 玩家已在对应版本明确选择是否启用；缺失时按关闭迁移一次。 */
  injectionOptInVersion: number;
  /** SD WebUI 启用参考图时走 img2img，值越高越接近文字提示，越低越贴近参考图。 */
  sdWebuiDenoisingStrength: number;
  /** ComfyUI 需要工作流显式接收参考图占位符，默认不开启以免误导。 */
  enableComfyWorkflowReference: boolean;
  /** OpenAI 兼容图片接口各中转差异很大，默认仅保存和提示，不自动传图。 */
  enableOpenAICompatibleReference: boolean;
  /** NovelAI 参考图能力接口差异较大，默认仅保存和提示，不自动传图。 */
  enableNovelAIReference: boolean;
}

export interface 文生图系统设置 {
  enabled: boolean;
  普通接口: 文生图API配置;
  场景接口: 文生图API配置;
  useSeparateSceneApi: boolean;
  NSFW接口: 文生图API配置;
  enableNsfwImageGeneration: boolean;
  enablePromptTokenizer: boolean;
  词组转化器API: 文生图词组转化器API覆盖;
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
  /** 正文生图：在剧情正文中插入 AI 生成的场景/角色插图 */
  正文生图: 正文生图设置;
  /** 参考图：玩家手动开启后，按后端能力把相册参考图传入生成流程。 */
  参考图: 文生图参考图设置;
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
    词组转化器API: 创建空文生图词组转化器API覆盖(),
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
    正文生图: 创建默认正文生图设置(),
    参考图: 创建默认文生图参考图设置(),
  };
}

export function 创建默认文生图参考图设置(): 文生图参考图设置 {
  return {
    enabled: false,
    injectionOptInVersion: 参考图注入选择加入版本,
    sdWebuiDenoisingStrength: 0.55,
    enableComfyWorkflowReference: false,
    enableOpenAICompatibleReference: false,
    enableNovelAIReference: false,
  };
}

export function 创建默认正文生图设置(): 正文生图设置 {
  return {
    enabled: false,
    mode: 'auto',
    playerAppearanceMode: 'auto',
    preference: 'both',
    timing: 'queue_current',
    parserApi: {
      provider: '',
      baseUrl: '',
      apiKey: '',
      model: '',
      maxTokens: 1600,
      temperature: 0.3,
      retryCount: 1,
    },
    imageApi: 创建默认文生图API配置(),
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
    词组转化器API: {
      ...创建空文生图词组转化器API覆盖(),
      ...(input.词组转化器API ?? {}),
      retryCount: Math.max(0, Math.trunc(Number(input.词组转化器API?.retryCount ?? defaults.词组转化器API.retryCount ?? 2)) || 0),
      maxTokens: Math.max(256, Math.trunc(Number(input.词组转化器API?.maxTokens ?? defaults.词组转化器API.maxTokens ?? 1600)) || 1600),
      temperature: Number.isFinite(Number(input.词组转化器API?.temperature ?? defaults.词组转化器API.temperature))
        ? Number(input.词组转化器API?.temperature ?? defaults.词组转化器API.temperature)
        : defaults.词组转化器API.temperature,
    },
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
    正文生图: 归一化正文生图设置(input.正文生图),
    参考图: 归一化文生图参考图设置(input.参考图),
  };
}

export function 归一化文生图参考图设置(input?: Partial<文生图参考图设置>): 文生图参考图设置 {
  const defaults = 创建默认文生图参考图设置();
  if (!input) return defaults;
  const inputOptInVersion = Math.max(0, Math.floor(Number(input.injectionOptInVersion) || 0));
  const hasCurrentOptIn = inputOptInVersion >= 参考图注入选择加入版本;
  return {
    enabled: hasCurrentOptIn && input.enabled === true,
    injectionOptInVersion: 参考图注入选择加入版本,
    sdWebuiDenoisingStrength: Math.max(0.05, Math.min(0.95, Number(input.sdWebuiDenoisingStrength ?? defaults.sdWebuiDenoisingStrength) || defaults.sdWebuiDenoisingStrength)),
    enableComfyWorkflowReference: input.enableComfyWorkflowReference === true,
    enableOpenAICompatibleReference: input.enableOpenAICompatibleReference === true,
    enableNovelAIReference: input.enableNovelAIReference === true,
  };
}

export function 归一化正文生图设置(input?: Partial<正文生图设置>): 正文生图设置 {
  const defaults = 创建默认正文生图设置();
  if (!input) return defaults;
  return {
    enabled: input.enabled === true,
    mode: input.mode === 'manual' ? 'manual' : 'auto',
    playerAppearanceMode: input.playerAppearanceMode === 'off' || input.playerAppearanceMode === 'force' ? input.playerAppearanceMode : 'auto',
    preference: input.preference ?? defaults.preference,
    timing: input.timing ?? defaults.timing,
    parserApi: {
      provider: (input.parserApi?.provider ?? ''),
      baseUrl: String(input.parserApi?.baseUrl ?? ''),
      apiKey: String(input.parserApi?.apiKey ?? ''),
      model: String(input.parserApi?.model ?? ''),
      maxTokens: Math.max(256, Math.trunc(Number(input.parserApi?.maxTokens ?? defaults.parserApi.maxTokens ?? 1600)) || 1600),
      temperature: Number.isFinite(Number(input.parserApi?.temperature))
        ? Number(input.parserApi?.temperature)
        : defaults.parserApi.temperature,
      retryCount: Math.max(0, Math.trunc(Number(input.parserApi?.retryCount ?? defaults.parserApi.retryCount ?? 1)) || 1),
    },
    imageApi: 归一化文生图API配置(input.imageApi),
  };
}

export function 创建默认记忆系统设置(): 记忆系统设置 {
  return {
    即时转短期阈值: 25,
    短期转中期阈值: 20,
    中期转长期阈值: 10,
    短期转长期阈值: 20,
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
      '原著角色的单回合沉默、紧张、冷淡、受伤、戒备或少话只能作为当时状态记录，不得压缩成长期人格；长期口吻与行为边界以智库人物主体资料为准。',
    ].join('\n'),
    短期转中期提示词: [
      '你是叙事游戏的阶段记忆管理员。请把多条「短期记忆」压缩为适合放入「中期记忆」的阶段摘要。',
      '中期记忆用于承接最近一段剧情链，而不是永久设定库。请保留任务进展、人物关系的近期变化、玩家明确选择、未解决事项、当前地点/目标、重要物品状态和下一步牵引。',
      '请合并重复内容，删除一次性氛围描写和已经无后续影响的小动作。输出 4-8 条要点，优先写清「事件」「影响」「仍需承接的问题」。',
      '原著角色的单回合沉默、紧张、冷淡、受伤、戒备或少话只能作为当时状态记录，不得压缩成长期人格；长期口吻与行为边界以智库人物主体资料为准。',
    ].join('\n'),
    中期转长期提示词: [
      '你是叙事游戏的长期记忆管理员。请把多条「中期记忆」压缩为稳定、可长期注入 AI 上下文的「长期记忆」。',
      '长期记忆只保留不应被遗忘的事实：主线转折、已确认设定、玩家身份与能力变化、重要承诺、组织关系、关键 NPC 关系、不可逆后果、长期目标和反复出现的伏笔。',
      '请删除一次性场景细节、重复描述、临时情绪和已经解决的小事件。输出 4-8 条结构化要点，优先写清「事实」「影响」「后续牵引」。不要改写成小说段落，也不要添加没有依据的新设定。',
      '不得把原著角色某几回合的临时沉默、紧张、冷淡、受伤或戒备归纳为长期性格改变；若确有关系变化，只写共同经历和当前关系事实。',
    ].join('\n'),
    短期转长期提示词: [
      '你是叙事游戏的长期记忆管理员。请把多条「中期记忆」压缩为稳定、可长期注入 AI 上下文的「长期记忆」。',
      '长期记忆只保留不应被遗忘的事实：主线转折、已确认设定、玩家身份与能力变化、重要承诺、组织关系、关键 NPC 关系、不可逆后果、长期目标和反复出现的伏笔。',
      '请删除一次性场景细节、重复描述、临时情绪和已经解决的小事件。输出 4-8 条结构化要点，优先写清「事实」「影响」「后续牵引」。不要改写成小说段落，也不要添加没有依据的新设定。',
      '不得把原著角色某几回合的临时沉默、紧张、冷淡、受伤或戒备归纳为长期性格改变；若确有关系变化，只写共同经历和当前关系事实。',
    ].join('\n'),
    NPC记忆压缩提示词: [
      '你负责将单个 NPC 的多条原始同行记忆压缩为一条「NPC总结记忆」。',
      '只写该 NPC 自身可知、可感知或可合理记住的事实，让记忆边界停留在该 NPC 的信息范围内；不要写入其他 NPC 才知道的想法、秘密或场外信息。',
      '只总结输入条目里反复出现、已经稳定、或对该 NPC 与玩家的关系/印象/立场/处境有持续影响的内容。优先保留初遇、关键共同经历、称呼变化、承诺与亏欠、信任或冲突原因、好感变化依据、对玩家的独特看法、等待兑现的约定和会影响之后互动的私人细节。',
      '允许概括趋势，但必须能从输入条目直接推出；不要扩写新事件，不要补不存在的动机，不要把关系突然推进或倒退。',
      '若该 NPC 是原著角色，不要把“本回合沉默/紧张/冷淡/受伤/戒备/少话”压缩为长期性格；长期人格、口吻和 OOC 边界以智库人物主体资料为准。',
      '输出必须是 1 段自然中文，不要分点，不要标签，不要代码块，不要前后缀。若输入整体没有稳定可沉淀内容，也输出一句极简事实概括，保持结果非空。字数建议 40-140 字。',
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
      '原著角色的长期人格不要由忆庭精炼改写；单回合沉默、紧张、冷淡、受伤、戒备或少话只能作为当时状态，不能被总结成“长期沉默寡言”等人格结论。',
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
    maxRelatedEntries: 5,
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
    maxRelatedEntries: Math.min(5, Math.max(1, Math.trunc(Number(input.maxRelatedEntries ?? defaults.maxRelatedEntries)) || defaults.maxRelatedEntries)),
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

const 旧版NPC默认记忆压缩提示词 = [
  '你是伙伴系统的同行记忆整理器。请把某一名 NPC 的「与你同行的记忆」压缩为更凝练但有情感连续性的记录。',
  '必须保留：玩家与该 NPC 的初遇/关键共同经历、称呼变化、约定与亏欠、信任或冲突的原因、好感变化依据、对玩家的独特看法、正在等待兑现的承诺，以及会影响之后互动的私人细节。',
  '删除重复寒暄和纯场景描写。输出 3-6 条要点，每条尽量说明「事件 -> NPC 对玩家的认知/关系影响」。不要把其他 NPC 的记忆混进来，不要让关系突然跳变。',
].join('\n');

export function 归一化记忆系统设置(input?: Partial<记忆系统设置>): 记忆系统设置 {
  const defaults = 创建默认记忆系统设置();
  if (!input) return defaults;
  const oldShortToLongThreshold = Number(input.短期转长期阈值);
  const shortToMiddleThreshold = Math.max(
    1,
    Math.trunc(Number(input.短期转中期阈值 ?? input.短期转长期阈值 ?? defaults.短期转中期阈值) || defaults.短期转中期阈值),
  );
  const middleToLongThreshold = Math.max(
    1,
    Math.trunc(Number(input.中期转长期阈值 ?? defaults.中期转长期阈值) || defaults.中期转长期阈值),
  );
  const shortToMiddlePrompt = input.短期转中期提示词 ?? defaults.短期转中期提示词;
  const middleToLongPrompt = input.中期转长期提示词 ?? input.短期转长期提示词 ?? defaults.中期转长期提示词;

  const merged: 记忆系统设置 = {
    ...defaults,
    ...input,
    短期转中期阈值: shortToMiddleThreshold,
    中期转长期阈值: middleToLongThreshold,
    短期转长期阈值: shortToMiddleThreshold,
    短期转中期提示词: shortToMiddlePrompt,
    中期转长期提示词: middleToLongPrompt,
    短期转长期提示词: middleToLongPrompt,
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
      短期转中期阈值: oldShortToLongThreshold === 10 ? defaults.短期转中期阈值 : merged.短期转中期阈值,
      中期转长期阈值: merged.中期转长期阈值,
      短期转长期阈值: oldShortToLongThreshold === 10 ? defaults.短期转长期阈值 : merged.短期转长期阈值,
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

  if (input.NPC记忆压缩提示词 === 旧版NPC默认记忆压缩提示词) {
    return {
      ...merged,
      NPC记忆压缩提示词: defaults.NPC记忆压缩提示词,
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
    enableClaudeMode: false,
    deepSeekMainMode: 'off',
    backgroundTaskMode: 'sequential',
    enableCacheDiagnostics: false,
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
    visualTextSettings: 创建默认视觉文本设置(),
    enableNsfw: false,
    enableMaleNsfwArchive: false,
    enableNoControl: true,
    enablePlayerSpeechExpansion: false,
    额外功能: 创建默认额外功能设置(),
    // ST 预设兼容相关字段（可选，这里显式列默认值保持风格一致）
    cotLanguage: 'zh',
    enableStPreset: true,
    stPresets: [],
    currentStPresetId: 'builtin_preset',
    promptModuleOrderVersion: 1,
    stWorldInfos: [],
    macroGlobalVars: {},
    worldbookTriggerStates: {},
    // === 新增：保留式 ST 预设默认值 ===
    stPresetsV2: [],
    currentStPresetIdV2: null,
    currentStCharacterId: null,
    stPostProcessMode: '未选择',
  };
}

export function 创建默认视觉文本设置(): VisualTextSettings {
  return {
    narrationFontSize: 15,
    dialogueFontSize: 15,
    playerFontSize: 14,
  };
}

export function 归一化视觉文本设置(input?: Partial<VisualTextSettings>): VisualTextSettings {
  const defaults = 创建默认视觉文本设置();
  const clamp = (value: unknown, fallback: number) => Math.max(13, Math.min(30, Math.trunc(Number(value) || fallback)));
  return {
    narrationFontSize: clamp(input?.narrationFontSize, defaults.narrationFontSize),
    dialogueFontSize: clamp(input?.dialogueFontSize, defaults.dialogueFontSize),
    playerFontSize: clamp(input?.playerFontSize, defaults.playerFontSize),
  };
}

export function 创建默认额外功能设置(): 额外功能设置 {
  return {
    污染词清理: {
      enabled: true,
      words: ['极其'],
    },
    标签块隐藏: {
      enabled: true,
    },
  };
}

export function 归一化额外功能设置(input?: Partial<额外功能设置>): 额外功能设置 {
  const defaults = 创建默认额外功能设置();
  const rawWords = input?.污染词清理?.words;
  const words = Array.isArray(rawWords)
    ? rawWords.map((word) => String(word || '').trim()).filter(Boolean)
    : defaults.污染词清理.words;
  return {
    ...defaults,
    ...input,
    污染词清理: {
      ...defaults.污染词清理,
      ...(input?.污染词清理 ?? {}),
      words: words.length ? Array.from(new Set(words)).slice(0, 50) : defaults.污染词清理.words,
    },
    标签块隐藏: {
      ...defaults.标签块隐藏,
      ...(input?.标签块隐藏 ?? {}),
    },
  };
}

export type 主题预设 = 'deepspace' | 'starOceanCyan';
export type 存档类型 = 'manual' | 'auto' | 'backup' | 'imported';

export interface 存档数据 {
  id: number;
  type: 存档类型;
  timestamp: number;
  /** 当前运行回合计数。旧存档没有该字段时，读档会按聊天记录兜底推算。 */
  turnCount?: number;
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
