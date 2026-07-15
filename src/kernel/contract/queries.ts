/**
 * IKernel query contract (Phase 1).
 * Must not import old models, services, hooks, or UI types.
 */

import type { SessionId } from './commands';

export type KernelQuery =
  | Readonly<{
      type: 'session.read';
      sessionId: SessionId;
    }>
  | Readonly<{
      type: 'settings.read';
      sessionId: SessionId;
    }>;
