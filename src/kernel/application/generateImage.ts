/**
 * generateImage — Stage 5.4 image generation application use case.
 *
 * Pipeline:
 * 1. findByCommandId → committed replay
 * 2. read session; revision check
 * 3. validate prompt / title / slot / targetType
 * 4. yield progress "generating"
 * 5. ImageGenerator.generate → collect frames; failure → rejected, state unchanged
 * 6. AssetStore.put → assetRef (only after successful generate)
 * 7. Build KernelAsset + KernelAlbumEntry + success KernelImageTask
 * 8. commitGeneratedAsset pure
 * 9. if commit fails → AssetStore.remove(ref) then rejected
 * 10. compareAndSwap once with nextState.album
 * 11. on CAS conflict → try AssetStore.remove(ref); rejected revision_conflict
 * 12. committed with projectSession
 *
 * Formal album state only updates on final successful CAS.
 * Intermediate generator progress is ExecutionFrame progress only (not CAS).
 * Expanding ModelGateway is forbidden — use ImageGenerator port.
 */

import type {
  CommandId,
  ExecutionFrame,
  ImageGenerateEnvelope,
  KernelError,
  Revision,
} from '@/src/kernel/contract';
import type { AssetRef, AssetStore } from '@/src/kernel/ports/AssetStore';
import type {
  ImageGenerateRequest,
  ImageGenerateSuccess,
  ImageGenerator,
} from '@/src/kernel/ports/ImageGenerator';
import type { SessionRepository } from '@/src/kernel/ports/SessionRepository';
import type { SessionSnapshot } from '@/src/kernel/domain/session/types';
import {
  commitGeneratedAsset,
  type KernelAlbumEntry,
  type KernelAsset,
  type KernelImageTask,
} from '@/src/kernel/domain/album';
import { projectSession } from '@/src/kernel/domain/turn/projectSession';

export type GenerateImageDependencies = Readonly<{
  sessions: SessionRepository;
  assets: AssetStore;
  images: ImageGenerator;
}>;

