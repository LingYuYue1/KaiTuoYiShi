import type { API配置项, 新闻API覆盖 } from '@/models/settings';
import type { 角色数据结构 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import type { NPC关系类型, NPC记录 } from '@/models/npc';
import type { 剧情节点 } from '@/models/plot';
import type { 新闻条目, 新闻生成结果, 新闻条目补丁 } from '@/models/news';
import { 归一化新闻条目 } from '@/models/news';
import type { 剧情编织分段, 剧情编织系统 } from '@/models/storyWeaving';
import { getStoryWeavingInjectionDiagnostics } from '@/services/storyWeaving';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { withRetries } from '@/services/ai/retry';
import { NEWS_WORLD_BOOK_PROMPT } from '@/data/newsWorldbook';
import { NEWS_COT_PROMPT } from '@/prompts/cot/newsCot';

export interface NewsModelRequest {
  config: API配置项 | 新闻API覆盖;
  turnCount: number;
  userInput: string;
  body: string;
  recentTurns?: string[];
  traveler: 角色数据结构;
  world: 世界状态;
  news: 新闻条目[];
  npcRecords?: NPC记录[];
  plotNodes?: 剧情节点[];
  storyWeaving?: 剧情编织系统;
  signal?: AbortSignal;
  retryCount?: number;
}

export interface NewsModelResult {
  rawText: string;
  parsed: 新闻生成结果;
}

export async function callNewsModel(request: NewsModelRequest): Promise<NewsModelResult> {
  const systemPrompt = buildNewsModelPrompt(request);
  const userMessage = buildNewsUserMessage(request);

  const rawText = await withRetries(
    () =>
      chatCompletionNonStream(request.config as API配置项, {
        messages: [{ role: 'user', content: userMessage }],
        systemPrompt,
        signal: request.signal,
        maxTokens: request.config.maxTokens ?? 1400,
        temperature: request.config.temperature ?? 0.35,
      }),
    { retries: request.retryCount ?? 0, signal: request.signal, label: '星际和平周报' },
  );

  return {
    rawText,
    parsed: parseNewsResult(rawText),
  };
}

export function buildNewsModelPrompt(request: Pick<NewsModelRequest, 'turnCount' | 'world' | 'traveler' | 'news'> & Partial<Pick<NewsModelRequest, 'npcRecords' | 'plotNodes' | 'storyWeaving'>>): string {
  const issue = Math.floor(request.turnCount / 10);
  const recentNews = [...request.news].sort((a, b) => b.回合 - a.回合).slice(0, 12);
  const storyBrief = buildStoryWeavingNewsBrief(request.storyWeaving);

  return [
    NEWS_WORLD_BOOK_PROMPT,
    '',
    NEWS_COT_PROMPT,
    '',
    '# 结构化输出格式',
    '只输出 JSON，对象字段固定为：',
    '{',
    '  "新增": [ { ... } ],',
    '  "更新": [ { ... } ],',
    '  "归档": [ "news_id" ],',
    '  "删除": [ "news_id" ],',
    '  "说明": "..."',
    '}',
    '',
    '## JSON 字段定义',
    '- 新增/更新条目都可包含：id, 类目, 状态, 回合, 标题, 正文, 组织标签, 关联系统, 关联剧情系列ID, 关联剧情分段ID, 重要',
    '- 类目只能取 plan / chronicle / starlog / frontline',
    '- 状态只能取 upcoming / ongoing / completed / archived',
    '- 新增条目可以不写 id；更新条目必须带 id',
    '- 归档与删除数组里只写 id',
    '',
    `## 期号信息`,
    `- 当前期号：第 ${issue} 期`,
    `- 当前回合：${request.turnCount}`,
    `- 当前地点：${request.world.当前地点 || '未标注'}`,
    `- 当前日期：${request.world.当前日期 || '未标注'}`,
    `- 当前时间：${request.world.当前时间 || '未标注'}`,
    '',
    '## 剧情编织联动摘要',
    storyBrief || '- 无当前剧情轨道。',
    '',
    '## 当前新闻快照',
    recentNews.length
      ? recentNews.map((n) => `- [${n.状态}] ${n.标题}（${n.回合} 回合 / ${n.类目}）`).join('\n')
      : '- 无',
    '',
  ].join('\n');
}

export function buildNewsUserMessage(request: NewsModelRequest): string {
  const currentNews = [...request.news]
    .sort((a, b) => {
      const statusDelta = NEWS_STATUS_RANK[a.状态] - NEWS_STATUS_RANK[b.状态];
      if (statusDelta !== 0) return statusDelta;
      return b.回合 - a.回合;
    })
    .slice(0, 20);

  return [
    `## 第 ${request.turnCount} 回合新闻生成请求`,
    '',
    `玩家输入：${request.userInput || '（无）'}`,
    '',
    `主回复正文：${request.body || '（无正文）'}`,
    '',
    '## 本次新闻窗口内的近期回合',
    request.recentTurns?.length
      ? request.recentTurns.join('\n\n')
      : '（无额外窗口上下文，仅使用本回合正文）',
    '',
    '## 旅人',
    JSON.stringify(request.traveler, null, 2),
    '',
    '## 世界状态',
    JSON.stringify(
      {
        当前日期: request.world.当前日期,
        当前时间: request.world.当前时间,
        当前地点: request.world.当前地点,
        当前时段: request.world.当前时段?.名称 ?? '',
        全局事件: request.world.全局事件,
        活跃人物: request.world.活跃人物?.map((n) => n.姓名 ?? ''),
        氛围变化: request.world.氛围变化,
      },
      null,
      2,
    ),
    '',
    '## 现有新闻',
    JSON.stringify(currentNews, null, 2),
    '',
    '## 相关 NPC 公开摘要',
    JSON.stringify(buildPublicNpcBriefs(request.npcRecords ?? []), null, 2),
    '',
    '## 剧情节点',
    JSON.stringify(request.plotNodes ?? [], null, 2),
    '',
    '## 剧情编织联动摘要',
    buildStoryWeavingNewsBrief(request.storyWeaving) || '（无可供新闻读取的剧情编织摘要）',
    '',
    '请根据上面内容输出本回合星际和平公司周报的结构化 JSON。优先少而精，最多新增 3 条。',
  ].join('\n');
}

function buildPublicNpcBriefs(npcs: NPC记录[]): Array<{
  姓名: string;
  别名?: string;
  阶位: NPC记录['阶位'];
  公开关系: string;
  最近回合: number;
  原著角色?: boolean;
  公开介绍?: string;
  装备摘要?: string;
  备注?: string[];
}> {
  return npcs
    .filter((npc) => npc.阶位 === 'companion' || npc.同行 || npc.最近回合 > 0)
    .sort((a, b) => b.最近回合 - a.最近回合)
    .slice(0, 12)
    .map((npc) => ({
      姓名: npc.姓名,
      别名: npc.别名,
      阶位: npc.阶位,
      公开关系: toPublicRelationLabel(npc.关系),
      最近回合: npc.最近回合,
      原著角色: npc.原著角色 || undefined,
      公开介绍: npc.介绍 ? npc.介绍.slice(0, 120) : undefined,
      装备摘要: npc.装备摘要 ? npc.装备摘要.slice(0, 100) : undefined,
      备注: npc.备注?.slice(0, 3),
    }));
}

function toPublicRelationLabel(relation: NPC关系类型): string {
  switch (relation) {
    case 'enemy':
      return '敌对或通缉风险';
    case 'rival':
      return '竞争 / 对立';
    case 'close':
    case 'friend':
      return '友好同行';
    case 'acquaintance':
      return '认识';
    default:
      return '公开关系不明';
  }
}

export function applyNewsGenerationResult(current: 新闻条目[], result: 新闻生成结果): 新闻条目[] {
  const map = new Map(current.map((item) => [item.id, item]));

  for (const patch of result.更新 ?? []) {
    applyPatchToMap(map, patch, false);
  }

  for (const id of result.归档 ?? []) {
    const hit = map.get(id);
    if (!hit) continue;
    map.set(id, { ...hit, 状态: 'archived', 更新时间: Date.now() });
  }

  for (const id of result.删除 ?? []) {
    map.delete(id);
  }

  for (const patch of result.新增 ?? []) {
    const entry = createEntryFromPatch(patch);
    map.set(entry.id, entry);
  }

  return Array.from(map.values()).sort((a, b) => {
    const statusDelta = NEWS_STATUS_RANK[a.状态] - NEWS_STATUS_RANK[b.状态];
    if (statusDelta !== 0) return statusDelta;
    if (b.回合 !== a.回合) return b.回合 - a.回合;
    return b.时间戳 - a.时间戳;
  });
}

function applyPatchToMap(map: Map<string, 新闻条目>, patch: 新闻条目补丁, allowCreate = true): void {
  const id = patch.id?.trim();
  if (!id) return;
  const hit = map.get(id);
  if (!hit) {
    if (!allowCreate) return;
    map.set(id, createEntryFromPatch({ ...patch, id }));
    return;
  }
  map.set(id, {
    ...hit,
    类目: patch.类目 ?? hit.类目,
    状态: patch.状态 ?? hit.状态,
    回合: typeof patch.回合 === 'number' ? patch.回合 : hit.回合,
    标题: patch.标题?.trim() ? patch.标题.trim() : hit.标题,
    正文: patch.正文?.trim() ? patch.正文.trim() : hit.正文,
    组织标签: patch.组织标签 ?? patch.阵营标签 ?? hit.组织标签 ?? hit.阵营标签,
    阵营标签: undefined,
    关联系统: patch.关联系统 ?? hit.关联系统,
    关联剧情系列ID: patch.关联剧情系列ID ?? hit.关联剧情系列ID,
    关联剧情分段ID: patch.关联剧情分段ID ?? hit.关联剧情分段ID,
    重要: patch.重要 ?? hit.重要,
    更新时间: Date.now(),
  });
}

function createEntryFromPatch(patch: 新闻条目补丁): 新闻条目 {
  const now = Date.now();
  return {
    ...归一化新闻条目({
      id: patch.id,
      类目: patch.类目,
      状态: patch.状态,
      回合: patch.回合 ?? 0,
      标题: patch.标题 ?? '未命名新闻',
      正文: patch.正文 ?? '',
      组织标签: patch.组织标签 ?? patch.阵营标签,
      阵营标签: undefined,
      关联系统: patch.关联系统,
      关联剧情系列ID: patch.关联剧情系列ID,
      关联剧情分段ID: patch.关联剧情分段ID,
      重要: patch.重要 ?? false,
      创建时间: now,
      更新时间: now,
    }),
    更新时间: now,
  };
}

function parseNewsResult(rawText: string): 新闻生成结果 {
  const candidate = extractJsonCandidate(rawText);
  try {
    const parsed = JSON.parse(candidate) as Partial<新闻生成结果>;
    return {
      新增: Array.isArray(parsed.新增) ? parsed.新增.map(normalizePatch).filter(Boolean) as 新闻条目补丁[] : [],
      更新: Array.isArray(parsed.更新) ? parsed.更新.map(normalizePatch).filter(Boolean) as 新闻条目补丁[] : [],
      归档: Array.isArray(parsed.归档) ? parsed.归档.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()) : [],
      删除: Array.isArray(parsed.删除) ? parsed.删除.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()) : [],
      说明: typeof parsed.说明 === 'string' ? parsed.说明.trim() : undefined,
    };
  } catch {
    return { 新增: [], 更新: [], 归档: [], 删除: [], 说明: rawText.trim() };
  }
}

