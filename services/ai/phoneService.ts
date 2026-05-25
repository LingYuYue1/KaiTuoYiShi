import type { API配置项, API设置, 游戏设置 } from '@/models/settings';
import type { 角色数据结构 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import type { 记忆系统 } from '@/models/memory';
import type { 忆庭系统 } from '@/models/yiting';
import type { 手机会话, 手机联系人, 主动来信种子 } from '@/models/phone';
import type { NPC记录 } from '@/models/npc';
import { 提取NPC同行记忆文本列表 } from '@/models/npc';
import type { 新闻条目 } from '@/models/news';
import { PHONE_COT_PROMPT } from '@/prompts/cot/phoneCot';
import { PHONE_WORLD_BOOK_PROMPT } from '@/data/phoneWorldbook';
import { chatCompletionNonStream } from './chatCompletionClient';
import { withRetries } from '@/services/ai/retry';

export interface 手机回复上下文 {
  traveler: 角色数据结构;
  world: 世界状态;
  memory: 记忆系统;
  yiting: 忆庭系统;
  npcRecords: NPC记录[];
  news: 新闻条目[];
  turnCount: number;
  chat: 手机会话;
  contact?: 手机联系人;
  userText?: string;
  seed?: 主动来信种子;
}

export interface 手机回复结果 {
  messages: string[];
  summary?: string;
  message?: string;
}

export function buildPhoneApiConfig(settings: 游戏设置, apiSettings: API设置): API配置项 | null {
  const mainConfig = apiSettings.configs.find((c) => c.id === apiSettings.activeConfigId) ?? apiSettings.configs[0] ?? null;
  const phoneApi = settings.手机系统.api;
  const phoneFieldsEmpty = !phoneApi.baseUrl.trim() && !phoneApi.apiKey.trim() && !phoneApi.model.trim();
  const provider = phoneFieldsEmpty ? mainConfig?.provider : phoneApi.provider || mainConfig?.provider;
  const baseUrl = phoneApi.baseUrl.trim() || mainConfig?.baseUrl || '';
  const apiKey = phoneApi.apiKey.trim() || mainConfig?.apiKey || '';
  const model = phoneApi.model.trim() || mainConfig?.model || '';

  if (!provider || !baseUrl || !apiKey || !model) return null;

  return {
    id: '__phone_runtime__',
    name: '手机系统',
    provider,
    baseUrl,
    apiKey,
    model,
    maxTokens: phoneApi.maxTokens ?? mainConfig?.maxTokens ?? 900,
    temperature: phoneApi.temperature ?? mainConfig?.temperature ?? 0.75,
    retryCount: phoneApi.retryCount ?? mainConfig?.retryCount ?? 2,
    createdAt: 0,
    updatedAt: Date.now(),
  };
}

export async function generatePhoneReply(
  config: API配置项,
  ctx: 手机回复上下文,
  retryCount = 2,
): Promise<手机回复结果> {
  const systemPrompt = buildPhoneSystemPrompt(ctx);
  const messages = buildPhoneMessages(ctx);
  const messageLimit = ctx.chat.type === 'group' ? 15 : 6;
  const raw = await withRetries(
    () =>
      chatCompletionNonStream(config, {
        systemPrompt,
        messages,
        maxTokens: config.maxTokens ?? 1200,
        temperature: config.temperature ?? 0.75,
      }),
    { retries: retryCount, label: '手机系统' },
  );
  return parsePhoneReply(raw, messageLimit);
}

function buildPhoneSystemPrompt(ctx: 手机回复上下文): string {
  const targetName = ctx.contact?.name ?? ctx.chat.title;
  const chatType = ctx.chat.type === 'group' ? '群聊' : ctx.chat.type === 'system' ? '系统通知' : '私聊';
  return [
    '你是「开拓轶事」手机系统的独立短讯生成器，只负责生成手机通讯内容。',
    '你不是主剧情叙述者，不要推进现场战斗，不要输出正文标签，不要输出思维链，不要把回复写成长篇小说。',
    `当前会话类型：${chatType}。目标对象/频道：${targetName}。`,
    '手机系统专属世界书：',
    PHONE_WORLD_BOOK_PROMPT,
    '手机系统专属思维链（仅内化，不输出）：',
    PHONE_COT_PROMPT,
    '写法要求：',
    ctx.chat.type === 'group'
      ? [
          '- 群聊一次输出总条数 6-15 条，不要让所有人都说话。',
          '- 每个角色本轮回复条目可为 0-6 条，先判断谁需要说话，再决定每个人说几条。',
          '- 群聊内容要像真实多人聊天，保持不同角色的短句交错与节奏，不要写成长篇小说。',
        ].join('\n')
      : [
          '- 一次回复生成 3-6 条短讯，像真实聊天连续弹出。',
          '- 每条尽量短，优先 8-45 个中文字符；最多不要超过两三句。',
          '- 私聊要像真实聊天，不要写成长篇小说段落。',
        ].join('\n'),
    '- 群聊和私聊的判定方式不同，群聊必须先筛选发言者，再安排每个人的回复数量。',
    '- 如果是主动来信，要承接种子里的事件原因，但不要编造主剧情没有发生的新结果。',
    '- 允许体现关系、担心、调侃、任务提醒或新闻反应；不要越权修改变量。',
    '- 手机聊天会写回记忆，所以内容要能被摘要，不要只剩空话或表情包式废句。',
    '严格输出 JSON，不要代码块，不要解释：',
    '{"messages":["短讯1","短讯2"],"summary":"一句话通讯摘要"}',
  ].join('\n');
}

function buildPhoneMessages(ctx: 手机回复上下文): Array<{ role: string; content: string }> {
  const memories = [
    ...ctx.memory.长期记忆.slice(-5).map((m) => `长期：${m}`),
    ...ctx.memory.短期记忆.slice(-8).map((m) => `短期：${m}`),
    ...ctx.memory.即时记忆.slice(-6).map((m) => `即时：${m}`),
    ...ctx.yiting.回忆档案.slice(-5).map((m) => `回忆档案：${m.名称 || `第${m.回合}回合`}｜${(m.摘要 || m.原文 || '').slice(0, 180)}`),
  ];
  const npc = ctx.contact?.npcId
    ? ctx.npcRecords.find((item) => item.id === ctx.contact?.npcId)
    : undefined;
  const npcLine = npc
    ? [
        `姓名：${npc.姓名}`,
        npc.别名 ? `别名：${npc.别名}` : '',
        `关系：${npc.关系}，好感度：${npc.好感度}`,
        npc.对玩家称呼 ? `对玩家称呼：${npc.对玩家称呼}` : '',
        npc.介绍 ? `介绍：${npc.介绍}` : '',
        提取NPC同行记忆文本列表(npc).length ? `同行记忆：${提取NPC同行记忆文本列表(npc).slice(-5).join('；')}` : '',
      ].filter(Boolean).join('\n')
    : '';

  const groupNpcLines =
    ctx.chat.type === 'group'
      ? ctx.chat.participantIds
          .map((participantId) =>
            ctx.npcRecords.find((item) => item.id === participantId || `npc_${item.id}` === participantId),
          )
          .filter((item): item is NPC记录 => Boolean(item))
          .map((item) =>
            [
              `- ${item.姓名}`,
              item.别名 ? `别名：${item.别名}` : '',
              `关系：${item.关系}，好感度：${item.好感度}`,
              item.性格 ? `性格：${item.性格}` : '',
              item.说话方式 ? `说话方式：${item.说话方式}` : '',
              提取NPC同行记忆文本列表(item).length ? `最近同行记忆：${提取NPC同行记忆文本列表(item).slice(-3).join('；')}` : '',
            ].filter(Boolean).join('；'),
          )
          .join('\n')
      : '';

  const recentNews = ctx.news
    .slice(-5)
    .map((item) => `- [${item.状态}] ${item.标题}${item.正文 ? `：${item.正文.slice(0, 120)}` : ''}`)
    .join('\n');

  const context = [
    `当前回合：${ctx.turnCount}`,
    `玩家：${ctx.traveler.姓名 || '开拓者'}`,
    `当前时间：${ctx.world.当前日期 || ctx.world.当前时间 || '未知'}`,
    `地点：${ctx.world.当前地点 || '未设定'}`,
    memories.length ? `近期记忆：\n${memories.join('\n')}` : '',
    npcLine ? `相关 NPC 档案：\n${npcLine}` : '',
    groupNpcLines ? `群聊参与者档案：\n${groupNpcLines}` : '',
    recentNews ? `近期新闻：\n${recentNews}` : '',
    ctx.seed
      ? `主动来信种子：\n标题：${ctx.seed.title}\n来源：${ctx.seed.source}/${ctx.seed.triggerType}\n优先级：${ctx.seed.priority}\n事件上下文：${ctx.seed.context}`
      : '',
  ].filter(Boolean).join('\n\n');

  const history = ctx.chat.messages.slice(-14).map((msg) => ({
    role: msg.role === 'player' ? 'user' : 'assistant',
    content: `${msg.senderName}：${msg.content}`,
  }));

  const prompt = ctx.seed
    ? '请根据主动来信种子生成第一条对方来信。'
    : `玩家刚发送：${ctx.userText || '（无）'}\n请生成对方回复。`;

  return [
    { role: 'user', content: `【上下文】\n${context}` },
    ...history,
    { role: 'user', content: prompt },
  ];
}

function parsePhoneReply(raw: string, messageLimit = 6): 手机回复结果 {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json|JSON)?\s*/, '')
    .replace(/```$/, '')
    .trim();
  const jsonText = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? cleaned;
  try {
    const parsed = JSON.parse(jsonText) as Partial<手机回复结果> & { messages?: unknown };
    const normalizedMessages = normalizePhoneMessages(parsed.messages, parsed.message, messageLimit);
    if (normalizedMessages.length) {
      return {
        messages: normalizedMessages,
        summary: typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 300) : undefined,
        message: normalizedMessages.join('\n'),
      };
    }
  } catch {
    // fall through
  }
  return {
    messages: fallbackPhoneMessages(cleaned, messageLimit),
    message: cleaned.replace(/^["']|["']$/g, '').trim().slice(0, 1600) || '（通讯信号短暂波动，对方没有留下可读消息。）',
  };
}

function normalizePhoneMessages(messages: unknown, singleMessage?: unknown, maxCount = 6): string[] {
  const rawList = Array.isArray(messages)
    ? messages
    : typeof singleMessage === 'string'
      ? [singleMessage]
      : [];
  const cleaned = rawList
    .map((item) => (typeof item === 'string' ? item : ''))
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, Math.max(1, maxCount));
  if (cleaned.length >= 3) return cleaned;
  if (cleaned.length > 0) {
    const expanded = cleaned.flatMap((line) =>
      line
        .split(/[\n。！？!?；;]+/)
        .map((part) => part.trim())
        .filter(Boolean),
    );
    const deduped = Array.from(new Set(expanded)).slice(0, Math.max(1, maxCount));
    if (deduped.length >= 3) return deduped;
    const source = deduped.length ? deduped : cleaned;
    if (source.length === 1 && source[0].length > 24) {
      return splitTextIntoChunks(source[0], Math.min(3, Math.max(1, maxCount))).slice(0, Math.max(1, maxCount));
    }
    if (source.length === 2) {
      const longerIndex = source[0].length >= source[1].length ? 0 : 1;
      const splitLonger = splitTextIntoChunks(source[longerIndex], 2);
      if (splitLonger.length >= 2) {
        return longerIndex === 0 ? [...splitLonger, source[1]].slice(0, 6) : [source[0], ...splitLonger].slice(0, 6);
      }
      return source;
    }
    if (source.length) return source;
  }
  return cleaned.slice(0, Math.max(1, maxCount));
}

function fallbackPhoneMessages(text: string, maxCount = 6): string[] {
  const base = text.replace(/^["']|["']$/g, '').trim();
  if (!base) return ['（通讯信号短暂波动，对方没有留下可读消息。）'];
  const parts = base
    .split(/[\n。！？!?；;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.length >= 3) return parts.slice(0, Math.max(1, maxCount));
  if (base.length > 48) return splitTextIntoChunks(base, Math.min(3, Math.max(1, maxCount))).slice(0, Math.max(1, maxCount));
  return [base.slice(0, 1600)];
}

function splitTextIntoChunks(text: string, targetChunks: number): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const safeChunks = Math.max(1, Math.min(6, targetChunks));
  const approxSize = Math.max(12, Math.ceil(clean.length / safeChunks));
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < clean.length) {
    const next = clean.slice(cursor, cursor + approxSize);
    chunks.push(next.trim());
    cursor += approxSize;
  }
  return chunks.filter(Boolean);
}
