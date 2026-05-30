import type { API配置项, API设置, 游戏设置 } from '@/models/settings';
import type { 角色数据结构 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import type { 记忆系统 } from '@/models/memory';
import type { 忆庭系统 } from '@/models/yiting';
import type { 手机会话, 手机联系人, 主动来信种子 } from '@/models/phone';
import type { NPC记录 } from '@/models/npc';
import { 提取NPC同行记忆文本列表 } from '@/models/npc';
import type { 新闻条目 } from '@/models/news';
import type { 聊天消息 } from '@/models/chat';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { 智库系统, 智库条目 } from '@/models/zhiku';
import { 解析智库软结构标签, 获取智库人物名, 比较智库人物节点 } from '@/models/zhiku';
import { PHONE_COT_PROMPT } from '@/prompts/cot/phoneCot';
import { PHONE_WORLD_BOOK_PROMPT } from '@/data/phoneWorldbook';
import { chatCompletionNonStream } from './chatCompletionClient';
import { withRetries } from '@/services/ai/retry';
import { buildImmediateStoryReview } from '@/hooks/useGame/historyWindow';
import { getStoryWeavingInjectionDiagnostics } from '@/services/storyWeaving';

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
  mainChatHistory?: 聊天消息[];
  storyWeaving?: 剧情编织系统;
  zhiku?: 智库系统;
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
  return dedupePhoneReply(parsePhoneReply(raw, messageLimit), ctx, messageLimit);
}

export function buildPhoneSystemPrompt(ctx: 手机回复上下文): string {
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
    '- 严禁复读最近手机消息：不能逐句、同序、同义改写上一轮或历史来信；同一事件再次来信时必须换成新的角度，例如追问后续、补充提醒、报平安、改约定或只发一句短促跟进。',
    '- 允许体现关系、担心、调侃、任务提醒或新闻反应；不要越权修改变量。',
    '- 手机聊天会写回记忆，所以内容要能被摘要，不要只剩空话或表情包式废句。',
    '严格输出 JSON，不要代码块，不要解释：',
    '{"messages":["短讯1","短讯2"],"summary":"一句话通讯摘要"}',
  ].join('\n');
}

