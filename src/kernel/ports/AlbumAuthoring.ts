import type { 游戏设置 } from '@/models/settings';
import type { NPC角色锚点档案 } from '@/models/npc';

export interface AlbumAuthoring {
  extractCharacterAnchor(settings: 游戏设置, input: import('@/services/ai/characterAnchorExtract').CharacterAnchorExtractInput): Promise<NPC角色锚点档案>;
  tokenizePrompt(settings: 游戏设置, input: import('@/services/ai/imagePromptTokenizer').ImagePromptTokenizerInput): Promise<import('@/services/ai/imagePromptTokenizer').ImagePromptTokenizerResult | null>;
  parseScene(settings: 游戏设置, input: import('@/services/ai/narrativeImageParse').解析上下文): Promise<import('@/services/ai/narrativeImageParse').场景图解析结果>;
  parseStorySnapshot(
    settings: 游戏设置,
    input: import('@/services/ai/narrativeImageParse').解析上下文,
    signal?: AbortSignal,
  ): Promise<import('@/services/ai/narrativeImageParse').故事快照解析结果>;
}
