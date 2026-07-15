/**
 * Stage 5.3 — ModelGateway surface guard.
 *
 * Phone/News must NOT expand ModelGateway with phoneReply()/newsGenerate().
 * Application uses model.complete(request) only.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ModelGateway } from '@/src/kernel/ports/ModelGateway';
import { ScriptedModelGateway } from '@/src/kernel/adapters/test/ScriptedModelGateway';

const ROOT = resolve(import.meta.dirname, '../../../..');

describe('ModelGateway surface guard (Stage 5.3)', () => {
  it('port source only declares complete()', () => {
    const source = readFileSync(
      resolve(ROOT, 'src/kernel/ports/ModelGateway.ts'),
      'utf8',
    );
    expect(source).toMatch(/complete\s*\(/);
    expect(source).not.toMatch(/phoneReply\s*\(/);
    expect(source).not.toMatch(/newsGenerate\s*\(/);
    expect(source).not.toMatch(/newsApply\s*\(/);
    expect(source).not.toMatch(/generateNews\s*\(/);
    expect(source).not.toMatch(/replyPhone\s*\(/);
  });

  it('TypeScript ModelGateway interface only has complete', () => {
    const gateway: ModelGateway = new ScriptedModelGateway();
    const keys = Object.getOwnPropertyNames(
      Object.getPrototypeOf(gateway),
    ).filter((k) => k !== 'constructor');
    // Runtime instance may have helpers on ScriptedModelGateway; the port type
    // must only require complete. Duck-check assignability:
    const portOnly: ModelGateway = {
      complete: gateway.complete.bind(gateway),
    };
    expect(typeof portOnly.complete).toBe('function');
    // Forbidden method names must not exist on the port-shaped object.
    expect('phoneReply' in portOnly).toBe(false);
    expect('newsGenerate' in portOnly).toBe(false);
    expect(keys.includes('phoneReply')).toBe(false);
    expect(keys.includes('newsGenerate')).toBe(false);
  });

  it('application sources call model.complete only', () => {
    const phoneReplySrc = readFileSync(
      resolve(ROOT, 'src/kernel/application/phoneReply.ts'),
      'utf8',
    );
    const applyNewsSrc = readFileSync(
      resolve(ROOT, 'src/kernel/application/applyNews.ts'),
      'utf8',
    );
    expect(phoneReplySrc).toMatch(/model\.complete\(/);
    expect(applyNewsSrc).toMatch(/model\.complete\(/);
    expect(phoneReplySrc).not.toMatch(/model\.phone/);
    expect(applyNewsSrc).not.toMatch(/model\.news/);
  });
});
