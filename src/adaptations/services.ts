import { getAppKernel } from '@/src/kernel/appKernel';
import type { KernelServices } from '@/src/kernel/ports';

/** Browser-facing service adaptation. Components must not import the kernel composition root. */
export async function getAdaptationServices(): Promise<KernelServices> {
  return (await getAppKernel()).services;
}
