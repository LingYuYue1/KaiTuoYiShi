import type { SkillDraftGenerator } from '@/src/kernel/ports/SkillDraftGenerator';
import { generateSkillDraft } from '@/services/ai/skillGenerator';
import type { API配置项 } from '@/models/settings';
import type { 角色数据结构 } from '@/models/character';
import type { GeneratedSkillDraft, SkillDraftGenerationInput } from '@/src/kernel/contract/session';

export class BrowserSkillDraftGenerator implements SkillDraftGenerator {
  async generate(
    config: API配置项,
    traveler: 角色数据结构,
    input: SkillDraftGenerationInput,
    signal?: AbortSignal,
  ): Promise<GeneratedSkillDraft> {
    const result = await generateSkillDraft(config, {
      traveler,
      slotKind: input.slot.kind,
      slotIndex: input.slot.index,
      pathId: input.slot.pathId,
      pathStage: input.slot.pathStage,
      existingSkillNames: [...input.existingSkillNames],
      userHint: input.userHint,
      currentDraft: input.currentDraft ? {
        名称: input.currentDraft.name,
        描述: input.currentDraft.description,
        来源: input.currentDraft.source,
        关键词: input.currentDraft.keywords ? [...input.currentDraft.keywords] : undefined,
        消耗: input.currentDraft.cost,
        冷却: input.currentDraft.cooldown,
        备注: input.currentDraft.notes,
      } : undefined,
    }, signal);
    return {
      name: result.名称,
      description: result.描述,
      source: result.来源,
      keywords: result.关键词,
      cost: result.消耗,
      cooldown: result.冷却,
      notes: result.备注,
    };
  }
}
