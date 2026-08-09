import { optionsResponse, type PagesContextLike } from './auth/_shared';
import { handleQianfanProxyRequest } from '../../services/ai/qianfanProxyCore';

export const onRequestOptions = (): Response => optionsResponse();

export const onRequestPost = async ({ request }: PagesContextLike): Promise<Response> => {
  return handleQianfanProxyRequest(request);
};
