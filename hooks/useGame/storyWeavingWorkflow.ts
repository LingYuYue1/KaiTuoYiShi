import { hydratePersistedStoryWeavingSystem } from '@/data/storyWeavingPreset';
import type { NPC记录 } from '@/models/npc';
import { 归一化剧情编织系统, type 剧情编织系统 } from '@/models/storyWeaving';
import { loadSetting } from '@/services/dbService';
import { 提取NPC同行记忆文本列表 } from '@/models/npc';

export function buildStoryProgressMemoryLine(previous: 剧情编织系统, next: 剧情编织系统): string {
  const before = previous.当前进度;
  const after = next.当前进度;
  if (!after) return '';
  if (
    before?.当前系列ID === after.当前系列ID &&
    before?.当前分段ID === after.当前分段ID &&
    before?.推进状态 === after.推进状态 &&
    before.最近一次推进判定回合 === after.最近一次推进判定回合
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

export function applyStoryProgressNpcMemory(npcs: NPC记录[], story: 剧情编织系统, _memoryLine: string, turn: number): NPC记录[] {
  if (!story.当前进度) return npcs;
  const series = story.系列列表.find((item) => item.id === story.当前进度?.当前系列ID)
    ?? story.系列列表.find((item) => item.id === story.当前系列ID);
  if (!series) return npcs;
  const latestArchive = story.当前进度.历史归档.at(-1);
  const roleProgress = latestArchive?.角色推进摘要 ?? [];
  if (!roleProgress.length) return npcs;
  const next = npcs.map((npc) => {
    const aliases = [npc.姓名, npc.别名].filter((item): item is string => Boolean(item?.trim()));
    const matched = roleProgress.find((summary) =>
      aliases.some((name) => summary.includes(name)),
    );
    if (!matched || !(npc.阶位 === 'companion' || npc.同行 || 提取NPC同行记忆文本列表(npc).length > 0)) return npc;
    const existing = 提取NPC同行记忆文本列表(npc);
    const cleanSummary = matched.length > 120 ? `${matched.slice(0, 118)}…` : matched;
    if (existing.some((item) => item.includes(cleanSummary))) return npc;
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
  const changed = next.some((npc, index) => npc !== npcs[index]);
  return changed ? next : npcs;
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

export async function resolveStoryWeavingForBackgroundWrite(input: {
  workflowBase: 剧情编织系统;
  proposed: 剧情编织系统;
}): Promise<{ system: 剧情编织系统; concurrentChange: boolean }> {
  const latest = await loadSetting<剧情编织系统>('storyWeavingSystem');
  const latestNormalized = latest ? hydratePersistedStoryWeavingSystem(latest, input.workflowBase) : null;
  if (!latestNormalized) return { system: input.proposed, concurrentChange: false };
  const baseSignature = getStoryWeavingWriteSignature(归一化剧情编织系统(input.workflowBase));
  const latestSignature = getStoryWeavingWriteSignature(latestNormalized);
  if (baseSignature === latestSignature) {
    return { system: input.proposed, concurrentChange: false };
  }
  return { system: latestNormalized, concurrentChange: true };
}
