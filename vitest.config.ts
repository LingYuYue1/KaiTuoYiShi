import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Phase 0 behavior tests only.
 * Does not replace scripts/* structure guards.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
    // Keep unit/characterization runs deterministic and local.
    fileParallelism: false,
  },
});
