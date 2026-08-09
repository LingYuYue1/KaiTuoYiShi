import { optionsResponse, type PagesContextLike } from './auth/_shared';
import { handleOpenCodeProxyRequest } from '../../services/ai/opencodeProxyCore';

export const onRequestOptions = (): Response => optionsResponse();

export const onRequestPost = async ({ request }: PagesContextLike): Promise<Response> => {
  return handleOpenCodeProxyRequest(request);
};
