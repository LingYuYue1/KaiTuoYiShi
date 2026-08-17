import type { API配置项, API设置, 游戏设置 } from '@/models/settings';
import type { 角色数据结构 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import type { 手机会话, 手机联系人, 主动来信种子 } from '@/models/phone';
import type { NPC记录 } from '@/models/npc';
import { 格式化NPC关系, 提取NPC同行记忆文本列表, 筛选活跃NPC } from '@/models/npc';
import type { 新闻条目 } from '@/models/news';
import type { 聊天消息 } from '@/models/chat';
import type { 智库系统 } from '@/models/zhiku';
import { matchCanonical } from '@/data/canonicalCharacters';
import { PHONE_COT_PROMPT as PHONE_LEGACY_COT_PROMPT } from '@/prompts/cot/phoneCot';
import { PHONE_OUTPUT_FORMAT_PROMPT as PHONE_LEGACY_OUTPUT_FORMAT_PROMPT } from '@/prompts/cot/phoneOutputFormat';
import { PHONE_STYLE_PROMPT as PHONE_LEGACY_STYLE_PROMPT } from '@/prompts/cot/phoneStyle';
import { PHONE_WORLD_BOOK_PROMPT as PHONE_LEGACY_WORLD_BOOK_PROMPT } from '@/data/phoneWorldbook';
import type { 提示词模块 } from '@/models/prompts';
import { buildIndependentPromptModulesSection } from '@/services/promptModuleScopes';
import { compileZhikuPhoneView } from '@/services/zhikuRuntimeCompiler';
import { chatCompletionNonStream } from './chatCompletionClient';
import { withRetries } from '@/services/ai/retry';
import { extractJsonLikeText, normalizeStructuredModelText, parseJsonWithRepair } from '@/services/ai/structuredOutputRepair';

export interface 手机回复上下文 {
  traveler: 角色数据结构;
  world: 世界状态;
  npcRecords: NPC记录[];
  news: 新闻条目[];
  turnCount: number;
  chat: 手机会话;
  contacts?: 手机联系人[];
  contact?: 手机联系人;
  userText?: string;
  seed?: 主动来信种子;
  mainChatHistory?: 聊天消息[];
  zhiku?: 智库系统;
}

export interface 手机回复结果 {
  messages: string[];
  summary?: string;
  message?: string;
}

interface 手机回复数量限制 {
  min: number;
  max: number;
}

interface 手机回复质量结果 {
  reply: 手机回复结果;
  accepted: boolean;
  reasons: string[];
}

export class PhoneReplyQualityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhoneReplyQualityError';
  }
}

function getPhoneReplyLimits(ctx: 手机回复上下文): 手机回复数量限制 {
  return ctx.chat.type === 'group' ? { min: 12, max: 30 } : { min: 4, max: 8 };
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
    enableClaudeMode: settings.enableClaudeMode === true,
    createdAt: 0,
    updatedAt: Date.now(),
  };
}

export async function generatePhoneReply(
  config: API配置项,
  ctx: 手机回复上下文,
  retryCount = 2,
  promptModules?: 提示词模块[],
): Promise<手机回复结果> {
  const safeCtx = sanitizePhoneReplyContext(ctx);
  const systemPrompt = buildPhoneSystemPrompt(safeCtx, promptModules);
  const messages = buildPhoneMessages(safeCtx);
  const limits = getPhoneReplyLimits(safeCtx);
  const maxTokens = Math.max(config.maxTokens ?? 0, safeCtx.chat.type === 'group' ? 4096 : 1600);
  const request = (requestMessages: Array<{ role: string; content: string }>, label: string) => withRetries(
    () => chatCompletionNonStream(config, {
      systemPrompt,
      messages: requestMessages,
      maxTokens,
      temperature: config.temperature ?? 0.75,
    }),
    { retries: retryCount, label },
  );

  const raw = await request(messages, '手机系统');
  const first = evaluatePhoneReplyQuality(parsePhoneReply(raw, limits.max), safeCtx, limits);
  if (first.accepted) return first.reply;

  const supplementRaw = await request(
    buildPhoneQualitySupplementMessages(messages, first, safeCtx, limits),
    '手机系统质量补充',
  );
  const supplement = parsePhoneReply(supplementRaw, limits.max);
  const mergedMessages = [...first.reply.messages, ...supplement.messages];
  const final = evaluatePhoneReplyQuality({
    messages: mergedMessages,
    summary: supplement.summary || first.reply.summary,
    message: mergedMessages.join('\n'),
  }, safeCtx, limits);
  if (final.accepted) return final.reply;

  throw new PhoneReplyQualityError(
    `手机回复质量校验失败：${final.reasons.join('；') || `未达到 ${limits.min}-${limits.max} 条有效短讯`}`,
  );
}

