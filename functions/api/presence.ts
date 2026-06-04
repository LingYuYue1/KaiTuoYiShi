import { jsonResponse, optionsResponse, type PagesContextLike } from './auth/_shared';

const PRESENCE_SYSTEM_ENABLED = false;
const HEARTBEAT_TTL_MS = 2 * 60 * 1000;
const SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 500;
const DEFAULT_R2_PREFIX = 'kaituoyishi/online';
const REGISTRY_FILE = 'sessions.json';

type PresenceSessionRecord = {
  id: string;
  firstSeenAt: string;
  lastSeenAt: string;
  ip: string;
  userAgent?: string;
  path?: string;
  heartbeatCount: number;
};

type PresenceRegistry = {
  sessions: PresenceSessionRecord[];
};

type PresenceBody = {
  online: number;
  onlineCount: number;
  onlineSessionCount: number;
  totalRecentCount: number;
  ttlSeconds: number;
  updatedAt: string;
  serverTime: string;
  storage: 'r2' | 'kv' | 'memory' | 'disabled';
  disabled?: boolean;
};

type PresenceMemoryState = {
  sessions: Map<string, PresenceSessionRecord>;
};

type R2BucketLike = {
  get(key: string): Promise<{ json<T = unknown>(): Promise<T> } | null>;
  put(key: string, value: string, options?: unknown): Promise<unknown>;
};

type KvNamespaceLike = {
  get<T = unknown>(key: string, type: 'json'): Promise<T | null>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
  put(key: string, value: string, options?: unknown): Promise<unknown>;
};

const globalPresence = globalThis as typeof globalThis & {
  __KTY_PRESENCE_STATE__?: PresenceMemoryState;
};

function getMemoryState(): PresenceMemoryState {
  if (!globalPresence.__KTY_PRESENCE_STATE__) {
    globalPresence.__KTY_PRESENCE_STATE__ = { sessions: new Map<string, PresenceSessionRecord>() };
  }
  return globalPresence.__KTY_PRESENCE_STATE__;
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readSessionId(raw: unknown): string {
  return readText(raw).replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 96);
}

function getClientIp(request: Request): string {
  const direct = readText(request.headers.get('CF-Connecting-IP'));
  if (direct) return direct;
  const forwarded = readText(request.headers.get('X-Forwarded-For'));
  if (forwarded) return forwarded.split(',')[0]?.trim() || '';
  return readText(request.headers.get('X-Real-IP')) || 'unknown';
}

function getBucket(env: PagesContextLike['env']): R2BucketLike | null {
  const candidate = (env as Record<string, unknown>)?.ONLINE_SESSIONS_R2
    ?? (env as Record<string, unknown>)?.CNB_SYNC_R2;
  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof (candidate as R2BucketLike).get === 'function' &&
    typeof (candidate as R2BucketLike).put === 'function'
  ) {
    return candidate as R2BucketLike;
  }
  return null;
}

function getKvNamespace(env: PagesContextLike['env']): KvNamespaceLike | null {
  const candidate = (env as Record<string, unknown>)?.ONLINE_SESSIONS_KV;
  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof (candidate as KvNamespaceLike).get === 'function' &&
    typeof (candidate as KvNamespaceLike).list === 'function' &&
    typeof (candidate as KvNamespaceLike).put === 'function'
  ) {
    return candidate as KvNamespaceLike;
  }
  return null;
}

function getPrefix(env: PagesContextLike['env']): string {
  return (readText(env.ONLINE_SESSIONS_R2_PREFIX) || readText(env.ONLINE_SESSIONS_KV_PREFIX) || DEFAULT_R2_PREFIX).replace(/^\/+|\/+$/g, '') || DEFAULT_R2_PREFIX;
}

function getRegistryKey(env: PagesContextLike['env']): string {
  return `${getPrefix(env)}/${REGISTRY_FILE}`;
}

function getKvSessionPrefix(env: PagesContextLike['env']): string {
  return `${getPrefix(env)}/session/`;
}

