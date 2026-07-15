/**
 * Stage 5.4 — image.generate success, generator failure, validation,
 * commandId idempotency, revision conflict, bindToSlot, NativeKernel route.
 */

import { describe, expect, it } from 'vitest';
import { collectAsync, terminalFrames } from '@/tests/helpers/asyncFrames';
import {
  asCommandId,
  asRevision,
  asSessionId,
  type ImageGenerateEnvelope,
} from '@/src/kernel/contract';
import { generateImage } from '@/src/kernel/application/generateImage';
import { NativeKernel } from '@/src/kernel/NativeKernel';
import { InMemorySessionRepository } from '@/src/kernel/adapters/test/InMemorySessionRepository';
import { InMemoryAssetStore } from '@/src/kernel/adapters/test/InMemoryAssetStore';
import { ScriptedImageGenerator } from '@/src/kernel/adapters/test/ScriptedImageGenerator';
import { ScriptedModelGateway } from '@/src/kernel/adapters/test/ScriptedModelGateway';
import { createSessionSnapshot } from '@/src/kernel/domain/session/types';
import { asAssetRef } from '@/src/kernel/ports/AssetStore';

const SESSION = asSessionId('phase54-image-exec');
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function seedEmpty(revision = 0) {
  const sessions = new InMemorySessionRepository();
  sessions.seed(
    createSessionSnapshot({
      sessionId: SESSION,
      revision: asRevision(revision),
      state: { turnCount: 2, travelerName: '开拓者' },
    }),
  );
  return sessions;
}

function imageEnvelope(
  opts?: Readonly<{
    commandId?: string;
    expectedRevision?: number;
    prompt?: string;
    title?: string;
    targetType?: string;
    targetId?: string;
    slot?: string;
    nsfw?: boolean;
    bindToSlot?: boolean;
    backend?: string;
  }>,
): ImageGenerateEnvelope {
  return {
    protocolVersion: 1,
    commandId: asCommandId(opts?.commandId ?? 'img-cmd-1'),
    sessionId: SESSION,
    expectedRevision: asRevision(opts?.expectedRevision ?? 0),
    command: {
      type: 'image.generate',
      prompt: opts?.prompt ?? '三月七肖像',
      title: opts?.title ?? '三月七',
      targetType: (opts?.targetType ?? 'npc') as ImageGenerateEnvelope['command']['targetType'],
      ...(opts?.targetId !== undefined ? { targetId: opts.targetId } : { targetId: 'npc_march' }),
      slot: (opts?.slot ?? 'portrait') as ImageGenerateEnvelope['command']['slot'],
      nsfw: opts?.nsfw ?? false,
      ...(opts?.bindToSlot === true ? { bindToSlot: true } : {}),
      ...(opts?.backend !== undefined ? { backend: opts.backend } : {}),
    },
  };
}

function deps(
  sessions: InMemorySessionRepository,
  assets: InMemoryAssetStore,
  images: ScriptedImageGenerator,
) {
  return { sessions, assets, images };
}

