import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { handleQianfanProxyRequest } from './services/ai/qianfanProxyCore';
import { handleOpenCodeProxyRequest } from './services/ai/opencodeProxyCore';
import { handlePioneerProxyRequest } from './services/ai/pioneerProxyCore';
import { handleArkProxyRequest } from './services/ai/arkProxyCore';
import { handleClineProxyRequest } from './services/ai/clineProxyCore';

function readRequestBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'kty-local-qianfan-proxy',
      configureServer(server) {
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
