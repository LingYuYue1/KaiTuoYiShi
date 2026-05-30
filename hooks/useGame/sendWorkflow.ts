import type { UseGameStateReturn } from '@/hooks/useGameState';
import { 创建聊天消息, type 聊天消息, type 回合快照 } from '@/models/chat';
import { sendChatMessage } from '@/services/ai/text';
import { callVariableModel } from '@/services/ai/variableModel';
import { buildOpeningSystemPrompt, buildSystemPrompt } from './systemPromptBuilder';
import {
  buildImmediateMemory,
  addImmediateMemory,
  autoCompressMemorySystemWithArchives,
  autoCompressMemorySystemWithArchivesAsync,
  compressNpcMemories,
  upsertRecallEntry,
} from './memoryUtils';
import { runNewsGenerationStep } from './newsWorkflow';
import { autoAlignCanonStoryProgress } from '@/services/storyProgressService';
import { evaluateStoryWeavingGate, getStoryWeavingInjectionDiagnostics } from '@/services/storyWeaving';
import { 归一化世界状态 } from '@/models/world';
import { loadSetting, saveGame, saveSetting } from '@/services/dbService';
import { buildSavePayload } from './saveLoadWorkflow';
import { parseVariableCommands, snapshotVariableState, reduceVariableCommands, commitVariableState, unpackVariableState } from '@/utils/variableExecutor';
import { factsToVariableCommands, parseVariableFacts } from '@/utils/variableFacts';
import { isTravelerPlayerAuthoredVariablePath } from '@/utils/variableRegistry';
import type { 变量命令, 变量命令批次 } from '@/models/variableCommand';
import { 解析命途ID, 应用狭间结果, 踏入命途狭间, type 狭间评判 } from '@/services/pathService';
import { 创建默认记忆系统设置 } from '@/models/settings';
import type { 队列任务ID, 队列任务状态 } from '@/models/queueTask';
import { retrieveZhikuContext, retrieveZhikuContextWithModel, type 智库召回诊断 } from '@/services/zhikuRetrieval';
import { applyStoryArchiveZhikuRuntimeUnlock } from '@/services/zhikuRuntimeUnlock';
import { buildPersistedZhikuSystem } from '@/data/zhikuPreset';
import { retrieveYitingContextWithModel } from '@/services/yitingRetrieval';
import { buildYitingArchiveEntry } from '@/services/yitingArchive';
import { 创建默认智库系统设置 } from '@/models/settings';
import { 提取NPC同行记忆文本列表, type NPC记录, type NPC同行记忆条目 } from '@/models/npc';
import type { 手机系统, 主动来信种子 } from '@/models/phone';
import { buildImmediateStoryReview, buildMainRecallQuery, getMainHistoryWindow } from './historyWindow';
import { 归一化剧情编织系统, type 剧情编织系统 } from '@/models/storyWeaving';
import { restorePreTurnSnapshot } from './turnSnapshot';
import { normalizePlayerSpeechInBody, replaceBodyInRawResponse } from '@/utils/playerSpeechGuard';
import { enrichNpcArchives } from '@/utils/npcArchiveEnrichment';

function buildStoryProgressMemoryLine(previous: 剧情编织系统, next: 剧情编织系统): string {
  const before = previous.当前进度;
  const after = next.当前进度;
  if (!after) return '';
  if (
    before?.当前系列ID === after.当前系列ID &&
    before?.当前分段ID === after.当前分段ID &&
    before?.推进状态 === after.推进状态 &&
    before?.最近一次推进判定回合 === after.最近一次推进判定回合
  ) {
    return '';
  }
  const series = next.系列列表.find((item) => item.id === after.当前系列ID)
    ?? next.系列列表.find((item) => item.id === next.当前系列ID);
  const current = series?.分段列表.find((item) => item.id === after.当前分段ID)
    ?? series?.分段列表.find((item) => item.组号 === after.当前分段组号);
  const parts = [
    `剧情编织进度：${series?.标题 ?? '未知系列'} 当前进入第 ${after.当前分段组号} 段${current?.标题 ? `「${current.标题}」` : ''}`,
    `状态 ${after.推进状态}`,
  ];
  const latestArchive = after.历史归档.at(-1);
  if (latestArchive) {
    parts.push(`最新归档：第 ${latestArchive.分段组号} 段「${latestArchive.分段标题}」${latestArchive.摘要 ? `：${latestArchive.摘要}` : ''}`);
    if (latestArchive.角色推进摘要?.length) {
      parts.push(`角色阶段承接：${latestArchive.角色推进摘要.slice(0, 4).join('；')}`);
    }
  }
  if (after.已完成摘要.length) parts.push(`已归档：${after.已完成摘要.slice(-3).join('；')}`);
  if (after.当前待解问题.length) parts.push(`待解：${after.当前待解问题.slice(0, 3).join('；')}`);
  if (after.最近判定理由.length) parts.push(`判定：${after.最近判定理由.slice(0, 3).join('；')}`);
  return parts.join('。');
}

function applyStoryProgressNpcMemory(npcs: NPC记录[], story: 剧情编织系统, _memoryLine: string, turn: number): NPC记录[] {
  if (!story.当前进度) return npcs;
  const series = story.系列列表.find((item) => item.id === story.当前进度?.当前系列ID)
    ?? story.系列列表.find((item) => item.id === story.当前系列ID);
  if (!series) return npcs;
  const latestArchive = story.当前进度.历史归档.at(-1);
  const roleProgress = latestArchive?.角色推进摘要 ?? [];
  if (!roleProgress.length) return npcs;
  let changed = false;
  const next = npcs.map((npc) => {
    const aliases = [npc.姓名, npc.别名].filter((item): item is string => Boolean(item?.trim()));
    const matched = roleProgress.find((summary) =>
      aliases.some((name) => summary.includes(name)),
    );
    if (!matched || !(npc.阶位 === 'companion' || npc.同行 || 提取NPC同行记忆文本列表(npc).length > 0)) return npc;
    const existing = 提取NPC同行记忆文本列表(npc);
    const cleanSummary = matched.length > 120 ? `${matched.slice(0, 118)}…` : matched;
    if (existing.some((item) => item.includes(cleanSummary))) return npc;
    changed = true;
    return {
      ...npc,
      同行记忆: [
        ...(npc.同行记忆 ?? []),
        {
          id: `npc_story_progress_${npc.id}_${turn}_${Math.random().toString(36).slice(2, 6)}`,
          回合: turn,
          摘要: cleanSummary,
          来源: '其他' as const,
          关联NPCID: [npc.id],
        },
      ],
      最近回合: Math.max(npc.最近回合, turn),
    };
  });
  return changed ? next : npcs;
}

function formatZhikuDiagnosticsPreview(diagnostics?: 智库召回诊断): string {
  if (!diagnostics) return '';
  return [
    '智库召回诊断：',
    `场景锚点：${diagnostics.场景锚点.join('、') || '无'}`,
    `相关角色：${diagnostics.相关角色.join('、') || '无'}`,
    `人物锚点：${diagnostics.人物锚点.join('、') || '无'}`,
    `候选资料：${diagnostics.候选资料.join('、') || '无'}`,
    `角色相关资料：${diagnostics.角色相关资料.join('、') || '无'}`,
    `强相关资料：${diagnostics.强相关资料.join('、') || '无'}`,
    `弱相关资料：${diagnostics.弱相关资料.join('、') || '无'}`,
    `已注入资料：${diagnostics.已注入资料.join('、') || '无'}`,
    diagnostics.被门禁过滤.length
      ? `门禁过滤：${diagnostics.被门禁过滤.map((item) => `${item.标题}（${item.原因}）`).join('；')}`
      : '门禁过滤：无',
    diagnostics.检查项.length ? `检查项：${diagnostics.检查项.join('；')}` : '',
  ].filter(Boolean).join('\n');
}

function getStoryWeavingWriteSignature(system: 剧情编织系统): string {
  return JSON.stringify({
    当前系列ID: system.当前系列ID,
    当前进度: system.当前进度
      ? {
          当前系列ID: system.当前进度.当前系列ID,
          当前分段ID: system.当前进度.当前分段ID,
          当前分段组号: system.当前进度.当前分段组号,
          推进状态: system.当前进度.推进状态,
          updatedAt: system.当前进度.updatedAt,
        }
      : null,
    系列: system.系列列表.map((series) => ({
      id: series.id,
      来源类型: series.来源类型,
      标题: series.标题,
      分段数: series.分段列表.length,
      章节数: series.章节列表.length,
      当前分段组号: series.当前分段组号,
      激活注入: series.激活注入,
      updatedAt: series.updatedAt,
      分段更新时间: series.分段列表.map((segment) => `${segment.id}:${segment.处理状态}:${segment.运行状态}:${segment.updatedAt}`),
    })),
  });
}

async function resolveStoryWeavingForBackgroundWrite(input: {
  workflowBase: 剧情编织系统;
  proposed: 剧情编织系统;
}): Promise<{ system: 剧情编织系统; concurrentChange: boolean }> {
  const latest = await loadSetting<剧情编织系统>('storyWeavingSystem');
  const latestNormalized = latest ? 归一化剧情编织系统(latest) : null;
  if (!latestNormalized) return { system: input.proposed, concurrentChange: false };
  const baseSignature = getStoryWeavingWriteSignature(归一化剧情编织系统(input.workflowBase));
  const latestSignature = getStoryWeavingWriteSignature(latestNormalized);
  if (baseSignature === latestSignature) {
    return { system: input.proposed, concurrentChange: false };
  }
  return { system: latestNormalized, concurrentChange: true };
}