export function buildPhoneMessages(ctx: 手机回复上下文): Array<{ role: string; content: string }> {
  const memories = [
    ...ctx.memory.长期记忆.slice(-5).map((m) => `长期：${m}`),
    ...ctx.memory.短期记忆.slice(-8).map((m) => `短期：${m}`),
    ...ctx.memory.即时记忆.slice(-6).map((m) => `即时：${m}`),
    ...ctx.yiting.回忆档案.slice(-5).map((m) => `回忆档案：${m.名称 || `第${m.回合}回合`}｜${(m.摘要 || m.原文 || '').slice(0, 180)}`),
  ];
  const storyReview = ctx.mainChatHistory?.length
    ? buildImmediateStoryReview(ctx.mainChatHistory, 10)
    : '';
  const localArchiveLines = [
    ...(ctx.chat.localArchive?.compressedSummaries ?? []).slice(-4).map((summary) => `已压缩摘要：${summary}`),
    ...(ctx.chat.localArchive?.entries ?? []).slice(-6).map((entry) => `本地摘要：${entry.summary}`),
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
        npc.外貌 ? `外貌：${npc.外貌}` : '',
        npc.穿着 ? `穿着：${npc.穿着}` : '',
        npc.性格 ? `${npc.原著角色 ? '临时/旧档案性格参考' : '性格'}：${npc.性格}${npc.原著角色 ? '（长期口吻以智库人物主体资料为准）' : ''}` : '',
        npc.说话方式 ? `说话方式：${npc.说话方式}` : '',
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
              item.性格 ? `${item.原著角色 ? '临时/旧档案性格参考' : '性格'}：${item.性格}${item.原著角色 ? '（长期口吻以智库人物主体资料为准）' : ''}` : '',
              item.说话方式 ? `说话方式：${item.说话方式}` : '',
              提取NPC同行记忆文本列表(item).length ? `最近同行记忆：${提取NPC同行记忆文本列表(item).slice(-3).join('；')}` : '',
            ].filter(Boolean).join('；'),
          )
          .join('\n')
      : '';
  const zhikuPersona = buildPhoneZhikuPersonaBrief(ctx);

  const recentNews = ctx.news
    .slice(-5)
    .map((item) => `- [${item.状态}] ${item.标题}${item.正文 ? `：${item.正文.slice(0, 120)}` : ''}`)
    .join('\n');
  const storyProgress = buildStoryProgressBrief(ctx.storyWeaving);
  const recentContactMessages = ctx.chat.messages
    .filter((msg) => msg.role === 'contact')
    .slice(-8)
    .map((msg) => `- ${msg.content}`)
    .join('\n');

  const context = [
    `当前回合：${ctx.turnCount}`,
    `玩家：${ctx.traveler.姓名 || '开拓者'}`,
    `当前时间：${ctx.world.当前日期 || ctx.world.当前时间 || '未知'}`,
    `地点：${ctx.world.当前地点 || '未设定'}`,
    storyReview ? `最近主剧情回顾：\n${storyReview}` : '',
    memories.length ? `近期记忆：\n${memories.join('\n')}` : '',
    localArchiveLines.length ? `当前手机会话本地摘要：\n${localArchiveLines.join('\n')}` : '',
    npcLine ? `相关 NPC 档案：\n${npcLine}` : '',
    groupNpcLines ? `群聊参与者档案：\n${groupNpcLines}` : '',
    zhikuPersona ? `手机智库人物锚点：\n${zhikuPersona}` : '',
    '原著角色口吻边界：若 NPC 档案与智库人物主体资料冲突，长期人格、说话边界和 OOC 风险以智库人物主体资料为准；手机只沿用关系、称呼、共同经历和当前状态。',
    recentNews ? `近期新闻：\n${recentNews}` : '',
    storyProgress ? `剧情编织进度锚点：\n${storyProgress}` : '',
    recentContactMessages
      ? `最近已发送短讯（禁止复读或同序改写）：\n${recentContactMessages}`
      : '',
    ctx.seed
      ? `主动来信种子：\n标题：${ctx.seed.title}\n来源：${ctx.seed.source}/${ctx.seed.triggerType}\n优先级：${ctx.seed.priority}\n事件上下文：${ctx.seed.context}`
      : '',
  ].filter(Boolean).join('\n\n');

  const history = ctx.chat.messages.slice(-14).map((msg) => ({
    role: msg.role === 'player' ? 'user' : 'assistant',
    content: `${msg.senderName}：${msg.content}`,
  }));

  const prompt = ctx.seed
    ? '请根据主动来信种子生成第一条对方来信；如果该事件已在历史短讯里聊过，只能写新的跟进角度，不得复读旧来信。'
    : `玩家刚发送：${ctx.userText || '（无）'}\n请生成对方回复。`;

  return [
    { role: 'user', content: `【上下文】\n${context}` },
    ...history,
    { role: 'user', content: prompt },
  ];
}

