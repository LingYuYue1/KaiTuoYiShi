import type { 图片资源 } from '@/models/imageGeneration';
import type { 游戏设置 } from '@/models/settings';

export type AlbumImageReference = Readonly<{
  entryId: string;
  asset: Pick<图片资源, 'id' | 'dataUrl' | 'url' | 'localRef' | 'originalUrl'>;
}>;

export type AlbumImageGenerationRequest = Readonly<{
  assetId: string;
  prompt: string;
  negativePrompt?: string;
  nsfw: boolean;
  dimensions?: string;
  references: readonly AlbumImageReference[];
}>;

export type AlbumImageGenerationResult = Readonly<{
  url?: string;
  originalUrl?: string;
  dataUrl?: string;
  size?: number;
  mimeType?: string;
  model?: string;
  backend: string;
  retryCount: number;
}>;

export interface AlbumImageGenerator {
  generate(
    settings: 游戏设置,
    request: AlbumImageGenerationRequest,
    signal: AbortSignal,
  ): Promise<AlbumImageGenerationResult>;
}
