import { getAppKernel } from '@/src/kernel/appKernel';

/** Preference clients are thin async calls into the one application kernel. */
export async function getPreference<T>(key: string): Promise<T | null> {
  return (await getAppKernel()).getPreference<T>(key);
}

export async function setPreference(key: string, value: unknown): Promise<void> {
  await (await getAppKernel()).setPreference(key, value);
}

export async function deletePreference(key: string): Promise<void> {
  await (await getAppKernel()).deletePreference(key);
}
