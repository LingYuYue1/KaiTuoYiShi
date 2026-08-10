import { createBuiltinPromptModules } from '../data/builtinPromptModules';
import { createBuiltinWorldbooks } from '../data/worldbookPresets';
const SEP = '\n\n---\n\n';
for (const m of createBuiltinPromptModules()) {
  if (m.content.includes(SEP)) console.log('MODULE HAS SEP:', m.id);
  if (/^\s*---\s*$/m.test(m.content)) console.log('MODULE HAS HR LINE:', m.id);
}
for (const b of createBuiltinWorldbooks()) {
  for (const e of b.entries) {
    if (e.content.includes(SEP)) console.log('ENTRY HAS SEP:', e.id);
    if (/^\s*---\s*$/m.test(e.content)) console.log('ENTRY HAS HR LINE:', e.id);
  }
}
console.log('done');