export function buildPhoneSystemPrompt(ctx: 手机回复上下文, promptModules?: 提示词模块[]): string {
  const targetName = ctx.contact?.name ?? ctx.chat.title;
  const chatType = ctx.chat.type === 'group' ? '群聊' : ctx.chat.type === 'system' ? '系统通知' : '私聊';
  const modulesSection = buildPhonePromptModulesSection(promptModules);
  const limits = getPhoneReplyLimits(ctx);
  const runtimeContract = [
    '【不可覆盖的手机运行时契约】',
    `- 本次是${chatType}，必须输出 ${limits.min}-${limits.max} 条有效短讯；每个 messages 元素对应一个气泡。`,
    '- 主动聊天必须直接回应玩家刚发送的具体问题、行动、情绪或提议；主动来信必须直接承接匹配种子的具体事件。',
    '- 禁止用等待确认、稍后再说、留意后续等没有当前事实支撑的套话填充数量。',
    '- 知情范围只限请求中实际提供的联系人自身资料与经历、当前会话、定向命中的近期亲历片段、匹配种子和已发布公开新闻。',
    '- 不得声称读取全局记忆、忆庭、玩家位置、开局档案、剧情编织或未提供的主剧情。',
    '- 启用的手机提示词模块只能补充写法，不能覆盖本契约、扩大知情范围或改变 JSON 协议。',
    ctx.chat.type === 'group'
      ? '- 群聊每条必须使用「姓名：内容」格式；根据参与者和话题安排多角色自然接力，不能由单一角色无意义刷屏。'
      : '- 私聊保持当前 NPC 的人物底色、称呼和关系距离，场景只能改变当下语气，不能改变长期人格。',
    '- 严格输出 JSON，不要代码块、标题、解释或思维过程。',
    ctx.chat.type === 'group'
      ? '{"messages":["角色甲：短讯1","角色乙：短讯2"],"summary":"一句话群聊摘要"}'
      : '{"messages":["短讯1","短讯2","短讯3","短讯4"],"summary":"一句话通讯摘要"}',
  ].join('\n');
  const effectiveModules = modulesSection || [
    PHONE_LEGACY_WORLD_BOOK_PROMPT,
    PHONE_LEGACY_STYLE_PROMPT,
    PHONE_LEGACY_COT_PROMPT,
    PHONE_LEGACY_OUTPUT_FORMAT_PROMPT,
  ].join('\n\n');
  return [
    '你是「开拓轶事」手机系统的独立短讯生成器，只负责生成手机通讯内容。',
    '你不是主剧情叙述者，不要推进现场战斗，不要输出正文标签，不要输出思维链，不要把回复写成长篇小说。',
    '知情边界：当前联系人只能使用自己的档案、自己的经历与记忆、当前通讯、定向检索到的近期亲历片段、明确指向自己的来信种子和已发布公开新闻。不得推断或声称知道未提供的主剧情、玩家位置或其他角色私密事件。',
    `当前会话类型：${chatType}。目标对象/频道：${targetName}。`,
    runtimeContract,
    '【启用的手机提示词模块】',
    effectiveModules,
  ].join('\n');
}

export function buildPhonePromptModulesSection(promptModules?: 提示词模块[]): string {
  if (!promptModules || promptModules.length === 0) return '';
  return buildIndependentPromptModulesSection(promptModules, 'phone');
}