function normalizePatch(patch: Partial<新闻条目补丁>): 新闻条目补丁 | null {
  if (!patch || typeof patch !== 'object') return null;
  const id = typeof patch.id === 'string' ? patch.id.trim() : undefined;
  const 类目 = patch.类目;
  const 状态 = patch.状态;
  const 标题 = typeof patch.标题 === 'string' ? patch.标题.trim() : undefined;
  const 正文 = typeof patch.正文 === 'string' ? patch.正文.trim() : undefined;
  const 回合 = typeof patch.回合 === 'number' && Number.isFinite(patch.回合) ? patch.回合 : undefined;
  return {
    id,
    类目,
    状态,
    回合,
    标题,
    正文,
    组织标签: Array.isArray(patch.组织标签) ? patch.组织标签 : Array.isArray(patch.阵营标签) ? patch.阵营标签 : undefined,
    阵营标签: undefined,
    关联系统: Array.isArray(patch.关联系统) ? patch.关联系统 : undefined,
    关联剧情系列ID: typeof patch.关联剧情系列ID === 'string' && patch.关联剧情系列ID.trim() ? patch.关联剧情系列ID.trim() : undefined,
    关联剧情分段ID: typeof patch.关联剧情分段ID === 'string' && patch.关联剧情分段ID.trim() ? patch.关联剧情分段ID.trim() : undefined,
    重要: typeof patch.重要 === 'boolean' ? patch.重要 : undefined,
  };
}