function normalizePhoneSeedComparableText(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/[，。！？!?；;、,.…~～“”"'\[\]（）()《》<>]/g, '')
    .trim();
}

function isPhoneSeedTextSimilar(a: string, b: string): boolean {
  const left = normalizePhoneSeedComparableText(a);
  const right = normalizePhoneSeedComparableText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 12 && right.includes(left)) return true;
  if (right.length >= 12 && left.includes(right)) return true;
  const shared = [...new Set(left)].filter((char) => right.includes(char)).length;
  return shared / Math.max(1, Math.min(left.length, right.length)) >= 0.82;
}

function hasRecentSimilarPhoneSeed(input: {
  phone: 手机系统;
  npcId: string;
  turn: number;
  title: string;
  context: string;
  windowTurns?: number;
}): boolean {
  const windowTurns = Math.max(3, input.windowTurns ?? 12);
  const currentText = `${input.title}\n${input.context}`;
  return input.phone.messageSeeds.some((seed) => {
    if (input.turn - (Number(seed.turn) || 0) > windowTurns) return false;
    const sameTarget = seed.targetId === input.npcId || seed.targetId === `npc_${input.npcId}` || seed.relatedNpcIds.includes(input.npcId);
    if (!sameTarget) return false;
    return isPhoneSeedTextSimilar(currentText, `${seed.title}\n${seed.context}`);
  });
}

function buildFallbackPhoneSeed(input: {
  phone: 手机系统;
  npcs: NPC记录[];
  turn: number;
  userInput: string;
  body: string;
  maxSeedsPerTurn: number;
  contactCooldownTurns: number;
}): 主动来信种子 | null {
  if (input.maxSeedsPerTurn <= 0) return null;
  const pendingCount = input.phone.messageSeeds.filter((seed) => seed.status === 'pending').length;
  if (pendingCount >= input.maxSeedsPerTurn) return null;
  if (input.phone.messageSeeds.some((seed) => seed.status === 'pending')) return null;

  const cooldown = Math.max(1, Math.trunc(input.contactCooldownTurns || 3));
  const fallbackGlobalCooldown = Math.max(3, cooldown);
  const lastNonUrgentSeedTurn = input.phone.messageSeeds
    .filter((seed) => seed.priority !== 'urgent')
    .reduce((latest, seed) => Math.max(latest, Number(seed.turn) || 0), 0);
  if (lastNonUrgentSeedTurn > 0 && input.turn - lastNonUrgentSeedTurn < fallbackGlobalCooldown) return null;

  const text = `${input.userInput}\n${input.body}`;
  const candidates = input.npcs
    .filter((npc) => npc.关系 !== 'enemy')
    .filter((npc) => npc.阶位 === 'companion' || npc.同行 || 提取NPC同行记忆文本列表(npc).length > 0)
    .filter((npc) => {
      const recentTurn = Number(npc.最近回合 || 0);
      if (recentTurn < Math.max(1, input.turn - 4)) return false;
      const aliases = [npc.姓名, npc.别名].filter((item): item is string => Boolean(item?.trim()));
      return npc.同行 || aliases.some((name) => text.includes(name));
    })
    .filter((npc) => {
      const lastSeedTurn = input.phone.messageSeeds
        .filter((seed) =>
          seed.targetId === npc.id ||
          seed.targetId === `npc_${npc.id}` ||
          seed.relatedNpcIds.includes(npc.id),
        )
        .reduce((latest, seed) => Math.max(latest, Number(seed.turn) || 0), 0);
      return lastSeedTurn <= 0 || input.turn - lastSeedTurn >= cooldown;
    })
    .sort((a, b) => {
      if (a.同行 !== b.同行) return a.同行 ? -1 : 1;
      const recentDiff = Number(b.最近回合 || 0) - Number(a.最近回合 || 0);
      if (recentDiff !== 0) return recentDiff;
      return 提取NPC同行记忆文本列表(b).length - 提取NPC同行记忆文本列表(a).length;
    });

  const npc = candidates[0];
  if (!npc) return null;
  const reason = [
    input.body.replace(/\s+/g, ' ').trim().slice(0, 120),
    提取NPC同行记忆文本列表(npc).slice(-1)[0],
  ].filter(Boolean).join('；');
  const title = `${npc.姓名}的跟进短讯`;
  const context = `${npc.姓名}近期与玩家有互动，可低频发来一条跟进、确认状况或延续约定的短讯。已发生事实：${reason || '近期剧情互动。'}`;
  if (hasRecentSimilarPhoneSeed({
    phone: input.phone,
    npcId: npc.id,
    turn: input.turn,
    title,
    context,
  })) {
    return null;
  }
  return {
    id: `phone_seed_fallback_${input.turn}_${npc.id}_${Math.random().toString(36).slice(2, 8)}`,
    turn: input.turn,
    source: 'main_story',
    triggerType: npc.同行 ? 'quest' : 'relationship',
    priority: 'low',
    targetType: 'private',
    targetId: npc.id,
    title,
    context,
    relatedNpcIds: [npc.id],
    expiresAfterTurns: 6,
    status: 'pending',
  };
}

/** CoT 伪装历史：在 `user:开始任务` 后注入一条 assistant 历史，强化思考段输出习惯。
 *  内容刻意保留 `<thinking>` 段，让模型 in-context 学到「下次也要写 thinking」。 */
const COT_FAKE_HISTORY_USER = '开始任务';
const COT_FAKE_HISTORY_ASSISTANT = `<thinking>
- 系统就绪。当前任务：等待玩家发送指令后按 4 标签协议输出（thinking / 正文 / 短期记忆 / 动态世界）。
- 在收到首条具体指令前不输出正文，本条仅为格式确认。
</thinking>

<正文>
（待命中：等待玩家发起首回合）
</正文>

<短期记忆>
</短期记忆>

<动态世界>
</动态世界>`;

function applyNsfwVariablePolicy(
  commands: 变量命令[],
  policy: { nsfwEnabled: boolean; maleNsfwArchiveEnabled: boolean },
  npcs: NPC记录[] = [],
): {
  allowedCommands: 变量命令[];
  rejectedCommands: Array<{ command: 变量命令; ok: false; reason: string }>;
} {
  const allowedCommands: 变量命令[] = [];
  const rejectedCommands: Array<{ command: 变量命令; ok: false; reason: string }> = [];

  for (const command of commands) {
    const key = command.key ?? '';
    const valueText = JSON.stringify(command.value ?? '');
    const touchesNsfw = key.includes('NSFW档案') || valueText.includes('NSFW档案');
    const touchesMaleArchive =
      key.includes('男性身体档案') ||
      key.includes('男性器') ||
      valueText.includes('男性身体档案') ||
      valueText.includes('男性器');

    if (touchesNsfw && !policy.nsfwEnabled) {
      rejectedCommands.push({
        command,
        ok: false,
        reason: 'NSFW 总开关未开启，已阻止写入 NSFW 档案。',
      });
      continue;
    }

    if (touchesNsfw) {
      const blockedReason = getNsfwBlockedCommandReason(command, npcs);
      if (blockedReason) {
        rejectedCommands.push({
          command,
          ok: false,
          reason: blockedReason,
        });
        continue;
      }
    }

    if (touchesMaleArchive && !policy.maleNsfwArchiveEnabled) {
      rejectedCommands.push({
        command,
        ok: false,
        reason: '男性 NSFW 档案开关未开启，已阻止写入男性身体档案。',
      });
      continue;
    }

    allowedCommands.push(command);
  }

  return { allowedCommands, rejectedCommands };
}

function getNsfwBlockedCommandReason(command: 变量命令, npcs: NPC记录[]): string | null {
  const text = `${command.key}\n${JSON.stringify(command.value ?? '')}`;
  const selector = command.key.match(/^NPC\[([^\]]+)\]/)?.[1] ?? '';
  const selectorValue = selector.includes('=')
    ? selector.split('=').slice(1).join('=').replace(/^["']|["']$/g, '').trim()
    : selector.trim();
  const npc = npcs.find((item) =>
    item.id === selectorValue ||
    item.姓名 === selectorValue ||
    item.别名 === selectorValue ||
    text.includes(item.姓名) ||
    Boolean(item.别名 && text.includes(item.别名)),
  );
  const haystack = [text, npc?.姓名, npc?.别名, npc?.介绍, npc?.外貌, npc?.备注?.join(' ')].filter(Boolean).join(' ');
  if (/(帕姆|Pom-Pom|Pom Pom|佩佩|白露|彦卿|虎克|克拉拉|怪物|怪兽|裂界生物|反物质|虚卒|机兵|机械|机器人|生物|动物|宠物|造物|傀儡|人偶|投影)/i.test(haystack)) {
    return `NSFW 档案已阻止：${npc?.姓名 ?? (selectorValue || '目标')} 属于非人/生物形态/怪物/机械/未成年或暂不支持对象。`;
  }
  return null;
}

function pushQueueTask(
  state: UseGameStateReturn,
  id: 队列任务ID,
  status: 队列任务状态,
  patch?: {
    title?: string;
    subtitle?: string;
    detail?: string;
    rawText?: string;
    turn?: number;
    failCount?: number;
    retrying?: boolean;
    cancellable?: boolean;
    cancelled?: boolean;
  },
) {
  const titleMap: Record<队列任务ID, string> = {
    main_story: '主剧情生成',
    memory: '记忆整理',
    variable: '变量生成',
    news: '星际和平周报',
    world_evolution: '世界演变',
    yiting: '忆庭召回',
    zhiku: '智库检索',
    phone: '手机来信',
    autosave: '自动存档',
  };
  const subtitleMap: Record<队列任务ID, string> = {
    main_story: '主 API 输出正文与行动选项',
    memory: '即时记忆写入与自动压缩',
    variable: '解析正文并落地变量命令',
    news: '独立 API 推演新闻与后台事件',
    world_evolution: '后续接入独立世界演变 API',
    yiting: '后续接入回忆检索队列',
    zhiku: '独立 API 检索原著资料',
    phone: '主动来信种子与通讯入口',
    autosave: '写入最近自动存档',
  };
  state.setQueueTasks((prev) => [
    ...prev.slice(-24),
    {
      id,
      title: patch?.title ?? titleMap[id],
      subtitle: patch?.subtitle ?? subtitleMap[id],
      turn: patch?.turn ?? state.turnCount,
      timestamp: Date.now(),
      status,
      detail: patch?.detail,
      rawText: patch?.rawText,
      failCount: patch?.failCount,
      retrying: patch?.retrying,
      cancellable: patch?.cancellable,
      cancelled: patch?.cancelled,
    },
  ]);
}

function splitStreamingReveal(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const sentenceChunks = trimmed.match(/[^。！？!?；;\n]+[。！？!?；;\n]?/g)?.filter(Boolean) ?? [];
  if (sentenceChunks.length > 1) return sentenceChunks;
  const chars = Array.from(trimmed);
  if (chars.length <= 16) return [trimmed];
  const chunkSize = Math.max(4, Math.ceil(chars.length / 10));
  const chunks: string[] = [];
  for (let i = 0; i < chars.length; i += chunkSize) {
    chunks.push(chars.slice(i, i + chunkSize).join(''));
  }
  return chunks;
}

function isPageHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

function waitStreamingPreviewDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted || isPageHidden() || typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    let done = false;
    let timer: number | undefined;
    const finish = () => {
      if (done) return;
      done = true;
      if (typeof timer === 'number') window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const onVisibilityChange = () => {
      if (isPageHidden()) finish();
    };
    timer = window.setTimeout(finish, ms);
    document.addEventListener('visibilitychange', onVisibilityChange);
    signal?.addEventListener('abort', finish, { once: true });
  });
}