export function buildPhoneMessages(ctx: 手机回复上下文): Array<{ role: string; content: string }> {
  const seed = visiblePhoneSeed(ctx);
  const localArchiveLines = [
    ...(ctx.chat.localArchive?.compressedSummaries ?? []).slice(-4).map((summary) => `已压缩摘要：${summary}`),
    ...(ctx.chat.localArchive?.entries ?? []).slice(-6).map((entry) => `本地摘要：${entry.summary}`),
  ];
  const privateNpc = resolvePhonePrivateNpc(ctx);
  const npcLine = privateNpc ? formatPhoneNpcKnowledge(privateNpc) : '';

  const groupNpcLines =
    ctx.chat.type === 'group'
      ? ctx.chat.participantIds
          .map((participantId) => formatPhoneGroupParticipant(ctx, participantId))
          .filter(Boolean)
          .join('\n')
      : '';
  const zhikuPersona = buildPhoneZhikuPersonaBrief(ctx);

  const recentNews = ctx.news
    .slice(-5)
    .map((item) => `- [${item.状态}] ${item.标题}${item.正文 ? `：${item.正文.slice(0, 120)}` : ''}`)
    .join('\n');
  const relevantStory = buildPhoneRelevantStoryContext(ctx);

  const context = [
    `当前回合：${ctx.turnCount}`,
    `玩家：${ctx.traveler.姓名 || '开拓者'}`,
    `当前时间：${ctx.world.当前日期 || ctx.world.当前时间 || '未知'}`,
    localArchiveLines.length ? `当前手机会话本地摘要：\n${localArchiveLines.join('\n')}` : '',
    npcLine ? `当前联系人自身档案与经历：\n${npcLine}` : '',
    groupNpcLines ? `群聊参与者各自档案与经历：\n${groupNpcLines}` : '',
    relevantStory ? `近期主剧情定向检索（只可作为对应 NPC 亲历、听见或被明确告知的候选证据）：\n${relevantStory}` : '',
    zhikuPersona ? `手机智库人物锚点：\n${zhikuPersona}` : '',
    '原著角色口吻边界：若 NPC 档案与智库人物主体资料冲突，长期人格、说话边界和 OOC 风险以智库人物主体资料为准；手机只沿用关系、称呼、共同经历和当前状态。',
    recentNews ? `已发布公开新闻：\n${recentNews}` : '',
    seed
      ? `主动来信种子：\n标题：${seed.title}\n来源：${seed.source}/${seed.triggerType}\n优先级：${seed.priority}\n事件上下文：${seed.context}`
      : '',
  ].filter(Boolean).join('\n\n');

  const latestMessage = ctx.chat.messages[ctx.chat.messages.length - 1];
  const historySource = ctx.userText
    && latestMessage?.role === 'player'
    && latestMessage.content.trim() === ctx.userText.trim()
      ? ctx.chat.messages.slice(0, -1)
      : ctx.chat.messages;
  const history = historySource.slice(-14).map((msg) => ({
    role: msg.role === 'player' ? 'user' : 'assistant',
    content: `${msg.senderName}：${msg.content}`,
  }));

  const prompt = seed
    ? '请根据主动来信种子生成第一条对方来信；如果该事件已在历史短讯里聊过，只能写新的跟进角度，不得复读旧来信。'
    : `玩家刚发送：${ctx.userText || '（无）'}\n请生成对方回复。`;

  return [
    { role: 'user', content: `【上下文】\n${context}` },
    ...history,
    { role: 'user', content: ctx.chat.type === 'group' ? `${prompt}\n\n群聊硬性要求：本次 messages 必须为 12-30 条，并使用「姓名：内容」格式。` : prompt },
  ];
}

export function sanitizePhoneReplyContext(ctx: 手机回复上下文): 手机回复上下文 {
  return ctx.seed && !isPhoneSeedVisible(ctx) ? { ...ctx, seed: undefined } : ctx;
}

export function visiblePhoneSeed(ctx: 手机回复上下文): 主动来信种子 | undefined {
  return ctx.seed && isPhoneSeedVisible(ctx) ? ctx.seed : undefined;
}

