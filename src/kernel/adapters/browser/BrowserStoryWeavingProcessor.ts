import type { StoryWeavingProcessor } from '@/src/kernel/ports/StoryWeavingProcessor';
import { buildStoryWeavingApiConfig, decomposeStorySegment } from '@/src/kernel/workflows/storyWeaving';

export class BrowserStoryWeavingProcessor implements StoryWeavingProcessor {
  decompose(input: Parameters<StoryWeavingProcessor['decompose']>[0]) {
    return decomposeStorySegment({
      config: buildStoryWeavingApiConfig(input.settings),
      series: input.series,
      segment: input.segment,
      previousSegment: input.previousSegment,
      promptModules: input.settings.promptModules,
      signal: input.signal,
    });
  }
}
