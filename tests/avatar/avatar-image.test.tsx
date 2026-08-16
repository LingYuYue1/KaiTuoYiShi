// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BodyBlock } from '@/components/features/Chat/MessageRenderers';
import { 归一化NPC记录列表 } from '@/models/npc';

const [silverWolf] = 归一化NPC记录列表([{ 姓名: '银狼', 原著角色: true }]);

function mockRemoteImage(result: 'load' | 'error') {
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      queueMicrotask(() => {
        if (result === 'load') this.onload?.();
        else this.onerror?.();
      });
    }
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('story avatars', () => {
  it('shows the remote avatar after it has loaded', async () => {
    mockRemoteImage('load');
    render(
      <BodyBlock
        content="【银狼】先确认一下情况。"
        npcRecords={[silverWolf]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('img', { name: '银狼 头像' }).getAttribute('src')).toMatch(/^https:\/\//);
    });
  });

  it('keeps the local avatar visible when the remote image cannot load', async () => {
    mockRemoteImage('error');
    render(
      <BodyBlock
        content="【银狼】先确认一下情况。"
        npcRecords={[silverWolf]}
      />,
    );

    await waitFor(() => {
      const avatar = screen.getByRole('img', { name: '银狼 头像' });
      expect(avatar).toBeInTheDocument();
      expect(avatar.getAttribute('src')).not.toMatch(/^https:\/\//);
    });
  });
});
