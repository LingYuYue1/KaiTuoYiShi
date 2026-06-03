import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const landingPage = fs.readFileSync('components/layout/LandingPage.tsx', 'utf8');
const app = fs.readFileSync('App.tsx', 'utf8');
const presenceFunction = fs.readFileSync('functions/api/presence.ts', 'utf8');
const wranglerConfig = fs.readFileSync('wrangler.toml', 'utf8');

assert(presenceFunction.includes('HEARTBEAT_TTL_MS = 2 * 60 * 1000'), '在线人数接口必须按最近 2 分钟活跃心跳统计。');
assert(presenceFunction.includes('SESSION_RETENTION_MS = 24 * 60 * 60 * 1000'), '在线人数接口必须保留最近 24 小时 session 用于近期统计。');
assert(presenceFunction.includes('ONLINE_SESSIONS_R2'), '在线人数接口必须优先使用 R2 共享存储。');
assert(presenceFunction.includes('CNB_SYNC_R2'), '在线人数接口必须可复用已有 R2 绑定作为兜底。');
assert(presenceFunction.includes('ONLINE_SESSIONS_KV'), '在线人数接口必须在 R2 不可用时使用 KV 共享存储。');
assert(presenceFunction.includes('getKvSessionPrefix'), 'KV 在线人数必须使用每个 session 独立 key，避免并发写 sessions.json 互相覆盖。');
assert(presenceFunction.includes('kv.list'), 'KV 在线人数必须通过 list 汇总多个 session。');
assert(presenceFunction.includes('writeKvSession'), 'KV 在线人数必须单独写入当前 session。');
assert(presenceFunction.includes("DEFAULT_R2_PREFIX = 'kaituoyishi/online'"), '在线人数 R2 前缀必须隔离到 kaituoyishi/online。');
assert(presenceFunction.includes('onRequestGet'), '在线人数接口必须支持 GET 查询。');
assert(presenceFunction.includes('onRequestPost'), '在线人数接口必须支持 POST 心跳。');
assert(presenceFunction.includes('writeRegistry'), '在线人数接口必须把心跳写入 R2 registry。');
assert(presenceFunction.includes("storage: 'r2'"), '在线人数接口必须在 R2 可用时标记 storage=r2。');
assert(presenceFunction.includes("'kv'"), '在线人数接口必须在 KV 可用时标记 storage=kv。');
assert(presenceFunction.includes("storage: 'memory'"), '在线人数接口必须在无 R2 绑定时降级到 memory。');
assert(presenceFunction.includes('cleanupSessions'), '在线人数接口必须清理过期 session。');
assert(presenceFunction.includes("'cache-control': 'no-store'"), '在线人数接口必须禁用缓存，避免主界面人数滞后。');

assert(app.includes("fetch('/api/presence'"), '应用全局必须调用在线人数接口。');
assert(app.includes('PRESENCE_SESSION_KEY'), '应用全局必须给当前页面会话生成稳定 sessionId。');
assert(app.includes('window.location.pathname'), '在线心跳必须携带当前路径，便于服务端诊断。');
assert(app.includes('state.view'), '在线心跳必须携带当前视图，避免只统计主界面。');
assert(app.includes('window.setInterval'), '应用全局必须定时发送在线心跳。');
assert(app.includes('visibilitychange'), '应用从后台回到前台时必须刷新在线心跳。');
assert(!landingPage.includes("fetch('/api/presence'"), 'LandingPage 不应独占在线心跳，否则进游戏后玩家会掉线。');
assert(landingPage.includes('在线开拓者 ${presence.online} 人'), '主界面必须显示在线开拓者人数。');
assert(landingPage.includes('在线开拓者'), '在线人数加载或失败时必须显示在线开拓者兜底文案。');

assert(wranglerConfig.includes('[[kv_namespaces]]'), 'Wrangler 配置必须声明在线人数 KV 绑定。');
assert(wranglerConfig.includes('binding = "ONLINE_SESSIONS_KV"'), '在线人数 KV 绑定名必须是 ONLINE_SESSIONS_KV。');
assert(wranglerConfig.includes('fa2733b4a1b64405997a4f34f725234f'), '在线人数 KV namespace id 必须写入部署配置。');

console.log('presence regression ok');