function isPhoneSeedVisible(ctx: 手机回复上下文): boolean {
  const seed = ctx.seed;
  if (!seed) return false;
  if (ctx.chat.type === 'group') {
    if (seed.targetType !== 'group') return false;
    const archivedReference = [seed.targetId, ...seed.relatedNpcIds].some((id) =>
      isArchivedNpcReference(ctx.npcRecords, id),
    );
    if (archivedReference) return false;
    if (seed.targetId === ctx.chat.id) {
      const hasActiveNpc = ctx.chat.participantIds.some((participantId) =>
        Boolean(resolvePhoneGroupParticipant(ctx, participantId)?.npc),
      );
      const hasArchivedNpc = ctx.chat.participantIds.some((participantId) =>
        isArchivedNpcReference(ctx.npcRecords, participantId)
        || Boolean(ctx.contacts?.find((contact) => contact.id === participantId)?.npcId
          && isArchivedNpcReference(ctx.npcRecords, ctx.contacts?.find((contact) => contact.id === participantId)?.npcId)),
      );
      return hasActiveNpc || !hasArchivedNpc;
    }
    const participantIds = new Set(ctx.chat.participantIds.flatMap((id) => [id, id.replace(/^npc_/, '')]));
    const seedIds = [seed.targetId, ...seed.relatedNpcIds].flatMap((id) => [id, id.replace(/^npc_/, '')]);
    return seedIds.some((id) => participantIds.has(id));
  }
  if (seed.targetType !== 'private') return false;
  const privateNpc = resolvePhonePrivateNpc(ctx);
  // 绑定已归档 NPC 的联系人不参与种子可见性匹配（恢复由变量事实链触发）。
  const contactNpcArchived = Boolean(ctx.contact?.npcId && isArchivedNpcReference(ctx.npcRecords, ctx.contact.npcId));
  if (contactNpcArchived) return false;
  const allowedIds = new Set([
    ctx.chat.id,
    contactNpcArchived ? undefined : ctx.contact?.id,
    contactNpcArchived ? undefined : ctx.contact?.npcId,
    privateNpc?.id,
    privateNpc ? `npc_${privateNpc.id}` : undefined,
  ].filter((id): id is string => Boolean(id)));
  return [seed.targetId, ...seed.relatedNpcIds].some((id) => allowedIds.has(id));
}

function resolvePhonePrivateNpc(ctx: 手机回复上下文): NPC记录 | undefined {
  if (ctx.chat.type === 'group') return undefined;
  return 筛选活跃NPC(ctx.npcRecords).find((item) =>
    matchesPhoneNpcId(item.id, ctx.contact?.npcId)
    || item.id === ctx.contact?.id
    || `npc_${item.id}` === ctx.contact?.id
    || item.姓名 === ctx.contact?.name,
  );
}

function formatPhoneNpcKnowledge(npc: NPC记录): string {
  const rawMemories = 提取NPC同行记忆文本列表(npc).slice(-5);
  const summaryMemories = (npc.总结记忆 ?? []).slice(-3).map((item) => item.摘要).filter(Boolean);
  return [
    `姓名：${npc.姓名}`,
    npc.别名 ? `别名：${npc.别名}` : '',
    `关系：${格式化NPC关系(npc.好感度, Boolean(npc.亲密关系))}，好感度：${npc.好感度}`,
    npc.对玩家称呼 ? `对玩家称呼：${npc.对玩家称呼}` : '',
    npc.外貌 ? `外貌：${npc.外貌}` : '',
    npc.性格 ? `${npc.原著角色 ? '临时/旧档案性格参考' : '性格'}：${npc.性格}${npc.原著角色 ? '（长期口吻以智库人物主体资料为准）' : ''}` : '',
    npc.说话方式 ? `说话方式：${npc.说话方式}` : '',
    npc.介绍 ? `介绍：${npc.介绍}` : '',
    npc.最近互动 ? `最近互动：${npc.最近互动}` : '',
    npc.对玩家长期印象 ? `对玩家长期印象：${npc.对玩家长期印象}` : '',
    npc.共同经历?.length ? `共同经历：${npc.共同经历.slice(-5).join('；')}` : '',
    npc.必须记得?.length ? `必须记得：${npc.必须记得.slice(-4).join('；')}` : '',
    npc.未完成事项?.length ? `未完成事项：${npc.未完成事项.slice(0, 4).join('；')}` : '',
    summaryMemories.length ? `总结记忆：${summaryMemories.join('；')}` : '',
    rawMemories.length ? `最近同行记忆：${rawMemories.join('；')}` : '',
  ].filter(Boolean).join('\n');
}

