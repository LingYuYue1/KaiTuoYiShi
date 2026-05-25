import type { API配置项, API设置, 游戏设置 } from '@/models/settings';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { withRetries } from '@/services/ai/retry';
import { 获取当前PNG画风预设, 获取当前模型规则集, 获取当前画师串预设, 获取当前规则模板 } from '@/utils/imagePromptRules';

export interface ImagePromptTokenizerInput {
  title: string;
  mode: string;
  sourceText: string;
  basePrompt: string;
  baseNegative: string;
  extraRequirement?: string;
}

export interface ImagePromptTokenizerResult {
  prompt: string;
  negative: string;
}

export function buildImagePromptTokenizerConfig(settings: 游戏设置, apiSettings: API设置): API配置项 | null {
  const mainConfig = apiSettings.configs.find((config) => config.id === apiSettings.activeConfigId) ?? apiSettings.configs[0] ?? null;
  if (!settings.文生图系统.enablePromptTokenizer || !mainConfig) return null;
  return {
    ...mainConfig,
    id: '__image_prompt_tokenizer__',
    name: '文生图词组转化器',
    maxTokens: Math.min(mainConfig.maxTokens ?? 1200, 1600),
    temperature: mainConfig.temperature ?? 0.45,
    retryCount: mainConfig.retryCount ?? 2,
    updatedAt: Date.now(),
  };
}

export function buildImagePromptTokenizerSystemPrompt(settings: 游戏设置, mode: string): string {
  const rules = settings.文生图系统.rules;
  const templateType = mode.includes('scene') || mode === 'phone_wallpaper' ? 'scene' : 'npc';
  const template = 获取当前规则模板(rules, templateType);
  const modelRule = 获取当前模型规则集(rules);
  const artist = 获取当前画师串预设(rules, templateType);
  const png = 获取当前PNG画风预设(rules, templateType);
  return [
    settings.文生图系统.promptTokenizerSystemPrompt,
    '',
    '# 当前生效规则模板',
    modelRule ? `模型规则集：${modelRule.名称}` : '模型规则集：未启用',
    modelRule?.模型专属提示词,
    modelRule?.锚定模式模型提示词,
    template ? `规则名称：${template.名称}` : '规则名称：未启用',
    template?.提示词,
    templateType === 'npc' ? template?.角色锚定模式提示词 : template?.场景角色锚定模式提示词,
    template?.无锚点回退提示词,
    template?.输出格式提示词,
    '',
    '# 当前风格预设',
    artist ? `画师串预设：${artist.名称}` : '画师串预设：未启用',
    artist?.画师串,
    artist?.正面提示词,
    artist?.负面提示词,
    png ? `PNG画风预设：${png.名称}` : 'PNG画风预设：未启用',
    png?.画师串,
    png?.正面提示词,
    png?.负面提示词,
    '',
    '# 通用规则',
    rules.hsrBaseStyle,
    rules.compositionRule,
    rules.hsrCharacterAnchorRule,
    rules.promptTokenizerOutputRule,
    rules.modelCompatibilityRule,
    rules.pngStyleRule,
    rules.nsfwIsolationRule,
  ].filter(Boolean).join('\n');
}

export async function tokenizeImagePrompt(
  config: API配置项,
  systemPrompt: string,
  input: ImagePromptTokenizerInput,
  retryCount = 2,
): Promise<ImagePromptTokenizerResult> {
  const raw = await withRetries(
    () =>
      chatCompletionNonStream(config, {
        systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              `任务：${input.title}`,
              `模式：${input.mode}`,
              input.extraRequirement ? `额外要求：${input.extraRequirement}` : '',
              '',
              '# 规则中心要求',
              '必须遵守当前生效的规则模板、构图、角色锚点、模型兼容、画师串、PNG画风、NSFW隔离与输出格式规则。',
              '',
              '# 来源档案',
              input.sourceText,
              '',
              '# 本地草稿 Prompt',
              input.basePrompt,
              '',
              '# 本地草稿 Negative Prompt',
              input.baseNegative,
              '',
              '请只输出 JSON：{"prompt":"...","negative":"..."}',
            ].filter(Boolean).join('\n'),
          },
        ],
        maxTokens: config.maxTokens ?? 1600,
        temperature: config.temperature ?? 0.45,
      }),
    { retries: retryCount, label: '文生图词组转化器' },
  );
  return parseTokenizerJson(raw, input.basePrompt, input.baseNegative);
}

function parseTokenizerJson(raw: string, fallbackPrompt: string, fallbackNegative: string): ImagePromptTokenizerResult {
  const text = raw.trim();
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  try {
    const parsed = JSON.parse(jsonText) as Partial<ImagePromptTokenizerResult>;
    return {
      prompt: String(parsed.prompt || fallbackPrompt).trim(),
      negative: String(parsed.negative || fallbackNegative).trim(),
    };
  } catch {
    return {
      prompt: fallbackPrompt,
      negative: fallbackNegative,
    };
  }
}
