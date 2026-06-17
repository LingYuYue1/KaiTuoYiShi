import type { API配置项 } from '@/models/settings';
import type { NPC角色锚点档案 } from '@/models/npc';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { withRetries } from '@/services/ai/retry';

export interface CharacterAnchorExtractInput {
  name: string;
  kind: 'traveler' | 'npc';
  sourceText: string;
  requirement?: string;
}

const CHARACTER_ANCHOR_SYSTEM_PROMPT = `你是「开拓轶事」的角色视觉锚点提取模型。

你的任务是从旅人或 NPC 档案中提取“长期稳定外观锚点”，用于后续头像、立绘、场景图保持角色一致。

## 提取原则
- 只提取可视觉化、可长期复用的内容：年龄感、性别表现、体态、发型发色、眼睛、肤色、五官气质、常驻服装、材质、配饰、武器或身份道具。
- 不要把剧情经历、关系、心理、抽象性格、一次性动作或临时场景写成稳定锚点。
- 如果来源资料不足，允许做低冲突补全，但必须保守，不要重设计角色。
- 原著角色应保留可识别的官方设计倾向；原创角色应以档案文字为准。
- 正向提示词使用英文，适合图片生成模型读取。
- 负向提示词只写有助于稳定角色的排除项，不要写成人内容。
- 另外输出一段中文摘要，只用于玩家查看，不参与图片生成。

## 输出格式
只输出合法 JSON，不要 Markdown，不要解释：
{
  "name": "锚点名称",
  "positivePrompt": "英文正向提示词",
  "negativePrompt": "英文负向提示词",
  "chineseSummary": "中文锚点摘要，尽量简短，按发型、发色、眼睛、体态、服装、特征、注意事项的顺序写",
  "features": {
    "appearanceTags": ["外貌标签"],
    "bodyTags": ["身材标签"],
    "hairTags": ["发型/发色标签"],
    "eyeTags": ["眼睛标签"],
    "skinTags": ["肤色标签"],
    "ageTags": ["年龄感标签"],
    "outfitTags": ["服装基底标签"],
    "specialTags": ["特殊特征标签"]
  }
}`;

export async function extractCharacterAnchorWithAI(
  config: API配置项,
  input: CharacterAnchorExtractInput,
): Promise<NPC角色锚点档案> {
  if (!config.baseUrl.trim() || !config.apiKey.trim() || !config.model.trim()) {
    throw new Error('角色锚点提取模型未配置完整。');
  }

  const raw = await withRetries(
    () => chatCompletionNonStream(config, {
      systemPrompt: CHARACTER_ANCHOR_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            `对象类型：${input.kind === 'traveler' ? '旅人主控' : 'NPC伙伴'}`,
            `角色名称：${input.name}`,
            input.requirement?.trim() ? `额外提取要求：${input.requirement.trim()}` : '',
            '',
            '# 来源档案',
            input.sourceText,
            '',
            '请提取长期稳定外观锚点，并只输出 JSON。',
          ].filter(Boolean).join('\n'),
        },
      ],
      maxTokens: config.maxTokens ?? 1600,
      temperature: config.temperature ?? 0.35,
    }),
    { retries: config.retryCount ?? 1, label: '角色视觉锚点提取' },
  );

  const parsed = parseCharacterAnchorJson(raw);
  if (!parsed) throw new Error('角色锚点提取模型没有返回可用 JSON。');

  return {
    名称: parsed.name || input.name,
    是否启用: true,
    生成时默认附加: true,
    场景生图自动注入: true,
    正面提示词: parsed.positivePrompt,
    负面提示词: parsed.negativePrompt,
    中文摘要: parsed.chineseSummary || buildChineseSummary(parsed, input),
    结构化特征: {
      外貌标签: parsed.features.appearanceTags,
      身材标签: parsed.features.bodyTags,
      发型标签: parsed.features.hairTags,
      发色标签: parsed.features.hairTags,
      眼睛标签: parsed.features.eyeTags,
      肤色标签: parsed.features.skinTags,
      年龄感标签: parsed.features.ageTags,
      服装基底标签: parsed.features.outfitTags,
      特殊特征标签: parsed.features.specialTags,
    },
    来源: 'ai_extract',
    原始提取文本: input.sourceText,
    提取模型信息: `${config.name || '角色锚点提取模型'} / ${config.model}`,
  };
}

function parseCharacterAnchorJson(raw: string): {
  name: string;
  positivePrompt: string;
  negativePrompt: string;
  chineseSummary?: string;
  features: {
    appearanceTags?: string[];
    bodyTags?: string[];
    hairTags?: string[];
    eyeTags?: string[];
    skinTags?: string[];
    ageTags?: string[];
    outfitTags?: string[];
    specialTags?: string[];
  };
} | null {
  const text = raw.trim();
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  try {
    const data = JSON.parse(jsonText) as Record<string, unknown>;
    const positivePrompt = readString(data, 'positivePrompt', 'positive', 'prompt', '正面提示词');
    if (!positivePrompt) return null;
    const features = readObject(data, 'features', '结构化特征');
    return {
      name: readString(data, 'name', '名称'),
      positivePrompt,
      negativePrompt: readString(data, 'negativePrompt', 'negative', '负面提示词'),
      chineseSummary: readString(data, 'chineseSummary', '中文摘要'),
      features: {
        appearanceTags: readStringList(features, 'appearanceTags', '外貌标签'),
        bodyTags: readStringList(features, 'bodyTags', '身材标签'),
        hairTags: readStringList(features, 'hairTags', '发型标签', '发色标签'),
        eyeTags: readStringList(features, 'eyeTags', '眼睛标签'),
        skinTags: readStringList(features, 'skinTags', '肤色标签'),
        ageTags: readStringList(features, 'ageTags', '年龄感标签'),
        outfitTags: readStringList(features, 'outfitTags', '服装基底标签'),
        specialTags: readStringList(features, 'specialTags', '特殊特征标签'),
      },
    };
  } catch {
    return null;
  }
}

function buildChineseSummary(
  parsed: { name: string; positivePrompt: string; negativePrompt: string; features: { appearanceTags?: string[]; bodyTags?: string[]; hairTags?: string[]; eyeTags?: string[]; skinTags?: string[]; ageTags?: string[]; outfitTags?: string[]; specialTags?: string[] } },
  input: CharacterAnchorExtractInput,
): string {
  const parts = [
    parsed.name || input.name,
    parsed.features.hairTags?.length ? `发型/发色：${parsed.features.hairTags.slice(0, 3).join('、')}` : '',
    parsed.features.eyeTags?.length ? `眼睛：${parsed.features.eyeTags.slice(0, 2).join('、')}` : '',
    parsed.features.bodyTags?.length ? `体态：${parsed.features.bodyTags.slice(0, 2).join('、')}` : '',
    parsed.features.outfitTags?.length ? `服装：${parsed.features.outfitTags.slice(0, 3).join('、')}` : '',
    parsed.features.specialTags?.length ? `特征：${parsed.features.specialTags.slice(0, 3).join('、')}` : '',
  ].filter(Boolean);
  return parts.join('；');
}

function readObject(source: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  for (const key of keys) {
    const value = source[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  }
  return {};
}

function readString(source: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function readStringList(source: Record<string, unknown>, ...keys: string[]): string[] | undefined {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      const list = value.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 16);
      if (list.length) return list;
    }
    if (typeof value === 'string' && value.trim()) {
      const list = value.split(/[，,、\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 16);
      if (list.length) return list;
    }
  }
  return undefined;
}
