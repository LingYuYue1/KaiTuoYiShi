// 世界演变 AI 步骤：只在「有到期事件 或 本回合有 <动态世界> 线索」时调用模型；
// 只返回候选，不写任何状态；失败/解析失败一律非阻断（正式世界不变，到期事件保持待结算）。
import type { API配置项 } from '@/models/settings';
import type { 世界事件实例 } from '@/models/storyWeaving';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { extractJsonLikeText, parseJsonWithRepair } from '@/services/ai/structuredOutputRepair';
import type { 世界演变候选 } from '@/services/worldEvolutionAdjudicator';
import { devLogError } from '@/utils/devLog';

export interface 世界演变步骤输入 {
  config: API配置项 | null;
  events: 世界事件实例[];
  dueInstanceIds: string[];
  clues: string[];
  当前游戏日: number;
  signal?: AbortSignal;
}

export type 世界演变步骤结果 =
  | { ok: true; skipped: true; candidates: [] }
  | { ok: true; skipped: false; candidates: 世界演变候选[] }
  | { ok: false; failureReason: string };

export function buildWorldEvolutionPrompt(input: {
  当前游戏日: number;
  dueEvents: 世界事件实例[];
  clues: string[];
}): string {
  const due = input.dueEvents.map((event) => `- ${event.eventInstanceId}｜${event.标题 || '(未命名)'}｜第 ${event.dueAt} 日到期`);
  const clues = input.clues.map((clue) => `- ${clue}`);
  return [
    '你是世界演变引擎：根据到期事件与动态世界线索，给出到期事件的结算候选。只输出 JSON 数组，不输出其他内容。',
    `【当前游戏日】第 ${input.当前游戏日} 日`,
    '【到期事件】',
    ...due,
    clues.length ? '【动态世界线索】' : '',
    ...clues,
    '【输出格式】每项一个候选：',
    '{"eventInstanceId":"到期事件 ID","action":"resolve|reschedule|ignore","outcome":"一句话结果","dueAt":8,"facts":[{"factType":"world_event","payload":{},"playerKnown":true}]}',
    '规则：只处理列出的到期事件；resolve=已解决，reschedule=延期（可给 dueAt 目标游戏日），ignore=错过；',
    'facts 为该事件产生的结构化事实，playerKnown=true 表示玩家可直接感知（会进入全局事件展示）。',
  ].filter(Boolean).join('\n');
}

/** 解析世界演变响应：支持裸数组或 {candidates:[...]}；结构非法返回 null（整体拒绝）。 */
export function parseWorldEvolutionResponse(raw: string): 世界演变候选[] | null {
  if (!raw) return null;
  try {
    // 顶层可能是数组，交由 'any' 提取后自行判定形状。
    const parsed = parseJsonWithRepair(extractJsonLikeText(raw, 'any'), 'any');
    const list = Array.isArray(parsed) ? parsed : (parsed as { candidates?: unknown }).candidates;
    if (!Array.isArray(list)) return null;
    const candidates: 世界演变候选[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const rawItem = item as Record<string, unknown>;
      if (typeof rawItem.eventInstanceId !== 'string' || !rawItem.eventInstanceId.trim()) return null;
      if (rawItem.action !== 'resolve' && rawItem.action !== 'reschedule' && rawItem.action !== 'ignore') return null;
      const facts = Array.isArray(rawItem.facts)
        ? rawItem.facts
          .filter((fact): fact is Record<string, unknown> => Boolean(fact && typeof fact === 'object' && typeof (fact as { factType?: unknown }).factType === 'string'))
          .map((fact) => ({
            factType: fact.factType as string,
            payload: fact.payload && typeof fact.payload === 'object' ? fact.payload as Record<string, unknown> : {},
            playerKnown: fact.playerKnown === true,
          }))
        : undefined;
      candidates.push({
        eventInstanceId: rawItem.eventInstanceId.trim(),
        action: rawItem.action,
        dueAt: typeof rawItem.dueAt === 'number' && Number.isFinite(rawItem.dueAt) ? Math.trunc(rawItem.dueAt) : undefined,
        outcome: typeof rawItem.outcome === 'string' ? rawItem.outcome.trim() : undefined,
        facts,
        note: typeof rawItem.note === 'string' ? rawItem.note.trim() : undefined,
      });
    }
    return candidates;
  } catch {
    return null;
  }
}

export async function runWorldEvolutionStep(params: 世界演变步骤输入): Promise<世界演变步骤结果> {
  const dueIds = new Set(params.dueInstanceIds);
  const dueEvents = params.events.filter((event) => dueIds.has(event.eventInstanceId));
  const clues = params.clues.filter((clue) => typeof clue === 'string' && clue.trim()).slice(0, 8);
  if (dueEvents.length === 0 && clues.length === 0) {
    return { ok: true, skipped: true, candidates: [] };
  }
  if (!params.config) {
    return { ok: false, failureReason: '世界演变 API 未配置，正式世界保持不变，到期事件保持待结算。' };
  }
  const prompt = buildWorldEvolutionPrompt({ 当前游戏日: params.当前游戏日, dueEvents, clues });
  try {
    const raw = await chatCompletionNonStream(params.config, {
      systemPrompt: '你是世界演变引擎，只输出 JSON，不输出其他内容。',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: params.config.maxTokens ?? 2048,
      temperature: 0.2,
      signal: params.signal,
    });
    const candidates = parseWorldEvolutionResponse(raw);
    if (!candidates) {
      return { ok: false, failureReason: '世界演变 API 返回无法解析的候选 JSON，整体拒绝，正式世界保持不变。' };
    }
    return { ok: true, skipped: false, candidates };
  } catch (error) {
    devLogError('stage', 'world_evolution.failed', error);
    return { ok: false, failureReason: '世界演变调用失败，正式世界保持不变，到期事件保持待结算。' };
  }
}
