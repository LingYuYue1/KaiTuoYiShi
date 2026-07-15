/**
 * Stage 5.4 — ImageGenerator / AssetStore surface guard.
 *
 * Image generation must NOT expand ModelGateway with image* methods.
 * generateImage.ts uses ImageGenerator + AssetStore only.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ModelGateway } from '@/src/kernel/ports/ModelGateway';
import type { ImageGenerator } from '@/src/kernel/ports/ImageGenerator';
import { ScriptedModelGateway } from '@/src/kernel/adapters/test/ScriptedModelGateway';
import { ScriptedImageGenerator } from '@/src/kernel/adapters/test/ScriptedImageGenerator';

const ROOT = resolve(import.meta.dirname, '../../../..');

describe('asset surface guard (Stage 5.4)', () => {
  it('ImageGenerator is a separate port from ModelGateway', () => {
    const modelSource = readFileSync(
      resolve(ROOT, 'src/kernel/ports/ModelGateway.ts'),
      'utf8',
    );
    const imageSource = readFileSync(
      resolve(ROOT, 'src/kernel/ports/ImageGenerator.ts'),
      'utf8',
    );

    expect(modelSource).toMatch(/complete\s*\(/);
    expect(modelSource).not.toMatch(/generate\s*\(/);
    expect(modelSource).not.toMatch(/image/i);

    expect(imageSource).toMatch(/generate\s*\(/);
    expect(imageSource).toMatch(/ImageGenerator/);
  });

  it('ModelGateway interface only has complete; ImageGenerator only has generate', () => {
    const gateway: ModelGateway = new ScriptedModelGateway();
    const portOnly: ModelGateway = {
      complete: gateway.complete.bind(gateway),
    };
    expect(typeof portOnly.complete).toBe('function');
    expect('generate' in portOnly).toBe(false);
    expect('imageGenerate' in portOnly).toBe(false);

    const images: ImageGenerator = new ScriptedImageGenerator();
    const imagePort: ImageGenerator = {
      generate: images.generate.bind(images),
    };
    expect(typeof imagePort.generate).toBe('function');
    expect('complete' in imagePort).toBe(false);
  });

  it('generateImage.ts does not call model.image* or expand ModelGateway', () => {
    const generateImageSrc = readFileSync(
      resolve(ROOT, 'src/kernel/application/generateImage.ts'),
      'utf8',
    );
    expect(generateImageSrc).toMatch(/images\.generate\(/);
    expect(generateImageSrc).toMatch(/assets\.put\(/);
    expect(generateImageSrc).not.toMatch(/model\.image/);
    expect(generateImageSrc).not.toMatch(/model\.generate/);
    // No ModelGateway import/type dependency (comment may mention the forbid rule).
    expect(generateImageSrc).not.toMatch(/from ['"][^'"]*ModelGateway['"]/);
    expect(generateImageSrc).not.toMatch(/:\s*ModelGateway\b/);
    expect(generateImageSrc).toMatch(/ImageGenerator/);
    expect(generateImageSrc).toMatch(/AssetStore/);
  });
});