function buildPhoneZhikuPersonaBrief(ctx: 手机回复上下文): string {
  const entries = ctx.zhiku?.条目 ?? [];
  if (!entries.length) return '';
  const names = collectPhoneParticipantNames(ctx);
  if (!names.length) return '';

  const selected: 智库条目[] = [];
  for (const name of names) {
    const matched = entries
      .filter((entry) => entry.分类 === 'character' && entry.可用于联动)
      .filter((entry) => namesLikelySame(获取智库人物名(entry), name))
      .filter(isPhoneAllowedZhikuEntry)
      .sort(比较智库人物节点)
      .slice(0, 3);
    for (const entry of matched) {
      if (!selected.some((item) => item.id === entry.id)) selected.push(entry);
      if (selected.length >= 8) break;
    }
    if (selected.length >= 8) break;
  }
  if (!selected.length) return '';
  const lines = selected.map((entry) => {
    const meta = 解析智库软结构标签(entry);
    const metaLine = [
      meta.资料类型 ? `资料类型:${meta.资料类型}` : '',
      meta.节点 ? `节点:${meta.节点}` : '',
      meta.解锁状态 ? `解锁:${meta.解锁状态}` : '',
      meta.剧透等级 ? `剧透:${meta.剧透等级}` : '',
      meta.使用范围.length ? `范围:${meta.使用范围.join('/')}` : '',
    ].filter(Boolean).join('；');
    const summary = entry.摘要 || entry.原文.slice(0, 180) || '无摘要';
    return `- ${entry.标题}${metaLine ? `（${metaLine}）` : ''}：${summary}`;
  });
  lines.push('边界：这里只提供聊天对象的主体人格、OOC 风险或手机语气锚点；未解锁形态、重大剧透和只读资料不得在手机里提前表现。');
  return lines.join('\n');
}

function collectPhoneParticipantNames(ctx: 手机回复上下文): string[] {
  const names = new Set<string>();
  const addName = (value?: string) => {
    const trimmed = value?.trim();
    if (trimmed) names.add(trimmed);
  };
  addName(ctx.contact?.name);
  if (ctx.contact?.npcId) {
    const npc = ctx.npcRecords.find((item) => item.id === ctx.contact?.npcId);
    addName(npc?.姓名);
    addName(npc?.别名);
  }
  if (ctx.chat.type === 'group') {
    for (const participantId of ctx.chat.participantIds) {
      const npc = ctx.npcRecords.find((item) => item.id === participantId || `npc_${item.id}` === participantId);
      addName(npc?.姓名);
      addName(npc?.别名);
    }
  }
  return Array.from(names).slice(0, 8);
}

function isPhoneAllowedZhikuEntry(entry: 智库条目): boolean {
  const meta = 解析智库软结构标签(entry);
  const ranges = meta.使用范围.map((item) => item.trim()).filter(Boolean);
  if (ranges.length > 0 && !ranges.some((item) => /手机|通用|全部|all/i.test(item))) return false;
  const unlock = meta.解锁状态 ?? '';
  if (/未解锁|锁定|只读/i.test(unlock)) return false;
  const spoiler = meta.剧透等级 ?? '';
  if (/重大/i.test(spoiler) && !/默认可用|已解锁|当前可用|手动启用/i.test(unlock)) return false;
  const type = [meta.资料类型, meta.节点].filter(Boolean).join(' ');
  return /主体|人格|OOC|风险|手机|语气|基础/i.test(type) || !type;
}

function namesLikelySame(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  return !!left && !!right && (left === right || left.includes(right) || right.includes(left));
}

