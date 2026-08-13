import type { 记忆系统 } from '@/models/memory';
import type { 回忆条目 } from '@/models/yiting';
import type { API配置项, 记忆系统设置 } from '@/models/settings';
import type { NPC同行记忆来源, NPC同行记忆条目, NPC总结记忆条目 } from '@/models/npc';
import { summarizeMemoryBatch } from '@/services/memoryCompression';
import { 清理NPC同行记忆摘要 } from '@/utils/npcMemorySanitizer';

const MEMORY_SNIPPET_LIMIT = 84;
const NPC_MEMORY_SUMMARY_LIMIT = 160;
const NPC_MEMORY_SYSTEM_NOISE_PATTERNS = [
  /剧情编织进度/,
  /当前进入第\s*\d+\s*段/,
  /最新归档/,
  /已归档/,
  /待解[:：]/,
  /判定[:：]/,
  /推进状态/,
  /注入健康/,
  /实际注入/,
  /门禁/,
];

export function buildImmediateMemory(userInput: string, aiResponse: string): string {
  const input = userInput.trim();
  const response = aiResponse.trim();
  return [`玩家输入：${input || '（空）'}`, `剧情回应：${response || '（空）'}`].join('\n');
}

function normalizeMemorySnippet(text: string): string {
  return (text || '')
    .replace(/\s+/g, ' ')
    .replace(/^【\s*[\d:.\-\s]+\s*】\s*/, '')
    .replace(/^[-•·\d一二三四五六七八九十]+[.、)]\s*/, '')
    .trim();
}

function collectSummaryLines(items: string[], limit = 4): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const item of items) {
    const snippet = normalizeMemorySnippet(item);
    if (!snippet) continue;
    const key = snippet.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(snippet.length > MEMORY_SNIPPET_LIMIT ? `${snippet.slice(0, MEMORY_SNIPPET_LIMIT)}…` : snippet);
    if (lines.length >= limit) break;
  }
  return lines;
}

function isNpcMemorySystemNoise(text: string): boolean {
  return NPC_MEMORY_SYSTEM_NOISE_PATTERNS.some((pattern) => pattern.test(text));
}

function compactNpcMemoryChunk(chunk: string[]): string {
  const cleaned = chunk
    .map((item) => 清理NPC同行记忆摘要(item))
    .map((item) => item.replace(/^\[压缩\]\s*/u, '').trim())
    .filter(Boolean)
    .filter((item) => !isNpcMemorySystemNoise(item));
  if (!cleaned.length) return '';

  const relationshipKeywords = /认可|信任|警觉|戒备|质询|邀请|同行|托付|承诺|感谢|配合|救下|救援|保护|冲突|和解|称呼|关系|好感|怀疑|赞赏|担心|约定/;
  const prioritized = [
    ...cleaned.filter((item) => relationshipKeywords.test(item)),
    ...cleaned.filter((item) => !relationshipKeywords.test(item)),
  ];
  const lines = collectSummaryLines([...prioritized].reverse(), 3).reverse();
  const summary = lines.join('；').replace(/\s*\/\s*/g, '；').trim();
  return summary.length > NPC_MEMORY_SUMMARY_LIMIT
    ? `${summary.slice(0, NPC_MEMORY_SUMMARY_LIMIT - 1)}…`
    : summary;
}

