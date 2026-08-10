import { createBuiltinPromptModules } from '../data/builtinPromptModules';
const mods = createBuiltinPromptModules();
for (const m of mods) {
  const first = m.content.split('\n').find((l) => l.trim()) ?? '';
  console.log([m.id, m.order, (m.scope??[]).join('+'), m.enabled?'on':'OFF', JSON.stringify(first.slice(0,50))].join(' | '));
}