function buildStoryProgressBrief(system?: 剧情编织系统): string {
  const anchor = system?.当前进度;
  if (!system?.系列列表?.length || !anchor) return '';
  const diagnostics = getStoryWeavingInjectionDiagnostics(system);
  const series = system.系列列表.find((item) => item.id === diagnostics?.系列ID)
    ?? system.系列列表.find((item) => item.id === anchor.当前系列ID)
    ?? system.系列列表.find((item) => item.id === system.当前系列ID)
    ?? system.系列列表[0];
  const current = diagnostics
    ? series?.分段列表.find((item) => item.id === diagnostics.当前分段ID)
    : series?.分段列表.find((item) => item.id === anchor.当前分段ID)
      ?? series?.分段列表.find((item) => item.组号 === anchor.当前分段组号);
  const lines = [
    `系列：${series?.标题 ?? '未知'}`,
    `当前段：${diagnostics?.当前分段组号 ?? anchor.当前分段组号}${current?.标题 ? `｜${current.标题}` : ''}`,
    `推进状态：${anchor.推进状态}`,
  ];
  if (diagnostics) {
    lines.push(`注入窗口健康：${diagnostics.健康状态}`);
    lines.push(`实际注入段：第${diagnostics.当前分段组号}段「${diagnostics.当前分段标题}」`);
    if (diagnostics.归档锚点标题) {
      lines.push(`已跳过归档锚点：第${diagnostics.归档锚点组号}段「${diagnostics.归档锚点标题}」`);
    }
    if (diagnostics.检查项.length) lines.push(`检查项：${diagnostics.检查项.join('；')}`);
  }
  if (anchor.已完成摘要.length) lines.push(`已发生/已归档：${anchor.已完成摘要.slice(-5).join('；')}`);
  if (anchor.历史归档.length) {
    lines.push(`最近历史归档：${anchor.历史归档.slice(-3).map((item) => `第${item.分段组号}段「${item.分段标题}」${item.摘要 ? `：${item.摘要}` : ''}`).join('；')}`);
    const roleProgress = anchor.历史归档
      .flatMap((item) => item.角色推进摘要 ?? [])
      .slice(-6);
    if (roleProgress.length) {
      lines.push(`最近角色阶段变化：${roleProgress.join('；')}`);
    }
  }
  if (anchor.当前待解问题.length) lines.push(`仍可回应的待解问题：${anchor.当前待解问题.slice(0, 5).join('；')}`);
  if (anchor.最近判定理由.length) lines.push(`最近判定理由：${anchor.最近判定理由.slice(0, 4).join('；')}`);
  lines.push('边界：手机只能承接已发生事实、已公开后果、角色合理可知的信息或待解问题；不得提前发送下一章结论，不得把剧情编织素材当成已发生事实。');
  return lines.join('\n');
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

function dedupePhoneReply(reply: 手机回复结果, ctx: 手机回复上下文, messageLimit: number): 手机回复结果 {
  const recent = ctx.chat.messages
    .filter((msg) => msg.role === 'contact')
    .slice(-12)
    .map((msg) => normalizeComparableText(msg.content))
    .filter(Boolean);
  if (!recent.length) return reply;

  const fresh = reply.messages.filter((message) => {
    const normalized = normalizeComparableText(message);
    if (!normalized) return false;
    return !recent.some((old) => arePhoneMessagesTooSimilar(normalized, old));
  });
  if (fresh.length >= Math.min(3, Math.max(1, messageLimit))) {
    return {
      ...reply,
      messages: fresh.slice(0, messageLimit),
      message: fresh.slice(0, messageLimit).join('\n'),
    };
  }

  const fallback = buildNonRepeatingPhoneFallback(ctx, recent, messageLimit);
  return {
    messages: fallback,
    message: fallback.join('\n'),
    summary: ctx.seed
      ? `${ctx.contact?.name ?? ctx.chat.title}围绕「${ctx.seed.title}」发来新的跟进，没有复读旧来信。`
      : `${ctx.contact?.name ?? ctx.chat.title}换了新的角度回复玩家。`,
  };
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

function buildNonRepeatingPhoneFallback(ctx: 手机回复上下文, recent: string[], messageLimit: number): string[] {
  const name = ctx.contact?.name ?? ctx.chat.title;
  const seedTitle = ctx.seed?.title ?? '刚才那件事';
  const candidates = ctx.seed
    ? [
        `${name}又补了一句：刚才那事先别急着下结论。`,
        '我想了想，还是等你那边确认后再说。',
        '有新情况记得回我，我这边先盯着。'
      ]
    : [
        '我刚才又想起一件小事。',
        '等你方便的时候回我一下就好。',
        '这次不刷屏，先把重点留给你。'
      ];
  const scoped = ctx.seed ? candidates.map((line, index) => (index === 0 ? line.replace('刚才那事', `「${seedTitle}」`) : line)) : candidates;
  const fresh = scoped
    .filter((line) => !recent.some((old) => arePhoneMessagesTooSimilar(normalizeComparableText(line), old)))
    .slice(0, Math.max(1, Math.min(messageLimit, ctx.chat.type === 'group' ? 6 : 3)));
  return fresh.length ? fresh : [`${name}发来新的跟进：我这边先不重复刚才那些了，等你确认后续。`];
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
