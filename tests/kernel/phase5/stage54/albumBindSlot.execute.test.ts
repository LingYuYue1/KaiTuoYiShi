/**
 * Stage 5.4 — album.bindSlot success, replace semantics,
 * entry_not_found, revision conflict.
 */

import { describe, expect, it } from 'vitest';
import { collectAsync, terminalFrames } from '@/tests/helpers/asyncFrames';
import {
  asCommandId,
  asRevision,
  asSessionId,
  type AlbumBindSlotEnvelope,
} from '@/src/kernel/contract';
import { bindAlbumSlot } from '@/src/kernel/application/bindAlbumSlot';
import { NativeKernel } from '@/src/kernel/NativeKernel';
import { InMemorySessionRepository } from '@/src/kernel/adapters/test/InMemorySessionRepository';
import { ScriptedModelGateway } from '@/src/kernel/adapters/test/ScriptedModelGateway';
import { createSessionSnapshot } from '@/src/kernel/domain/session/types';
import type { KernelAlbum } from '@/src/kernel/domain/album';

const SESSION = asSessionId('phase54-album-bind');

function twoEntryAlbum(): KernelAlbum {
  return {
    assets: [
      {
        id: 'asset_old',
        source: 'generated',
        status: 'ready',
        nsfw: false,
        createdAt: 1,
        mimeType: 'image/png',
      },
      {
        id: 'asset_new',
        source: 'generated',
        status: 'ready',
        nsfw: false,
        createdAt: 2,
        mimeType: 'image/png',
      },
    ],
    entries: [
      {
        id: 'entry_old',
        assetId: 'asset_old',
        title: '旧图',
        targetType: 'traveler',
        targetId: 'traveler',
        slot: 'portrait',
        tags: [],
        nsfw: false,
        createdAt: 1,
        referenceTargets: [],
      },
      {
        id: 'entry_new',
        assetId: 'asset_new',
        title: '新图',
        targetType: 'misc',
        slot: 'misc',
        tags: [],
        nsfw: false,
        createdAt: 2,
        referenceTargets: [],
      },
    ],
    tasks: [],
    slots: [
      {
        targetType: 'traveler',
        targetId: 'traveler',
        slot: 'portrait',
        assetId: 'asset_old',
        entryId: 'entry_old',
      },
    ],
  };
}

function emptyBindableAlbum(): KernelAlbum {
  return {
    assets: [
      {
        id: 'asset_1',
        source: 'generated',
        status: 'ready',
        nsfw: false,
        createdAt: 1,
        mimeType: 'image/png',
      },
    ],
    entries: [
      {
        id: 'entry_1',
        assetId: 'asset_1',
        title: '可绑定',
        targetType: 'misc',
        slot: 'misc',
        tags: [],
        nsfw: false,
        createdAt: 1,
        referenceTargets: [],
      },
    ],
    tasks: [],
    slots: [],
  };
}

function seedWithAlbum(album: KernelAlbum, revision = 0) {
  const sessions = new InMemorySessionRepository();
  sessions.seed(
    createSessionSnapshot({
      sessionId: SESSION,
      revision: asRevision(revision),
      state: { turnCount: 1, travelerName: '开拓者', album },
    }),
  );
  return sessions;
}

function bindEnvelope(
  opts: Readonly<{
    commandId?: string;
    expectedRevision?: number;
    entryId: string;
    targetType?: AlbumBindSlotEnvelope['command']['targetType'];
    targetId?: string;
    slot?: AlbumBindSlotEnvelope['command']['slot'];
  }>,
): AlbumBindSlotEnvelope {
  return {
    protocolVersion: 1,
    commandId: asCommandId(opts.commandId ?? 'bind-cmd-1'),
    sessionId: SESSION,
    expectedRevision: asRevision(opts.expectedRevision ?? 0),
    command: {
      type: 'album.bindSlot',
      entryId: opts.entryId,
      targetType: opts.targetType ?? 'npc',
      targetId: opts.targetId ?? 'npc_march',
      slot: opts.slot ?? 'portrait',
    },
  };
}

