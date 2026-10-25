import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleQianfanProxyRequest } from './services/ai/qianfanProxyCore';
import { handleOpenCodeProxyRequest } from './services/ai/opencodeProxyCore';
import { handlePioneerProxyRequest } from './services/ai/pioneerProxyCore';
import { handleArkProxyRequest } from './services/ai/arkProxyCore';
import { handleClineProxyRequest } from './services/ai/clineProxyCore';

function readRequestBody(req: IncomingMessage): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => resolve(body));
  req.on('error', reject);
  return promise;
}

const LOCAL_SNAPSHOT_STORE_WHITELIST = ['saves', 'saveSummaries', 'saveAssets', 'saveNodeDeltas', 'settings'];
const LOCAL_SNAPSHOT_DIR = path.join(__dirname, 'save');

function localSnapshotFilePath(store: string): string {
  return path.join(LOCAL_SNAPSHOT_DIR, `snapshot-${store}.json`);
}

function handleLocalSnapshot(req: IncomingMessage, res: ServerResponse): void {
  const store = decodeURIComponent((req.url ?? '').replace(/^\/+/, ''));
  if (!LOCAL_SNAPSHOT_STORE_WHITELIST.includes(store)) {
    res.statusCode = 405;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Unknown Store' }));
    return;
  }
  const file = localSnapshotFilePath(store);
  const tmpFile = `${file}.tmp`;
  if (req.method === 'GET') {
    readFile(file, 'utf8')
      .then((content) => {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(content);
      })
      .catch(() => {
        res.statusCode = 404;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Not Found' }));
      });
    return;
  }
  if (req.method === 'PUT') {
    readRequestBody(req)
      .then((body) => mkdir(LOCAL_SNAPSHOT_DIR, { recursive: true })
        .then(() => writeFile(tmpFile, body, 'utf8'))
        .then(() => rename(tmpFile, file)))
      .then(() => {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: true }));
      })
      .catch((error) => {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: String(error) }));
      });
    return;
  }
  res.statusCode = 405;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'Method Not Allowed' }));
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'kty-local-qianfan-proxy',
      configureServer(server) {
        server.middlewares.use('/api/local-save/snapshot', handleLocalSnapshot);
        server.middlewares.use('/api/qianfan', async (req, res) => {
          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: true }));
            return;
          }
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'Method Not Allowed' }));
            return;
          }
          const body = await readRequestBody(req);
          const response = await handleQianfanProxyRequest(new Request('http://localhost/api/qianfan', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
          }));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          res.end(Buffer.from(await response.arrayBuffer()));
        });
        server.middlewares.use('/api/opencode', async (req, res) => {
          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: true }));
            return;
          }
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'Method Not Allowed' }));
            return;
          }
          const body = await readRequestBody(req);
          const response = await handleOpenCodeProxyRequest(new Request('http://localhost/api/opencode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
          }));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          res.end(Buffer.from(await response.arrayBuffer()));
        });
        server.middlewares.use('/api/pioneer', async (req, res) => {
          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: true }));
            return;
          }
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'Method Not Allowed' }));
            return;
          }
          const body = await readRequestBody(req);
          const response = await handlePioneerProxyRequest(new Request('http://localhost/api/pioneer', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
          }));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          res.end(Buffer.from(await response.arrayBuffer()));
        });
        server.middlewares.use('/api/ark', async (req, res) => {
          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: true }));
            return;
          }
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'Method Not Allowed' }));
            return;
          }
          const body = await readRequestBody(req);
          const response = await handleArkProxyRequest(new Request('http://localhost/api/ark', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
          }));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          res.end(Buffer.from(await response.arrayBuffer()));
        });
        server.middlewares.use('/api/cline', async (req, res) => {
          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: true }));
            return;
          }
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: 'Method Not Allowed' }));
            return;
          }
          const body = await readRequestBody(req);
          const response = await handleClineProxyRequest(new Request('http://localhost/api/cline', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body,
          }));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          res.end(Buffer.from(await response.arrayBuffer()));
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
});