function buildStoryWeavingNewsBrief(system?: 剧情编织系统): string {
  if (!system?.系列列表?.length) return '';
  const activeSeries = system.系列列表.find((item) => item.id === system.当前系列ID)
    ?? system.系列列表.find((item) => item.激活注入 !== false)
    ?? system.系列列表[0];
  if (!activeSeries || activeSeries.激活注入 === false) return '';

  const sideSeries = system.系列列表
    .filter((item) => item.id !== activeSeries.id && item.激活注入 !== false)
    .filter((item) => item.来源类型 !== activeSeries.来源类型)
    .slice(0, 2);

  const lines: string[] = [
    '【主注入剧情轨道】',
    ...formatStorySeriesForNews(activeSeries, true, system.当前进度),
  ];
  if (sideSeries.length) {
    lines.push('【非主注入剧情轨道 / 支线苗头】');
    for (const series of sideSeries) {
      lines.push(...formatStorySeriesForNews(series, false));
    }
  }
  lines.push('约束：新闻必须区分主注入轨道和非主注入轨道；主轨道可提供外围压力，非主轨道只能作为支线苗头、传闻或低优先级背景，不得抢走主剧情推进权。新闻只能读取外围压力、可铺垫事项、已发生后果和偏离状态；不得刊登完整原文，不得剧透核心反转，不得把已经历分段重新包装成未来事件；不得把私密人格、手机私聊、NSFW 档案、未公开身份或未解锁形态写成公开报道。');
  return lines.join('\n');
}

