import type { ContextSnapshotBuilder } from '@/src/kernel/ports/ContextSnapshotBuilder';
import type { StoryState } from '@/src/kernel/domain/session/storyState';
import { createTurnExecutionState } from '@/src/kernel/application/turn/turnExecutionState';
import { buildContextSnapshot } from '@/src/kernel/workflows/contextSnapshot';
import type { DeviceExecutionOverlay } from '@/src/kernel/ports/ExecutionContextProvider';
import type { ContextSnapshot, ContextSnapshotKind } from '@/src/kernel/contract/inspection';

export class BrowserContextSnapshotBuilder implements ContextSnapshotBuilder {
  build(story: StoryState, overlay: DeviceExecutionOverlay, kind?: ContextSnapshotKind): ContextSnapshot {
    return buildContextSnapshot(createTurnExecutionState(story, overlay), kind);
  }
}
