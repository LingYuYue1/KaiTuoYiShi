import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('components/features/Settings/SettingsModal.tsx', 'utf8');

const iconNames = [
  'TypeIcon',
  'BookOpen',
  'Cable',
  'TriangleAlert',
  'Layers3',
  'ShieldAlert',
  'Database',
  'FileText',
  'ImportIcon',
  'WandSparkles',
  'Palette',
  'HardDrive',
];

assert(source.includes("from 'lucide-react'"), 'settings navigation must use the shared Lucide icon set');
assert(source.includes('navIcon: LucideIcon'), 'tab metadata must type left-navigation icons explicitly');
assert.equal(source.match(/navIcon:/g)?.length, 13, 'all 12 tabs plus the metadata type must define navIcon');
for (const iconName of iconNames) {
  assert(source.includes(`navIcon: ${iconName}`), `missing semantic navigation icon: ${iconName}`);
}

assert(source.includes('const NavIcon = t.navIcon'), 'left navigation must render navIcon instead of the title glyph');
assert(source.includes('h-7 w-7 flex-shrink-0 items-center justify-center'), 'navigation icons must use a fixed 28px centered container');
assert(source.includes('size={17} strokeWidth={1.8}'), 'all navigation icons must share size and stroke width');
assert(source.includes('aria-hidden="true"'), 'decorative navigation icons must be hidden from assistive technology');
assert(source.includes("'2px solid rgba(var(--tj-accent-primary), 0.96)'"), 'active navigation border must remain valid CSS and preserve alignment');
assert(!source.includes('solid linear-gradient'), 'border color cannot use an invalid CSS gradient value');
assert(source.includes('{activeMeta.icon}'), 'the right-side title must keep its existing decorative glyph');
assert(!source.includes('{t.icon}\n                  </span>'), 'left navigation must not render variable-width title glyphs');

console.log('settings navigation icon regression ok');
