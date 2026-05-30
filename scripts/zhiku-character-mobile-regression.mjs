import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const panel = fs.readFileSync('components/features/GameSystems/ZhikuPanel.tsx', 'utf8');

assert(
  panel.includes('grid min-h-0 min-w-0 flex-1 gap-3 overflow-y-auto overflow-x-hidden p-3 md:overflow-hidden'),
  'Zhiku workbench must allow page-level vertical scrolling on mobile instead of hard-clipping columns.',
);
assert(
  panel.includes("activeCategory === 'character'") &&
    panel.includes('md:grid-cols-[170px_160px_220px_minmax(0,1fr)]') &&
    panel.includes('lg:grid-cols-[190px_180px_260px_minmax(0,1fr)]'),
  'Character workspace columns must only activate at md+ breakpoints.',
);
assert(
  panel.includes('min-w-0 overflow-x-hidden overflow-y-visible md:min-h-0 md:overflow-y-auto md:pr-1'),
  'Character list and node columns must stack naturally on mobile and only use internal scrolling on desktop.',
);
assert(
  panel.includes('className="h-full min-h-0 min-w-0 overflow-y-auto px-3 py-4 md:px-4"'),
  'Character detail panel must keep its own readable vertical scroll area.',
);

console.log('zhiku character mobile regression ok');
