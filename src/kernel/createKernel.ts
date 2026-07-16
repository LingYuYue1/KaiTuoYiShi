import type { IKernel } from '@/src/kernel/contract';
import { NativeKernel, type NativeKernelDependencies } from '@/src/kernel/NativeKernel';

/** Native-only composition. There is no mode flag and no legacy adapter. */
export async function createKernel(dependencies: NativeKernelDependencies): Promise<IKernel> {
  return new NativeKernel(dependencies);
}

export type { NativeKernelDependencies };