type PhoneStoryParticipant = { name: string; terms: string[] };

export function buildPhoneRelevantStoryContext(ctx: 手机回复上下文): string {
  const participants = collectPhoneStoryParticipants(ctx);
  if (!participants.length || !ctx.mainChatHistory?.length) return '';
  const turns = collectRecentPhoneStoryTurns(ctx.mainChatHistory, 5);
  const output: string[] = [];
  let totalLength = 0;

  for (const turn of turns) {
    const segments = splitPhoneStorySegments(turn.text);
    const matchedIndexes = new Set<number>();
    const matchedNames = new Set<string>();
    segments.forEach((segment, index) => {
      for (const participant of participants) {
        if (participant.terms.some((term) => storyTextIncludes(segment, term))) {
          matchedIndexes.add(index);
          matchedNames.add(participant.name);
        }
      }
    });
    if (!matchedIndexes.size) continue;
    const includedIndexes = new Set<number>();
    for (const index of matchedIndexes) {
      for (let offset = -1; offset <= 1; offset += 1) {
        if (segments[index + offset]) includedIndexes.add(index + offset);
      }
    }
    const excerpt = Array.from(includedIndexes)
      .sort((a, b) => a - b)
      .map((index) => segments[index])
      .join('\n');
    const block = `- ${turn.label}｜涉及：${Array.from(matchedNames).join('、')}\n${excerpt}`;
    if (totalLength + block.length > 2800) break;
    output.push(block);
    totalLength += block.length;
  }
  return output.join('\n\n');
}

function collectPhoneStoryParticipants(ctx: 手机回复上下文): PhoneStoryParticipant[] {
  const raw = ctx.chat.type === 'group'
    ? ctx.chat.participantIds.map((participantId) => resolvePhoneGroupParticipant(ctx, participantId)).filter(Boolean)
    : [{ name: ctx.contact?.name || ctx.chat.title, npc: resolvePhonePrivateNpc(ctx), contact: ctx.contact }];
  const participants: PhoneStoryParticipant[] = [];
  for (const item of raw) {
    if (!item?.name) continue;
    const terms = collectPhoneStoryTerms(item.name, item.npc?.姓名, item.npc?.别名, item.contact?.name);
    if (terms.length) participants.push({ name: item.name, terms });
  }
  return participants.slice(0, 8);
}

function collectPhoneStoryTerms(...values: Array<string | undefined>): string[] {
  const terms = new Set<string>();
  for (const value of values) {
    for (const part of String(value ?? '').split(/[\/／|、,，]/)) {
      const term = part.trim();
      if (!term) continue;
      terms.add(term);
      const canonical = matchCanonical(term);
      canonical?.aliases?.forEach((alias) => terms.add(alias.trim()));
    }
  }
  return Array.from(terms).filter((term) => term.length >= 2).slice(0, 12);
}

function collectRecentPhoneStoryTurns(history: 聊天消息[], limit: number): Array<{ label: string; text: string }> {
  const assistantIndexes = history
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === 'assistant' && Boolean((message.parsedResponse?.body || message.content).trim()))
    .slice(-limit);
  return assistantIndexes.map(({ message, index }, order) => {
    let playerText = '';
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (history[cursor].role === 'assistant') break;
      if (history[cursor].role === 'user') {
        playerText = history[cursor].content.trim();
        break;
      }
    }
    const body = (message.parsedResponse?.body || message.content).trim();
    return {
      label: message.gameTime ? `近期回合 ${order + 1}/${assistantIndexes.length}（${message.gameTime}）` : `近期回合 ${order + 1}/${assistantIndexes.length}`,
      text: [playerText, body].filter(Boolean).join('\n'),
    };
  });
}

