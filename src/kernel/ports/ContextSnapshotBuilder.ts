import type { ContextSnapshot, ContextSnapshotKind } from '@/src/kernel/contract/inspection';
import type { StoryState } from '@/src/kernel/domain/session/storyState';
import type { DeviceExecutionOverlay } from './ExecutionContextProvider';

export interface ContextSnapshotBuilder {
  build(
    story: StoryState,
    overlay: DeviceExecutionOverlay,
    kind?: ContextSnapshotKind,
  ): ContextSnapshot;
}