function buildRecentTurnWindowForNews(history: 聊天消息[], currentUserInput: string, currentBody: string, interval: number): string[] {
  const windowSize = Math.max(5, Math.min(10, Math.trunc(interval) || 5));
  const pairs: string[] = [];
  let pendingUser = '';

  for (const msg of history) {
    if (msg.role === 'user') {
      pendingUser = msg.content;
      continue;
    }
    if (msg.role === 'assistant') {
      const body = msg.parsedResponse?.body || msg.content;
      if (pendingUser || body) {
        pairs.push(`- 玩家：${pendingUser || '（无）'}\n  正文：${body.slice(0, 420)}`);
      }
      pendingUser = '';
    }
  }

  pairs.push(`- 玩家：${currentUserInput || '（无）'}\n  正文：${currentBody.slice(0, 420)}`);
  return pairs.slice(-windowSize);
}

async function revealStreamingPreview(
  state: UseGameStateReturn,
  text: string,
  signal?: AbortSignal,
  options?: { delayMs?: number; minChunks?: number },
): Promise<void> {
  const chunks = splitStreamingReveal(text);
  if (!chunks.length) return;
  if (isPageHidden()) {
    state.setStreamingMessage(text.trim());
    return;
  }
  const minChunks = options?.minChunks ?? 8;
  const delayMs = options?.delayMs ?? 18;
  const revealChunks =
    chunks.length >= minChunks
      ? chunks
      : (() => {
          const chars = Array.from(text.trim());
          const chunkSize = Math.max(3, Math.ceil(chars.length / minChunks));
          const expanded: string[] = [];
          for (let i = 0; i < chars.length; i += chunkSize) {
            expanded.push(chars.slice(i, i + chunkSize).join(''));
          }
          return expanded;
        })();

  let preview = '';
  for (const chunk of revealChunks) {
    if (signal?.aborted) return;
    preview += chunk;
    state.setStreamingMessage(preview);
    await waitStreamingPreviewDelay(delayMs, signal);
    if (isPageHidden()) {
      state.setStreamingMessage(text.trim());
      return;
    }
  }
}

function mergeYitingSystems(
  base: import('@/models/yiting').忆庭系统,
  override?: import('@/models/yiting').忆庭系统,
): import('@/models/yiting').忆庭系统 {
  if (!override) return base;
  const merged = [...base.回忆档案];
  for (const entry of override.回忆档案 ?? []) {
    if (!merged.some((item) => item.id === entry.id)) {
      merged.push(entry);
    }
  }
  return { ...override, 回忆档案: merged };
}

export interface SendWorkflowDeps {
  state: UseGameStateReturn;
  getActiveConfig: () => import('@/models/settings').API配置项 | null;
  onBeforeSend: () => void;
  onAfterSend: () => void;
  rerollContext?: {
    nonce: string;
    previousResponse: string;
  } | null;
}

function cloneForSnapshot<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function compactForRerollInstruction(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > 900 ? `${cleaned.slice(0, 900)}...` : cleaned;
}

