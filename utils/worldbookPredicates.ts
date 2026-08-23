import type { 世界书, 世界书条目 } from '@/models/worldbook';
import { STORY_MODE_BOOK_IDS } from '@/data/storyModeWorldbooks';

const storyModeIds: readonly string[] = STORY_MODE_BOOK_IDS;

export const isBuiltinBook = (book: 世界书) => book.builtin === true;
export const isStoryModeBook = (book: 世界书) => storyModeIds.includes(book.id);
export const isCalibrationEntry = (entry: 世界书条目) => entry.scope.includes('calibration');
export const isCalibrationBook = (book: 世界书) => book.entries.some(isCalibrationEntry);