function formatStorySeriesForNews(
  series: NonNullable<剧情编织系统['系列列表'][number]>,
  primary: boolean,
  anchor?: 剧情编织系统['当前进度'],
): string[] {
  const segments = [...series.分段列表].sort((a, b) => a.组号 - b.组号);
  const diagnostics = primary ? getStoryWeavingInjectionDiagnostics({ 系列列表: [series], 当前系列ID: series.id, 当前进度: anchor }) : null;
  const current = diagnostics
    ? segments.find((segment) => segment.id === diagnostics.当前分段ID)
    : segments.find((segment) => segment.id === anchor?.当前分段ID && !['已经历', '已跳过', '已偏离', '暂停'].includes(segment.运行状态))
      ?? segments.find((segment) => segment.组号 === anchor?.当前分段组号 && segment.运行状态 === '当前')
      ?? segments.find((segment) => segment.运行状态 === '当前');
  const next = current
    ? segments.find((segment) => segment.组号 > current.组号 && segment.运行状态 === '未开始')
    : segments.find((segment) => segment.运行状态 === '未开始');
  const experienced = segments.filter((segment) => segment.运行状态 === '已经历').slice(-3);
  const deviated = segments
    .filter((segment) => segment.运行状态 === '已偏离' || segment.运行状态 === '已跳过')
    .slice(-3);

  const lines: string[] = [
    `系列ID：${series.id}`,
    `系列：${series.标题}`,
    `来源：${series.来源类型 === 'canon' ? '原著剧情轨道' : '玩家自制剧情'}`,
    `新闻权限：${primary ? '主轨道外围压力' : '支线苗头 / 低优先级传闻'}`,
  ];
  if (primary && anchor) {
    lines.push('【剧情进度锚点】');
    lines.push(JSON.stringify({
      推进状态: anchor.推进状态,
      当前分段组号: anchor.当前分段组号,
      已完成摘要: anchor.已完成摘要.slice(0, 6),
      历史归档: anchor.历史归档.slice(-6).map((item) => ({
        分段组号: item.分段组号,
        分段标题: item.分段标题,
        归档状态: item.归档状态,
        摘要: item.摘要,
        角色推进摘要: item.角色推进摘要?.slice(0, 4) ?? [],
      })),
      当前待解问题: anchor.当前待解问题.slice(0, 6),
      最近判定理由: anchor.最近判定理由.slice(0, 5),
    }, null, 2));
    if (diagnostics) {
      lines.push('【注入窗口诊断】');
      lines.push(JSON.stringify({
        健康状态: diagnostics.健康状态,
        实际注入分段组号: diagnostics.当前分段组号,
        实际注入分段标题: diagnostics.当前分段标题,
        归档锚点标题: diagnostics.归档锚点标题,
        检查项: diagnostics.检查项,
      }, null, 2));
    }
  }
  if (current) {
    lines.push('【当前段外围压力】');
    lines.push(formatSegmentForNews(current, series.id, 'current'));
  }
  if (next) {
    lines.push('【下一段可铺垫】');
    lines.push(formatSegmentForNews(next, series.id, 'next'));
  }
  if (experienced.length) {
    lines.push('【已经历后果】');
    experienced.forEach((segment) => lines.push(formatSegmentForNews(segment, series.id, 'experienced')));
  }
  if (deviated.length) {
    lines.push('【偏离 / 跳过状态】');
    deviated.forEach((segment) => lines.push(formatSegmentForNews(segment, series.id, 'deviated')));
  }
  return lines;
}

