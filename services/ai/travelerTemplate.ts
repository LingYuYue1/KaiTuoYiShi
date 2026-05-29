import type { API配置项 } from '@/models/settings';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';

export interface TravelerTemplateContext {
  storyModeName?: string;
  existingName?: string;
  existingAlias?: string;
  existingGender?: string;
  existingAge?: number;
  existingBirthday?: string;
  userPrompt?: string;
}

export interface TravelerTemplateDraft {
  name: string;
  alias: string;
  gender: string;
  age: number;
  birthday: string;
  appearance: string;
  personality: string;
  background: string;
}

export async function generateTravelerTemplate(
  config: API配置项,
  context: TravelerTemplateContext,
  signal?: AbortSignal,
): Promise<TravelerTemplateDraft> {
  const raw = await chatCompletionNonStream(config, {
    systemPrompt: buildTravelerTemplatePrompt(),
    messages: [{ role: 'user', content: buildTravelerTemplateUserMessage(context) }],
    maxTokens: Math.max(900, Math.min(1800, config.maxTokens ?? 1200)),
    temperature: config.temperature ?? 0.95,
    signal,
  });

  return normalizeTravelerTemplate(parseTravelerTemplateJson(raw), context);
}

function buildTravelerTemplatePrompt(): string {
  return [
    '你是《开拓轶事》的角色设定模板生成器。',
    '你的任务是为玩家生成一个适合崩坏：星穹铁道同人开局的原创旅人模板。',
    '',
    '硬性要求：',
    '- 只输出 JSON 对象，不要 Markdown，不要解释，不要额外文本。',
    '- 这是玩家可编辑草稿，不是剧情正文。',
    '- 不要让玩家取代星/穹，不要默认玩家是星穹列车既定成员。',
    '- 这是玩家主角模板，不是路人 NPC 模板；角色必须有清晰行动能力、开局动机和可参与危机的个人优势。',
    '- 不要生成过弱、无目标、只能被动等待救援的模板；也不要生成碾压原著主角或掌握完整真相的模板。',
    '- 背景要能合理切入黑塔空间站危机，但不要提前知道完整主线真相。',
    '- 如果用户提供了生成偏好，请优先贴合偏好里的身份、气质、能力方向、强度、关系钩子或禁忌项。',
    '- 外貌要具体可视化，包含发色/眼睛/体态/服装/标志物中的至少 4 项。',
    '- 性格要写可被剧情调用的行为倾向，不要只堆标签。',
    '- 背景要留有余地，方便玩家后续修改；不要写成封死全部过去的大纲。',
    '- 如果用户已有姓名、性别、年龄或生日，请尽量沿用这些锚点；空字段可以随机生成。',
    '',
    'JSON 字段固定为：',
    '{"name":"", "alias":"", "gender":"", "age":20, "birthday":"", "appearance":"", "personality":"", "background":""}',
  ].join('\n');
}

function buildTravelerTemplateUserMessage(context: TravelerTemplateContext): string {
  return [
    '请生成一份随机旅人角色模板。',
    '',
    `剧情模式：${context.storyModeName || '标准开拓'}`,
    `已有姓名：${context.existingName?.trim() || '未填写，可随机生成'}`,
    `已有别名：${context.existingAlias?.trim() || '未填写，可随机生成或留空'}`,
    `已有性别：${context.existingGender?.trim() || '未填写，可随机生成'}`,
    `已有年龄：${Number.isFinite(context.existingAge) ? context.existingAge : '未填写，可随机生成'}`,
    `已有生日：${context.existingBirthday?.trim() || '未填写，可随机生成'}`,
    `玩家生成偏好：${context.userPrompt?.trim() || '未填写，可自由发挥，但不要生成弱路人模板'}`,
    '',
    '请让模板具备：',
    '- 一个能进入黑塔空间站开局的身份动因。',
    '- 一个不抢原著主角位置的个人目标。',
    '- 1-2 个可被 NPC 互动承接的小缺点或习惯。',
    '- 一点星际旅行、组织委托、研究事故、命途回响或求援信号相关的钩子。',
  ].join('\n');
}

function parseTravelerTemplateJson(rawText: string): unknown {
  const text = rawText
    .replace(/```(?:json|JSON)?/g, '')
    .replace(/```/g, '')
    .trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const candidate = start >= 0 && end > start ? text.slice(start, end + 1) : text;
  return JSON.parse(candidate);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTravelerTemplate(raw: unknown, context: TravelerTemplateContext): TravelerTemplateDraft {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('模板生成结果不是 JSON 对象。');
  }
  const record = raw as Record<string, unknown>;
  const age = Number(record.age ?? record.年龄 ?? context.existingAge ?? 20);
  const normalized: TravelerTemplateDraft = {
    name: readString(record.name ?? record.姓名) || context.existingName?.trim() || '无名开拓者',
    alias: readString(record.alias ?? record.别名) || context.existingAlias?.trim() || '',
    gender: readString(record.gender ?? record.性别) || context.existingGender?.trim() || '',
    age: Number.isFinite(age) && age > 0 ? Math.min(120, Math.max(1, Math.trunc(age))) : 20,
    birthday: readString(record.birthday ?? record.生日) || context.existingBirthday?.trim() || '',
    appearance: readString(record.appearance ?? record.外貌),
    personality: readString(record.personality ?? record.性格),
    background: readString(record.background ?? record.背景),
  };

  if (!normalized.appearance || !normalized.personality || !normalized.background) {
    throw new Error('模板生成结果缺少外貌、性格或背景字段。');
  }

  return normalized;
}