describe('generateImage execute (Stage 5.4)', () => {
  it('success: generate → put → CAS; album has asset+entry; AssetStore.has; revision +1', async () => {
    const sessions = seedEmpty();
    const assets = new InMemoryAssetStore();
    const images = new ScriptedImageGenerator();
    images.enqueue({
      kind: 'success',
      bytes: PNG_BYTES,
      mimeType: 'image/png',
      model: 'test-model',
      backend: 'openai_compatible',
    });
    const before = await sessions.read(SESSION);
    expect(before.state.album.assets).toEqual([]);
    expect(before.state.album.entries).toEqual([]);
    expect(assets.size()).toBe(0);

    const frames = await collectAsync(
      generateImage(imageEnvelope({ commandId: 'img-ok-1' }), deps(sessions, assets, images)),
    );

    expect(terminalFrames(frames)).toHaveLength(1);
    expect(frames.at(-1)?.type).toBe('committed');
    // Progress frame before commit
    expect(frames.some((f) => f.type === 'progress')).toBe(true);

    const after = await sessions.read(SESSION);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.state.album.assets).toHaveLength(1);
    expect(after.state.album.entries).toHaveLength(1);
    expect(after.state.album.tasks).toHaveLength(1);

    const asset = after.state.album.assets[0]!;
    const entry = after.state.album.entries[0]!;
    expect(asset.id).toBe('asset_1');
    expect(asset.mimeType).toBe('image/png');
    expect(asset.status).toBe('ready');
    expect(asset.source).toBe('generated');
    expect(asset.prompt).toBe('三月七肖像');
    expect(entry.id).toBe('entry_img-ok-1');
    expect(entry.assetId).toBe(asset.id);
    expect(entry.title).toBe('三月七');
    expect(entry.targetType).toBe('npc');
    expect(entry.slot).toBe('portrait');
    expect(after.state.album.tasks[0]).toMatchObject({
      id: 'task_img-ok-1',
      status: 'success',
      resultAssetId: asset.id,
    });

    // AssetStore holds bytes for the formal AssetRef
    expect(await assets.has(asAssetRef(asset.id))).toBe(true);
    expect(assets.size()).toBe(1);
    const stored = await assets.read(asAssetRef(asset.id));
    expect(Array.from(stored)).toEqual(Array.from(PNG_BYTES));

    // Other formal fields preserved
    expect(after.state.phone).toEqual(before.state.phone);
    expect(after.state.news).toEqual(before.state.news);
    expect(after.state.knowledge).toEqual(before.state.knowledge);
    expect(after.state.variables).toEqual(before.state.variables);
    expect(after.state.turnCount).toBe(before.state.turnCount);

    const terminal = frames.at(-1);
    if (terminal?.type === 'committed') {
      expect(terminal.view.album.assetCount).toBe(1);
      expect(terminal.view.album.entryCount).toBe(1);
      expect(terminal.view.album.taskCount).toBe(1);
      expect(terminal.view.album.slotCount).toBe(0);
      expect(terminal.view.album.recentTitles).toContain('三月七');
    }
  });

  it('generator failure: rejected model_failure; album empty; AssetStore empty', async () => {
    const sessions = seedEmpty();
    const assets = new InMemoryAssetStore();
    const images = new ScriptedImageGenerator();
    images.enqueue({ kind: 'failure', message: 'upstream image timeout' });
    const before = await sessions.read(SESSION);

    const frames = await collectAsync(
      generateImage(
        imageEnvelope({ commandId: 'img-fail-1' }),
        deps(sessions, assets, images),
      ),
    );

    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: { code: 'model_failure', message: 'upstream image timeout' },
    });
    const after = await sessions.read(SESSION);
    expect(after).toEqual(before);
    expect(after.state.album.assets).toEqual([]);
    expect(after.state.album.entries).toEqual([]);
    expect(assets.size()).toBe(0);
  });

  it('rejects empty prompt without generate or write', async () => {
    const sessions = seedEmpty();
    const assets = new InMemoryAssetStore();
    const images = new ScriptedImageGenerator();
    images.enqueue({
      kind: 'success',
      bytes: PNG_BYTES,
      mimeType: 'image/png',
    });
    const before = await sessions.read(SESSION);

    const frames = await collectAsync(
      generateImage(
        imageEnvelope({ commandId: 'img-empty-prompt', prompt: '' }),
        deps(sessions, assets, images),
      ),
    );

    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: {
        code: 'unknown',
        message: 'image.generate requires non-empty prompt',
      },
    });
    expect(await sessions.read(SESSION)).toEqual(before);
    expect(assets.size()).toBe(0);
  });

  it('commandId idempotency returns prior commit without second generate', async () => {
    const sessions = seedEmpty();
    const assets = new InMemoryAssetStore();
    const images = new ScriptedImageGenerator();
    images.enqueue({
      kind: 'success',
      bytes: PNG_BYTES,
      mimeType: 'image/png',
      backend: 'openai_compatible',
    });
    images.enqueue({
      kind: 'success',
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
      backend: 'should-not-run',
    });

    const envelope = imageEnvelope({ commandId: 'img-idem-1' });
    const first = await collectAsync(
      generateImage(envelope, deps(sessions, assets, images)),
    );
    expect(first.at(-1)?.type).toBe('committed');
    const mid = await sessions.read(SESSION);
    expect(mid.revision).toBe(1);
    expect(assets.size()).toBe(1);

    const second = await collectAsync(
      generateImage(envelope, deps(sessions, assets, images)),
    );
    expect(second.at(-1)?.type).toBe('committed');
    if (second.at(-1)?.type === 'committed' && first.at(-1)?.type === 'committed') {
      expect(second.at(-1)).toEqual(first.at(-1));
    }
    const after = await sessions.read(SESSION);
    expect(after.revision).toBe(mid.revision);
    expect(after.state.album.entries).toHaveLength(1);
    expect(after.state.album.entries[0]?.id).toBe('entry_img-idem-1');
    // No second put
    expect(assets.size()).toBe(1);
  });

  it('revision conflict leaves album and AssetStore unchanged', async () => {
    const sessions = seedEmpty(5);
    const assets = new InMemoryAssetStore();
    const images = new ScriptedImageGenerator();
    images.enqueue({
      kind: 'success',
      bytes: PNG_BYTES,
      mimeType: 'image/png',
    });
    const before = await sessions.read(SESSION);

    const frames = await collectAsync(
      generateImage(
        imageEnvelope({ commandId: 'img-stale', expectedRevision: 0 }),
        deps(sessions, assets, images),
      ),
    );

    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: {
        code: 'revision_conflict',
        details: { actualRevision: 5 },
      },
    });
    expect(await sessions.read(SESSION)).toEqual(before);
    expect(assets.size()).toBe(0);
  });

  it('bindToSlot true: slots array has binding after success', async () => {
    const sessions = seedEmpty();
    const assets = new InMemoryAssetStore();
    const images = new ScriptedImageGenerator();
    images.enqueue({
      kind: 'success',
      bytes: PNG_BYTES,
      mimeType: 'image/png',
      backend: 'openai_compatible',
    });

    const frames = await collectAsync(
      generateImage(
        imageEnvelope({
          commandId: 'img-bind-1',
          bindToSlot: true,
          targetId: 'npc_march',
          targetType: 'npc',
          slot: 'portrait',
        }),
        deps(sessions, assets, images),
      ),
    );

    expect(frames.at(-1)?.type).toBe('committed');
    const after = await sessions.read(SESSION);
    expect(after.state.album.slots).toHaveLength(1);
    expect(after.state.album.slots[0]).toMatchObject({
      targetType: 'npc',
      targetId: 'npc_march',
      slot: 'portrait',
      entryId: 'entry_img-bind-1',
      assetId: 'asset_1',
    });

    const terminal = frames.at(-1);
    if (terminal?.type === 'committed') {
      expect(terminal.view.album.slotCount).toBe(1);
      expect(terminal.view.album.slots[0]).toMatchObject({
        targetType: 'npc',
        targetId: 'npc_march',
        slot: 'portrait',
      });
    }
  });

  it('NativeKernel routes image.generate when assets+images provided', async () => {
    const sessions = seedEmpty();
    const assets = new InMemoryAssetStore();
    const images = new ScriptedImageGenerator();
    const model = new ScriptedModelGateway();
    images.enqueue({
      kind: 'success',
      bytes: PNG_BYTES,
      mimeType: 'image/png',
      backend: 'openai_compatible',
    });
    const kernel = new NativeKernel({ sessions, model, assets, images });

    const frames = await collectAsync(
      kernel.execute(imageEnvelope({ commandId: 'img-native-1' })),
    );
    expect(frames.at(-1)?.type).toBe('committed');
    const after = await sessions.read(SESSION);
    expect(after.state.album.entries[0]?.id).toBe('entry_img-native-1');
    expect(after.state.album.assets).toHaveLength(1);
    expect(await assets.has(asAssetRef(after.state.album.assets[0]!.id))).toBe(true);
  });
});
