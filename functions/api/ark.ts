import { optionsResponse, type PagesContextLike } from './auth/_shared';
import { handleArkProxyRequest } from '../../services/ai/arkProxyCore';

export const onRequestOptions = async ({ request }: PagesContextLike): Promise<Response> => optionsResponse(request);

export const onRequestPost = async ({ request }: PagesContextLike): Promise<Response> => {
  return handleArkProxyRequest(request);
};