describe('bindAlbumSlot execute (Stage 5.4)', () => {
  it('binds a new slot and bumps revision once', async () => {
    const sessions = seedWithAlbum(emptyBindableAlbum());
    const before = await sessions.read(SESSION);
    expect(before.state.album.slots).toEqual([]);

    const frames = await collectAsync(
      bindAlbumSlot(
        bindEnvelope({
          commandId: 'bind-ok-1',
          entryId: 'entry_1',
          targetType: 'npc',
          targetId: 'npc_march',
          slot: 'avatar_profile',
        }),
        { sessions },
      ),
    );

    expect(terminalFrames(frames)).toHaveLength(1);
    expect(frames.at(-1)?.type).toBe('committed');

    const after = await sessions.read(SESSION);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.state.album.slots).toEqual([
      {
        targetType: 'npc',
        targetId: 'npc_march',
        slot: 'avatar_profile',
        assetId: 'asset_1',
        entryId: 'entry_1',
      },
    ]);
    expect(after.state.album.entries[0]).toMatchObject({
      id: 'entry_1',
      targetType: 'npc',
      targetId: 'npc_march',
      slot: 'avatar_profile',
    });

    // Other formal fields preserved
    expect(after.state.phone).toEqual(before.state.phone);
    expect(after.state.news).toEqual(before.state.news);

    const terminal = frames.at(-1);
    if (terminal?.type === 'committed') {
      expect(terminal.view.album.slotCount).toBe(1);
      expect(terminal.view.album.slots[0]).toMatchObject({
        targetType: 'npc',
        targetId: 'npc_march',
        slot: 'avatar_profile',
        entryId: 'entry_1',
      });
    }
  });

  it('replace: bind B over same slot replaces previous in slots[]', async () => {
    const sessions = seedWithAlbum(twoEntryAlbum());
    const before = await sessions.read(SESSION);
    expect(before.state.album.slots).toHaveLength(1);
    expect(before.state.album.slots[0]?.entryId).toBe('entry_old');

    const frames = await collectAsync(
      bindAlbumSlot(
        bindEnvelope({
          commandId: 'bind-replace-1',
          entryId: 'entry_new',
          targetType: 'traveler',
          targetId: 'traveler',
          slot: 'portrait',
        }),
        { sessions },
      ),
    );

    expect(frames.at(-1)?.type).toBe('committed');
    const after = await sessions.read(SESSION);
    expect(after.revision).toBe(before.revision + 1);
    // Exactly one binding for that slot key — B wins
    expect(after.state.album.slots).toHaveLength(1);
    expect(after.state.album.slots[0]).toEqual({
      targetType: 'traveler',
      targetId: 'traveler',
      slot: 'portrait',
      assetId: 'asset_new',
      entryId: 'entry_new',
    });
    // Previous entry historical target fields stay; slots is SoT
    expect(after.state.album.entries.find((e) => e.id === 'entry_old')).toMatchObject({
      targetType: 'traveler',
      targetId: 'traveler',
      slot: 'portrait',
    });
    expect(after.state.album.entries.find((e) => e.id === 'entry_new')).toMatchObject({
      targetType: 'traveler',
      targetId: 'traveler',
      slot: 'portrait',
    });
  });

  it('entry_not_found rejects without write', async () => {
    const sessions = seedWithAlbum(emptyBindableAlbum());
    const before = await sessions.read(SESSION);

    const frames = await collectAsync(
      bindAlbumSlot(
        bindEnvelope({
          commandId: 'bind-missing',
          entryId: 'no_such_entry',
          targetType: 'npc',
          targetId: 'x',
          slot: 'portrait',
        }),
        { sessions },
      ),
    );

    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: {
        code: 'unknown',
        message: 'bindSlot failed: entry_not_found',
        details: { reason: 'entry_not_found' },
      },
    });
    expect(await sessions.read(SESSION)).toEqual(before);
  });

  it('revision conflict leaves slots unchanged', async () => {
    const sessions = seedWithAlbum(emptyBindableAlbum(), 4);
    const before = await sessions.read(SESSION);

    const frames = await collectAsync(
      bindAlbumSlot(
        bindEnvelope({
          commandId: 'bind-stale',
          expectedRevision: 0,
          entryId: 'entry_1',
          targetType: 'npc',
          targetId: 'npc_march',
          slot: 'portrait',
        }),
        { sessions },
      ),
    );

    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: {
        code: 'revision_conflict',
        details: { actualRevision: 4 },
      },
    });
    expect(await sessions.read(SESSION)).toEqual(before);
    expect(before.state.album.slots).toEqual([]);
  });

  it('commandId idempotency returns prior commit', async () => {
    const sessions = seedWithAlbum(emptyBindableAlbum());
    const envelope = bindEnvelope({
      commandId: 'bind-idem-1',
      entryId: 'entry_1',
      targetType: 'npc',
      targetId: 'npc_march',
      slot: 'portrait',
    });

    const first = await collectAsync(bindAlbumSlot(envelope, { sessions }));
    expect(first.at(-1)?.type).toBe('committed');
    const mid = await sessions.read(SESSION);

    const second = await collectAsync(bindAlbumSlot(envelope, { sessions }));
    expect(second.at(-1)?.type).toBe('committed');
    if (second.at(-1)?.type === 'committed' && first.at(-1)?.type === 'committed') {
      expect(second.at(-1)).toEqual(first.at(-1));
    }
    const after = await sessions.read(SESSION);
    expect(after.revision).toBe(mid.revision);
    expect(after.state.album.slots).toHaveLength(1);
  });

  it('NativeKernel routes album.bindSlot', async () => {
    const sessions = seedWithAlbum(emptyBindableAlbum());
    const model = new ScriptedModelGateway();
    const kernel = new NativeKernel({ sessions, model });

    const frames = await collectAsync(
      kernel.execute(
        bindEnvelope({
          commandId: 'bind-native-1',
          entryId: 'entry_1',
          targetType: 'npc',
          targetId: 'npc_march',
          slot: 'portrait',
        }),
      ),
    );
    expect(frames.at(-1)?.type).toBe('committed');
    const after = await sessions.read(SESSION);
    expect(after.state.album.slots[0]?.entryId).toBe('entry_1');
  });
});
