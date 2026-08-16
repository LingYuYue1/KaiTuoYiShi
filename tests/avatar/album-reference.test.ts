import { describe, expect, it } from 'vitest';
import { 归一化NPC记录列表 } from '@/models/npc';
import { 挂载NPC头像图片, 解析相册资源引用 } from '@/utils/albumActions';
import { isRemoteStaticAssetUrl } from '@/utils/staticAssets';

describe('album avatar references', () => {
  it('persists a logical avatar reference and resolves it only for display', () => {
    const [npc] = 归一化NPC记录列表([{ id: 'npc-1', 姓名: '艾丝妲' }]);
    const logicalReference = 'static:avatar:asta:03';
    const [mounted] = 挂载NPC头像图片([npc], {
      npcId: npc.id,
      slot: '档案',
      src: logicalReference,
      source: '原著',
    });

    expect(mounted.头像).toBe(logicalReference);
    expect(isRemoteStaticAssetUrl(解析相册资源引用(undefined, mounted.头像))).toBe(true);
  });

  it('does not expose an invalid logical reference as an image URL', () => {
    expect(解析相册资源引用(undefined, 'static:avatar:unknown:01')).toBeUndefined();
  });

  it('preserves a user-provided remote image reference', () => {
    const customImage = 'https://player.example/custom.webp';
    expect(解析相册资源引用(undefined, customImage)).toBe(customImage);
  });
});