function pickSummaryClause(text: string, limit = 48): string {
  const cleaned = normalizeMemorySnippet(text)
    .replace(/[。！？!?；;]+$/g, '')
    .trim();
  if (!cleaned) return '（空）';
  const clause = cleaned
    .split(/[。！？!?；;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join('；');
  const source = clause || cleaned;
  return source.length > limit ? `${source.slice(0, limit)}…` : source;
}

function limitSummaryLine(text: string, limit: number): string {
  const cleaned = normalizeMemorySnippet(text);
  if (!cleaned) return '无';
  return cleaned.length > limit ? `${cleaned.slice(0, limit)}…` : cleaned;
}

function buildArchiveSummary(items: string[], turn: number, kind: 'short' | 'middle' | 'long'): string {
  const lines = collectSummaryLines(items, kind === 'long' ? 5 : 4);
  const fallback = items.map(normalizeMemorySnippet).filter(Boolean).join('；');
  const body = lines.length ? lines.join('；') : fallback;
  const content = lines.length ? lines.map((line) => `- ${line}`) : [`- ${body || '空白'}`];
  const label = kind === 'long' ? '长期纪要' : kind === 'middle' ? '中期纪要' : '短期纪要';
  return [`【${label}·回合${turn}】`, ...content].join('\n');
}

function buildKeywords(items: string[]): string[] {
  return collectSummaryLines(items, 8)
    .flatMap((line) => line.split(/[，、；：:｜\s]+/))
    .map((word) => word.trim())
    .filter((word) => word.length >= 2)
    .slice(0, 16);
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of lines) {
    const normalized = raw.trim();
    if (!normalized) continue;
    const line = normalized.replace(/^[*•—·]\s*/, '- ');
    const key = line.replace(/\s+/g, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(line.startsWith('- ') ? line : `- ${line}`);
  }
  return result;
}

export function addImmediateMemory(system: 记忆系统, memory: string, _turn: number): 记忆系统 {
  void _turn;
  const newMemories = [...system.即时记忆, memory];
  const trimmed = newMemories.length > 50 ? newMemories.slice(-50) : newMemories;
  return { ...system, 即时记忆: trimmed };
}

export function checkCompressionThreshold(system: 记忆系统, threshold = 25): boolean {
  return system.即时记忆.length >= Math.max(1, Math.trunc(threshold));
}

export function compressToShortTerm(system: 记忆系统, turn: number, batchSize = 25): 记忆系统 {
  const size = Math.max(1, Math.trunc(batchSize));
  const recentRaw = system.即时记忆.slice(0, size);
  const summary = buildArchiveSummary(recentRaw, turn, 'short');

  return {
    ...system,
    即时记忆: system.即时记忆.slice(size),
    短期记忆: [...system.短期记忆, summary],
  };
}

export function createShortTermArchiveEntry(rawMemories: string[], turn: number, summaryOverride?: string): 回忆条目 {
  return {
    id: `recall_${Date.now()}`,
    名称: `【回忆${String(Math.max(1, turn)).padStart(3, '0')}】`,
    类型: '短期压缩',
    摘要: summaryOverride?.trim() || buildArchiveSummary(rawMemories, turn, 'short'),
    原文: rawMemories.join('\n'),
    检索关键词: buildKeywords(rawMemories),
    来源回合: [turn],
    回合: turn,
    时间戳: new Date().toISOString(),
  };
}

export function checkMiddleTermThreshold(system: 记忆系统, threshold = 20): boolean {
  return system.短期记忆.length >= Math.max(1, Math.trunc(threshold));
}

export function compressToMiddleTerm(system: 记忆系统, turn: number, batchSize = 20): 记忆系统 {
  const size = Math.max(1, Math.trunc(batchSize));
  const oldest = system.短期记忆.slice(0, size);
  const compressed = buildArchiveSummary(oldest, turn, 'middle');
  return {
    ...system,
    短期记忆: system.短期记忆.slice(size),
    中期记忆: [...system.中期记忆, compressed],
  };
}

export function createMiddleTermArchiveEntry(shortMemories: string[], turn: number, summaryOverride?: string): 回忆条目 {
  return {
    id: `recall_middle_${Date.now()}`,
    名称: `【中期纪要 ${String(Math.max(1, turn)).padStart(3, '0')}】`,
    类型: '中期压缩',
    摘要: summaryOverride?.trim() || buildArchiveSummary(shortMemories, turn, 'middle'),
    原文: shortMemories.join('\n'),
    检索关键词: buildKeywords(shortMemories),
    来源回合: [turn],
    回合: turn,
    时间戳: new Date().toISOString(),
  };
}

export function checkLongTermThreshold(system: 记忆系统, threshold = 10): boolean {
  return system.中期记忆.length >= Math.max(1, Math.trunc(threshold));
}

export function compressToLongTerm(system: 记忆系统, turn: number, batchSize = 10): 记忆系统 {
  const size = Math.max(1, Math.trunc(batchSize));
  const oldest = system.中期记忆.slice(0, size);
  const compressed = buildArchiveSummary(oldest, turn, 'long');
  return {
    ...system,
    中期记忆: system.中期记忆.slice(size),
    长期记忆: [...system.长期记忆, compressed],
  };
}

export function createLongTermArchiveEntry(shortMemories: string[], turn: number, summaryOverride?: string): 回忆条目 {
  return {
    id: `recall_long_${Date.now()}`,
    名称: `【精炼纪要 ${String(Math.max(1, turn)).padStart(3, '0')}】`,
    类型: '长期压缩',
    摘要: summaryOverride?.trim() || buildArchiveSummary(shortMemories, turn, 'long'),
    原文: shortMemories.join('\n'),
    检索关键词: buildKeywords(shortMemories),
    来源回合: [turn],
    回合: turn,
    时间戳: new Date().toISOString(),
  };
}

export function buildTurnRecallSummary(input: {
  userInput: string;
  body: string;
  memory: string;
  turn: number;
  worldEvents?: string[];
  actionOptions?: string[];
}): string {
  const turnLabel = String(Math.max(1, input.turn)).padStart(3, '0');
  const lines: string[] = [
    `- 玩家输入：${limitSummaryLine(input.userInput, 90)}`,
    `- 正文推进：${pickSummaryClause(input.body, 64)}`,
    `- 承接记忆：${input.memory.trim() ? pickSummaryClause(input.memory, 64) : '无'}`,
  ];

  if (input.worldEvents?.length) {
    lines.push(`- 世界变化：${input.worldEvents.map((item) => pickSummaryClause(item, 40)).join(' / ')}`);
  }
  if (input.actionOptions?.length) {
    lines.push(`- 行动选项：${input.actionOptions.map((item) => pickSummaryClause(item, 36)).join(' / ')}`);
  }

  return `【回合${turnLabel} 纪要】\n${dedupeLines(lines).slice(0, 6).join('\n')}`;
}

export function upsertRecallEntry(system: { 回忆档案: 回忆条目[] }, entry: 回忆条目): { 回忆档案: 回忆条目[] } {
  const next = system.回忆档案.filter(
    (item) => !(item.回合 === entry.回合 && item.类型 === '精炼纪要' && item.名称?.startsWith('【回合纪要')),
  );
  return { 回忆档案: [...next, entry] };
}

export async function autoCompressMemorySystemWithArchivesAsync(
  system: 记忆系统,
  turn: number,
  settings: 记忆系统设置,
  mainConfig: API配置项,
  signal?: AbortSignal,
): Promise<{ memory: 记忆系统; archives: 回忆条目[]; usedFallback: boolean; usedModel: boolean }> {
  let next = system;
  const archives: 回忆条目[] = [];
  const immediateThreshold = Math.max(1, Math.trunc(settings.即时转短期阈值 || 25));
  const shortThreshold = Math.max(1, Math.trunc(settings.短期转中期阈值 || 20));
  const middleThreshold = Math.max(1, Math.trunc(settings.中期转长期阈值 || 10));
  const retryCount = settings.记忆总结API.retryCount ?? 2;
  let usedFallback = false;
  let usedModel = false;

  while (next.即时记忆.length >= immediateThreshold) {
    const raw = next.即时记忆.slice(0, immediateThreshold);
    const result = await summarizeMemoryBatch(
      {
        kind: 'short',
        turn,
        items: raw,
        prompt: settings.即时转短期提示词,
      },
      settings,
      mainConfig,
      signal,
      retryCount,
    );
    usedFallback = usedFallback || result.usedFallback;
    usedModel = usedModel || !result.usedFallback;
    archives.push(createShortTermArchiveEntry(raw, turn, result.summary));
    next = {
      ...next,
      即时记忆: next.即时记忆.slice(immediateThreshold),
      短期记忆: [...next.短期记忆, result.summary],
    };
  }

  while (next.短期记忆.length >= shortThreshold) {
    const raw = next.短期记忆.slice(0, shortThreshold);
    const result = await summarizeMemoryBatch(
      {
        kind: 'middle',
        turn,
        items: raw,
        prompt: settings.短期转中期提示词,
      },
      settings,
      mainConfig,
      signal,
      retryCount,
    );
    usedFallback = usedFallback || result.usedFallback;
    usedModel = usedModel || !result.usedFallback;
    archives.push(createMiddleTermArchiveEntry(raw, turn, result.summary));
    next = {
      ...next,
      短期记忆: next.短期记忆.slice(shortThreshold),
      中期记忆: [...next.中期记忆, result.summary],
    };
  }

  while (next.中期记忆.length >= middleThreshold) {
    const raw = next.中期记忆.slice(0, middleThreshold);
    const result = await summarizeMemoryBatch(
      {
        kind: 'long',
        turn,
        items: raw,
        prompt: settings.中期转长期提示词,
      },
      settings,
      mainConfig,
      signal,
      retryCount,
    );
    usedFallback = usedFallback || result.usedFallback;
    usedModel = usedModel || !result.usedFallback;
    archives.push(createLongTermArchiveEntry(raw, turn, result.summary));
    next = {
      ...next,
      中期记忆: next.中期记忆.slice(middleThreshold),
      长期记忆: [...next.长期记忆, result.summary],
    };
  }

  return { memory: next, archives, usedFallback, usedModel };
}

type NpcMemoryLedgerCompressionInput = {
  npcId: string;
  entries: Array<NPC同行记忆条目 | string>;
  summaries?: Array<NPC总结记忆条目 | string>;
  threshold: number;
  prompt: string;
  turn: number;
  source?: NPC同行记忆来源;
};

type NpcMemoryLedgerCompressionResult = {
  memories: NPC同行记忆条目[];
  summaries: NPC总结记忆条目[];
  changed: boolean;
  summaryTriggered: boolean;
};

function normalizeLedgerKey(text: string): string {
  return normalizeMemorySnippet(text).replace(/\s+/g, '').toLowerCase();
}

function buildNpcSummaryId(npcId: string, turn: number, index: number): string {
  const safeNpcId = npcId.replace(/[^\w-]/g, '_') || 'unknown';
  return `npc_summary_${safeNpcId}_${Math.max(1, turn)}_${index}_${Math.random().toString(36).slice(2, 7)}`;
}

function buildNpcMemoryId(npcId: string, turn: number, index: number, source: NPC同行记忆来源): string {
  const safeNpcId = npcId.replace(/[^\w-]/g, '_') || 'unknown';
  const sourceKey = source === '手机' ? 'phone' : source === '正文' ? 'story' : source === '新闻' ? 'news' : source === '变量' ? 'var' : 'misc';
  return `npc_mem_${sourceKey}_${safeNpcId}_${Math.max(0, turn)}_${index}_${Math.random().toString(36).slice(2, 6)}`;
}

function buildNpcSummaryTurnRange(chunk: NPC同行记忆条目[], fallbackTurn: number): string {
  const turns = chunk
    .map((entry) => entry.回合)
    .filter((turn) => Number.isFinite(turn) && turn > 0);
  if (!turns.length) return `第${Math.max(1, fallbackTurn)}回合前`;
  const min = Math.min(...turns);
  const max = Math.max(...turns);
  return min === max ? `第${min}回合` : `第${min}-${max}回合`;
}

function normalizeNpcSummaryEntry(
  item: NPC总结记忆条目 | string,
  index: number,
  npcId: string,
  turn: number,
): NPC总结记忆条目 | null {
  const source: Partial<NPC总结记忆条目> = typeof item === 'string' ? { 摘要: item } : item;
  const summary = 清理NPC同行记忆摘要(source.摘要 ?? '')
    .replace(/^\[压缩\]\s*/u, '')
    .trim();
  if (!summary || isNpcMemorySystemNoise(summary)) return null;
  return {
    ...(typeof item === 'string' ? {} : item),
    id: typeof source.id === 'string' && source.id.trim()
      ? source.id.trim()
      : buildNpcSummaryId(npcId, turn, index),
    摘要: summary,
    保留事实: source.保留事实?.map((text) => 清理NPC同行记忆摘要(text)).filter(Boolean),
    关系变化: source.关系变化?.map((text) => 清理NPC同行记忆摘要(text)).filter(Boolean),
    未完成事项: source.未完成事项?.map((text) => 清理NPC同行记忆摘要(text)).filter(Boolean),
  };
}

function mergeNpcSummaryEntries(entries: NPC总结记忆条目[]): NPC总结记忆条目[] {
  const seen = new Set<string>();
  const output: NPC总结记忆条目[] = [];
  for (const entry of entries) {
    const key = `${entry.回合范围 ?? ''}:${normalizeLedgerKey(entry.摘要)}`;
    if (!normalizeLedgerKey(entry.摘要) || seen.has(key)) continue;
    seen.add(key);
    output.push(entry);
  }
  return output;
}

function normalizeNpcLedgerMemoryEntries(input: NpcMemoryLedgerCompressionInput): {
  memories: NPC同行记忆条目[];
  migratedSummaries: NPC总结记忆条目[];
  changed: boolean;
} {
  const seen = new Set<string>();
  const memories: NPC同行记忆条目[] = [];
  const migratedSummaries: NPC总结记忆条目[] = [];
  let changed = false;

  input.entries.forEach((entry, index) => {
    const originalText = typeof entry === 'string' ? entry : entry.摘要;
    const cleaned = 清理NPC同行记忆摘要(originalText, input.prompt);
    if (!cleaned || isNpcMemorySystemNoise(cleaned)) {
      changed = true;
      return;
    }
    if (cleaned.startsWith('[压缩]')) {
      const summary = normalizeNpcSummaryEntry(
        {
          id: typeof entry === 'string' ? buildNpcSummaryId(input.npcId, input.turn, index) : `migrated_${entry.id}`,
          回合范围: typeof entry === 'string' || !entry.回合 ? undefined : `第${entry.回合}回合前`,
          条数: 1,
          摘要: cleaned,
        },
        index,
        input.npcId,
        input.turn,
      );
      if (summary) migratedSummaries.push(summary);
      changed = true;
      return;
    }

    const turn = typeof entry === 'string' ? input.turn : entry.回合;
    const next: NPC同行记忆条目 = typeof entry === 'string'
      ? {
          id: buildNpcMemoryId(input.npcId, input.turn, index, input.source ?? '其他'),
          回合: input.turn,
          摘要: cleaned,
          来源: input.source ?? '其他',
          关联NPCID: [input.npcId],
        }
      : {
          ...entry,
          id: entry.id.trim() || buildNpcMemoryId(input.npcId, input.turn, index, entry.来源 ?? input.source ?? '其他'),
          回合: Number.isFinite(turn) ? turn : input.turn,
          摘要: cleaned,
          来源: entry.来源 ?? input.source ?? '其他',
          关联NPCID: entry.关联NPCID?.length ? entry.关联NPCID : [input.npcId],
        };
    const key = `${next.回合 || 0}:${normalizeLedgerKey(next.摘要)}`;
    if (seen.has(key)) {
      changed = true;
      return;
    }
    seen.add(key);
    memories.push(next);
    if (typeof entry === 'string' || cleaned !== originalText || next.来源 !== (typeof entry === 'string' ? input.source : entry.来源)) {
      changed = true;
    }
  });

  return { memories, migratedSummaries, changed };
}

export function compressNpcMemoryLedger(input: NpcMemoryLedgerCompressionInput): NpcMemoryLedgerCompressionResult {
  const sourceEntries = Array.isArray(input.entries) ? input.entries : [];
  const sourceSummaries = Array.isArray(input.summaries) ? input.summaries : [];
  const normalizedInput = { ...input, entries: sourceEntries, summaries: sourceSummaries };
  const size = Math.max(1, Math.trunc(input.threshold || 15));
  const keepRecentCount = Math.min(4, Math.max(0, size - 1));
  const normalized = normalizeNpcLedgerMemoryEntries(normalizedInput);
  let memories = normalized.memories;
  let summaries = mergeNpcSummaryEntries([
    ...sourceSummaries
      .map((item, index) => normalizeNpcSummaryEntry(item, index, input.npcId, input.turn))
      .filter((item): item is NPC总结记忆条目 => Boolean(item)),
    ...normalized.migratedSummaries,
  ]);
  let summaryTriggered = false;

  if (memories.length >= size) {
    const recent = keepRecentCount > 0 ? memories.slice(-keepRecentCount) : [];
    const compressable = keepRecentCount > 0 ? memories.slice(0, -keepRecentCount) : memories;
    const chunkSize = Math.max(1, size);
    const generatedSummaries: NPC总结记忆条目[] = [];
    for (let index = 0; index < compressable.length; index += chunkSize) {
      const chunk = compressable.slice(index, index + chunkSize);
      const summary = compactNpcMemoryChunk(chunk.map((entry) => entry.摘要));
      if (!summary) continue;
      generatedSummaries.push({
        id: buildNpcSummaryId(input.npcId, input.turn, summaries.length + generatedSummaries.length),
        回合范围: buildNpcSummaryTurnRange(chunk, input.turn),
        条数: chunk.length,
        摘要: summary,
        保留事实: chunk
          .map((entry) => entry.摘要)
          .filter(Boolean)
          .slice(-5),
      });
    }
    if (generatedSummaries.length) {
      summaries = mergeNpcSummaryEntries([...summaries, ...generatedSummaries]);
      memories = recent;
      summaryTriggered = true;
    }
  }

  const changed =
    normalized.changed ||
    summaryTriggered ||
    normalized.migratedSummaries.length > 0 ||
    memories.length !== sourceEntries.length ||
    summaries.length !== sourceSummaries.length;

  return {
    memories,
    summaries,
    changed,
    summaryTriggered,
  };
}

export function normalizeMemorySystem(raw: 记忆系统): 记忆系统 {
  return {
    即时记忆: raw.即时记忆,
    短期记忆: raw.短期记忆,
    中期记忆: raw.中期记忆,
    长期记忆: raw.长期记忆,
  };
}
