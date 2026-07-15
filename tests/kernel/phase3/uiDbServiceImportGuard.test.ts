/**
 * Phase 3 Exit Gate — presentation layer must not import dbService.
 *
 * Source-level structural check (design wants UI→dbService edges = 0).
 * Adapters under src/ui/preferences and src/ui/ports may wrap dbService.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

const PRESENTATION_ROOTS = ['components', 'App.tsx', 'hooks'] as const;

const DB_SERVICE_IMPORT =
  /from\s+['"]@\/services\/dbService['"]|require\(\s*['"]@\/services\/dbService['"]\s*\)/;

function collectTsFiles(entry: string): string[] {
  const abs = join(ROOT, entry);
  let st;
  try {
    st = statSync(abs);
  } catch {
    return [];
  }
  if (st.isFile()) {
    return abs.endsWith('.ts') || abs.endsWith('.tsx') ? [abs] : [];
  }
  if (!st.isDirectory()) return [];
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    out.push(...collectTsFiles(join(entry, name)));
  }
  return out;
}

describe('UI dbService import guard (Phase 3 exit gate)', () => {
  it('components/**, App.tsx, hooks/** do not import @/services/dbService', () => {
    const offenders: string[] = [];
    for (const root of PRESENTATION_ROOTS) {
      for (const file of collectTsFiles(root)) {
        const src = readFileSync(file, 'utf8');
        if (DB_SERVICE_IMPORT.test(src)) {
          offenders.push(relative(ROOT, file));
        }
      }
    }
    expect(offenders, `UI→dbService edges must be 0:\n${offenders.join('\n')}`).toEqual(
      [],
    );
  });

  it('preference/save adapters are the only intended dbService UI wrappers', () => {
    // Document allowed adapter locations (not presentation).
    const allowed = [
      'src/ui/preferences/indexedDbPreferenceStore.ts',
      'src/ui/ports/dbServiceSaveCatalog.ts',
    ];
    for (const file of allowed) {
      const src = readFileSync(join(ROOT, file), 'utf8');
      expect(src.includes('dbService') || src.includes("services/dbService")).toBe(true);
    }
  });
});
