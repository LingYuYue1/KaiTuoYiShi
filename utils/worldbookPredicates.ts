import type { 世界书, 世界书条目 } from '@/models/worldbook';
import { BUILTIN_BOOK_IDS } from '@/data/builtinWorldbookConfig';
import { STORY_MODE_BOOK_IDS } from '@/data/storyModeWorldbooks';

const builtinIds: readonly string[] = BUILTIN_BOOK_IDS;
const storyModeIds: readonly string[] = STORY_MODE_BOOK_IDS;

export const isBuiltinBook = (book: 世界书) => builtinIds.includes(book.id) || storyModeIds.includes(book.id);
export const isStoryModeBook = (book: 世界书) => storyModeIds.includes(book.id);
export const isCalibrationEntry = (entry: 世界书条目) => entry.scope.includes('calibration');
export const isCalibrationBook = (book: 世界书) => book.entries.some(isCalibrationEntry);
