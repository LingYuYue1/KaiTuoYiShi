import {
  MEMORY_LAYER_COMPRESSION_THRESHOLD,
  deserializeMemoryFailureSource,
  normalizeMemorySystem as normalizeMemorySystemModel,
  serializeMemoryFailureSource,
  type 记忆失败草稿,
  type 记忆系统,
} from '@/models/memory';
import type { 回忆条目 } from '@/models/yiting';
import type { API配置项, 记忆系统设置 } from '@/models/settings';
import type { NPC同行记忆来源, NPC同行记忆条目, NPC总结记忆条目 } from '@/models/npc';
import { summarizeMemoryBatch } from '@/services/memoryCompression';
import { 清理NPC同行记忆摘要 } from '@/utils/npcMemorySanitizer';

const MEMORY_SNIPPET_LIMIT = 84;
const NPC_MEMORY_SUMMARY_LIMIT = 160;

/** F6·对标既定方案：长期记忆保留上限。超限最旧条目归档进忆庭（信息不丢、可检索召回），长期只留最近章节级纪要。 */
export const MAIN_LONG_TERM_MEMORY_KEEP = 12;

// ── 对标参考项目：即时+短期合体存储 ─────────────────────────────

/** 即时条目与短期摘要的合体分隔标记（参考项目 memoryUtils 同款）。 */
export const 即时短期分隔标记 = '\n<<SHORT_TERM_SYNC>>\n';

/** 把合体条目拆回「即时内容 + 短期摘要」两段。 */
export function 拆分即时与短期(entry: string): { 即时内容: string; 短期摘要: string } {
  const raw = (entry || '').trim();
  if (!raw) return { 即时内容: '', 短期摘要: '' };
  const splitAt = raw.lastIndexOf(即时短期分隔标记);
  if (splitAt < 0) return { 即时内容: raw, 短期摘要: '' };
  return {
    即时内容: raw.slice(0, splitAt).trim(),
    短期摘要: raw.slice(splitAt + 即时短期分隔标记.length).trim(),
  };
}

/** 合体：即时内容 + 分隔标记 + 短期摘要（无摘要时只存即时内容）。 */
export function 合并即时与短期(immediateEntry: string, shortEntry: string): string {
  const full = (immediateEntry || '').trim();
  const summary = (shortEntry || '').trim();
  if (!summary) return full;
  return `${full}${即时短期分隔标记}${summary}`;
}

/** 清理 AI 短期摘要开头的日期/时间前缀（参考项目 清理短期记忆时间前缀 同款语义）。 */
function 清理短期记忆时间前缀(text: string): string {
  return (text || '')
    .trim()
    .replace(/^\d{2,4}[:：年\-\/]\d{1,2}(?:[:：月\-\/]\d{1,2})?(?:[:：日号\-\/]\d{1,2})?(?:[:：时分秒卯辰巳午未申酉戌亥子丑寅刻]*)?[，,\s]*/u, '')
    .replace(/^[零一二三四五六七八九十百千两〇○]{1,8}年[零一二三四五六七八九十两〇○]{1,4}月[零一二三四五六七八九十两〇○]{1,4}[日号]?(?:[子丑寅卯辰巳午未申酉戌亥]|[零一二三四五六七八九十两〇○]{1,3}时)?[，,\s]*/u, '')
    .replace(/^(今晨|今日|今天|今夜|今晚|昨夜|昨日|昨天|清晨|早晨|上午|中午|午后|下午|傍晚|夜里|深夜)[，,\s]*/u, '')
    .trim();
}

/** 规范化游戏时间展示：空值补「未知时间」。 */
function 格式化记忆时间(raw?: string | null): string {
  const value = (raw || '').trim();
  return value ? `【${value}】` : '【未知时间】';
}

/**
 * 对标参考项目「构建即时记忆条目」：
 * 【游戏时间】\n玩家输入：{原文}\nAI输出：\n{正文全文}
 * 正文为最终展示正文（本项目无正文润色，不存在润色前/后版本问题）。
 */
export function 构建即时记忆条目(
  gameTime: string,
  playerInput: string,
  bodyText: string,
  options?: { 省略玩家输入?: boolean },
): string {
  const lines = [格式化记忆时间(gameTime)];
  if (!options?.省略玩家输入) {
    lines.push(`玩家输入：${(playerInput || '').trim() || '（空输入）'}`);
  }
  const body = (bodyText || '').trim();
  lines.push(body ? `AI输出：\n${body}` : 'AI输出：\n（本轮无有效剧情正文）');
  return lines.join('\n').trim();
}

/**
 * 对标参考项目「构建短期记忆条目」：
 * 摘要 = AI <短期记忆> 输出（清理时间前缀）|| 正文拼接截断 180 字 || '本回合推进'；
 * 返回带【时间】前缀的条目。
 */
