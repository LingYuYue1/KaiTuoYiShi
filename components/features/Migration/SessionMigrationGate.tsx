import { useEffect, useState, type ReactNode } from 'react';
import { APP_SESSION_ID, getAppRoot } from '@/src/adaptations/kernel';
import type { SessionMigrationInspection } from '@/src/kernel/application/sessionMigration';
import type { PortableSaveMigrationInspection } from '@/src/kernel/application/portableSaveMigration';

type RequiredInspection = {
  session: SessionMigrationInspection;
  portable: PortableSaveMigrationInspection;
};

type GateState =
  | { phase: 'checking' }
  | { phase: 'ready' }
  | { phase: 'required'; inspection: RequiredInspection }
  | { phase: 'migrating' }
  | { phase: 'failed'; message: string };

export function SessionMigrationGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ phase: 'checking' });
  const [recoverDevicePreferences, setRecoverDevicePreferences] = useState(false);

  useEffect(() => {
    void getAppRoot().then(async (root) => Promise.all([
      root.migration.inspect(APP_SESSION_ID),
      root.migration.inspectPortableSaves(),
    ])).then(([session, portable]) => {
      if (session.status === 'unsupported') {
        setState({ phase: 'failed', message: `无法迁移会话格式：${String(session.schemaVersion)}` });
      } else if (session.status === 'v2-required' || portable.requiredCount > 0) {
        setState({ phase: 'required', inspection: { session, portable } });
      } else {
        setState({ phase: 'ready' });
      }
    }).catch((error: unknown) => setState({ phase: 'failed', message: error instanceof Error ? error.message : String(error) }));
  }, []);

  if (state.phase === 'ready') return children;
  const required = state.phase === 'required' ? state.inspection : null;
  const migrate = async () => {
    setState({ phase: 'migrating' });
    try {
      const root = await getAppRoot();
      const warnings: string[] = [];
      if (required?.session.status === 'v2-required') {
        warnings.push(...(await root.migration.migrateV2(APP_SESSION_ID, { recoverDevicePreferences })).warnings);
      }
      if ((required?.portable.requiredCount ?? 0) > 0) {
        warnings.push(...(await root.migration.migratePortableSaves({ recoverDevicePreferences })).warnings);
      }
      if (warnings.length) window.alert(`迁移完成：\n${warnings.join('\n')}`);
      window.location.reload();
    } catch (error) {
      setState({ phase: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-950 px-5 text-slate-100">
      <section className="w-full max-w-lg border border-cyan-400/30 bg-slate-900/95 p-6 shadow-2xl">
        <h1 className="text-xl font-semibold">剧情档案格式升级</h1>
        {required ? (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {required.session.status === 'v2-required'
                ? `检测到 V2 会话：${required.session.travelerName}，第 ${required.session.turnCount} 回合。`
                : '当前没有 V2 活跃会话。'}
              {required.portable.requiredCount > 0 ? `另有 ${required.portable.requiredCount} 个旧版便携存档。` : ''}
              升级后，旧结构不会在游戏运行时继续读取。
            </p>
            <label className="mt-4 flex items-start gap-3 border border-amber-300/25 bg-amber-300/5 p-3 text-sm leading-5 text-amber-100">
              <input
                type="checkbox"
                className="mt-1"
                checked={recoverDevicePreferences}
                onChange={(event) => setRecoverDevicePreferences(event.target.checked)}
              />
              <span>同时从 V2 恢复设备设置（会覆盖当前 API 配置、主题与设备策略；默认关闭）。</span>
            </label>
            <button type="button" className="mt-5 w-full bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400" onClick={() => void migrate()}>
              立即升级档案
            </button>
          </>
        ) : state.phase === 'failed' ? (
          <p className="mt-3 text-sm leading-6 text-rose-300">迁移已停止：{state.message}</p>
        ) : (
          <p className="mt-3 text-sm text-slate-300">{state.phase === 'migrating' ? '正在原子升级档案…' : '正在检查档案格式…'}</p>
        )}
      </section>
    </main>
  );
}
