import { describe, expect, it } from 'vitest';
import {
  isRemoteStaticAssetUrl,
  resolveStaticAssetReference,
} from '@/utils/staticAssets';

describe('static avatar references', () => {
  it('resolves logical and legacy avatar references to a valid static resource', () => {
    const references = [
      'static:avatar:asta:03',
      '/assets/builtin-avatars/candidates/asta-03.png',
      'assets/builtin-avatars/candidates/asta-03.png',
      '/public/assets/builtin-avatars/candidates/asta-03.png?version=1',
      'https://legacy.example.invalid/assets/builtin-avatars/candidates/asta-03.png#old-save',
    ];

    for (const reference of references) {
      const resolved = resolveStaticAssetReference(reference);
      expect(isRemoteStaticAssetUrl(resolved)).toBe(true);
    }
  });

  it('rejects unknown static references instead of rendering them literally', () => {
    expect(resolveStaticAssetReference('static:avatar:unknown:01')).toBeUndefined();
    expect(resolveStaticAssetReference('/assets/builtin-avatars/candidates/not-an-avatar.png')).toBeUndefined();
  });
});
