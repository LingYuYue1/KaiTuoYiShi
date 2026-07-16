/**
 * IKernel query contract (Phase 1).
 * Must not import old models, services, hooks, or UI types.
 */

import type { SessionId } from './commands';

export type SessionExistsQuery = Readonly<{ type: 'session.exists'; sessionId: SessionId }>;
export type SessionReadQuery = Readonly<{ type: 'session.read'; sessionId: SessionId }>;
export type KernelQuery = SessionExistsQuery | SessionReadQuery;