function getKvSessionKey(env: PagesContextLike['env'], sessionId: string): string {
  return `${getKvSessionPrefix(env)}${sessionId}`;
}

function cleanupSessions(sessions: PresenceSessionRecord[], now: number): PresenceSessionRecord[] {
  return sessions
    .filter((session) => {
      const lastSeen = Date.parse(session.lastSeenAt || session.firstSeenAt || '');
      return Number.isFinite(lastSeen) && now - lastSeen <= SESSION_RETENTION_MS;
    })
    .sort((left, right) => Date.parse(right.lastSeenAt || '') - Date.parse(left.lastSeenAt || ''))
    .slice(0, MAX_SESSIONS);
}

function countOnlineSessions(sessions: PresenceSessionRecord[], now: number): number {
  return sessions.filter((session) => {
    const lastSeen = Date.parse(session.lastSeenAt || '');
    return Number.isFinite(lastSeen) && now - lastSeen <= HEARTBEAT_TTL_MS;
  }).length;
}

function buildPresenceBody(sessions: PresenceSessionRecord[], now: number, storage: PresenceBody['storage']): PresenceBody {
  const cleaned = cleanupSessions(sessions, now);
  const online = countOnlineSessions(cleaned, now);
  const serverTime = new Date(now).toISOString();
  return {
    online,
    onlineCount: online,
    onlineSessionCount: online,
    totalRecentCount: cleaned.length,
    ttlSeconds: Math.floor(HEARTBEAT_TTL_MS / 1000),
    updatedAt: serverTime,
    serverTime,
    storage,
  };
}

function buildDisabledPresenceBody(): PresenceBody {
  const serverTime = new Date().toISOString();
  return {
    online: 0,
    onlineCount: 0,
    onlineSessionCount: 0,
    totalRecentCount: 0,
    ttlSeconds: 0,
    updatedAt: serverTime,
    serverTime,
    storage: 'disabled',
    disabled: true,
  };
}

async function readRegistry(env: PagesContextLike['env']): Promise<PresenceRegistry | null> {
  const bucket = getBucket(env);
  if (bucket) {
    const object = await bucket.get(getRegistryKey(env));
    if (!object) return { sessions: [] };
    try {
      const parsed = await object.json<Partial<PresenceRegistry>>();
      return normalizeRegistry(parsed);
    } catch {
      return { sessions: [] };
    }
  }
  const kv = getKvNamespace(env);
  if (!kv) return null;
  return readKvSessions(env, kv);
}

async function writeRegistry(env: PagesContextLike['env'], registry: PresenceRegistry): Promise<void> {
  const bucket = getBucket(env);
  if (bucket) {
    await bucket.put(getRegistryKey(env), JSON.stringify(registry), {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    });
    return;
  }
  const kv = getKvNamespace(env);
  if (!kv) throw new Error('ONLINE_SESSIONS_R2 / ONLINE_SESSIONS_KV 未绑定。');
  await kv.put(getRegistryKey(env), JSON.stringify(registry), {
    expirationTtl: Math.floor(SESSION_RETENTION_MS / 1000),
  });
}

async function readKvSessions(env: PagesContextLike['env'], kv: KvNamespaceLike): Promise<PresenceRegistry> {
  const sessions: PresenceSessionRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: getKvSessionPrefix(env), limit: 500, cursor });
    const records = await Promise.all(page.keys.map((key) => kv.get<PresenceSessionRecord>(key.name, 'json').catch(() => null)));
    for (const record of records) {
      if (record && typeof record === 'object' && typeof record.id === 'string') sessions.push(record);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return { sessions };
}

async function writeKvSession(env: PagesContextLike['env'], session: PresenceSessionRecord): Promise<void> {
  const kv = getKvNamespace(env);
  if (!kv) throw new Error('ONLINE_SESSIONS_KV 未绑定。');
  await kv.put(getKvSessionKey(env, session.id), JSON.stringify(session), {
    expirationTtl: Math.floor(SESSION_RETENTION_MS / 1000),
  });
}

