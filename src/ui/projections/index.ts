/**
 * UI projection ownership (Phase 3).
 */

export type {
  ProjectionProgress,
  ProjectionState,
} from './projectionStore';
export {
  applyExecutionFrame,
  createProjectionState,
  reduceExecutionFrames,
} from './projectionStore';
export {
  restoreProjectionFromKernel,
  commitProjectionView,
  refreshProjectionAfterCommit,
} from './restoreProjection';
