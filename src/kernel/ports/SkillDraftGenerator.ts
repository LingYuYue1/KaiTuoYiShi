import type { API配置项 } from '@/models/settings';
import type { 角色数据结构 } from '@/models/character';
import type { GeneratedSkillDraft, SkillDraftGenerationInput } from '@/src/kernel/contract/session';

export interface SkillDraftGenerator {
  generate(
    config: API配置项,
    traveler: 角色数据结构,
    input: SkillDraftGenerationInput,
    signal?: AbortSignal,
  ): Promise<GeneratedSkillDraft>;
}