async function readPresenceSessions(env: PagesContextLike['env'], now: number): Promise<{ sessions: PresenceSessionRecord[]; storage: PresenceBody['storage'] }> {
  const registry = await readRegistry(env);
  if (registry) {
    return { sessions: cleanupSessions(registry.sessions, now), storage: getBucket(env) ? 'r2' : 'kv' };
  }
  const state = getMemoryState();
  const sessions = cleanupSessions(Array.from(state.sessions.values()), now);
  state.sessions = new Map(sessions.map((session) => [session.id, session]));
  return { sessions, storage: 'memory' };
}

function normalizeRegistry(parsed: Partial<PresenceRegistry> | null | undefined): PresenceRegistry {
  return {
    sessions: Array.isArray(parsed?.sessions)
      ? parsed.sessions.filter((item): item is PresenceSessionRecord => Boolean(item && typeof item === 'object' && typeof item.id === 'string'))
      : [],
  };
}

async function upsertPresenceSession(params: {
  request: Request;
  env: PagesContextLike['env'];
  sessionId: string;
  path?: string;
  now: number;
}): Promise<{ sessions: PresenceSessionRecord[]; storage: PresenceBody['storage'] }> {
  const nowIso = new Date(params.now).toISOString();
  const current = await readPresenceSessions(params.env, params.now);
  const index = current.sessions.findIndex((session) => session.id === params.sessionId);
  const previous = index >= 0 ? current.sessions[index] : undefined;
  const next: PresenceSessionRecord = {
    id: params.sessionId,
    firstSeenAt: previous?.firstSeenAt || nowIso,
    lastSeenAt: nowIso,
    ip: getClientIp(params.request),
    userAgent: readText(params.request.headers.get('User-Agent')).slice(0, 180),
    path: readText(params.path).slice(0, 160),
    heartbeatCount: (previous?.heartbeatCount || 0) + 1,
  };
  const sessions = [...current.sessions];
  if (index >= 0) {
    sessions[index] = next;
  } else {
    sessions.unshift(next);
  }
  const cleaned = cleanupSessions(sessions, params.now);
  if (current.storage === 'r2') {
    await writeRegistry(params.env, { sessions: cleaned });
  } else if (current.storage === 'kv') {
    await writeKvSession(params.env, next);
  } else {
    getMemoryState().sessions = new Map(cleaned.map((session) => [session.id, session]));
  }
  return { sessions: cleaned, storage: current.storage };
}

function noStore(init: ResponseInit = {}): ResponseInit {
  return {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      'cache-control': 'no-store',
    },
  };
}

export const onRequestOptions = async (): Promise<Response> => optionsResponse();

export const onRequestGet = async ({ env }: PagesContextLike): Promise<Response> => {
  if (!PRESENCE_SYSTEM_ENABLED) {
    return jsonResponse(buildDisabledPresenceBody(), noStore());
  }
  const now = Date.now();
  const { sessions, storage } = await readPresenceSessions(env, now);
  return jsonResponse(buildPresenceBody(sessions, now, storage), noStore());
};

export const onRequestPost = async ({ request, env }: PagesContextLike): Promise<Response> => {
  if (!PRESENCE_SYSTEM_ENABLED) {
    return jsonResponse(buildDisabledPresenceBody(), noStore());
  }
  const now = Date.now();
  let sessionId = '';
  let path = '';
  try {
    const payload = await request.json() as { sessionId?: unknown; path?: unknown };
    sessionId = readSessionId(payload.sessionId);
    path = readText(payload.path);
  } catch {
    sessionId = '';
  }
  if (!sessionId) {
    return jsonResponse({ error: '缺少在线心跳 sessionId。' }, { status: 400 });
  }
  const { sessions, storage } = await upsertPresenceSession({ request, env, sessionId, path, now });
  return jsonResponse(buildPresenceBody(sessions, now, storage), noStore());
};
