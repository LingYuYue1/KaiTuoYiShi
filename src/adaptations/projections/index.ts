/**
 * UI projection ownership (Phase 3).
 */

export type {
  ProjectionProgress,
  ProjectionState,
} from './projectionStore';
export {
  applyExecutionFrame,
  clearProjectionEphemerals,
  createProjectionState,
  displaySessionView,
  reduceExecutionFrames,
} from './projectionStore';
export {
  restoreProjectionFromKernel,
  commitProjectionView,
  refreshProjectionAfterCommit,
} from './restoreProjection';
