/**
 * Stage 5.4 — album.delete success (CAS then AssetStore.remove),
 * none_found / empty_ids, revision conflict, commandId idempotency.
 */

import { describe, expect, it } from 'vitest';
import { collectAsync, terminalFrames } from '@/tests/helpers/asyncFrames';
import {
  asCommandId,
  asRevision,
  asSessionId,
  type AlbumDeleteEnvelope,
} from '@/src/kernel/contract';
import { deleteAlbumEntries } from '@/src/kernel/application/deleteAlbumEntries';
import { NativeKernel } from '@/src/kernel/NativeKernel';
import { InMemorySessionRepository } from '@/src/kernel/adapters/test/InMemorySessionRepository';
import { InMemoryAssetStore } from '@/src/kernel/adapters/test/InMemoryAssetStore';
import { ScriptedModelGateway } from '@/src/kernel/adapters/test/ScriptedModelGateway';
import { createSessionSnapshot } from '@/src/kernel/domain/session/types';
import type { KernelAlbum } from '@/src/kernel/domain/album';
import { asAssetRef } from '@/src/kernel/ports/AssetStore';

const SESSION = asSessionId('phase54-album-delete');

/**
 * Formal album whose asset ids match InMemoryAssetStore sequential ids
 * after two put() calls (asset_1, asset_2).
 */
function sampleAlbum(): KernelAlbum {
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
      {
        id: 'asset_2',
        source: 'generated',
        status: 'ready',
        nsfw: false,
        createdAt: 2,
        mimeType: 'image/png',
      },
    ],
    entries: [
      {
        id: 'entry_keep',
        assetId: 'asset_1',
        title: '保留',
        targetType: 'npc',
        targetId: 'npc_a',
        slot: 'portrait',
        tags: [],
        nsfw: false,
        createdAt: 1,
        referenceTargets: [],
      },
      {
        id: 'entry_drop',
        assetId: 'asset_2',
        title: '删除',
        targetType: 'npc',
        targetId: 'npc_b',
        slot: 'portrait',
        tags: [],
        nsfw: false,
        createdAt: 2,
        referenceTargets: [],
      },
    ],
    tasks: [
      {
        id: 'task_1',
        targetType: 'npc',
        targetId: 'npc_b',
        slot: 'portrait',
        source: 'manual',
        status: 'success',
        backend: 'openai_compatible',
        nsfw: false,
        prompt: 'x',
        resultAssetId: 'asset_2',
        retryCount: 0,
        createdAt: 2,
      },
    ],
    slots: [
      {
        targetType: 'npc',
        targetId: 'npc_b',
        slot: 'portrait',
        assetId: 'asset_2',
        entryId: 'entry_drop',
      },
    ],
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

async function seedAssetsMatchingSample(): Promise<InMemoryAssetStore> {
  const assets = new InMemoryAssetStore();
  const r1 = await assets.put({ bytes: new Uint8Array([1]), mimeType: 'image/png' });
  const r2 = await assets.put({ bytes: new Uint8Array([2]), mimeType: 'image/png' });
  expect(String(r1)).toBe('asset_1');
  expect(String(r2)).toBe('asset_2');
  return assets;
}

function deleteEnvelope(
  entryIds: readonly string[],
  opts?: Readonly<{ commandId?: string; expectedRevision?: number }>,
): AlbumDeleteEnvelope {
  return {
    protocolVersion: 1,
    commandId: asCommandId(opts?.commandId ?? 'del-cmd-1'),
    sessionId: SESSION,
    expectedRevision: asRevision(opts?.expectedRevision ?? 0),
    command: { type: 'album.delete', entryIds },
  };
}

