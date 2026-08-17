import { describe, expect, it } from 'vitest';
import { createBuiltinPromptModules } from '@/data/builtinPromptModules';
import {
  BUILTIN_BOOK_IDS,
  NARRATIVE_GENERAL_CONTENT,
  WORLDVIEW_SPINE_USAGE_RULES,
} from '@/data/builtinWorldbookConfig';
import { createBuiltinWorldbooks } from '@/data/worldbookPresets';
import { buildSystemPrompt } from '@/hooks/useGame/systemPromptBuilder';
import { migratePromptModules } from '@/hooks/useGameState';
import { 创建空记忆系统 } from '@/models/memory';
import { BUILTIN_PROMPT_MODULE_IDS, type 提示词模块 } from '@/models/prompts';
import { createPromptFixture } from './fixtures';

const RULES = [
  ['builtin_rule_first_turn', 40, ['opening']],
  ['builtin_rule_narrative_general', 41, ['main', 'opening']],
  ['builtin_rule_forbidden_phrases', 42, ['main', 'opening', 'pathAwakening']],
  ['builtin_rule_emotion_realism', 43, ['main', 'opening']],
  ['builtin_rule_battle_narration', 44, ['main', 'opening']],
  ['builtin_rule_time_progression', 45, ['main', 'opening']],
  ['builtin_rule_power_system', 46, ['main', 'pathAwakening']],
  ['builtin_rule_awakening_interrogation', 47, ['pathAwakening']],
] as const;

describe('规则模块搬运', () => {
  it('保留八个规则模块的注入清单，并从世界书移除对应职责', () => {
    const modules = createBuiltinPromptModules();
    for (const [id, order, scope] of RULES) {
      expect(modules.find((module) => module.id === id)).toMatchObject({ id, order, scope, enabled: true });
      expect(BUILTIN_PROMPT_MODULE_IDS).toContain(id);
    }

    const books = createBuiltinWorldbooks();
    const retiredIds = ['builtin_opening_rule', 'builtin_narrative_general', 'builtin_forbidden_phrases', 'builtin_power_system_overview'];
    for (const id of retiredIds) {
      expect(books.some((book) => book.id === id)).toBe(false);
      expect(BUILTIN_BOOK_IDS).not.toContain(id);
    }

    const worldview = books.find((book) => book.id === 'builtin_worldview_core')!;
    const paths = books.find((book) => book.id === 'builtin_paths_lore')!;
    expect(worldview.entries.some((entry) => entry.id === 'builtin_worldview_time_progression')).toBe(false);
    expect(paths.entries.some((entry) => entry.id === 'builtin_paths_awakening_interrogation')).toBe(false);
    expect(modules.find((module) => module.id === 'builtin_rule_narrative_general')?.content)
      .toBe(`${NARRATIVE_GENERAL_CONTENT}\n\n${WORLDVIEW_SPINE_USAGE_RULES}`);
    expect(worldview.entries.find((entry) => entry.id === 'builtin_worldview_spine')?.content)
      .not.toContain('### 世界观使用原则');
  });

  it('补齐缺失规则模块，保留既有内置模块开关', () => {
    const { settings } = createPromptFixture();
    settings.promptModules = settings.promptModules
      .filter((module) => !RULES.some(([id]) => module.id === id))
      .map((module) => module.id === 'builtin_narrator_persona' ? { ...module, enabled: false } : module);

    const migrated = migratePromptModules(settings);
    for (const [id] of RULES) {
      expect(migrated.find((module) => module.id === id)?.enabled).toBe(true);
    }
    expect(migrated.find((module) => module.id === 'builtin_narrator_persona')?.enabled).toBe(false);
  });

  it('仅在有世界书上下文时解析规则模块的世界书占位符', () => {
    const { traveler, world, settings, context } = createPromptFixture();
    const rule: 提示词模块 = {
      ...createBuiltinPromptModules().find((module) => module.id === 'builtin_rule_narrative_general')!,
      id: 'test_rule_placeholder',
      content: '旅人={playerName}; 原作主角={originalProtagonistSubject}',
      scope: ['main'],
      order: 40,
    };
    settings.promptModules = [rule];

    const withoutWorldbookContext = buildSystemPrompt(traveler, world, 创建空记忆系统(), settings, 1).systemPrompt;
    const withWorldbookContext = buildSystemPrompt(
      traveler,
      world,
      创建空记忆系统(),
      settings,
      1,
      [],
      { ...context, originalProtagonist: '星' },
    ).systemPrompt;

    expect(withoutWorldbookContext).toContain(`旅人=${traveler.姓名}; 原作主角={originalProtagonistSubject}`);
    expect(withWorldbookContext).toContain(`旅人=${traveler.姓名}; 原作主角=原作主角星`);
  });
});
