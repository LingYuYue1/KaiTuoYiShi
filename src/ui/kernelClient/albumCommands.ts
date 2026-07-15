/**
 * Kernel album command client (Stage 5.4 D).
 *
 * Thin envelopes for image.generate / album.delete / album.bindSlot.
 * Progress frames → sink only (no formal album CAS until committed).
 */

import {
  asCommandId,
  asRevision,
  asSessionId,
  type IKernel,
  type ImageGenerate,
  type AlbumDelete,
  type AlbumBindSlot,
} from '@/src/kernel/contract';
import { consumeExecution, type ExecutionSink } from './consumeExecution';

export type AlbumCommandMeta = Readonly<{
  commandId: string;
  sessionId: string;
  expectedRevision: number;
}>;

export type ImageGenerateIntent = AlbumCommandMeta &
  Readonly<{
    command: Omit<ImageGenerate, 'type'>;
  }>;

export type AlbumDeleteIntent = AlbumCommandMeta &
  Readonly<{
    entryIds: readonly string[];
  }>;

export type AlbumBindSlotIntent = AlbumCommandMeta &
  Readonly<{
    entryId: string;
    targetType: AlbumBindSlot['targetType'];
    targetId: string;
    slot: AlbumBindSlot['slot'];
  }>;

/** image.generate → consumeExecution (progress only until committed). */
export async function executeImageGenerate(
  kernel: IKernel,
  intent: ImageGenerateIntent,
  sink: ExecutionSink,
): Promise<void> {
  await consumeExecution(
    kernel,
    {
      protocolVersion: 1,
      commandId: asCommandId(intent.commandId),
      sessionId: asSessionId(intent.sessionId),
      expectedRevision: asRevision(intent.expectedRevision),
      command: {
        type: 'image.generate',
        ...intent.command,
      },
    },
    sink,
  );
}

/** album.delete → consumeExecution. */
export async function executeAlbumDelete(
  kernel: IKernel,
  intent: AlbumDeleteIntent,
  sink: ExecutionSink,
): Promise<void> {
  await consumeExecution(
    kernel,
    {
      protocolVersion: 1,
      commandId: asCommandId(intent.commandId),
      sessionId: asSessionId(intent.sessionId),
      expectedRevision: asRevision(intent.expectedRevision),
      command: {
        type: 'album.delete',
        entryIds: intent.entryIds,
      },
    },
    sink,
  );
}

/** album.bindSlot → consumeExecution (replace semantics in domain). */
export async function executeAlbumBindSlot(
  kernel: IKernel,
  intent: AlbumBindSlotIntent,
  sink: ExecutionSink,
): Promise<void> {
  await consumeExecution(
    kernel,
    {
      protocolVersion: 1,
      commandId: asCommandId(intent.commandId),
      sessionId: asSessionId(intent.sessionId),
      expectedRevision: asRevision(intent.expectedRevision),
      command: {
        type: 'album.bindSlot',
        entryId: intent.entryId,
        targetType: intent.targetType,
        targetId: intent.targetId,
        slot: intent.slot,
      },
    },
    sink,
  );
}