export async function* generateImage(
  envelope: ImageGenerateEnvelope,
  dependencies: GenerateImageDependencies,
): AsyncIterable<ExecutionFrame> {
  const priorCommit = await dependencies.sessions.findByCommandId(
    envelope.sessionId,
    envelope.commandId,
  );
  if (priorCommit) {
    yield committedFrame(envelope.commandId, priorCommit);
    return;
  }

  const base = await dependencies.sessions.read(envelope.sessionId);
  if (base.revision !== envelope.expectedRevision) {
    yield rejectedRevisionConflict(
      envelope.commandId,
      envelope.expectedRevision,
      base.revision,
    );
    return;
  }

  const validationError = validateImageGenerateCommand(envelope);
  if (validationError) {
    yield rejected(envelope.commandId, validationError);
    return;
  }

  const command = envelope.command;

  yield {
    type: 'progress',
    commandId: envelope.commandId,
    delta: { kind: 'narrative', text: 'generating' },
  };

  const request: ImageGenerateRequest = {
    prompt: command.prompt,
    nsfw: command.nsfw,
    ...(command.negativePrompt !== undefined
      ? { negativePrompt: command.negativePrompt }
      : {}),
    ...(command.size !== undefined ? { size: command.size } : {}),
    ...(command.referenceAssetIds !== undefined
      ? { referenceAssetIds: command.referenceAssetIds }
      : {}),
  };

  let success: ImageGenerateSuccess | null = null;
  try {
    for await (const frame of dependencies.images.generate(request)) {
      if (frame.type === 'progress') {
        yield {
          type: 'progress',
          commandId: envelope.commandId,
          delta: {
            kind: 'narrative',
            text: frame.message ?? `generating ${frame.attempt}/${frame.totalAttempts}`,
          },
        };
        continue;
      }
      if (frame.type === 'failure') {
        yield rejected(envelope.commandId, {
          code: 'model_failure',
          message: frame.message,
        });
        return;
      }
      // success — keep last success frame; generator should yield at most one
      success = frame;
    }
  } catch (err) {
    yield rejected(envelope.commandId, {
      code: 'model_failure',
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (!success) {
    yield rejected(envelope.commandId, {
      code: 'model_failure',
      message: 'ImageGenerator completed without success frame',
    });
    return;
  }

  let assetRef: AssetRef;
  try {
    assetRef = await dependencies.assets.put({
      bytes: success.bytes,
      mimeType: success.mimeType,
    });
  } catch (err) {
    yield rejected(envelope.commandId, {
      code: 'unknown',
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const createdAt = deterministicTimestamp(envelope.commandId);
  const assetId = String(assetRef);
  const entryId = `entry_${envelope.commandId}`;
  const taskId = `task_${envelope.commandId}`;
  const backend =
    command.backend
    ?? success.backend
    ?? 'unknown';

  const asset: KernelAsset = {
    id: assetId,
    mimeType: success.mimeType,
    size: success.bytes.byteLength,
    source: 'generated',
    status: 'ready',
    nsfw: command.nsfw,
    createdAt,
    prompt: command.prompt,
    ...(command.negativePrompt !== undefined
      ? { negativePrompt: command.negativePrompt }
      : {}),
    ...(success.model !== undefined ? { model: success.model } : {}),
    backend,
    ...(success.originalUrl !== undefined && !isForbiddenRemoteUrl(success.originalUrl)
      ? { remoteUrl: success.originalUrl }
      : {}),
  };

  const entry: KernelAlbumEntry = {
    id: entryId,
    assetId,
    title: command.title,
    targetType: command.targetType,
    ...(command.targetId !== undefined ? { targetId: command.targetId } : {}),
    slot: command.slot,
    tags: command.tags ? command.tags.slice() : [],
    nsfw: command.nsfw,
    createdAt,
    ...(command.note !== undefined ? { note: command.note } : {}),
    referenceTargets: command.referenceAssetIds
      ? command.referenceAssetIds.slice()
      : [],
  };

  const task: KernelImageTask = {
    id: taskId,
    targetType: command.targetType,
    ...(command.targetId !== undefined ? { targetId: command.targetId } : {}),
    slot: command.slot,
    source: 'manual',
    status: 'success',
    backend,
    nsfw: command.nsfw,
    prompt: command.prompt,
    ...(command.negativePrompt !== undefined
      ? { negativePrompt: command.negativePrompt }
      : {}),
    resultAssetId: assetId,
    retryCount: 0,
    createdAt,
    startedAt: createdAt,
    finishedAt: createdAt,
  };

  const commitResult = commitGeneratedAsset(base.state.album, {
    asset,
    entry,
    task,
    ...(command.bindToSlot === true ? { bindToSlot: true } : {}),
  });

  if (!commitResult.ok) {
    await tryRemoveAsset(dependencies.assets, assetRef);
    yield rejected(envelope.commandId, {
      code: 'unknown',
      message: `commitGeneratedAsset failed: ${commitResult.reason}`,
      details: { reason: commitResult.reason },
    });
    return;
  }

  const cas = await dependencies.sessions.compareAndSwap({
    sessionId: envelope.sessionId,
    expectedRevision: envelope.expectedRevision,
    nextState: {
      ...base.state,
      album: commitResult.album,
    },
    commandId: envelope.commandId,
  });

  if (cas.type === 'conflict') {
    // Prefer remove staging ref on CAS conflict after put for cleanliness.
    await tryRemoveAsset(dependencies.assets, assetRef);
    yield rejectedRevisionConflict(
      envelope.commandId,
      envelope.expectedRevision,
      cas.actualRevision,
    );
    return;
  }

  yield committedFrame(envelope.commandId, cas.snapshot);
}

function validateImageGenerateCommand(
  envelope: ImageGenerateEnvelope,
): KernelError | null {
  const { prompt, title, targetType, slot, nsfw } = envelope.command;
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return { code: 'unknown', message: 'image.generate requires non-empty prompt' };
  }
  if (typeof title !== 'string' || title.trim().length === 0) {
    return { code: 'unknown', message: 'image.generate requires non-empty title' };
  }
  if (typeof targetType !== 'string' || targetType.trim().length === 0) {
    return { code: 'unknown', message: 'image.generate requires targetType' };
  }
  if (typeof slot !== 'string' || slot.trim().length === 0) {
    return { code: 'unknown', message: 'image.generate requires slot' };
  }
  if (typeof nsfw !== 'boolean') {
    return { code: 'unknown', message: 'image.generate requires boolean nsfw' };
  }
  if (
    envelope.command.bindToSlot === true
    && (typeof envelope.command.targetId !== 'string'
      || envelope.command.targetId.trim().length === 0)
  ) {
    return {
      code: 'unknown',
      message: 'image.generate bindToSlot requires non-empty targetId',
    };
  }
  return null;
}

/**
 * Deterministic timestamp derived from commandId for idempotent content shape.
 * Prefer numeric suffix if present; otherwise hash-like sum of char codes.
 */
function deterministicTimestamp(commandId: CommandId): number {
  const text = String(commandId);
  let sum = 0;
  for (let i = 0; i < text.length; i += 1) {
    sum = (sum + text.charCodeAt(i) * (i + 1)) >>> 0;
  }
  // Keep in a plausible ms range without depending on wall clock.
  return 1_700_000_000_000 + (sum % 1_000_000_000);
}

function isForbiddenRemoteUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  return lower.startsWith('data:') || lower.startsWith('blob:');
}

async function tryRemoveAsset(assets: AssetStore, ref: AssetRef): Promise<void> {
  try {
    await assets.remove(ref);
  } catch {
    // Staging orphan is acceptable if remove fails; prefer clean when possible.
  }
}

function rejectedRevisionConflict(
  commandId: CommandId,
  expectedRevision: Revision,
  actualRevision: Revision,
): ExecutionFrame {
  return rejected(commandId, {
    code: 'revision_conflict',
    message: `expectedRevision ${expectedRevision} != actual ${actualRevision}`,
    details: { actualRevision },
  });
}

function rejected(commandId: CommandId, error: KernelError): ExecutionFrame {
  return {
    type: 'rejected',
    commandId,
    error,
  };
}

function committedFrame(
  commandId: CommandId,
  snapshot: SessionSnapshot,
): ExecutionFrame {
  return {
    type: 'committed',
    commandId,
    revision: snapshot.revision,
    view: projectSession(snapshot),
  };
}
