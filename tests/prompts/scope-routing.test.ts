import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, createSystemPromptInput } from '@/hooks/useGame/systemPromptBuilder';
import { 创建空手机系统, 创建手机会话 } from '@/models/phone';
import { 创建NPC记录 } from '@/models/npc';
import { 创建新闻条目 } from '@/models/news';
import { 创建空记忆系统 } from '@/models/memory';
import { createPromptFixture, createStoryWeavingFixture, createZhikuFixture } from './fixtures';

const FINGERPRINTS = {
  memory: 'PROBE_MEMORY_PAYLOAD',
  news: 'PROBE_NEWS_PAYLOAD',
  phone: 'PROBE_PHONE_PAYLOAD',
  npcLedger: '命途测试员',
  companions: '同行测试员',
  weaving: 'CURRENT_SEGMENT_PAYLOAD',
  zhiku: 'PROBE_ZHIKU_PAYLOAD',
} as const;

function createAllDomainsInput() {
  const base = createPromptFixture();
  const npcLedgerNpc = { ...创建NPC记录({ 姓名: FINGERPRINTS.npcLedger, 初见回合: 1, 阶位: 'extra' }), 最近回合: 8 };
  const companionNpc = { ...创建NPC记录({ 姓名: FINGERPRINTS.companions, 初见回合: 1, 阶位: 'companion' }), 同行: true };
  const phone = 创建空手机系统();
  const chat = 创建手机会话({ type: 'group', title: FINGERPRINTS.phone, participantIds: [] });
  chat.localArchive = { threshold: 20, entries: [], compressedSummaries: [FINGERPRINTS.phone] };
  phone.chats.push(chat);
  const memory = 创建空记忆系统();
  memory.短期记忆 = [FINGERPRINTS.memory];
  const news = [创建新闻条目({ 类目: 'chronicle', 回合: 7, 标题: FINGERPRINTS.news })];
  const zhiku = createZhikuFixture();
  zhiku.条目[0].原文 = FINGERPRINTS.zhiku;
  base.settings.剧情编织系统.enabled = true;
  base.settings.剧情编织系统.currentWindow = true;
  return {
    ...base,
    memory,
    npcRecords: [npcLedgerNpc, companionNpc],
    news,
    phone,
    storyWeaving: createStoryWeavingFixture(),
    zhiku,
  };
}

type BaseInput = ReturnType<typeof createAllDomainsInput>;

function buildPrompt(base: BaseInput, scope: 'main' | 'pathAwakening', world = base.world): string {
  return buildSystemPrompt(createSystemPromptInput({
    scope,
    traveler: base.traveler,
    world,
    settings: base.settings,
    turnCount: base.context.turnCount,
    memory: base.memory,
    npcRecords: base.npcRecords,
    news: base.news,
    phone: base.phone,
    storyWeaving: base.storyWeaving,
    zhiku: base.zhiku,
    worldbookCtx: base.context,
  })).systemPrompt;
}

describe('场景路由', () => {
  it('主链注入全部开启的内容域特征数据', () => {
    const base = createAllDomainsInput();
    const prompt = buildPrompt(base, 'main');
    for (const [domain, fingerprint] of Object.entries(FINGERPRINTS)) {
      expect(prompt).toContain(fingerprint);
      void domain;
    }
  });

  it('狭间链（scope 路由）不注入记忆/新闻/手机/账本/同伴/编织/智库', () => {
    const base = createAllDomainsInput();
    const prompt = buildPrompt(base, 'pathAwakening');
    for (const [domain, fingerprint] of Object.entries(FINGERPRINTS)) {
      expect(prompt, `${domain} 不应出现在狭间提示词`).not.toContain(fingerprint);
    }
    expect(prompt).toContain(base.traveler.姓名);
  });

  it('world.进行中狭间 为真时同样进入狭间链', () => {
    const base = createAllDomainsInput();
    const world = { ...base.world, 进行中狭间: 'hunt' as const };
    const prompt = buildPrompt(base, 'main', world);
    for (const [domain, fingerprint] of Object.entries(FINGERPRINTS)) {
      expect(prompt, `${domain} 不应出现在狭间提示词`).not.toContain(fingerprint);
    }
    expect(prompt).toContain(base.traveler.姓名);
  });
});
