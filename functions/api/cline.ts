import { optionsResponse, type PagesContextLike } from './auth/_shared';
import { handleClineProxyRequest } from '../../services/ai/clineProxyCore';

export const onRequestOptions = async (): Promise<Response> => optionsResponse();

export const onRequestPost = async ({ request }: PagesContextLike): Promise<Response> => {
  return handleClineProxyRequest(request);
};