function splitPhoneStorySegments(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split(/\n+/)
    .flatMap((paragraph) => paragraph.length > 360
      ? paragraph.match(/[^。！？!?]{1,360}[。！？!?]?/g) ?? [paragraph.slice(0, 360)]
      : [paragraph])
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function storyTextIncludes(text: string, term: string): boolean {
  return text.toLocaleLowerCase().includes(term.toLocaleLowerCase());
}

function resolvePhoneGroupParticipant(ctx: 手机回复上下文, participantId: string): { name: string; npc?: NPC记录; contact?: 手机联系人 } | undefined {
  const contact = ctx.contacts?.find((item) => item.id === participantId || item.npcId === participantId);
  const npc = 筛选活跃NPC(ctx.npcRecords).find(
    (item) =>
      matchesPhoneNpcId(item.id, participantId) ||
      matchesPhoneNpcId(item.id, contact?.npcId) ||
      item.姓名 === contact?.name,
  );
  if (npc) return { name: npc.姓名, npc, contact };
  // 归档 NPC 绑定的旧联系人不回退名字注入（恢复由变量事实链触发）。
  if (contact?.name) {
    if (contact.npcId) {
      const boundNpc = ctx.npcRecords?.find((item) => item.id === contact.npcId);
      if (boundNpc?.归档) return undefined;
    }
    return { name: contact.name, contact };
  }
  return undefined;
}

function formatPhoneGroupParticipant(ctx: 手机回复上下文, participantId: string): string {
  const participant = resolvePhoneGroupParticipant(ctx, participantId);
  if (!participant) return '';
  const item = participant.npc;
  if (!item) return `- ${participant.name}；通讯录联系人`;
  return `【${item.姓名}】\n${formatPhoneNpcKnowledge(item)}`;
}

function buildPhoneZhikuPersonaBrief(ctx: 手机回复上下文): string {
  const names = collectPhoneParticipantNames(ctx);
  if (!names.length) return '';
  return compileZhikuPhoneView(ctx.zhiku, names).phonePersonaView;
}

function collectPhoneParticipantNames(ctx: 手机回复上下文): string[] {
  const names = new Set<string>();
  const addName = (value?: string) => {
    for (const part of String(value ?? '').split(/[\/／|、,，]/)) {
      const trimmed = part.trim();
      if (trimmed) names.add(trimmed);
    }
  };
  if (ctx.contact?.npcId) {
    const boundNpc = ctx.npcRecords?.find((item) => matchesPhoneNpcId(item.id, ctx.contact?.npcId));
    if (boundNpc?.归档) {
      // 绑定已归档 NPC 的联系人不注入名字（避免归档 NPC 回到智库人物锚点检索）
    } else {
      addName(ctx.contact?.name);
      const npc = 筛选活跃NPC(ctx.npcRecords).find((item) => matchesPhoneNpcId(item.id, ctx.contact?.npcId));
      addName(npc?.姓名);
      addName(npc?.别名);
    }
  } else {
    addName(ctx.contact?.name);
  }
  if (ctx.chat.type === 'group') {
    for (const participantId of ctx.chat.participantIds) {
      const participant = resolvePhoneGroupParticipant(ctx, participantId);
      addName(participant?.name);
      addName(participant?.npc?.别名);
    }
  }
  return Array.from(names).slice(0, 8);
}

function normalizePhoneNpcId(value: string | undefined): string | undefined {
  return value?.replace(/^npc_/i, '');
}

function matchesPhoneNpcId(recordId: string, reference: string | undefined): boolean {
  const raw = reference?.trim();
  if (!raw) return false;
  return recordId === raw || recordId === normalizePhoneNpcId(raw) || `npc_${recordId}` === raw;
}

function isArchivedNpcReference(records: NPC记录[] | undefined, reference: string | undefined): boolean {
  return Boolean(records?.some((item) => matchesPhoneNpcId(item.id, reference) && item.归档));
}

function parsePhoneReply(raw: string, messageLimit = 8): 手机回复结果 {
  const cleaned = normalizeStructuredModelText(raw);
  const jsonText = extractJsonLikeText(cleaned, 'object');
  try {
    const parsed = parseJsonWithRepair<Partial<手机回复结果> & { messages?: unknown }>(jsonText, 'object');
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
    messages: [],
    message: '',
  };
}

function evaluatePhoneReplyQuality(
  reply: 手机回复结果,
  ctx: 手机回复上下文,
  limits: 手机回复数量限制,
): 手机回复质量结果 {
  const recent = ctx.chat.messages
    .filter((msg) => msg.role === 'contact')
    .slice(-12)
    .map((msg) => normalizePhoneMessageForComparison(msg.content, ctx.chat.type === 'group'))
    .filter(Boolean);
  const reasons = new Set<string>();
  const acceptedMessages: string[] = [];
  const acceptedComparable: string[] = [];

  for (const message of reply.messages) {
    const trimmed = message.trim();
    if (!trimmed) continue;
    if (ctx.chat.type === 'group' && !/^[^：:]{1,24}[：:]\s*\S/.test(trimmed)) {
      reasons.add('群聊消息缺少“姓名：内容”格式');
      continue;
    }
    const normalized = normalizePhoneMessageForComparison(trimmed, ctx.chat.type === 'group');
    if (!normalized) continue;
    if (acceptedComparable.some((old) => arePhoneMessagesTooSimilar(normalized, old))) {
      reasons.add('本批回复存在重复内容');
      continue;
    }
    if (recent.some((old) => arePhoneMessagesTooSimilar(normalized, old))) {
      reasons.add('回复与近期手机消息重复');
      continue;
    }
    acceptedMessages.push(trimmed);
    acceptedComparable.push(normalized);
    if (acceptedMessages.length >= limits.max) break;
  }

  if (acceptedMessages.length < limits.min) {
    reasons.add(`有效短讯仅 ${acceptedMessages.length} 条，至少需要 ${limits.min} 条`);
  }
  const normalizedReply: 手机回复结果 = {
    ...reply,
    messages: acceptedMessages,
    message: acceptedMessages.join('\n'),
  };
  return {
    reply: normalizedReply,
    accepted: acceptedMessages.length >= limits.min,
    reasons: Array.from(reasons),
  };
}

function buildPhoneQualitySupplementMessages(
  baseMessages: Array<{ role: string; content: string }>,
  quality: 手机回复质量结果,
  ctx: 手机回复上下文,
  limits: 手机回复数量限制,
): Array<{ role: string; content: string }> {
  const missing = Math.max(1, limits.min - quality.reply.messages.length);
  const available = Math.max(missing, limits.max - quality.reply.messages.length);
  const acceptedJson = JSON.stringify({
    messages: quality.reply.messages,
    summary: quality.reply.summary || '',
  });
  return [
    ...baseMessages,
    { role: 'assistant', content: acceptedJson },
    {
      role: 'user',
      content: [
        '上一版未通过手机回复质量校验，请只补充缺少的有效短讯，不要改写或复述已保留内容。',
        `任务锚点：继续严格回应本请求中已经提供的${ctx.seed ? '匹配主动来信种子' : '当前玩家消息'}。`,
        `校验原因：${quality.reasons.join('；') || '有效消息不足'}`,
        `已保留 ${quality.reply.messages.length} 条；本次补充 ${missing}-${available} 条，合并后总数必须为 ${limits.min}-${limits.max} 条。`,
        ctx.chat.type === 'group' ? '群聊每条仍须使用“姓名：内容”格式，并自然补足不同参与者的发言。' : '私聊继续直接回应玩家当前内容并保持该 NPC 的角色底色。',
        '严格只输出补充部分的 JSON：{"messages":["补充短讯"],"summary":"覆盖合并后完整通讯的一句话摘要"}',
      ].join('\n'),
    },
  ];
}

function normalizePhoneMessageForComparison(text: string, group: boolean): string {
  const comparable = group ? text.replace(/^[^：:]{1,24}[：:]\s*/, '') : text;
  return normalizeComparableText(comparable);
}

function normalizeComparableText(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/[，。！？!?；;、,.…~～“”"'\[\]（）()《》<>]/g, '')
    .trim();
}

function arePhoneMessagesTooSimilar(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 8 && b.includes(a)) return true;
  if (b.length >= 8 && a.includes(b)) return true;
  const shorter = Math.min(a.length, b.length);
  const longer = Math.max(a.length, b.length);
  if (shorter < 10) return false;
  return longestCommonSubstringLength(a, b) / longer >= 0.72;
}

function longestCommonSubstringLength(a: string, b: string): number {
  const prev = new Array(b.length + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diagonal + 1 : 0;
      if (prev[j] > best) best = prev[j];
      diagonal = saved;
    }
  }
  return best;
}

function normalizePhoneMessages(messages: unknown, singleMessage?: unknown, maxCount = 8): string[] {
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
  return cleaned;
}
