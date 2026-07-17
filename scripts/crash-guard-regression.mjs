import fs from 'node:fs/promises';
import path from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const app = await fs.readFile(path.join(root, 'App.tsx'), 'utf8');
const index = await fs.readFile(path.join(root, 'index.tsx'), 'utf8');
const errorBoundary = await fs.readFile(path.join(root, 'components/ui/ErrorBoundary.tsx'), 'utf8');
const lazyRetry = await fs.readFile(path.join(root, 'utils/lazyWithRetry.ts'), 'utf8');

assert(index.includes('<ErrorBoundary>'), '入口必须包裹 ErrorBoundary');
assert(index.includes('unhandledrejection'), '入口必须监听未处理的 Promise 拒绝');
assert(app.includes('lazyWithRetry('), 'App 懒加载必须走 lazyWithRetry');
assert(errorBoundary.includes('diagnosticId'), 'ErrorBoundary 必须只展示安全诊断 ID，不能输出原始 stack');
assert(!errorBoundary.includes('error.stack'), 'ErrorBoundary 不得向玩家输出可能含密钥的原始 stack');
assert(lazyRetry.includes("const RELOAD_QUERY_KEY = 'kty_chunk_retry'"), '懒加载重试必须使用 URL 单次重试标记');
assert(lazyRetry.includes('window.location.replace(url.toString())'), '懒加载失败必须使用单次 cache-busting replace');
assert(!lazyRetry.includes('sessionStorage'), '懒加载重试不得依赖可能被禁用的 sessionStorage');

console.log('crash guard regression ok');