export async function executeSendWorkflow(
  userInput: string,
  deps: SendWorkflowDeps,
): Promise<void> {
  const { state } = deps;
  const config = deps.getActiveConfig();
  if (!config) {
    alert('请先在设置中配置API');
    return;
  }
  const isOpeningSystemTrigger = state.turnCount === 1 && userInput.startsWith('[系统]');
  const openingInstruction =
    '请根据当前角色、当前场景、世界书与内置提示词，直接生成第 0 回合开场叙事。不要等待玩家再次输入。';

  // 「踏入命途狭间」触发:玩家点击邀请卡片 → App 调 handleSend('[系统] 踏入命途狭间')。
  // 在快照/作用域/systemPrompt 计算之前先把 世界.待触发狭间 转成 世界.进行中狭间——
  // 否则 currentScope 拿不到 pathAwakening,系统提示词不会切到狭间问答模块,AI 出不了题。
  const isAwakeningEnterTrigger = userInput === '[系统] 踏入命途狭间';
  let effectiveWorld: typeof state.世界 = state.世界;
  if (isAwakeningEnterTrigger && state.世界.待触发狭间) {
    effectiveWorld = 踏入命途狭间(state.世界);
    state.set世界(effectiveWorld);
  }
  const awakeningPathId = isAwakeningEnterTrigger ? effectiveWorld.进行中狭间 : undefined;
  const awakeningInstruction = awakeningPathId
    ? `玩家选择踏入「命途狭间」(命途 ID: ${awakeningPathId})。请按 pathAwakening 流程生成第一道诘问,不要推进主剧情,不要等玩家再次发言。`
    : '';

  // Abort previous request
  state.abortControllerRef.current?.abort();
  const abortController = new AbortController();
  state.abortControllerRef.current = abortController;
  const isCurrentWorkflow = () => state.abortControllerRef.current === abortController;
  const assertWorkflowActive = () => {
    if (abortController.signal.aborted || !isCurrentWorkflow()) {
      throw new DOMException('Workflow aborted', 'AbortError');
    }
  };

  deps.onBeforeSend();
  state.setLoading(true);
  state.setStreamingMessage('');
  state.setWorkflowHint('忆庭召回 / 智库检索中');
  state.setWorkflowStatus('searching');
  pushQueueTask(state, 'main_story', 'pending', { detail: '正在调用主剧情模型。', cancellable: true });
  let pendingVariableStarted = false;
  let keepWorkflowHint = false;
  let rollbackHistoryOnAbort = state.chatHistory;
  let rollbackSnapshotOnAbort: 回合快照 | null = null;

  const startTime = Date.now();

  try {
    // 0. 本回合 user 发送之前的全状态快照，留给 reroll 回滚用。
    //    避免重 roll 时上次的变量副作用堆叠（NPC / 新闻等都会双份）。
    const preTurnSnapshot: 回合快照 = {
      旅人: cloneForSnapshot(state.旅人),
      世界: cloneForSnapshot(effectiveWorld),
      记忆: cloneForSnapshot(state.记忆),
      忆庭: cloneForSnapshot(state.忆庭),
      智库: cloneForSnapshot(state.智库),
      手机: cloneForSnapshot(state.手机),
      NPC: cloneForSnapshot(state.NPC),
      相册: cloneForSnapshot(state.相册),
      新闻: cloneForSnapshot(state.新闻),
      剧情: cloneForSnapshot(state.剧情),
      剧情编织: cloneForSnapshot(state.剧情编织),
      variableBatches: cloneForSnapshot(state.variableBatches),
      queueTasks: cloneForSnapshot(state.queueTasks),
      turnCount: state.turnCount,
      pendingOpeningTrigger: state.pendingOpeningTrigger,
    };
    rollbackSnapshotOnAbort = preTurnSnapshot;

    // 1. Add user message。同时把过往 assistant 上的 snapshot 全部清掉，只保留即将生成的最新一条，
    //    避免存档无限膨胀（snapshot 只服务"最近一次 reroll"，老的没用）。
    const userMsg = 创建聊天消息('user', userInput, {
      gameTime: `${state.turnCount}`,
    });
    const purgedHistory = state.chatHistory.map((m) =>
      m.role === 'assistant' && m.preTurnSnapshot
        ? { ...m, preTurnSnapshot: undefined }
        : m,
    );
    rollbackHistoryOnAbort = purgedHistory;
    const updatedHistory = [...purgedHistory, userMsg];
    state.setChatHistory(updatedHistory);

    // 2. Build system prompt
    // currentScope 优先级:进行中狭间 > 开局/主流程。狭间专用 scope 让世界书 + 提示词模块同步切换。
    // 用 effectiveWorld(踏入触发已经把 进行中狭间 写入),否则 React 异步 setState 会让本帧还是旧 scope。
    const currentScope: 'opening' | 'main' | 'pathAwakening' = effectiveWorld.进行中狭间
      ? 'pathAwakening'
      : state.turnCount === 1
        ? 'opening'
        : 'main';
    // 命途狭间阶段:出题 vs 评判。
    //   - 玩家本回合刚点踏入 → 出题回合,AI 应该出 3 题
    //   - 进行中狭间 != null 且 不是踏入触发 → 评判回合,AI 必须落 <狭间评判> 标签
    //   - 不在狭间流程里 → undefined
    const awakeningPhase: 'question' | 'judgement' | undefined = effectiveWorld.进行中狭间
      ? (isAwakeningEnterTrigger ? 'question' : 'judgement')
      : undefined;
    const worldbookCtx = {
      recentUserInput: userInput,
      recentAIResponse: '',
      worldName: effectiveWorld.当前时段?.名称 ?? '',
      travelerName: state.旅人.姓名,
      turnCount: state.turnCount,
      startScenarioId: effectiveWorld.起航之地ID,
      startSceneName: effectiveWorld.当前地点,
      currentLocation: effectiveWorld.当前地点,
      currentScope,
      // 当前剧情模式，用于按 storyModeGate 过滤主线世界书（4 选 1）
      storyMode: effectiveWorld.剧情模式,
    };
    const recallQuery = buildMainRecallQuery({
      userInput,
      history: updatedHistory,
      currentLocation: effectiveWorld.当前地点,
      npcNames: state.NPC
        .filter((npc) => npc.同行 || Number(npc.最近回合 || 0) >= Math.max(1, state.turnCount - 15))
        .map((npc) => npc.姓名),
    });
    let newsForPrompt = state.新闻;
    let openingNewsPreprocessed = false;
    if (isOpeningSystemTrigger && state.gameSettings.新闻系统?.enabled && state.gameSettings.新闻系统?.autoGenerate) {
      pushQueueTask(state, 'news', 'pending', {
        detail: '开局前正在先处理一次星际和平周报，用作首回合世界背景。',
        cancellable: true,
      });
      try {
        const preNews = await runNewsGenerationStep({
          state,
          mainBody: '开局初始化：原著主线即将从黑塔空间站危机开始，星/穹苏醒前夕，空间站遭遇反物质军团入侵。',
          userInput,
          recentTurns: ['- 系统：开局初始化\n  正文：黑塔空间站危机即将开始，新闻系统先生成可供首回合参考的世界事件苗头。'],
          signal: abortController.signal,
          shouldCommit: isCurrentWorkflow,
        });
        assertWorkflowActive();
        openingNewsPreprocessed = true;
        newsForPrompt = preNews ?? state.新闻;
        pushQueueTask(state, 'news', 'success', {
          detail: preNews?.length ? `开局新闻预处理完成，当前 ${preNews.length} 条新闻记录。` : '开局新闻预处理完成，暂无新增新闻。',
        });
      } catch (err) {
        pushQueueTask(state, 'news', 'failed', {
          detail: err instanceof Error ? err.message : '开局新闻预处理失败。',
          failCount: state.gameSettings.新闻系统?.api.retryCount ?? 1,
        });
      }
    }
    const yitingEnabled = state.gameSettings.记忆系统?.忆庭启用 !== false;
    const yitingRecallEnabled = yitingEnabled && !isOpeningSystemTrigger && (state.gameSettings.记忆系统?.忆庭召回最早触发回合 ?? 10) < state.turnCount;
    const zhikuRecallEnabled = !isOpeningSystemTrigger && !!(state.gameSettings.智库系统?.enabled && state.智库 && worldbookCtx.recentUserInput);
    const storyWeavingGate = state.gameSettings.剧情编织系统?.enabled && state.gameSettings.剧情编织系统.currentWindow
      ? evaluateStoryWeavingGate(state.剧情编织, worldbookCtx)
      : null;
    const storyWeavingDiagnostics = state.gameSettings.剧情编织系统?.enabled && state.gameSettings.剧情编织系统.currentWindow
      ? getStoryWeavingInjectionDiagnostics(state.剧情编织)
      : null;
    pushQueueTask(state, 'yiting', yitingRecallEnabled ? 'pending' : 'skipped', {
      detail: yitingRecallEnabled ? '正在检索回忆档案。' : '未到忆庭召回回合，已跳过。',
      cancellable: yitingRecallEnabled,
    });
    const [yitingPreview, zhikuPreview] = await Promise.all([
      yitingRecallEnabled && state.忆庭 && recallQuery
        ? retrieveYitingContextWithModel(
            state.忆庭,
            recallQuery,
            state.gameSettings.记忆系统?.忆庭召回条数 ?? 8,
            state.gameSettings.记忆系统 ?? 创建默认记忆系统设置(),
            config,
            abortController.signal,
            state.gameSettings.记忆系统?.忆庭召回API.retryCount ?? 2,
          ).catch((err) => {
            pushQueueTask(state, 'yiting', 'failed', {
              detail: err instanceof Error ? err.message : '忆庭召回失败。',
              failCount: state.gameSettings.记忆系统?.忆庭召回API.retryCount ?? 1,
            });
            return null;
          })
        : Promise.resolve(null),
      zhikuRecallEnabled
        ? retrieveZhikuContextWithModel(
            state.智库,
            worldbookCtx.recentUserInput,
            state.gameSettings.智库系统?.maxRelatedEntries ?? 创建默认智库系统设置().maxRelatedEntries,
            state.gameSettings.智库系统 ?? 创建默认智库系统设置(),
            config,
            abortController.signal,
            state.gameSettings.智库系统?.api.retryCount ?? 2,
            worldbookCtx,
          ).catch((err) => {
            console.warn('[zhiku-retrieval] 智库检索失败：', err);
            return null;
          })
        : Promise.resolve(null),
    ]);
    assertWorkflowActive();
    const memoryHint = isOpeningSystemTrigger
      ? '开局专用上下文已注入：角色 / 场景 / 切入说明 / 开局世界书 / 开局 CoT'
      : yitingPreview?.injection
      ? `剧情回忆已命中，已暂停普通长短期记忆注入：强 ${yitingPreview.strongEntries?.length ?? 0} 条 / 弱 ${yitingPreview.weakEntries?.length ?? 0} 条`
      : state.gameSettings.enableMemoryInjection
      ? `记忆上下文已注入：即时 ${state.记忆.即时记忆.length} 条 / 短期 ${state.记忆.短期记忆.length} 条 / 长期 ${state.记忆.长期记忆.length} 条`
      : '记忆上下文已跳过';
    const yitingHint = !yitingEnabled
      ? '忆庭召回已关闭'
      : yitingPreview?.entries.length
      ? `剧情回忆已召回：强 ${yitingPreview.strongEntries?.length ?? 0} 条 / 弱 ${yitingPreview.weakEntries?.length ?? 0} 条`
      : yitingRecallEnabled
        ? `忆庭已召回：${state.忆庭?.回忆档案?.length ? '无相关档案' : '当前还没有可召回档案'}`
        : `忆庭已召回：未到第${(state.gameSettings.记忆系统?.忆庭召回最早触发回合 ?? 10) + 1}回合`;
    const zhikuHint = state.gameSettings.智库系统?.enabled
      ? `智库内容已注入：${
          zhikuPreview?.entries.length
            ? zhikuPreview.entries.slice(0, 2).map((entry) => entry.标题).join('、')
            : '无相关条目'
        }`
      : '智库已跳过';
    state.setWorkflowHint(isOpeningSystemTrigger ? memoryHint : `${memoryHint} · ${yitingHint} · ${zhikuHint}`);
    state.setWorkflowStatus('done');
    const immediateStoryReview = !isOpeningSystemTrigger ? buildImmediateStoryReview(updatedHistory, 12) : '';
    const storyRecallInjection = [
      immediateStoryReview
        ? ['# 即时剧情回顾', '', '【即时剧情回顾】', immediateStoryReview].join('\n')
        : '',
      yitingPreview?.injection ?? '',
    ].filter((item) => item.trim()).join('\n\n');
    let systemPrompt = isOpeningSystemTrigger
      ? buildOpeningSystemPrompt(
          state.旅人,
          effectiveWorld,
          state.gameSettings,
          state.turnCount,
          state.worldbooks,
          worldbookCtx,
          newsForPrompt,
        )
      : buildSystemPrompt(
          state.旅人,
          effectiveWorld,
          state.记忆,
          state.gameSettings,
          state.turnCount,
          state.worldbooks,
          worldbookCtx,
          state.NPC,
          state.新闻,
          state.剧情,
          state.剧情编织,
          state.智库,
          state.忆庭,
          state.手机,
          awakeningPhase,
          storyRecallInjection || (yitingRecallEnabled ? '' : undefined),
          zhikuRecallEnabled ? (zhikuPreview?.injection ?? '') : undefined,
          Boolean(yitingPreview?.injection),
        );
    if (deps.rerollContext && !isOpeningSystemTrigger) {
      systemPrompt = [
        systemPrompt,
        '',
        '# 重roll生成约束',
        `本次请求是玩家对上一版回复的重roll。重roll nonce: ${deps.rerollContext.nonce}`,
        '必须基于同一事实起点重新组织镜头、描写、对话和节奏；禁止复用上一版回复的具体段落、句式、变量草稿或行动选项。',
        '可以保留必要事实一致性，但正文展开方式必须明显不同；如果上一版已经处理某事件，本次不得因为重roll而把旧副作用当作已发生事实。',
        deps.rerollContext.previousResponse
          ? `上一版回复摘录（仅用于避重复，不是当前事实）：${compactForRerollInstruction(deps.rerollContext.previousResponse)}`
          : '',
      ].filter(Boolean).join('\n');
    }

    // 3. Prepare messages for API
    const apiMessages: 聊天消息[] = [];
    const recentHistory = getMainHistoryWindow(updatedHistory, state.gameSettings, state.记忆);
    for (const msg of recentHistory) {
      // 跳过 [系统] 触发消息，避免污染 AI 上下文
      if (msg.role === 'user' && msg.content.startsWith('[系统]')) {
        continue;
      }
      if (msg.role === 'user') {
        apiMessages.push(msg);
      } else if (msg.role === 'assistant' && msg.parsedResponse) {
        // Send the raw response text for AI context
        apiMessages.push(创建聊天消息('assistant', msg.content));
      }
    }
    if (isOpeningSystemTrigger) {
      apiMessages.push(创建聊天消息('user', openingInstruction));
    }
    // [系统] 触发被 API 过滤 → 必须额外推一条真实指令,否则 AI 收到空白消息直接卡住。
    if (isAwakeningEnterTrigger && awakeningInstruction) {
      apiMessages.push(创建聊天消息('user', awakeningInstruction));
    }
    // 评判回合:再追加一条系统级提醒,强化「必输 <狭间评判> 标签」的指令优先级。
    // 实践中,AI 若只在 system prompt 里看到此规则,容易在长正文里漏掉标签;把它升到 user 末尾会显著提高遵循率。
    if (awakeningPhase === 'judgement') {
      apiMessages.push(
        创建聊天消息(
          'user',
          '⚠ 命途狭间·回应回合提醒:你上一回合已出三题,玩家本轮给出了答案。本回合**必须**在所有标签之外、**单独**写一行 `<狭间评判>升阶</狭间评判>`。命途狭间没有失败、滞留或退转;三问只是让玩家明确自己的道路。漏掉这个标签会让玩家永远卡在虚境无法升阶——这是必须避免的错误。同时正文里要让命途意志回应玩家答案、确认其道路,再把旅人从虚境拉回现实场景。',
        ),
      );
    }

    // 3b. CoT 伪装历史注入：在消息序列最前面塞一对 user/assistant，强化思考段输出习惯。
    //     仅在 enableCotFakeHistory 时生效；放在所有真实历史之前，不影响正文上下文。
    if (state.gameSettings.enableCotFakeHistory && !isOpeningSystemTrigger) {
      apiMessages.unshift(
        创建聊天消息('user', COT_FAKE_HISTORY_USER),
        创建聊天消息('assistant', COT_FAKE_HISTORY_ASSISTANT),
      );
    }

    const forcePreviewStream = (() => {
      const provider = config.provider;
      const baseUrl = config.baseUrl.toLowerCase();
      return provider === 'deepseek' || baseUrl.includes('deepseek');
    })();

    // 4. Stream AI response（含自动重试循环）
    let streamedText = '';
    let streamEventCount = 0;
    let previewText = '';
    let previewChain: Promise<void> = Promise.resolve();
    let result: Awaited<ReturnType<typeof sendChatMessage>>;
    const maxAttempts = state.gameSettings.autoRetryOnError
      ? Math.max(1, state.gameSettings.autoRetryCount) + 1
      : 1;
    let lastErr: unknown = null;
    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt++;
      streamedText = '';
      streamEventCount = 0;
      previewText = '';
      previewChain = Promise.resolve();
      state.setStreamingMessage('');
      try {
        result = await sendChatMessage(config, {
          messages: apiMessages,
          systemPrompt,
          onDelta: (delta) => {
            streamedText += delta;
            if (!state.gameSettings.enableStreaming || isPageHidden()) {
              state.setStreamingMessage(streamedText);
              return;
            }
            streamEventCount += 1;
            previewChain = previewChain.then(async () => {
              const chunks = splitStreamingReveal(delta);
              for (const chunk of chunks) {
                if (abortController.signal.aborted) return;
                previewText += chunk;
                state.setStreamingMessage(previewText);
                await waitStreamingPreviewDelay(14, abortController.signal);
                if (isPageHidden()) {
                  state.setStreamingMessage(streamedText);
                  previewText = streamedText;
                  return;
                }
              }
            });
          },
          signal: abortController.signal,
          streaming: state.gameSettings.enableStreaming && !forcePreviewStream && !isPageHidden(),
          repairTags: state.gameSettings.enableTagRepair,
        });
        const candidateText = (result.parsed.body?.trim() || result.fullText.trim() || streamedText.trim());
        if (!candidateText) {
          if (attempt < Math.max(2, maxAttempts)) {
            console.warn(`[sendWorkflow] 第 ${attempt} 次返回空响应，自动重试。`);
            continue;
          }
          throw new Error('AI response was empty');
        }
        lastErr = null;
        break;
      } catch (innerErr) {
        if ((innerErr as Error).name === 'AbortError' || abortController.signal.aborted) {
          throw innerErr;
        }
        lastErr = innerErr;
        if (attempt >= maxAttempts) break;
        pushQueueTask(state, 'main_story', 'pending', {
          detail: `主剧情生成失败 ${attempt} 次，正在自动重试。`,
          failCount: attempt,
          retrying: true,
          cancellable: true,
        });
        console.warn(`[sendWorkflow] 第 ${attempt}/${maxAttempts} 次尝试失败，自动重试：`, innerErr);
      }
    }
    if (lastErr) throw lastErr;
    // 进入下面流程：result 一定已被赋值（lastErr 为空意味着 break 出循环）
    result = result!;

    if (abortController.signal.aborted || !isCurrentWorkflow()) return;

    // 5. Build AI message
    const duration = (Date.now() - startTime) / 1000;
    pushQueueTask(state, 'main_story', 'success', {
      detail: `正文生成完成，用时 ${Math.round(duration)}s。`,
    });
    const parsedBody = normalizePlayerSpeechInBody({
      body: result.parsed.body?.trim() ?? '',
      playerName: state.旅人.姓名 || state.旅人.别名 || '你',
      userInput,
    });
    const sanitizedRawText = replaceBodyInRawResponse(
      result.parsed.rawText || result.fullText || streamedText,
      parsedBody,
    );
    const displayText = parsedBody || result.fullText || streamedText;
    if (state.gameSettings.enableStreaming) {
      if (streamEventCount > 0) {
        await previewChain;
      } else if (displayText.trim()) {
        await revealStreamingPreview(state, displayText, abortController.signal, {
          delayMs: 16,
          minChunks: 8,
        });
      }
      state.setStreamingMessage('');
    }
    // 给狭间消息预先打上 awakenPathId 标签:出题/评判回合,此时 effectiveWorld.进行中狭间 还没清空,
    // 把命途 ID 写进 parsedResponse,让 TurnItem 在 进行中狭间 清空后仍能拿到命途名做美化。
    // 兜底:如果 effectiveWorld 当前帧没拿到(罕见 race),从 chatHistory 向前找最近一条出题消息
    // 取它的 awakenPathId,确保评判消息一定拿得到命途名。
    const isAwakeningTurn =
      !!(result.parsed.awakenQuestions?.trim() || result.parsed.awakenJudgement?.trim());
    let awakenPathId = '';
    if (isAwakeningTurn) {
      awakenPathId = effectiveWorld.进行中狭间 ?? '';
      if (!awakenPathId) {
        for (let i = updatedHistory.length - 1; i >= 0; i--) {
          const prev = updatedHistory[i];
          const prevPid = prev?.parsedResponse?.awakenPathId;
          if (prevPid) {
            awakenPathId = prevPid;
            break;
          }
        }
      }
    }
    const baseParsed = parsedBody
      ? { ...result.parsed, body: parsedBody, rawText: sanitizedRawText }
      : { ...result.parsed, body: displayText, rawText: sanitizedRawText };
    const parsedForDisplay = awakenPathId
      ? { ...baseParsed, awakenPathId }
      : baseParsed;
    const aiMsg = 创建聊天消息('assistant', displayText, {
      gameTime: `${state.turnCount}`,
      parsedResponse: parsedForDisplay,
      responseDurationSec: duration,
      preTurnSnapshot,
      debugContext: {
        systemPrompt,
        messages: apiMessages.map((msg) => ({ role: msg.role, content: msg.content })),
        zhikuRecallPreview: formatZhikuDiagnosticsPreview(zhikuPreview?.diagnostics),
        recallPreview: [
          yitingPreview?.previewText ?? '',
          storyWeavingGate
            ? `剧情编织门禁：${storyWeavingGate.mode}｜第 ${storyWeavingGate.分段组号 ?? '?'} 段｜${storyWeavingGate.reasons.join('；') || '无命中理由'}`
            : '',
          storyWeavingDiagnostics
            ? [
              `剧情编织注入健康：${storyWeavingDiagnostics.健康状态}`,
              `剧情编织实际注入：第 ${storyWeavingDiagnostics.当前分段组号} 段「${storyWeavingDiagnostics.当前分段标题}」｜${storyWeavingDiagnostics.当前分段运行状态}`,
              storyWeavingDiagnostics.归档锚点标题 ? `已跳过归档锚点：第 ${storyWeavingDiagnostics.归档锚点组号} 段「${storyWeavingDiagnostics.归档锚点标题}」` : '',
              storyWeavingDiagnostics.前一分段标题 ? `历史承接段：${storyWeavingDiagnostics.前一分段标题}` : '',
              storyWeavingDiagnostics.下一分段标题 ? `下一段预热：${storyWeavingDiagnostics.下一分段标题}` : '',
              storyWeavingDiagnostics.检查项.length ? `注入检查：${storyWeavingDiagnostics.检查项.join('；')}` : '',
            ].filter(Boolean).join('\n')
            : '',
          formatZhikuDiagnosticsPreview(zhikuPreview?.diagnostics),
        ].filter(Boolean).join('\n\n'),
      },
    });
    const finalHistory = [...updatedHistory, aiMsg];
    state.setChatHistory(finalHistory);
    state.setTurnCount((prev) => prev + 1);
    state.setStreamingMessage('');
    state.setLoading(false);
    state.setPendingVariable(true);
    pendingVariableStarted = true;

    // 6. Update memory
    pushQueueTask(state, 'memory', 'pending', { detail: '正在写入即时记忆并检查压缩阈值。' });
    const rawMemory = buildImmediateMemory(userInput, [
      result.parsed.memory?.trim() ? `本回合小结：${result.parsed.memory.trim()}` : '',
      displayText,
    ].filter(Boolean).join('\n\n'));
    let mem = addImmediateMemory(state.记忆, rawMemory, state.turnCount);
    const compression = await autoCompressMemorySystemWithArchivesAsync(
      mem,
      state.turnCount,
      state.gameSettings.记忆系统 ?? 创建默认记忆系统设置(),
      config,
      abortController.signal,
    );
    assertWorkflowActive();
    mem = compression.memory;
    state.set记忆(mem);
    const yitingWithCompression = state.忆庭;
    pushQueueTask(state, 'memory', 'success', {
      detail: compression.usedModel
        ? '即时/短期/长期记忆已调用记忆总结 API 完成整理。'
        : '即时/短期/长期记忆已使用本地摘要完成整理。',
    });

    // 7 / 7a / 7b. 世界 + 旅人 的本回合修改全部累计到本地变量,最后一次性 set。
    //     这样在 8.5 变量校准里能拿到这些修改作为 snapshot——否则变量模型 commit 时
    //     会用「函数开始那一刻的 state.世界」覆盖,把刚写入的 待触发狭间/进行中狭间 抹掉,
    //     表现就是「狭间邀请卡片在变量校准结束后突然消失」。
    //     worldAfter 用 effectiveWorld 初始化(踏入触发已经把 进行中狭间 写入)。
    let worldAfter: typeof state.世界 = 归一化世界状态(effectiveWorld);
    let travelerAfter: typeof state.旅人 = state.旅人;

    // 7. 全局事件
    if (result.parsed.worldEvents.length) {
      worldAfter = {
        ...worldAfter,
        全局事件: [...worldAfter.全局事件, ...result.parsed.worldEvents],
      };
    }

    // 7a. 命途狭间·邀请发出 → 写入 世界.待触发狭间
    //     校验:必须是已踏上 + 待升阶 的命途,才允许邀请落地。AI 偶发误标(把已经过去的命途
    //     又邀请一次)直接静默丢弃。
    if (result.parsed.awakenInvite?.trim() && !worldAfter.待触发狭间 && !worldAfter.进行中狭间) {
      const invitedId = 解析命途ID(result.parsed.awakenInvite);
      if (invitedId) {
        const target = (travelerAfter.命途列表 ?? []).find((p) => p.id === invitedId);
        if (target?.待升阶) {
          worldAfter = { ...worldAfter, 待触发狭间: invitedId };
        } else {
          console.warn('[sendWorkflow] 命途狭间邀请被忽略:目标命途未达待升阶状态:', invitedId);
        }
      } else {
        console.warn('[sendWorkflow] 无法解析狭间邀请的命途 ID:', result.parsed.awakenInvite);
      }
    }

    // 7b. 命途狭间·评判落地 → 调用 应用狭间结果,清空 世界.进行中狭间
    if (result.parsed.awakenJudgement?.trim() && worldAfter.进行中狭间) {
      const pathId = worldAfter.进行中狭间;
      const judgementRaw = result.parsed.awakenJudgement.trim();
      const judgement: 狭间评判 | null =
        judgementRaw.includes('升阶')
        || judgementRaw.includes('突破')
        || judgementRaw.includes('确认')
        || /promote|advance|awaken/i.test(judgementRaw)
          ? '升阶'
          : null;
      if (judgement) {
        const res = 应用狭间结果(travelerAfter, pathId, judgement);
        if (res.ok) {
          travelerAfter = res.traveler;
        } else {
          console.warn('[sendWorkflow] 应用狭间结果失败:', res.reason);
        }
        // 不论成功失败都清掉 进行中狭间,避免卡死在狭间回合
        worldAfter = { ...worldAfter, 进行中狭间: undefined };
      } else {
        console.warn('[sendWorkflow] 无法识别的狭间评判:', judgementRaw);
      }
    }

    // 一次性 commit。直接传值不用 functional updater,因为 worldAfter / travelerAfter
    // 已基于 state.世界 / state.旅人 派生,React 批处理后效果等价。
    if (worldAfter !== state.世界) state.set世界(worldAfter);
    if (travelerAfter !== state.旅人) state.set旅人(travelerAfter);

    // 8.5 变量模型校准：主回复完成 → 调用独立的变量模型分析正文，把结构化命令落地。
    //     失败/超时不影响主流程，只在 console 报警。
    pushQueueTask(state, 'variable', state.gameSettings.enableVariableUpdate ? 'pending' : 'skipped', {
      detail: state.gameSettings.enableVariableUpdate ? '正在调用变量模型校准正文。' : '变量更新未启用，已跳过。',
    });
    const variableOverrides = await runVariableCalibrationStep({
      state,
      mainApiConfig: config,
      userInput,
      body: displayText,
      variableDraft: result.parsed.variableDraft,
      turnAfter: state.turnCount + 1,
      // 本回合主流程已经更新过的切片，传入保证变量模型看到最新值
      memorySystemSnapshot: mem,
      // 7/7a/7b 累积的 旅人 / 世界 也要带进去——否则校准 commit 会用旧值覆盖,
      // 把刚写入的 待触发狭间 / 应用狭间结果后的命途列表抹掉。
      travelerSnapshot: travelerAfter,
      worldSnapshot: worldAfter,
      signal: abortController.signal,
      allowYiting: yitingEnabled,
      shouldCommit: isCurrentWorkflow,
      });
      assertWorkflowActive();
      if (state.gameSettings.enableVariableUpdate) {
        const variableApplied = Boolean(variableOverrides && Object.keys(variableOverrides).some((key) => key !== 'batch'));
        pushQueueTask(state, 'variable', 'success', {
          detail: variableApplied ? '变量命令已落地。' : '本回合没有可落地的变量命令，已记录变量报告。',
        });
      }

      const npcSource = variableOverrides?.NPC ?? state.NPC;
      const archiveEnrichment = enrichNpcArchives(npcSource, {
        nsfwEnabled: state.gameSettings.enableNsfw,
        maleNsfwArchiveEnabled: state.gameSettings.enableMaleNsfwArchive,
        zhiku: state.智库,
      });
      const npcSourceForCompression = archiveEnrichment.records;
      const memorySettings = state.gameSettings.记忆系统 ?? 创建默认记忆系统设置();
      let npcAfterCompression = npcSourceForCompression.map((npc) => {
        const existingMemories = 提取NPC同行记忆文本列表(npc);
        const nextMemoryTexts = compressNpcMemories(
          existingMemories,
          memorySettings.NPC记忆压缩阈值,
          memorySettings.NPC记忆压缩提示词,
        );
        if (
          nextMemoryTexts.length === existingMemories.length &&
          nextMemoryTexts.every((item, index) => item === existingMemories[index])
        ) {
          return npc;
        }
        const previousEntries = npc.同行记忆 ?? [];
        const nextMemories: NPC同行记忆条目[] = nextMemoryTexts.map((summary, index) => {
          const existing = previousEntries.find((entry) => entry.摘要 === summary);
          if (existing) return existing;
          return {
            id: `npc_mem_${npc.id}_${state.turnCount}_${index}_${Math.random().toString(36).slice(2, 6)}`,
            回合: state.turnCount,
            摘要: summary,
            来源: '变量',
            关联NPCID: [npc.id],
          };
        });
        return { ...npc, 同行记忆: nextMemories };
      });
      const npcChanged =
        archiveEnrichment.changed ||
        npcAfterCompression.length !== npcSource.length ||
        npcAfterCompression.some((npc, index) => npc !== npcSource[index]);
      if (npcChanged) {
        state.setNPC(npcAfterCompression);
      }

      let memoryAfterStoryProgress = variableOverrides?.记忆 ?? mem;
      const storyAlignment = autoAlignCanonStoryProgress({
        storyWeaving: state.剧情编织,
        turnCount: state.turnCount + 1,
        userInput,
        body: displayText,
        gateSnapshot: storyWeavingGate,
      });
      const storyProgressMemoryLine = storyAlignment.progressed
        ? buildStoryProgressMemoryLine(state.剧情编织, storyAlignment.system)
        : '';
      let storyWeavingForSave = storyAlignment.system;
      let storyWeavingConcurrentChange = false;
      if (storyAlignment.changed) {
        assertWorkflowActive();
        const resolvedStory = await resolveStoryWeavingForBackgroundWrite({
          workflowBase: state.剧情编织,
          proposed: storyAlignment.system,
        });
        storyWeavingForSave = resolvedStory.system;
        storyWeavingConcurrentChange = resolvedStory.concurrentChange;
        if (!storyWeavingConcurrentChange) {
          state.set剧情编织(storyWeavingForSave);
          await saveSetting('storyWeavingSystem', storyWeavingForSave);
        } else {
          pushQueueTask(state, 'zhiku', 'success', {
            detail: '检测到剧情编织面板已有更新，本回合后台未覆盖最新导入/分解结果。',
          });
        }
        assertWorkflowActive();
        if (storyProgressMemoryLine && !storyWeavingConcurrentChange) {
          memoryAfterStoryProgress = addImmediateMemory(memoryAfterStoryProgress, storyProgressMemoryLine, state.turnCount + 1);
          mem = memoryAfterStoryProgress;
          state.set记忆(memoryAfterStoryProgress);
          const npcAfterStoryProgress = applyStoryProgressNpcMemory(
            npcAfterCompression,
            storyWeavingForSave,
            storyProgressMemoryLine,
            state.turnCount + 1,
          );
          if (npcAfterStoryProgress !== npcAfterCompression) {
            npcAfterCompression = npcAfterStoryProgress;
            state.setNPC(npcAfterCompression);
          }
        }
      }
      let zhikuAfterRuntimeUnlock = state.智库;
      if (storyAlignment.progressed && !storyWeavingConcurrentChange) {
        const zhikuUnlock = applyStoryArchiveZhikuRuntimeUnlock({
          zhiku: state.智库,
          storyWeaving: storyWeavingForSave,
        });
        if (zhikuUnlock.changed) {
          assertWorkflowActive();
          zhikuAfterRuntimeUnlock = zhikuUnlock.system;
          state.set智库(zhikuAfterRuntimeUnlock);
          await saveSetting('zhikuSystem', buildPersistedZhikuSystem(zhikuAfterRuntimeUnlock));
          assertWorkflowActive();
          pushQueueTask(state, 'zhiku', 'success', {
            detail: `剧情归档已更新智库门禁：${zhikuUnlock.unlocked.slice(0, 3).map((item) => `${item.title}→${item.status}`).join('、')}${zhikuUnlock.unlocked.length > 3 ? ` 等 ${zhikuUnlock.unlocked.length} 项` : ''}。`,
          });
        }
      }
      const newsSettings = state.gameSettings.新闻系统;
      const newsEnabled = Boolean(newsSettings?.enabled && newsSettings?.autoGenerate);
      const newsInterval = Math.max(5, Math.min(10, Math.trunc(newsSettings?.generateIntervalTurns ?? 5) || 5));
      const newsTurn = state.turnCount + 1;
      const shouldRunOpeningNews = isOpeningSystemTrigger && newsEnabled;
      const shouldRunNews = newsEnabled && ((shouldRunOpeningNews && !openingNewsPreprocessed) || (newsTurn > 0 && newsTurn % newsInterval === 0));
      let newsAfterGeneration = state.新闻;
      if (!newsSettings?.enabled || !newsSettings?.autoGenerate) {
        pushQueueTask(state, 'news', 'skipped', {
          detail: '星际和平周报未开启，已跳过。',
        });
      } else if (!shouldRunNews) {
        pushQueueTask(state, 'news', 'skipped', {
          detail: `未到新闻触发间隔（每 ${newsInterval} 回合一次），已跳过。`,
        });
      } else {
        pushQueueTask(state, 'news', 'pending', {
          detail: shouldRunOpeningNews
            ? '开局首回合正在先处理一次星际和平周报。'
            : `正在调用星际和平周报独立 API（读取最近 ${newsInterval} 回合）。`,
          cancellable: true,
        });
        newsAfterGeneration =
          (await runNewsGenerationStep({
            state,
            mainBody: displayText,
            userInput,
            recentTurns: buildRecentTurnWindowForNews(finalHistory, userInput, displayText, newsInterval),
            storyWeavingSnapshot: storyWeavingForSave,
            signal: abortController.signal,
            shouldCommit: isCurrentWorkflow,
          })) ?? state.新闻;
        assertWorkflowActive();
        pushQueueTask(state, 'news', 'success', {
          detail: '星际和平周报检查完成。',
        });
      }

      const yitingBase = mergeYitingSystems(yitingWithCompression, variableOverrides?.忆庭);
      const turnRecallSource = {
        turn: state.turnCount,
        userInput,
        body: displayText,
        memory: result.parsed.memory,
        worldEvents: storyProgressMemoryLine
          ? [...result.parsed.worldEvents, storyProgressMemoryLine]
          : result.parsed.worldEvents,
        actionOptions: result.parsed.actionOptions,
        gameTime: effectiveWorld?.当前日期 || undefined,
        gameClock: effectiveWorld?.当前时间 || undefined,
        location: effectiveWorld?.当前地点 || undefined,
      };
      // 忆庭入库始终执行；这里的开关只控制“是否召回并注入正文”。
      const turnRecallEntryResult = await buildYitingArchiveEntry(
        turnRecallSource,
        memorySettings,
        config,
        abortController.signal,
        memorySettings.忆庭召回API.retryCount ?? 2,
      );
      assertWorkflowActive();
      const turnRecallEntry = turnRecallEntryResult.entry;
      const yitingAfterTurnRecall = upsertRecallEntry(yitingBase, turnRecallEntry);
      state.set忆庭(yitingAfterTurnRecall);
      pushQueueTask(state, 'memory', 'success', {
        detail: turnRecallEntryResult.usedFallback ? '忆庭纪要已使用主回复小总结入库。' : '忆庭纪要已由独立模型压缩并入库。',
      });
      if (!yitingEnabled) {
        pushQueueTask(state, 'yiting', 'skipped', {
          detail: '忆庭召回已关闭，但入库仍已执行。',
        });
      } else if (!yitingRecallEnabled) {
        pushQueueTask(state, 'yiting', 'skipped', {
          detail: `未到第${(memorySettings.忆庭召回最早触发回合 ?? 10) + 1}回合，忆庭召回已跳过。`,
        });
      } else if (yitingPreview?.entries.length) {
        pushQueueTask(state, 'yiting', 'success', {
          detail: yitingPreview.usedModel ? '忆庭召回已由独立模型完成。' : '忆庭召回已由本地摘要检索完成。',
        });
      } else {
        pushQueueTask(state, 'yiting', 'success', {
          detail: '忆庭已检索，本回合没有命中相关档案。',
        });
      }

      let phoneAfterFallbackSeed = variableOverrides?.手机 ?? state.手机;
      if (state.gameSettings.手机系统.enabled && state.gameSettings.手机系统.autoGenerateSeeds) {
        const fallbackSeed = buildFallbackPhoneSeed({
          phone: phoneAfterFallbackSeed,
          npcs: npcAfterCompression,
          turn: state.turnCount + 1,
          userInput,
          body: displayText,
          maxSeedsPerTurn: state.gameSettings.手机系统.maxSeedsPerTurn,
          contactCooldownTurns: state.gameSettings.手机系统.contactCooldownTurns,
        });
        if (fallbackSeed) {
          phoneAfterFallbackSeed = {
            ...phoneAfterFallbackSeed,
            messageSeeds: [...phoneAfterFallbackSeed.messageSeeds, fallbackSeed],
            unreadTotal: phoneAfterFallbackSeed.unreadTotal + 1,
          };
          state.set手机(phoneAfterFallbackSeed);
          pushQueueTask(state, 'phone', 'success', {
            detail: `已补充低频主动来信种子：${fallbackSeed.title}。`,
          });
        }
      }

      // 9. Auto-save —— 每回合只在后台队列收尾写一次，避免正文/变量阶段重复生成多条自动存档。
      if (state.gameSettings.enableAutoSaveEveryTurn) {
        pushQueueTask(state, 'autosave', 'pending', { detail: '正在写入本回合自动存档。' });
        const variableBatchesForSave = variableOverrides?.batch
          ? [...state.variableBatches, variableOverrides.batch]
          : state.variableBatches;
        const saveData = buildSavePayload(state, 'auto', {
          chatHistory: finalHistory,
          记忆: memoryAfterStoryProgress,
          忆庭: yitingAfterTurnRecall,
          手机: phoneAfterFallbackSeed,
          旅人: variableOverrides?.旅人,
          世界: variableOverrides?.世界,
          NPC: npcAfterCompression,
          新闻: newsAfterGeneration ?? variableOverrides?.新闻,
          剧情: variableOverrides?.剧情,
          剧情编织: storyWeavingForSave,
          智库: zhikuAfterRuntimeUnlock,
          variableBatches: variableBatchesForSave,
          queueTasks: state.queueTasks,
          turnCount: state.turnCount + 1,
        });
        assertWorkflowActive();
        await saveGame(saveData);
        assertWorkflowActive();
        pushQueueTask(state, 'autosave', 'success', { detail: '本回合自动存档完成。' });
        state.setHasSave(true);
      }

    await saveSetting('theme', state.currentTheme);
    await saveSetting('apiSettings', state.apiSettings);
    await saveSetting('gameSettings', state.gameSettings);
    await saveSetting('worldbooks', state.worldbooks);
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError' || abortController.signal.aborted) {
      state.setChatHistory(rollbackHistoryOnAbort);
      if (rollbackSnapshotOnAbort) {
        const rollbackStoryWeaving = restorePreTurnSnapshot(state, rollbackSnapshotOnAbort);
        await saveSetting('storyWeavingSystem', rollbackStoryWeaving);
      }
      state.setWorkflowHint('已停止生成，本次输入已回到输入框，可修改后重新发送。');
      state.setWorkflowStatus('');
      keepWorkflowHint = true;
    } else {
      console.error('Send workflow error:', err);
      keepWorkflowHint = true;
      const detail = err instanceof Error ? err.message : '主流程调用失败。';
      state.setWorkflowHint(`主流程失败：${detail}`);
      state.setWorkflowStatus('');
      pushQueueTask(state, 'main_story', 'failed', {
        detail,
        failCount: state.gameSettings.autoRetryOnError ? Math.max(1, state.gameSettings.autoRetryCount) : 1,
      });
    }
  } finally {
    if (isCurrentWorkflow()) {
      state.setLoading(false);
      state.setStreamingMessage('');
      if (!keepWorkflowHint) {
        state.setWorkflowHint('');
        state.setWorkflowStatus('');
      }
      state.setPendingVariable(false);
      if (!pendingVariableStarted) {
        pushQueueTask(state, 'memory', 'idle', { detail: '主剧情未完成，本轮后台任务未启动。' });
        pushQueueTask(state, 'variable', 'idle', { detail: '主剧情未完成，本轮后台任务未启动。' });
        pushQueueTask(state, 'news', 'idle', { detail: '主剧情未完成，本轮后台任务未启动。' });
        pushQueueTask(state, 'autosave', 'idle', { detail: '主剧情未完成，本轮后台任务未启动。' });
      }
      state.abortControllerRef.current = null;
      deps.onAfterSend();
    }
  }
}