function formatSegmentForNews(
  segment: 剧情编织分段,
  seriesId: string,
  mode: 'current' | 'next' | 'experienced' | 'deviated',
): string {
  const payload = {
    关联剧情系列ID: seriesId,
    关联剧情分段ID: segment.id,
    组号: segment.组号,
    标题: segment.标题,
    运行状态: segment.运行状态,
    摘要: segment.本段概括 || segment.原文摘要 || segment.标题,
    地点: segment.涉及地点.slice(0, 6),
    派系: segment.涉及派系.slice(0, 6),
    角色: segment.登场角色.slice(0, 8),
    可报道信息:
      mode === 'next'
        ? segment.可提前铺垫.slice(0, 4).map((item) => item.内容)
        : mode === 'experienced'
          ? segment.本段结束状态.slice(0, 5)
          : mode === 'deviated'
            ? ['该分段已被标记为偏离或跳过，新闻只能写成情报偏差、走向变化或旧事件归档。']
            : [...segment.前段延续事实, ...segment.给后续参考].slice(0, 6),
  };
  return JSON.stringify(payload, null, 2);
}

function extractJsonCandidate(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

const NEWS_STATUS_RANK: Record<新闻条目['状态'], number> = {
  upcoming: 0,
  ongoing: 1,
  completed: 2,
  archived: 3,
};
