import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const panel = fs.readFileSync('components/features/GameSystems/MemoryPanel.tsx', 'utf8');

assert(panel.includes('flex-col') && panel.includes('md:flex-row'), 'MemoryPanel must stack on mobile and return to two columns on desktop.');
assert(panel.includes('overflow-x-hidden'), 'MemoryPanel mobile layout must prevent horizontal overflow.');
assert(panel.includes('w-full min-w-0') && panel.includes('md:w-[260px]'), 'MemoryPanel sidebar must be full width on mobile and fixed width on desktop.');
assert(panel.includes('w-full min-w-0 flex-1'), 'MemoryPanel content column must be allowed to shrink within the mobile viewport.');
assert(panel.includes('overflow-visible pr-0 md:overflow-y-auto md:pr-1'), 'MemoryPanel should use page scrolling on mobile and inner scrolling on desktop.');
assert(panel.includes('px-3 py-3 md:px-5 md:py-5'), 'MemoryPanel main card needs tighter mobile padding without changing desktop padding.');
assert(!panel.includes('className="flex h-full min-h-0 gap-4"'), 'MemoryPanel must not use the old desktop-only root row layout.');

console.log('memory panel mobile regression ok');