export function 构建短期记忆条目(
  gameTime: string,
  shortTerm: string,
  fallbackText?: string,
): string {
  const summary = 清理短期记忆时间前缀(shortTerm)
    || (fallbackText || '').replace(/\s+/g, ' ').trim().slice(0, 180)
    || '本回合推进';
  const time = (gameTime || '').trim();
  return time ? `【${time}】 ${summary}` : summary;
}

/**
 * 对标参考项目「写入四段记忆」：
 * 1. 即时记忆 push 合体条目（即时内容 + 分隔标记 + 短期摘要）；
 * 2. 生成回忆条目（名称【回忆N】、概括=短期摘要、原文=即时内容、回合/记录时间/时间戳）返回给调用方汇入忆庭；
 * 3. 即时记忆超过 immediateLimit 时：shift 最旧条目 → 拆分出短期摘要 → 滚入短期记忆（即时层不调 AI 压缩）。
 */
export function 写入四段记忆(
  system: 记忆系统,
  immediateEntry: string,
  shortEntry: string,
  options: { immediateLimit: number; recallRound: number; gameTime?: string },
): { memory: 记忆系统; recallEntry: 回忆条目 | null } {
  const full = (immediateEntry || '').trim();
  const summary = (shortEntry || '').trim();
  if (!full && !summary) return { memory: system, recallEntry: null };

  const immediateLimit = Math.max(1, Math.trunc(options.immediateLimit) || 10);
  let next: 记忆系统 = { ...system, 即时记忆: [...system.即时记忆] };

  if (full) {
    next.即时记忆 = [...next.即时记忆, 合并即时与短期(full, summary)];
  } else if (summary) {
    next.短期记忆 = [...next.短期记忆, summary];
  }

  // 回忆条目：概括=短期摘要，原文=即时全文
  const recallRound = Math.max(1, Math.trunc(options.recallRound) || 1);
  const recallEntry: 回忆条目 | null = (full || summary)
    ? {
        id: `recall_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        名称: `【回忆${String(recallRound).padStart(3, '0')}】`,
        摘要: summary || '（无概括）',
        原文: full || '（无原文）',
        回合: recallRound,
        时间戳: options.gameTime || '未知时间',
        记录时间: options.gameTime || '未知时间',
        分类: '正文',
      }
    : null;

  // 即时滑动窗口：超限时最旧条目的短期摘要滚入短期层
  while (next.即时记忆.length > immediateLimit) {
    const shifted = next.即时记忆.shift();
    if (!shifted) break;
    const { 短期摘要 } = 拆分即时与短期(shifted);
    if (短期摘要) next.短期记忆 = [...next.短期记忆, 短期摘要];
  }

  return { memory: next, recallEntry };
}

/**
 * 阶段1：通用记忆系统噪声过滤模式（从NPC侧提取，主链也使用）
 * 过滤 storyProgressMemoryLine 等剧情编织进度元数据，防止污染记忆链和忆庭归档
 */
// 阶段1修复：统一噪声过滤模式集合（合并 yitingArchive 原硬编码模式 + 压缩链噪声模式）
// 同时服务于：①压缩链写入/压缩时过滤 ②忆庭归档时过滤 ③NPC压缩时过滤
const MEMORY_SYSTEM_NOISE_PATTERNS = [
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
  // 以下为原 yitingArchive.ts 的硬编码模式（合并到统一集合，避免两套分开维护导致模式漂移）
  /动态世界/,
  /行动选项/,
  /后续选项/,
  /系统提示/,
  /变量草稿/,
  /最近判定理由/,
];

// 保留旧名用于NPC侧（回归测试要求 NPC_MEMORY_SYSTEM_NOISE_PATTERNS 存在）
const NPC_MEMORY_SYSTEM_NOISE_PATTERNS = MEMORY_SYSTEM_NOISE_PATTERNS;

export function buildImmediateMemory(userInput: string, aiResponse: string): string {
  const input = userInput.trim();
  const response = aiResponse.trim();
  return [`玩家输入：${input || '（空）'}`, `剧情回应：${response || '（空）'}`].join('\n');
}

function normalizeMemorySnippet(text: string): string {
  return (text || '')
    .replace(/\s+/g, ' ')
    .replace(/^【\s*[\d:.\-\s]+\s*】\s*/, '')
    .replace(/^[\-\u2022•·\d一二三四五六七八九十]+[\.、\)]\s*/, '')
    .trim();
}

function collectSummaryLines(items: string[], limit = 4): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const item of items) {
    const snippet = normalizeMemorySnippet(item);
    if (!snippet) continue;
    // 阶段1：压缩时噪声过滤（双重保险，防止写入时漏过的噪声进入压缩摘要）
    if (isMemorySystemNoise(snippet)) continue;
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

/** 阶段1：通用记忆系统噪声检测（主链用，与NPC侧同模式） */
export function isMemorySystemNoise(text: string): boolean {
  return MEMORY_SYSTEM_NOISE_PATTERNS.some((pattern) => pattern.test(text));
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

/** 从批次条目提取首尾游戏时间（条目以【时间】开头的合体/纪要格式）。 */
function 提取条目时间范围(items: string[]): { start: string; end: string } {
  const times = items.flatMap((item) => {
    const matches = String(item).match(/【([^】]*\d[^】]*)】/g) || [];
    return matches.map((m) => m.replace(/^【/, '').replace(/】$/, '').trim());
  }).filter(Boolean);
  if (!times.length) return { start: '', end: '' };
  return { start: times[0], end: times[times.length - 1] };
}

function buildArchiveSummary(items: string[], turn: number, kind: 'short' | 'middle' | 'long'): string {
  const lines = collectSummaryLines(items, kind === 'long' ? 5 : 4);
  const fallback = items.map(normalizeMemorySnippet).filter(Boolean).join('；');
  const body = lines.length ? lines.join('；') : fallback;
  const content = lines.length ? lines.map((line) => `- ${line}`) : [`- ${body || '空白'}`];
  // 对标参考项目：压缩产物带【时间范围】前缀（从批次条目提取首尾时间）；无时间时保留回合标签。
  const { start, end } = 提取条目时间范围(items);
  const timeLabel = start ? (end && end !== start ? `【${start} - ${end}】` : `【${start}】`) : '';
  const label = kind === 'long' ? '长期纪要' : kind === 'middle' ? '中期纪要' : '短期纪要';
  const title = timeLabel ? `${timeLabel} ${label}` : `【${label}·回合${turn}】`;
  return [title, ...content].join('\n');
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
  // 阶段1：写入时噪声过滤（从源头杜绝 storyProgressMemoryLine 等进度元数据进入即时记忆）
  if (!memory || isMemorySystemNoise(memory)) {
    return system;
  }
  const newMemories = [...system.即时记忆, memory];
  const trimmed = newMemories.length > 50 ? newMemories.slice(-50) : newMemories;
  return { ...system, 即时记忆: trimmed };
}

/**
 * 记忆内容指纹：稳定序列化 + FNV-1a（同步、无 crypto 依赖）。
 * 用于压缩请求的来源绑定：确认压缩前校验指纹，来源已变化则拒绝旧结果覆盖。
 */
export function computeMemoryFingerprint(memory: 记忆系统): string {
  const stable = JSON.stringify({
    即时: memory.即时记忆,
    短期: memory.短期记忆,
    中期: memory.中期记忆 ?? [],
    长期: memory.长期记忆,
    草稿: (memory.失败草稿 ?? []).map((draft) => `${draft.id}:${draft.status}`),
  });
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(stable)) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `mem-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** 压缩类型 → 主记忆链目标层；精炼纪要/未知类型不映射主链。 */
function archiveTypeToMemoryLayer(类型: string | undefined): keyof 记忆系统 | null {
  if (类型 === '短期压缩') return '短期记忆';
  if (类型 === '中期压缩') return '中期记忆';
  if (类型 === '长期压缩') return '长期记忆';
  return null;
}

/**
 * 玩家编辑忆庭 archive 摘要后，通过稳定映射把相同文本同步到压缩后的主记忆层：
 * 对每个 draft，在其目标层中把「编辑前摘要」首次出现的条目替换为编辑后的值。
 * 不得只改 archives 数组而保留主记忆链中的旧摘要。
 */
export function applyEditedArchiveSummaries(
  memory: 记忆系统,
  drafts: 回忆条目[],
  originalSummaries: string[],
): 记忆系统 {
  const next: 记忆系统 = {
    ...memory,
    即时记忆: [...memory.即时记忆],
    短期记忆: [...memory.短期记忆],
    中期记忆: [...(memory.中期记忆 ?? [])],
    长期记忆: [...memory.长期记忆],
  };
  const consumed = new Set<string>();
  drafts.forEach((draft, index) => {
    const layer = archiveTypeToMemoryLayer(draft.类型);
    if (!layer) return;
    const original = originalSummaries[index]?.trim();
    const edited = draft.摘要.trim();
    if (!original || !edited || original === edited) return;
    const arr = next[layer] as string[];
    const matchIndex = arr.findIndex(
      (item, itemIndex) => item === original && !consumed.has(`${layer}:${itemIndex}`),
    );
    if (matchIndex < 0) return;
    consumed.add(`${layer}:${matchIndex}`);
    arr[matchIndex] = edited;
  });
  return next;
}

export function checkCompressionThreshold(system: 记忆系统, threshold = MEMORY_LAYER_COMPRESSION_THRESHOLD): boolean {
  return system.即时记忆.length >= Math.max(1, Math.trunc(threshold));
}

export function compressToShortTerm(system: 记忆系统, turn: number, batchSize = MEMORY_LAYER_COMPRESSION_THRESHOLD): 记忆系统 {
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

export function checkMiddleTermThreshold(system: 记忆系统, threshold = MEMORY_LAYER_COMPRESSION_THRESHOLD): boolean {
  return system.短期记忆.length >= Math.max(1, Math.trunc(threshold));
}

export function compressToMiddleTerm(system: 记忆系统, turn: number, batchSize = MEMORY_LAYER_COMPRESSION_THRESHOLD): 记忆系统 {
  const size = Math.max(1, Math.trunc(batchSize));
  const oldest = system.短期记忆.slice(0, size);
  const compressed = buildArchiveSummary(oldest, turn, 'middle');
  return {
    ...system,
    短期记忆: system.短期记忆.slice(size),
    中期记忆: [...(system.中期记忆 ?? []), compressed],
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

export function checkLongTermThreshold(system: 记忆系统, threshold = MEMORY_LAYER_COMPRESSION_THRESHOLD): boolean {
  return (system.中期记忆 ?? []).length >= Math.max(1, Math.trunc(threshold));
}

export function compressToLongTerm(system: 记忆系统, turn: number, batchSize = MEMORY_LAYER_COMPRESSION_THRESHOLD): 记忆系统 {
  const size = Math.max(1, Math.trunc(batchSize));
  const oldest = (system.中期记忆 ?? []).slice(0, size);
  const compressed = buildArchiveSummary(oldest, turn, 'long');
  return {
    ...system,
    中期记忆: (system.中期记忆 ?? []).slice(size),
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

/** 从长期纪要文本提取归档回合号（文本以【长期纪要·回合N】开头），失败时用兜底。 */
function extractLongTermEntryTurn(text: string, fallback: number): number {
  const match = String(text).match(/【长期纪要·回合\s*(\d+)】/);
  return match && Number.isFinite(Number(match[1]))
    ? Math.max(1, Number(match[1]))
    : Math.max(1, fallback);
}

/** F6·对标既定方案：长期记忆超限最旧条目转成忆庭归档条目（保留全文与关键词，可检索召回）。 */
function buildLongTermOverflowArchiveEntry(text: string, fallbackTurn: number): 回忆条目 {
  const entryTurn = extractLongTermEntryTurn(text, fallbackTurn);
  return {
    id: `recall_long_archive_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    名称: `【长期纪要·回合${String(entryTurn).padStart(3, '0')}】`,
    类型: '长期压缩',
    摘要: text,
    原文: text,
    检索关键词: buildKeywords([text]),
    来源回合: [entryTurn],
    回合: entryTurn,
    时间戳: new Date().toISOString(),
  };
}

/**
 * F6·对标既定方案：压缩结算后统一裁剪长期记忆（保留最近 MAIN_LONG_TERM_MEMORY_KEEP 条）。
 * 超限的最旧条目生成忆庭归档条目追加到 archives（信息不丢）；无 archives 通道时直接丢弃。
 */
function trimLongTermMemoryOverflow(system: 记忆系统, archives: 回忆条目[] | null, turn: number): 记忆系统 {
  const longTerm = system.长期记忆 ?? [];
  if (longTerm.length <= MAIN_LONG_TERM_MEMORY_KEEP) return system;
  const excess = longTerm.length - MAIN_LONG_TERM_MEMORY_KEEP;
  if (archives) {
    for (let index = 0; index < excess; index += 1) {
      const item = longTerm[index];
      if (typeof item === 'string' && item.trim()) {
        archives.push(buildLongTermOverflowArchiveEntry(item, turn));
      }
    }
  }
  return { ...system, 长期记忆: longTerm.slice(excess) };
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

export function createTurnRecallEntry(input: {
  userInput: string;
  body: string;
  memory?: string;
  turn: number;
  worldEvents?: string[];
  actionOptions?: string[];
}): 回忆条目 {
  const rawPieces = [
    `玩家输入：${input.userInput.trim() || '（空）'}`,
    `正文：${input.body.trim() || '（空）'}`,
    input.memory?.trim() ? `回合小结：${input.memory.trim()}` : '',
    input.worldEvents?.length ? `动态世界：${input.worldEvents.join(' / ')}` : '',
    input.actionOptions?.length ? `行动选项：${input.actionOptions.join(' / ')}` : '',
  ].filter(Boolean);
  return {
    id: `recall_turn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    名称: `【回合纪要 ${String(Math.max(1, input.turn)).padStart(3, '0')}】`,
    类型: '精炼纪要',
    摘要: buildTurnRecallSummary({
      userInput: input.userInput,
      body: input.body,
      memory: input.memory ?? '',
      turn: input.turn,
      worldEvents: input.worldEvents,
      actionOptions: input.actionOptions,
    }),
    原文: rawPieces.join('\n'),
    检索关键词: buildKeywords(rawPieces),
    来源回合: [input.turn],
    回合: input.turn,
    时间戳: new Date().toISOString(),
  };
}

export function upsertRecallEntry(system: { 回忆档案: 回忆条目[] }, entry: 回忆条目): { 回忆档案: 回忆条目[] } {
  const next = system.回忆档案.filter(
    (item) => !(item.回合 === entry.回合 && item.类型 === '精炼纪要' && item.名称?.startsWith('【回合纪要')),
  );
  return { 回忆档案: [...next, entry] };
}

export function autoCompressMemorySystem(
  system: 记忆系统,
  turn: number,
  settings: Pick<记忆系统设置, '即时转短期阈值' | '短期转中期阈值' | '中期转长期阈值' | '短期转长期阈值'>,
): 记忆系统 {
  let next = system;
  // 对标参考项目：即时层不调 AI 压缩——由「写入四段记忆」滑动窗口（超限摘要滚入短期）处理。
  const shortThreshold = Math.max(1, Math.trunc(settings.短期转中期阈值 || settings.短期转长期阈值 || MEMORY_LAYER_COMPRESSION_THRESHOLD));
  const middleThreshold = Math.max(1, Math.trunc(settings.中期转长期阈值 || MEMORY_LAYER_COMPRESSION_THRESHOLD));

  while (next.短期记忆.length >= shortThreshold) {
    next = compressToMiddleTerm(next, turn, shortThreshold);
  }
  while ((next.中期记忆 ?? []).length >= middleThreshold) {
    next = compressToLongTerm(next, turn, middleThreshold);
  }
  // F6：长期记忆保留上限（无 archives 通道时直接裁剪超限最旧条目）
  return trimLongTermMemoryOverflow(next, null, turn);
}

export function autoCompressMemorySystemWithArchives(
  system: 记忆系统,
  turn: number,
  settings: Pick<记忆系统设置, '即时转短期阈值' | '短期转中期阈值' | '中期转长期阈值' | '短期转长期阈值'>,
): { memory: 记忆系统; archives: 回忆条目[] } {
  let next = system;
  const archives: 回忆条目[] = [];
  // 对标参考项目：即时层不调 AI 压缩（滑动滚动由写入链路处理）。
  const shortThreshold = Math.max(1, Math.trunc(settings.短期转中期阈值 || settings.短期转长期阈值 || MEMORY_LAYER_COMPRESSION_THRESHOLD));
  const middleThreshold = Math.max(1, Math.trunc(settings.中期转长期阈值 || MEMORY_LAYER_COMPRESSION_THRESHOLD));

  while (next.短期记忆.length >= shortThreshold) {
    const raw = next.短期记忆.slice(0, shortThreshold);
    archives.push(createMiddleTermArchiveEntry(raw, turn));
    next = compressToMiddleTerm(next, turn, shortThreshold);
  }
  while ((next.中期记忆 ?? []).length >= middleThreshold) {
    const raw = (next.中期记忆 ?? []).slice(0, middleThreshold);
    archives.push(createLongTermArchiveEntry(raw, turn));
    next = compressToLongTerm(next, turn, middleThreshold);
  }
  // F6：长期记忆保留上限，超限最旧条目归档进 archives（调用方汇入忆庭）
  next = trimLongTermMemoryOverflow(next, archives, turn);
  return { memory: next, archives };
}

export async function autoCompressMemorySystemWithArchivesAsync(
  system: 记忆系统,
  turn: number,
  settings: 记忆系统设置,
  mainConfig: API配置项,
  signal?: AbortSignal,
): Promise<{
  memory: 记忆系统;
  archives: 回忆条目[];
  failures: 记忆失败草稿[];
  usedFallback: boolean;
  usedModel: boolean;
  usedLocal: boolean;
}> {
  let next = system;
  const archives: 回忆条目[] = [];
  const failures: 记忆失败草稿[] = [];
  const immediateThreshold = Math.max(1, Math.trunc(settings.即时转短期阈值 || MEMORY_LAYER_COMPRESSION_THRESHOLD));
  const shortThreshold = Math.max(1, Math.trunc(settings.短期转中期阈值 || settings.短期转长期阈值 || MEMORY_LAYER_COMPRESSION_THRESHOLD));
  const middleThreshold = Math.max(1, Math.trunc(settings.中期转长期阈值 || MEMORY_LAYER_COMPRESSION_THRESHOLD));
  const retryCount = settings.记忆总结API?.retryCount ?? 2;
  let usedFallback = false;
  let usedModel = false;
  let usedLocal = false;

  const unresolvedFallbacks = new Set(
    (next.失败草稿 ?? [])
      .filter((draft) => draft.status === 'pending' || draft.status === 'retrying')
      .map((draft) => draft.fallbackSummary),
  );

  const appendFailure = async (
    source: { kind: 'short' | 'middle' | 'long'; turn: number; items: string[]; sourceTurns?: { start: number; end: number } },
    result: Awaited<ReturnType<typeof summarizeMemoryBatch>>,
  ): Promise<void> => {
    if (!result.failureCode) return;
    const sourceSnapshot = await serializeMemoryFailureSource(source.items);
    const duplicate = (next.失败草稿 ?? []).find(
      (draft) => (draft.status === 'pending' || draft.status === 'retrying')
        && draft.kind === source.kind
        && draft.sourceSnapshot.checksum === sourceSnapshot.checksum,
    );
    if (duplicate) {
      unresolvedFallbacks.add(duplicate.fallbackSummary);
      return;
    }
    const now = Date.now();
    const draft: 记忆失败草稿 = {
      id: `memory_failure_${now}_${Math.random().toString(36).slice(2, 8)}`,
      origin: 'automatic',
      kind: source.kind,
      status: 'pending',
      sourceTurns: source.sourceTurns ?? { start: source.turn, end: source.turn },
      sourceSnapshot,
      targetLayer: source.kind === 'short' ? '短期记忆' : source.kind === 'middle' ? '中期记忆' : '长期记忆',
      fallbackSummary: result.summary,
      failureCode: result.failureCode,
      failureMessage: result.failureMessage ?? '记忆总结失败。',
      attemptCount: 1,
      createdAt: now,
      updatedAt: now,
    };
    failures.push(draft);
    next = { ...next, 失败草稿: [...(next.失败草稿 ?? []), draft] };
    unresolvedFallbacks.add(draft.fallbackSummary);
  };

  const pickEligible = (items: string[], size: number): { raw: string[]; indexes: number[] } | null => {
    const indexes = items
      .map((item, index) => unresolvedFallbacks.has(item) ? -1 : index)
      .filter((index) => index >= 0)
      .slice(0, size);
    return indexes.length >= size
      ? { raw: indexes.map((index) => items[index]), indexes }
      : null;
  };

  const removeIndexes = (items: string[], indexes: number[]): string[] => {
    const selected = new Set(indexes);
    return items.filter((_item, index) => !selected.has(index));
  };

  const inferSourceTurns = (items: string[], currentTurn: number): { start: number; end: number } => {
    const embeddedTurns = items.flatMap((item) => {
      const matches = String(item).matchAll(/(?:回合|回合纪要|短期纪要|中期纪要)[^\d]{0,8}(\d{1,5})/g);
      return Array.from(matches, (match) => Number(match[1])).filter(Number.isFinite);
    });
    const end = embeddedTurns.length
      ? Math.max(1, ...embeddedTurns)
      : Math.max(1, Math.trunc(currentTurn) || 1);
    const start = embeddedTurns.length ? Math.min(...embeddedTurns) : Math.max(1, end - items.length + 1);
    return { start, end };
  };

  while (next.短期记忆.length >= shortThreshold) {
    const picked = pickEligible(next.短期记忆, shortThreshold);
    if (!picked) break;
    const raw = picked.raw;
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
    usedModel = usedModel || result.usedModel;
    usedLocal = usedLocal || result.usedLocal;
    await appendFailure({ kind: 'middle', turn, items: raw, sourceTurns: inferSourceTurns(raw, turn) }, result);
    archives.push(createMiddleTermArchiveEntry(raw, turn, result.summary));
    next = {
      ...next,
      短期记忆: removeIndexes(next.短期记忆, picked.indexes),
      中期记忆: [...(next.中期记忆 ?? []), result.summary],
    };
  }

  while ((next.中期记忆 ?? []).length >= middleThreshold) {
    const picked = pickEligible(next.中期记忆 ?? [], middleThreshold);
    if (!picked) break;
    const raw = picked.raw;
    const result = await summarizeMemoryBatch(
      {
        kind: 'long',
        turn,
        items: raw,
        prompt: settings.中期转长期提示词 || settings.短期转长期提示词,
      },
      settings,
      mainConfig,
      signal,
      retryCount,
    );
    usedFallback = usedFallback || result.usedFallback;
    usedModel = usedModel || result.usedModel;
    usedLocal = usedLocal || result.usedLocal;
    await appendFailure({ kind: 'long', turn, items: raw, sourceTurns: inferSourceTurns(raw, turn) }, result);
    archives.push(createLongTermArchiveEntry(raw, turn, result.summary));
    next = {
      ...next,
      中期记忆: removeIndexes(next.中期记忆 ?? [], picked.indexes),
      长期记忆: [...next.长期记忆, result.summary],
    };
  }

  // F6：长期记忆保留上限，超限最旧条目归档进 archives（调用方汇入忆庭）
  next = trimLongTermMemoryOverflow(next, archives, turn);

  return { memory: next, archives, failures, usedFallback, usedModel, usedLocal };
}

export interface RetryMemoryFailureDraftResult {
  memory: 记忆系统;
  draft: 记忆失败草稿;
  usedModel: boolean;
  usedFallback: boolean;
}

/**
 * 使用失败发生时保存的 sourceSnapshot 重试；不会重新从当前 chatHistory 拼材料。
 * 成功时只替换原 fallback，且清理已解决草稿的原文 payload，避免长期存档膨胀。
 */
export async function retryMemoryFailureDraft(
  system: 记忆系统,
  draftId: string,
  settings: 记忆系统设置,
  mainConfig: API配置项,
  signal?: AbortSignal,
): Promise<RetryMemoryFailureDraftResult> {
  const draft = (system.失败草稿 ?? []).find((item) => item.id === draftId);
  if (!draft) throw new Error('找不到对应的失败草稿。');
  if (draft.status === 'resolved' || draft.status === 'ignored') {
    return { memory: system, draft, usedModel: false, usedFallback: false };
  }
  if (draft.origin === 'batch_rebuild') {
    throw new Error('这份草稿来自批量重建，请重新运行批量重建；原记忆仍保持不变。');
  }
  if (settings.启用中短长期API总结 === false) {
    throw new Error('请先开启“启用中短长期 API 总结”再重试失败草稿。');
  }

  const items = await deserializeMemoryFailureSource(draft.sourceSnapshot);
  const prompt = draft.kind === 'short'
    ? settings.即时转短期提示词
    : draft.kind === 'middle'
      ? settings.短期转中期提示词
      : settings.中期转长期提示词 || settings.短期转长期提示词;
  const result = await summarizeMemoryBatch(
    {
      kind: draft.kind,
      turn: draft.sourceTurns.end,
      items,
      prompt,
      sourceTurns: draft.sourceTurns,
    },
    settings,
    mainConfig,
    signal,
    settings.记忆总结API?.retryCount ?? 2,
  );
  if (result.usedLocal) {
    // 开关在请求前已检查，这个分支只是防止调用方传入被并发修改的设置。
    throw new Error('记忆总结 API 已关闭，未发起重试请求。');
  }

  const now = Date.now();
  if (result.failureCode) {
    const updated: 记忆失败草稿 = {
      ...draft,
      status: 'pending',
      failureCode: result.failureCode,
      failureMessage: result.failureMessage ?? draft.failureMessage,
      attemptCount: Math.max(0, draft.attemptCount) + 1,
      updatedAt: now,
    };
    return {
      memory: {
        ...system,
        失败草稿: (system.失败草稿 ?? []).map((item) => item.id === draft.id ? updated : item),
      },
      draft: updated,
      usedModel: false,
      usedFallback: true,
    };
  }

  const layerKey = draft.targetLayer;
  const current = system[layerKey];
  const index = current.findIndex((item) => item === draft.fallbackSummary);
  if (index < 0) {
    const conflicted: 记忆失败草稿 = {
      ...draft,
      status: 'pending',
      failureCode: 'source_changed',
      failureMessage: '目标记忆中的本地 fallback 已被修改或移除，请先确认后再重试。',
      attemptCount: Math.max(0, draft.attemptCount) + 1,
      updatedAt: now,
    };
    return {
      memory: {
        ...system,
        失败草稿: (system.失败草稿 ?? []).map((item) => item.id === draft.id ? conflicted : item),
      },
      draft: conflicted,
      usedModel: false,
      usedFallback: false,
    };
  }

  const nextLayer = [...current];
  nextLayer[index] = result.summary;
  const resolved: 记忆失败草稿 = {
    ...draft,
    status: 'resolved',
    sourceSnapshot: { ...draft.sourceSnapshot, payload: '' },
    updatedAt: now,
  };
  return {
    memory: {
      ...system,
      [layerKey]: nextLayer,
      失败草稿: (system.失败草稿 ?? []).map((item) => item.id === draft.id ? resolved : item),
    },
    draft: resolved,
    usedModel: true,
    usedFallback: false,
  };
}

export function compressNpcMemories(memories: string[], threshold: number, prompt: string): string[] {
  const size = Math.max(1, Math.trunc(threshold || 15));
  if (!Array.isArray(memories)) return memories;

  let next = memories
    .map((item) => 清理NPC同行记忆摘要(item, prompt))
    .filter(Boolean)
    .filter((item) => !isNpcMemorySystemNoise(item));
  if (next.length < size) return next;

  while (next.length >= size) {
    const chunk = next.slice(0, size);
    const summary = compactNpcMemoryChunk(chunk);
    next = [...(summary ? [`[压缩] ${summary}`] : []), ...next.slice(size)];
  }
  return next;
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
    .map((entry) => Number(entry.回合))
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
    const originalText = typeof entry === 'string' ? entry : entry?.摘要 ?? '';
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

    const turn = typeof entry === 'string' ? input.turn : Number(entry.回合);
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
          id: entry.id?.trim() || buildNpcMemoryId(input.npcId, input.turn, index, entry.来源 ?? input.source ?? '其他'),
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
  // 阶段1对齐既定方案：阈值20，保留最近5条不压缩
  const keepRecentCount = Math.min(5, Math.max(0, size - 1));
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

/**
 * 阶段1·NPC同行记忆压缩异步版（对齐既定方案：调AI + 阈值20 + 保留最近5条 + 失败兜底）
 *
 * 与同步版 compressNpcMemoryLedger 的区别：
 * - 压缩调用 AI（summarizeMemoryBatch kind='npc'），质量更高
 * - 返回 drafts 供玩家审核（三阶段弹窗 review 阶段可编辑 摘要）
 * - 失败时使用 buildFallbackSummary 的 NPC 兜底（前3条去重各截28字+省略号）
 *
 * 提示词需包含【通讯记录】处理规则：将多条消息整理为包含时间锚点和关键信息的叙述式。
 */
export async function compressNpcMemoryLedgerAsync(
  input: NpcMemoryLedgerCompressionInput & {
    settings: 记忆系统设置;
    mainConfig: API配置项;
    signal?: AbortSignal;
  },
): Promise<
  NpcMemoryLedgerCompressionResult & {
    drafts: NPC总结记忆条目[];
    usedFallback: boolean;
    usedModel: boolean;
    usedLocal: boolean;
    errors: string[];
  }
> {
  const sourceEntries = Array.isArray(input.entries) ? input.entries : [];
  const sourceSummaries = Array.isArray(input.summaries) ? input.summaries : [];
  const normalizedInput = { ...input, entries: sourceEntries, summaries: sourceSummaries };
  const size = Math.max(1, Math.trunc(input.threshold || 20));
  const keepRecentCount = Math.min(5, Math.max(0, size - 1));
  const retryCount = input.settings.记忆总结API?.retryCount ?? 2;

  const normalized = normalizeNpcLedgerMemoryEntries(normalizedInput);
  let memories = normalized.memories;
  let summaries = mergeNpcSummaryEntries([
    ...sourceSummaries
      .map((item, index) => normalizeNpcSummaryEntry(item, index, input.npcId, input.turn))
      .filter((item): item is NPC总结记忆条目 => Boolean(item)),
    ...normalized.migratedSummaries,
  ]);

  const drafts: NPC总结记忆条目[] = [];
  const errors: string[] = [];
  let usedFallback = false;
  let usedModel = false;
  let usedLocal = false;
  let summaryTriggered = false;

  if (memories.length >= size) {
    const recent = keepRecentCount > 0 ? memories.slice(-keepRecentCount) : [];
    const compressable = keepRecentCount > 0 ? memories.slice(0, -keepRecentCount) : memories;
    const chunkSize = Math.max(1, size);
    const generatedSummaries: NPC总结记忆条目[] = [];

    for (let index = 0; index < compressable.length; index += chunkSize) {
      const chunk = compressable.slice(index, index + chunkSize);
      const result = await summarizeMemoryBatch(
        {
          kind: 'npc',
          turn: input.turn,
          items: chunk.map((entry) => entry.摘要),
          prompt: input.prompt,
        },
        input.settings,
        input.mainConfig,
        input.signal,
        retryCount,
      );
      usedFallback = usedFallback || result.usedFallback;
      usedModel = usedModel || result.usedModel;
      usedLocal = usedLocal || result.usedLocal;
      if (result.failureCode) {
        errors.push(result.failureMessage ?? 'NPC记忆压缩失败');
      }
      if (!result.summary) continue;
      const summaryEntry: NPC总结记忆条目 = {
        id: buildNpcSummaryId(input.npcId, input.turn, summaries.length + generatedSummaries.length),
        回合范围: buildNpcSummaryTurnRange(chunk, input.turn),
        条数: chunk.length,
        摘要: result.summary,
        保留事实: chunk.map((entry) => entry.摘要).filter(Boolean).slice(-5),
      };
      generatedSummaries.push(summaryEntry);
      drafts.push(summaryEntry);
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
    drafts,
    usedFallback,
    usedModel,
    usedLocal,
    errors,
  };
}

export function formatMemoryForPrompt(system: 记忆系统): string {
  const sections: string[] = [];
  if (system.长期记忆.length) {
    sections.push(
      '【长期记忆】\n' + system.长期记忆.map((m, i) => `${i + 1}. ${m}`).join('\n'),
    );
  }
  if ((system.中期记忆 ?? []).length) {
    sections.push(
      '【中期记忆】\n' + (system.中期记忆 ?? []).map((m, i) => `${i + 1}. ${m}`).join('\n'),
    );
  }
  if (system.短期记忆.length) {
    sections.push(
      '【短期记忆】\n' + system.短期记忆.map((m, i) => `${i + 1}. ${m}`).join('\n'),
    );
  }
  return sections.join('\n\n');
}

/** Compatibility export for save/load callers; normalization lives in the model layer. */
export const normalizeMemorySystem = normalizeMemorySystemModel;
