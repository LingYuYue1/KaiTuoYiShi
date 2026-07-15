/**
 * Composition-root kernel factory (Phase 1).
 *
 * Mode selection lives ONLY here (or at the single call site next to createKernel).
 * Components, hooks (except factory injection), domain, and adapters must not
 * branch on legacy vs native.
 *
 * Rollback: keep mode `"legacy"`.
 */

import type { IKernel } from '@/src/kernel/contract';
import {
  LegacyKernelAdapter,
  type LegacyKernelDependencies,
} from '@/src/kernel/adapters/legacy/LegacyKernelAdapter';

export type KernelMode = 'legacy' | 'native-turn';

export type KernelDependencies = Readonly<{
  legacy: LegacyKernelDependencies;
}>;

/**
 * Create an IKernel for the given mode.
 *
 * - `"legacy"` → LegacyKernelAdapter (production default)
 * - `"native-turn"` → stub that rejects all executes (Phase 2 lands real native)
 *
 * Does not dual-write; only one authority is returned.
 */
export async function createKernel(
  mode: KernelMode,
  dependencies: KernelDependencies,
): Promise<IKernel> {
  switch (mode) {
    case 'legacy':
      return new LegacyKernelAdapter(dependencies.legacy);
    case 'native-turn':
      return new NativeTurnStubKernel();
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown kernel mode: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Phase 1 stub: native path is not implemented.
 * Explicitly rejects rather than silently falling back to legacy.
 */
class NativeTurnStubKernel implements IKernel {
  async *execute(command: import('@/src/kernel/contract').CommandEnvelope) {
    yield {
      type: 'rejected' as const,
      commandId: command.commandId,
      error: {
        code: 'not_implemented' as const,
        message:
          'Native Kernel is not implemented in Phase 1. Use createKernel("legacy") at the composition root.',
        details: { mode: 'native-turn' },
      },
    };
  }

  async read(): Promise<never> {
    throw new Error(
      'Native Kernel is not implemented in Phase 1. Use createKernel("legacy") at the composition root.',
    );
  }
}
