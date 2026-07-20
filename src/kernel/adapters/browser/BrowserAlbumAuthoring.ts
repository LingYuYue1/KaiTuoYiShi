import type { AlbumAuthoring } from '@/src/kernel/ports/AlbumAuthoring';
import { buildImagePromptTokenizerConfig, buildImagePromptTokenizerSystemPrompt, tokenizeImagePrompt } from '@/services/ai/imagePromptTokenizer';
import { extractCharacterAnchorWithAI } from '@/services/ai/characterAnchorExtract';
import { parseSceneImagePrompt, parseStorySnapshotPrompt } from '@/services/ai/narrativeImageParse';

export class BrowserAlbumAuthoring implements AlbumAuthoring {
  async extractCharacterAnchor(
    settings: Parameters<AlbumAuthoring['extractCharacterAnchor']>[0],
    input: Parameters<AlbumAuthoring['extractCharacterAnchor']>[1],
  ) {
    const config = requireAnalysisConfig(settings);
    return extractCharacterAnchorWithAI(config, input);
  }

  async tokenizePrompt(
    settings: Parameters<AlbumAuthoring['tokenizePrompt']>[0],
    input: Parameters<AlbumAuthoring['tokenizePrompt']>[1],
  ) {
    const config = buildImagePromptTokenizerConfig(settings);
    if (!config) return null;
    return tokenizeImagePrompt(
      config,
      buildImagePromptTokenizerSystemPrompt(settings, input.mode),
      input,
      config.retryCount ?? 2,
    );
  }

  parseScene(
    settings: Parameters<AlbumAuthoring['parseScene']>[0],
    input: Parameters<AlbumAuthoring['parseScene']>[1],
  ) {
    return parseSceneImagePrompt(requireAnalysisConfig(settings), input);
  }

  parseStorySnapshot(
    settings: Parameters<AlbumAuthoring['parseStorySnapshot']>[0],
    input: Parameters<AlbumAuthoring['parseStorySnapshot']>[1],
    signal?: Parameters<AlbumAuthoring['parseStorySnapshot']>[2],
  ) {
    return parseStorySnapshotPrompt(requireAnalysisConfig(settings), input, signal);
  }
}

function requireAnalysisConfig(settings: import('@/models/settings').游戏设置) {
  const config = buildImagePromptTokenizerConfig(settings);
  if (!config) {
    throw new Error(settings.文生图系统.enablePromptTokenizer
      ? '文生图词组转化器独立 API 未完整配置（需 provider / Base URL / API Key / 模型）'
      : '请先在文生图设置中启用词组转化器并配置独立 API');
  }
  return config;
}
