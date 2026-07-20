import type { ContentResolver } from '@/src/kernel/ports/ContentResolver';
import { loadAllBundledZhikuPresets } from '@/data/zhikuPreset';
import { loadAllBundledStoryWeavingPresets } from '@/data/storyWeavingPreset';

export class BrowserContentResolver implements ContentResolver {
  loadBundledZhiku(cacheBust?: number) {
    return loadAllBundledZhikuPresets({ cacheBust });
  }

  loadBundledStoryWeaving() {
    return loadAllBundledStoryWeavingPresets();
  }
}