// ── 变量模型校准 ──

interface VariableCalibrationParams {
  state: UseGameStateReturn;
  mainApiConfig: import('@/models/settings').API配置项;
  userInput: string;
  body: string;
  variableDraft?: string;
  /** 主流程结束后的回合数(已 +1)。 */
  turnAfter: number;
  memorySystemSnapshot: import('@/models/memory').记忆系统;
  /** 7/7a/7b 后的旅人快照(包含 应用狭间结果 写入的命途列表变化)。 */
  travelerSnapshot?: import('@/models/character').角色数据结构;
  /** 7/7a/7b 后的世界快照(包含全局事件追加、待触发狭间写入、进行中狭间清空)。 */
  worldSnapshot?: import('@/models/world').世界状态;
  signal?: AbortSignal;
  allowYiting?: boolean;
  shouldCommit?: () => boolean;
}

interface VariableCalibrationOverrides {
  旅人?: import('@/models/character').角色数据结构;
  世界?: import('@/models/world').世界状态;
  记忆?: import('@/models/memory').记忆系统;
  忆庭?: import('@/models/yiting').忆庭系统;
  智库?: import('@/models/zhiku').智库系统;
  手机?: import('@/models/phone').手机系统;
  NPC?: import('@/models/npc').NPC记录[];
  新闻?: import('@/models/news').新闻条目[];
  剧情?: import('@/models/plot').剧情节点[];
  batch?: 变量命令批次;
}