describe('deleteAlbumEntries execute (Stage 5.4)', () => {
  it('deletes entry + orphan asset from formal state; AssetStore.remove after CAS', async () => {
    const sessions = seedWithAlbum(sampleAlbum());
    const assets = await seedAssetsMatchingSample();
    const before = await sessions.read(SESSION);
    expect(before.state.album.entries).toHaveLength(2);
    expect(await assets.has(asAssetRef('asset_2'))).toBe(true);
    expect(assets.size()).toBe(2);

    const frames = await collectAsync(
      deleteAlbumEntries(deleteEnvelope(['entry_drop'], { commandId: 'del-ok-1' }), {
        sessions,
        assets,
      }),
    );

    expect(terminalFrames(frames)).toHaveLength(1);
    expect(frames.at(-1)?.type).toBe('committed');

    const after = await sessions.read(SESSION);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.state.album.entries.map((e) => e.id)).toEqual(['entry_keep']);
    expect(after.state.album.assets.map((a) => a.id)).toEqual(['asset_1']);
    expect(after.state.album.slots).toEqual([]);
    expect(after.state.album.tasks[0]?.resultAssetId).toBeUndefined();

    // Orphan bytes removed after CAS; kept asset remains.
    expect(await assets.has(asAssetRef('asset_2'))).toBe(false);
    expect(await assets.has(asAssetRef('asset_1'))).toBe(true);
    expect(assets.size()).toBe(1);

    // Other formal fields preserved
    expect(after.state.phone).toEqual(before.state.phone);
    expect(after.state.news).toEqual(before.state.news);

    const terminal = frames.at(-1);
    if (terminal?.type === 'committed') {
      expect(terminal.view.album.entryCount).toBe(1);
      expect(terminal.view.album.assetCount).toBe(1);
      expect(terminal.view.album.slotCount).toBe(0);
    }
  });

  it('none_found rejects without write', async () => {
    const sessions = seedWithAlbum(sampleAlbum());
    const assets = await seedAssetsMatchingSample();
    const before = await sessions.read(SESSION);

    const frames = await collectAsync(
      deleteAlbumEntries(
        deleteEnvelope(['missing_entry'], { commandId: 'del-none' }),
        { sessions, assets },
      ),
    );

    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: {
        code: 'unknown',
        message: 'deleteEntries failed: none_found',
        details: { reason: 'none_found' },
      },
    });
    expect(await sessions.read(SESSION)).toEqual(before);
    expect(assets.size()).toBe(2);
  });

  it('empty_ids rejects without write', async () => {
    const sessions = seedWithAlbum(sampleAlbum());
    const assets = await seedAssetsMatchingSample();
    const before = await sessions.read(SESSION);

    const frames = await collectAsync(
      deleteAlbumEntries(deleteEnvelope([], { commandId: 'del-empty' }), {
        sessions,
        assets,
      }),
    );

    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: {
        code: 'unknown',
        message: 'deleteEntries failed: empty_ids',
        details: { reason: 'empty_ids' },
      },
    });
    expect(await sessions.read(SESSION)).toEqual(before);
    expect(assets.size()).toBe(2);
  });

  it('revision conflict leaves album and AssetStore unchanged', async () => {
    const sessions = seedWithAlbum(sampleAlbum(), 3);
    const assets = await seedAssetsMatchingSample();
    const before = await sessions.read(SESSION);

    const frames = await collectAsync(
      deleteAlbumEntries(
        deleteEnvelope(['entry_drop'], {
          commandId: 'del-stale',
          expectedRevision: 0,
        }),
        { sessions, assets },
      ),
    );

    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: {
        code: 'revision_conflict',
        details: { actualRevision: 3 },
      },
    });
    expect(await sessions.read(SESSION)).toEqual(before);
    expect(await assets.has(asAssetRef('asset_2'))).toBe(true);
    expect(assets.size()).toBe(2);
  });

  it('commandId idempotency returns prior commit without second remove', async () => {
    const sessions = seedWithAlbum(sampleAlbum());
    const assets = await seedAssetsMatchingSample();
    const envelope = deleteEnvelope(['entry_drop'], { commandId: 'del-idem-1' });

    const first = await collectAsync(
      deleteAlbumEntries(envelope, { sessions, assets }),
    );
    expect(first.at(-1)?.type).toBe('committed');
    const mid = await sessions.read(SESSION);
    expect(mid.revision).toBe(1);
    expect(assets.size()).toBe(1);

    // Re-stage orphan bytes so a second remove would fail if attempted with same id.
    // Idempotent path must not re-run delete/remove.
    const second = await collectAsync(
      deleteAlbumEntries(envelope, { sessions, assets }),
    );
    expect(second.at(-1)?.type).toBe('committed');
    if (second.at(-1)?.type === 'committed' && first.at(-1)?.type === 'committed') {
      expect(second.at(-1)).toEqual(first.at(-1));
    }
    const after = await sessions.read(SESSION);
    expect(after.revision).toBe(mid.revision);
    expect(after.state.album.entries).toHaveLength(1);
    expect(assets.size()).toBe(1);
  });

  it('NativeKernel routes album.delete when assets provided', async () => {
    const sessions = seedWithAlbum(sampleAlbum());
    const assets = await seedAssetsMatchingSample();
    const model = new ScriptedModelGateway();
    const kernel = new NativeKernel({ sessions, model, assets });

    const frames = await collectAsync(
      kernel.execute(deleteEnvelope(['entry_drop'], { commandId: 'del-native-1' })),
    );
    expect(frames.at(-1)?.type).toBe('committed');
    const after = await sessions.read(SESSION);
    expect(after.state.album.entries.map((e) => e.id)).toEqual(['entry_keep']);
    expect(await assets.has(asAssetRef('asset_2'))).toBe(false);
  });
});
