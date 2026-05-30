import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const panel = fs.readFileSync('components/features/GameSystems/ZhikuPanel.tsx', 'utf8');

assert(
  panel.includes('hidden h-full min-h-0 min-w-0 overflow-hidden md:block'),
  'Zhiku desktop detail wrapper must provide a constrained full-height scroll container.',
);
assert(
  panel.includes('className="h-full min-h-0 min-w-0 overflow-y-auto px-3 py-4 md:px-4"'),
  'Zhiku DetailPanel must own vertical scrolling within the constrained wrapper.',
);
assert(
  panel.includes("md:grid-cols-[220px_minmax(0,1fr)_minmax(0,1.2fr)]") &&
    panel.includes('md:overflow-hidden'),
  'Zhiku desktop workbench must keep overflow hidden so child columns can scroll independently.',
);

console.log('zhiku detail scroll regression ok');