/** 执行一次变量模型校准：调用独立 API → 解析命令 → 落地 → 推入 variableBatches。
 *  失败不抛错（不影响主流程的存档）。 */
async function runVariableCalibrationStep(
  params: VariableCalibrationParams,
): Promise<VariableCalibrationOverrides | null> {
  const { state, mainApiConfig } = params;
  if (!state.gameSettings.enableVariableUpdate) return null;
  if (!params.body?.trim()) return null;

  // 选择变量模型 API：用 settings 里的 override，字段留空回退到主 API 同名字段。
  const override = state.gameSettings.variableApi;
  const overrodeAny =
    !!override.baseUrl.trim() || !!override.apiKey.trim() || !!override.model.trim();
  const variableConfig: import('@/models/settings').API配置项 = {
    ...mainApiConfig,
    provider: override.provider || mainApiConfig.provider,
    baseUrl: override.baseUrl.trim() || mainApiConfig.baseUrl,
    apiKey: override.apiKey.trim() || mainApiConfig.apiKey,
    model: override.model.trim() || mainApiConfig.model,
    maxTokens: override.maxTokens ?? mainApiConfig.maxTokens,
    temperature: override.temperature ?? mainApiConfig.temperature,
  };

  // 构造当前状态快照(用主流程已更新过的切片)。
  const stateSnapshot = snapshotVariableState({
    旅人: params.travelerSnapshot ?? state.旅人,
    世界: params.worldSnapshot ?? state.世界,
    记忆: params.memorySystemSnapshot,
    忆庭: state.忆庭,
    智库: state.智库,
    手机: state.手机,
    NPC: state.NPC,
    新闻: state.新闻,
    剧情: state.剧情,
  });

  try {
    const { rawText } = await callVariableModel(variableConfig, {
      body: params.body,
      variableDraft: params.variableDraft,
      userInput: params.userInput,
      turnCount: params.turnAfter - 1, // 这条变量是给「刚结束的那回合」用的
      state: stateSnapshot,
      nsfwEnabled: state.gameSettings.enableNsfw,
      maleNsfwArchiveEnabled: state.gameSettings.enableMaleNsfwArchive,
      signal: params.signal,
      retryCount: state.gameSettings.variableApi.retryCount ?? 2,
    });
    if (params.signal?.aborted || params.shouldCommit?.() === false) return null;

    const parsedFacts = parseVariableFacts(rawText);
    const factCommands = factsToVariableCommands(parsedFacts.facts, stateSnapshot, params.turnAfter - 1, {
      phoneSeedsEnabled: state.gameSettings.手机系统.enabled && state.gameSettings.手机系统.autoGenerateSeeds,
      maxPhoneSeedsPerTurn: state.gameSettings.手机系统.maxSeedsPerTurn,
    });
    const parsedLegacyCommands = parseVariableCommands(rawText);
    const filteredLegacyCommands = parsedLegacyCommands.commands.filter((command) => !isTravelerPlayerAuthoredVariablePath(command.key));
    const skippedTravelerProfileLegacyCount = parsedLegacyCommands.commands.length - filteredLegacyCommands.length;
    const commands = [...factCommands.commands, ...filteredLegacyCommands];
    const parseErrors = [
      ...parsedFacts.parseErrors.map((reason) => `变量事实：${reason}`),
      ...parsedLegacyCommands.parseErrors.map((reason) => `变量命令：${reason}`),
    ];
    const { allowedCommands, rejectedCommands } = applyNsfwVariablePolicy(commands, {
      nsfwEnabled: state.gameSettings.enableNsfw,
      maleNsfwArchiveEnabled: state.gameSettings.enableMaleNsfwArchive,
    }, stateSnapshot.NPC as NPC记录[]);
    const { results, nextState } = reduceVariableCommands(allowedCommands, stateSnapshot);
    if (params.signal?.aborted || params.shouldCommit?.() === false) return null;

    // 解析错误也合并进 results，让玩家在面板里看到
    const errResults = parseErrors.map((reason) => ({
      command: { action: 'set' as const, key: '(解析失败)', value: null },
      ok: false,
      kind: 'error' as const,
      reason,
    }));
    const warningResults = factCommands.warnings.map((reason) => ({
      command: { action: 'set' as const, key: '(事实忽略)', value: null },
      ok: false,
      kind: 'warning' as const,
      reason,
    }));
    const rejectedResults = rejectedCommands.map((item) => ({ ...item, kind: 'rejected' as const }));
    const commandResults = results.map((item) => ({ ...item, kind: 'command' as const }));
    const allResults = [...errResults, ...warningResults, ...rejectedResults, ...commandResults];

    // 把整个 batch 推入历史
    const batch: 变量命令批次 = {
      id: `vbatch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      turn: params.turnAfter - 1,
      timestamp: Date.now(),
      source: overrodeAny ? 'calibration' : 'main',
      modelName: variableConfig.model,
      results: allResults,
      report: [
        `变量事实：${parsedFacts.facts.length} 条，生成内部命令 ${factCommands.commands.length} 条。`,
        filteredLegacyCommands.length ? `兼容旧命令：${filteredLegacyCommands.length} 条。` : '兼容旧命令：0 条。',
        skippedTravelerProfileLegacyCount ? `已静默忽略旅人核心档案旧命令：${skippedTravelerProfileLegacyCount} 条。` : '',
        factCommands.warnings.length ? `事实警告：${factCommands.warnings.length} 条。` : '事实警告：0 条。',
        ...factCommands.notes,
      ].filter(Boolean).join('\n'),
      rawText,
    };
    if (params.shouldCommit?.() === false) return null;
    state.setVariableBatches((prev) => [...prev, batch]);

    // 没有任何成功命令时，无需 setState；返回空 overrides 让 save 用主流程的值
      const anyApplied = results.some((r) => r.ok);
      const worldSelfHealed = nextState.世界 !== stateSnapshot.世界;
      if (!anyApplied && !worldSelfHealed) return { batch };
      if (params.signal?.aborted || params.shouldCommit?.() === false) return null;

    // 一次性提交所有切片到 React state。传 stateSnapshot 作 initialState,
    // commitVariableState 内部用引用相等过滤——变量模型没改的 root 不会 setState,
    // 避免覆盖玩家在校准这几秒里在 UI 上做的交互(比如点了「踏入命途狭间」)。
    commitVariableState(nextState, stateSnapshot, {
      set旅人: state.set旅人,
      set世界: state.set世界,
      set记忆: state.set记忆,
      set忆庭: params.allowYiting === false ? (() => {}) : state.set忆庭,
      set智库: state.set智库,
      set手机: state.set手机,
      setNPC: state.setNPC,
      set新闻: state.set新闻,
      set剧情: state.set剧情,
    });

    return { ...unpackVariableState(nextState), batch };
  } catch (err) {
    if ((err as Error).name === 'AbortError') return null;
    if (params.signal?.aborted || params.shouldCommit?.() === false) return null;
    console.warn('[variable-model] 校准失败：', err);
    pushQueueTask(state, 'variable', 'failed', {
      detail: (err as Error).message ?? '变量模型校准失败。',
    });
    // 失败也记一条 batch 让玩家知道
    const batch: 变量命令批次 = {
      id: `vbatch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      turn: params.turnAfter - 1,
      timestamp: Date.now(),
      source: overrodeAny ? 'calibration' : 'main',
      modelName: variableConfig.model,
      results: [{
        command: { action: 'set', key: '(变量模型调用失败)', value: null },
        ok: false,
        reason: (err as Error).message ?? '未知错误',
      }],
      rawText: err instanceof Error ? err.message : String(err ?? '变量模型调用失败'),
    };
    state.setVariableBatches((prev) => [...prev, batch]);
    return { batch };
  }
}

