import type { AlbumImageGenerator } from '@/src/kernel/ports/AlbumImageGenerator';
import { generateImage } from '@/services/ai/imageGeneration';
import { runImageGenerationWithRetry } from '@/utils/imageGenerationRetry';
import { pickAssetDisplayUrl, rememberAlbumAssetFromDataUrl } from '@/utils/albumObjectUrl';

export class BrowserAlbumImageGenerator implements AlbumImageGenerator {
  async generate(
    settings: Parameters<AlbumImageGenerator['generate']>[0],
    request: Parameters<AlbumImageGenerator['generate']>[1],
    signal: Parameters<AlbumImageGenerator['generate']>[2],
  ) {
    const imageSettings = settings.文生图系统;
    if (!imageSettings.enabled) throw new Error('请先在设置里启用文生图。');
    const api = request.nsfw ? imageSettings.NSFW接口 : imageSettings.普通接口;
    if (!api.enabled) throw new Error('当前文生图接口未启用。');

    const references = request.references.flatMap((reference) => {
      const src = pickAssetDisplayUrl(reference.asset);
      return src ? [{ id: reference.entryId, src, role: 'character' as const, weight: 1 }] : [];
    });
    let attempts = 0;
    const result = await runImageGenerationWithRetry(
      () => generateImage(api, {
        prompt: request.prompt,
        negativePrompt: request.negativePrompt,
        nsfw: request.nsfw,
        size: request.dimensions,
        referenceImages: references,
        referenceStrength: imageSettings.参考图.sdWebuiDenoisingStrength,
        signal,
      }),
      {
        maxRetries: api.retryCount,
        signal,
        onAttempt: (attempt) => { attempts = attempt; },
      },
    );

    if (result.src.startsWith('data:')) {
      const blob = rememberAlbumAssetFromDataUrl(request.assetId, result.src);
      return {
        dataUrl: `asset:${request.assetId}`,
        size: blob?.size,
        originalUrl: result.originalUrl?.startsWith('data:') ? undefined : result.originalUrl,
        mimeType: result.mimeType,
        model: result.model,
        backend: result.backend ?? api.backend,
        retryCount: Math.max(0, attempts - 1),
      };
    }
    return {
      url: result.src,
      originalUrl: result.originalUrl,
      mimeType: result.mimeType,
      model: result.model,
      backend: result.backend ?? api.backend,
      retryCount: Math.max(0, attempts - 1),
    };
  }
}
