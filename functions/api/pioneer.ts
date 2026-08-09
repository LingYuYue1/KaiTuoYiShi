import { optionsResponse, type PagesContextLike } from './auth/_shared';
import { handlePioneerProxyRequest } from '../../services/ai/pioneerProxyCore';

export const onRequestOptions = (): Response => optionsResponse();

export const onRequestPost = async ({ request }: PagesContextLike): Promise<Response> => {
  return handlePioneerProxyRequest(request);
};
