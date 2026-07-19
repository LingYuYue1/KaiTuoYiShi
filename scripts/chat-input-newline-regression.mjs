import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const inputArea = await readFile(new URL('../components/features/Chat/InputArea.tsx', import.meta.url), 'utf8');
const turnItem = await readFile(new URL('../components/features/Chat/TurnItem.tsx', import.meta.url), 'utf8');

assert.match(
  inputArea,
  /\(hover: none\) and \(pointer: coarse\)/,
  'mobile text input should be detected from input capabilities',
);
assert.match(
  inputArea,
  /if \(isMobileTextInput\(\)\) return;/,
  'mobile Enter should keep the textarea default newline behavior',
);
assert.match(
  inputArea,
  /e\.nativeEvent\.isComposing|isComposingRef\.current/,
  'IME composition should not trigger send',
);
assert.match(
  inputArea,
  /if \(e\.key !== 'Enter' \|\| e\.shiftKey\) return;/,
  'desktop Shift+Enter should keep the textarea default newline behavior',
);
assert.match(
  turnItem,
  /whitespace-pre-wrap break-words/,
  'user bubbles should preserve internal newlines and wrap long text',
);

console.log('chat input newline regression ok');
