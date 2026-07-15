/**
 * Composition-root kernel factory (Phase 2).
 *
 * Mode selection lives ONLY here (or at the single call site next to createKernel).
 * Components, hooks (except factory injection), domain, and adapters must not
 * branch on legacy vs native.
 *
 * Rollback: keep mode `"legacy"`.
 * Production default remains `"legacy"` until SessionRepository owns the full
 * game graph (Phase 3 provides durable minimal formal slice + CAS; full 旅人/NPC
 * expansion is later). Tests construct `"native-turn"` directly.
 *
 * Native path: SessionRepository is the sole formal write for its GameState —
 * do not dual-write formal session through React free-mutation AND repository.
 */

import type { IKernel } from '@/src/kernel/contract';
import {
  LegacyKernelAdapter,
  type LegacyKernelDependencies,
} from '@/src/kernel/adapters/legacy/LegacyKernelAdapter';
import { NativeKernel, type NativeKernelDependencies } from '@/src/kernel/NativeKernel';

export type KernelMode = 'legacy' | 'native-turn';

export type KernelDependencies = Readonly<{
  /** Required for `"legacy"` mode. Optional transitional fallback for native non-advance. */
  legacy?: LegacyKernelDependencies;
  /** Required for `"native-turn"` mode. */
  native?: NativeKernelDependencies;
}>;

/**
 * Create an IKernel for the given mode.
 *
 * - `"legacy"` → LegacyKernelAdapter (production default)
 * - `"native-turn"` → NativeKernel owning AdvanceTurn + RerollTurn (Phase 4)
 *
 * Does not dual-write; only one authority is returned.
 * Production default remains legacy until full game graph is native-owned.
 */
export async function createKernel(
  mode: KernelMode,
  dependencies: KernelDependencies,
): Promise<IKernel> {
  switch (mode) {
    case 'legacy': {
      if (!dependencies.legacy) {
        throw new Error('createKernel("legacy") requires dependencies.legacy');
      }
      return new LegacyKernelAdapter(dependencies.legacy);
    }
    case 'native-turn': {
      if (!dependencies.native) {
        throw new Error(
          'createKernel("native-turn") requires dependencies.native ' +
            '(sessions: SessionRepository, model: ModelGateway)',
        );
      }
      return new NativeKernel({
        sessions: dependencies.native.sessions,
        model: dependencies.native.model,
        // Stage 5.4 optional ports — required only when image/album commands run.
        ...(dependencies.native.assets
          ? { assets: dependencies.native.assets }
          : {}),
        ...(dependencies.native.images
          ? { images: dependencies.native.images }
          : {}),
        // Optional transitional fallback for non-advance only.
        legacy: dependencies.native.legacy ?? dependencies.legacy,
      });
    }
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unknown kernel mode: ${String(_exhaustive)}`);
    }
  }
}

export type { NativeKernelDependencies };
