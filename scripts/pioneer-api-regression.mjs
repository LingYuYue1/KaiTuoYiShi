import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const settings = fs.readFileSync('models/settings.ts', 'utf8');
const client = fs.readFileSync('services/ai/chatCompletionClient.ts', 'utf8');
const apiTools = fs.readFileSync('services/ai/apiTools.ts', 'utf8');
const pioneerProxy = fs.readFileSync('functions/api/pioneer.ts', 'utf8');
const pioneerProxyCore = fs.readFileSync('services/ai/pioneerProxyCore.ts', 'utf8');
const viteConfig = fs.readFileSync('vite.config.ts', 'utf8');

assert(!settings.includes("'pioneer'"), 'Pioneer must stay inside OpenAI compatible mode, not become a separate provider.');

assert(pioneerProxy.includes('handlePioneerProxyRequest'), 'Cloudflare Pioneer proxy must reuse shared proxy core.');
assert(pioneerProxyCore.includes('api.pioneer.ai/v1'), 'Pioneer proxy must be restricted to api.pioneer.ai/v1.');
assert(pioneerProxyCore.includes('export function normalizePioneerBaseUrl'), 'Pioneer base URL normalizer must be reusable by client code.');
assert(pioneerProxyCore.includes('export function isPioneerBaseUrl'), 'Pioneer base URL detector must be reusable by client code.');
assert(pioneerProxyCore.includes("payload.kind === 'models'"), 'Pioneer proxy must support model list requests.');
assert(pioneerProxyCore.includes('chat/completions'), 'Pioneer proxy must support OpenAI-compatible chat completions.');

assert(viteConfig.includes("server.middlewares.use('/api/pioneer'"), 'Local Vite dev server must expose /api/pioneer.');
assert(viteConfig.includes('handlePioneerProxyRequest'), 'Local Vite Pioneer proxy must reuse the same proxy core.');

assert(client.includes("from './pioneerProxyCore'"), 'Chat client must import Pioneer helpers.');
assert(client.includes('function buildPioneerProxyBody'), 'OpenAI-compatible chat path must build Pioneer proxy bodies.');
assert(client.includes('function isPioneerConfig'), 'OpenAI-compatible chat path must detect Pioneer by Base URL.');
assert(/isPioneerConfig\(config\)\s*\?\s*'\/api\/pioneer'/.test(client), 'Streaming OpenAI-compatible Pioneer requests must use same-origin proxy.');
assert(client.includes('buildPioneerProxyBody(config, requestBody)'), 'Streaming Pioneer requests must send body through proxy wrapper.');
assert(/isPioneerConfig\(deepSeekPayload\.config\)\s*\?\s*'\/api\/pioneer'/.test(client), 'Non-stream Pioneer requests must use same-origin proxy.');
assert(client.includes('buildPioneerProxyBody(deepSeekPayload.config, requestBody)'), 'Non-stream Pioneer requests must send body through proxy wrapper.');

assert(apiTools.includes('isPioneerBaseUrl(baseRaw)'), 'Model list fetch must detect Pioneer by Base URL.');
assert(apiTools.includes('fetchPioneerModels(baseRaw, apiKey)'), 'Model list fetch must use dedicated Pioneer proxy function.');
assert(apiTools.includes("fetch('/api/pioneer'"), 'Pioneer model list fetch must use same-origin proxy to avoid browser CORS.');
assert(apiTools.includes("kind: 'models'"), 'Pioneer model list proxy request must declare models kind.');
assert(apiTools.includes("source: 'Pioneer"), 'Pioneer model list failures must be labeled in API error reports.');

console.log('pioneer api regression ok');
