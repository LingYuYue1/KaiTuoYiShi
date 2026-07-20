import { PORTABLE_SAVE_SCHEMA_VERSION, type 存档数据, type 存档类型 } from '@/models/settings';
import type { StoryState } from '@/src/kernel/domain/session/storyState';
import { buildPersistedZhikuSystem } from '@/data/zhikuPreset';
import { assertDurableJob } from '@/src/kernel/domain/jobs/durableJob';
import { assertStoryPolicy } from '@/models/settingsPlanes';

/** Exact story-only portable DTO. Device preferences and content bodies are unrepresentable. */
export function createPortableSave(story: StoryState, type: 存档类型, timestamp: number): 存档数据 {
  return {
    portableSchemaVersion: PORTABLE_SAVE_SCHEMA_VERSION,
    id: 0,
    type,
    timestamp,
    turnCount: story.conversation.turnCount,
    旅人: story.traveler,
    世界: story.world,
    chatHistory: story.conversation.history.slice(),
    记忆: story.memory.system,
    忆庭: story.memory.yiting,
    智库: buildPersistedZhikuSystem(story.content.zhikuRuntime),
    手机: story.phone,
    NPC: story.characters.npcs.slice(),
    相册: story.album,
    新闻: story.news.slice(),
    剧情: story.plot.nodes.slice(),
    剧情编织: story.plot.weaving,
    variableBatches: story.systems.variableBatches.slice(),
    jobs: story.jobs.records.slice(),
    policy: story.policy,
    turnJournal: story.conversation.turnJournal.slice(),
    worldbookTriggerStates: { ...story.content.worldbookTriggerStates },
    pendingOpeningTrigger: story.turn.pendingOpeningTrigger,
  };
}

/** Exact portable-save ingress. Migration has a separate, explicitly invoked reader. */
export function readPortableSave(value: unknown): 存档数据 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('无效的当前版本存档文件');
  const save = value as Record<string, unknown>;
  if (save.portableSchemaVersion !== PORTABLE_SAVE_SCHEMA_VERSION) {
    throw new Error(`存档结构版本不兼容：需要 ${PORTABLE_SAVE_SCHEMA_VERSION}，实际 ${String(save.portableSchemaVersion)}`);
  }
  for (const forbidden of ['apiSettings', 'gameSettings', 'theme', 'currentTheme', 'worldbooks']) {
    if (forbidden in save) throw new Error(`当前版本存档禁止设备或内容库字段：${forbidden}`);
  }
  for (const field of ['旅人', '世界', '记忆', '忆庭', '智库', '手机', '相册', '剧情编织', 'policy']) {
    const item = save[field];
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`当前版本存档字段必须是对象：${field}`);
  }
  for (const field of ['chatHistory', 'NPC', '新闻', '剧情', 'variableBatches', 'jobs', 'turnJournal']) {
    if (!Array.isArray(save[field])) throw new Error(`当前版本存档字段必须是数组：${field}`);
  }
  for (const job of save.jobs as unknown[]) assertDurableJob(job);
  assertStoryPolicy(save.policy);
  if (!Number.isSafeInteger(save.turnCount) || Number(save.turnCount) < 1) throw new Error('当前版本存档需要正整数 turnCount');
  if (!save.worldbookTriggerStates || typeof save.worldbookTriggerStates !== 'object' || Array.isArray(save.worldbookTriggerStates)) {
    throw new Error('当前版本存档需要 worldbookTriggerStates');
  }
  if (save.pendingOpeningTrigger !== null && typeof save.pendingOpeningTrigger !== 'string') {
    throw new Error('当前版本存档需要 string|null pendingOpeningTrigger');
  }
  return structuredClone(value) as 存档数据;
}
