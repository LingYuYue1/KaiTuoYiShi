import { getAppKernel } from '@/src/kernel/appKernel';

export type {
  SaveCatalogPort,
  SaveListItem,
  SavePayload,
} from '@/src/kernel/ports/SaveCatalog';

export async function getSaveCatalog() {
  return (await getAppKernel()).saves;
}
