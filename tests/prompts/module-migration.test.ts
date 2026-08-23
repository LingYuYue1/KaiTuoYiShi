import { describe, expect, it } from 'vitest';
import { createBuiltinPromptModules } from '@/data/builtinPromptModules';
import { migratePromptModules } from '@/hooks/useGameState';
import { createPromptFixture } from './fixtures';

const RULE_SCOPES = [
  ['builtin_rule_first_turn', ['opening']],
  ['builtin_rule_narrative_general', ['main', 'opening']],
  ['builtin_rule_forbidden_phrases', ['main', 'opening', 'pathAwakening']],
  ['builtin_rule_emotion_realism', ['main', 'opening']],
  ['builtin_rule_battle_narration', ['main', 'opening']],
  ['builtin_rule_time_progression', ['main', 'opening']],
  ['builtin_rule_power_system', ['main', 'pathAwakening']],
  ['builtin_rule_awakening_interrogation', ['pathAwakening']],
] as const;

describe('规则模块', () => {
  it('规则职责由启用的提示词模块承担，且作用域覆盖声明的场景', () => {
    const modules = createBuiltinPromptModules();
    for (const [id, requiredScopes] of RULE_SCOPES) {
      const module = modules.find((candidate) => candidate.id === id);
      expect(module, id).toBeDefined();
      expect(module?.enabled).toBe(true);
      expect(module?.content.trim()).not.toBe('');
      for (const scope of requiredScopes) {
        expect(module?.scope, `${id} 应覆盖 ${scope}`).toContain(scope);
      }
    }
  });

  it('migrate 补齐缺失的内置模块并保留既有开关', () => {
    const { settings } = createPromptFixture();
    settings.promptModules = settings.promptModules
      .filter((module) => !RULE_SCOPES.some(([id]) => module.id === id))
      .map((module) => module.id === 'builtin_narrator_persona' ? { ...module, enabled: false } : module);

    const migrated = migratePromptModules(settings);
    for (const [id] of RULE_SCOPES) {
      expect(migrated.find((module) => module.id === id)?.enabled).toBe(true);
    }
    expect(migrated.find((module) => module.id === 'builtin_narrator_persona')?.enabled).toBe(false);
  });
});
