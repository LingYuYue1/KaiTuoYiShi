/**
 * Host helpers for restoring UI ProjectionState from kernel.read.
 *
 * Formal session authority remains with IKernel / SessionRepository.
 * These helpers only rebuild the presentation projection.
 */

import type {
  CommandId,
  IKernel,
  SessionId,
  SessionView,
} from '@/src/kernel/contract';
import {
  applyExecutionFrame,
  createProjectionState,
  type ProjectionState,
} from './projectionStore';

/**
 * Read formal SessionView from kernel and create a clean ProjectionState
 * (progress cleared). Safe on both legacy and native-turn kernels.
 */
export async function restoreProjectionFromKernel(
  kernel: IKernel,
  sessionId: SessionId,
): Promise<ProjectionState> {
  const view = await kernel.read({
    type: 'session.read',
    sessionId,
  });
  return createProjectionState(view);
}

/**
 * Apply a committed SessionView into the projection (clears progress).
 * Prefer frame.view from the execution stream; use restoreProjectionFromKernel
 * when re-hydrating from repository authority.
 */
export function commitProjectionView(
  current: ProjectionState,
  commandId: CommandId,
  view: SessionView,
): ProjectionState {
  return applyExecutionFrame(current, {
    type: 'committed',
    commandId,
    revision: view.revision,
    view,
  });
}

/**
 * After a committed frame, optionally refresh projection.session from
 * kernel.read so the host can re-sync if the frame view was provisional.
 */
export async function refreshProjectionAfterCommit(
  kernel: IKernel,
  sessionId: SessionId,
): Promise<ProjectionState> {
  return restoreProjectionFromKernel(kernel, sessionId);
}
