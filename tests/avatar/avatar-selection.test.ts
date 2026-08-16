import { describe, expect, it } from 'vitest';
import {
  getBuiltinAvatarSetForNames,
  getDefaultBuiltinAvatarForNames,
} from '@/data/builtinAvatars';
import { 归一化NPC记录列表, 读取NPC头像 } from '@/models/npc';
import {
  isRemoteStaticAssetUrl,
  STATIC_ASSET_FALLBACK_AVATAR,
} from '@/utils/staticAssets';

describe('NPC avatar selection', () => {
  it('recognizes saved aliases and returns a usable built-in avatar', () => {
    expect(getBuiltinAvatarSetForNames('银狼LV.999')?.canonicalName).toBe('银狼');
    expect(isRemoteStaticAssetUrl(getDefaultBuiltinAvatarForNames('银狼LV.999'))).toBe(true);
  });

  it('keeps a player-provided avatar ahead of a built-in choice', () => {
    const customAvatar = 'https://player.example/custom.webp';
    expect(读取NPC头像({ 姓名: '银狼', 头像: customAvatar })).toBe(customAvatar);
  });

  it('replaces a legacy generic placeholder with the character avatar', () => {
    const avatar = 读取NPC头像({ 姓名: '银狼', 头像: STATIC_ASSET_FALLBACK_AVATAR }, '正文');
    expect(isRemoteStaticAssetUrl(avatar)).toBe(true);
  });

  it('retains an unknown character avatar after normalizing a saved record', () => {
    const customAvatar = 'https://player.example/custom.webp';
    const [record] = 归一化NPC记录列表([{ 姓名: '自定义角色', 头像: customAvatar }]);
    expect(读取NPC头像(record)).toBe(customAvatar);
  });
});
