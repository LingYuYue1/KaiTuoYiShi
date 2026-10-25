// 世界观管理面板：展示全部世界观，支持创建 / 重命名 / 删除自建世界，以及切换当前世界。
// 用于首页「世界」入口与设置页「世界观」页签。切换世界后由调用方负责重新加载页面。

import { useEffect, useState } from 'react';
import type { 世界档案 } from '@/models/worldProfile';
import {
  createWorld,
  deleteWorld,
  loadWorldProfiles,
  saveActiveWorldId,
  updateWorld,
} from '@/services/worldProfileService';

interface WorldManagerPanelProps {
  activeWorldId: string;
  /** 切换世界前的钩子（如先保存当前回合），随后执行切换与页面重载。 */
  onEnterWorld?: (worldId: string) => Promise<void> | void;
}

const shellClip =
  'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)';

export function WorldManagerPanel({ activeWorldId, onEnterWorld }: WorldManagerPanelProps) {
  const [profiles, setProfiles] = useState<世界档案[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await loadWorldProfiles();
        if (!cancelled) setProfiles(list);
      } catch (err) {
        console.warn('[world] 世界档案加载失败:', err);
        if (!cancelled) setError('世界档案加载失败，请刷新页面重试。');
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      setProfiles(await loadWorldProfiles());
    } catch (err) {
      console.warn('[world] 操作失败:', err);
      setError(err instanceof Error ? err.message : '操作失败，请重试。');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    void run(async () => {
      await createWorld({ name, description: newDescription });
      setNewName('');
      setNewDescription('');
      setShowCreate(false);
    });
  };

  const handleUpdate = (worldId: string) => {
    void run(async () => {
      await updateWorld(worldId, { name: editName, description: editDescription });
      setEditingId(null);
    });
  };

  const handleDelete = (worldId: string) => {
    void run(async () => {
      const ok = await deleteWorld(worldId);
      if (!ok) setError('该世界无法删除（内置世界不可删除）。');
      setConfirmDeleteId(null);
      // 删除的是当前世界：存储层已把 activeWorldId 重置为默认世界，重载页面让全局状态回到默认世界。
      if (ok && worldId === activeWorldId) {
        window.location.reload();
      }
    });
  };

  const handleEnter = (worldId: string) => {
    if (worldId === activeWorldId) return;
    void (async () => {
      setBusy(true);
      try {
        await onEnterWorld?.(worldId);
        await saveActiveWorldId(worldId);
        window.location.reload();
      } catch (err) {
        console.warn('[world] 切换世界失败:', err);
        setError('切换世界失败，请重试。');
        setBusy(false);
      }
    })();
  };

  const activeProfile = profiles.find((p) => p.id === activeWorldId);

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-lg tracking-[0.14em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
            世界观
          </h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.75)' }}>
            每个世界拥有独立的智库、世界书、剧情编织与存档。切换世界需重新加载页面。
            {activeProfile ? ` 当前：${activeProfile.name}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="shrink-0 px-4 py-2 font-serif text-xs tracking-[0.16em] transition-all hover:opacity-90 disabled:opacity-50"
          style={{
            color: 'rgba(var(--tj-accent-primary), 0.95)',
            background: 'rgba(var(--tj-bg-primary), 0.32)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.5)',
            clipPath: shellClip,
          }}
          disabled={busy}
        >
          {showCreate ? '收起' : '＋ 创建新世界'}
        </button>
      </div>

      {error ? (
        <p className="text-xs" style={{ color: 'rgba(var(--tj-danger, 220,80,80), 1)' }}>{error}</p>
      ) : null}

      {showCreate ? (
        <div
          className="flex flex-col gap-3 p-4"
          style={{
            background: 'rgba(var(--tj-bg-primary), 0.36)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.35)',
            clipPath: shellClip,
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="世界名称（必填，如：我的原创大陆）"
            maxLength={64}
            className="w-full bg-transparent px-3 py-2 font-serif text-sm tracking-[0.1em] outline-none"
            style={{ color: 'rgb(var(--tj-text-primary))', boxShadow: 'inset 0 -1px 0 rgba(var(--tj-accent-primary), 0.4)' }}
          />
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="世界简介（可选）：背景设定、时代、基调……"
            maxLength={512}
            rows={3}
            className="w-full resize-none bg-transparent px-3 py-2 text-xs leading-relaxed outline-none"
            style={{ color: 'rgba(var(--tj-text-secondary), 0.9)', boxShadow: 'inset 0 -1px 0 rgba(var(--tj-accent-primary), 0.3)' }}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-1.5 font-serif text-xs tracking-[0.14em] hover:opacity-80"
              style={{ color: 'rgba(var(--tj-text-secondary), 0.9)' }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim() || busy}
              className="px-5 py-1.5 font-serif text-xs tracking-[0.16em] transition-all hover:opacity-90 disabled:opacity-40"
              style={{
                color: 'rgba(var(--tj-bg-primary), 0.95)',
                background: 'rgb(var(--tj-accent-primary))',
                clipPath: shellClip,
              }}
            >
              创建
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto pr-1">
        {!loaded ? (
          <p className="py-6 text-center text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}>
            世界档案载入中……
          </p>
        ) : profiles.length === 0 ? (
          <p className="py-6 text-center text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}>
            暂无世界，点击右上角创建第一个世界。
          </p>
        ) : (
          profiles.map((world) => {
            const isActive = world.id === activeWorldId;
            const isEditing = editingId === world.id;
            return (
              <div
                key={world.id}
                className="flex flex-col gap-2 p-3.5"
                style={{
                  background: 'rgba(var(--tj-bg-primary), 0.3)',
                  boxShadow: `inset 0 0 0 1px ${isActive ? 'rgba(var(--tj-accent-primary), 0.75)' : 'rgba(var(--tj-accent-primary), 0.28)'}`,
                  clipPath: shellClip,
                }}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background: isActive ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-secondary), 0.5)',
                      boxShadow: isActive ? '0 0 10px rgba(var(--tj-accent-primary), 0.8)' : 'none',
                    }}
                  />
                  {isEditing ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      maxLength={64}
                      className="min-w-0 flex-1 bg-transparent px-2 py-1 font-serif text-sm tracking-[0.1em] outline-none"
                      style={{ color: 'rgb(var(--tj-text-primary))', boxShadow: 'inset 0 -1px 0 rgba(var(--tj-accent-primary), 0.45)' }}
                    />
                  ) : (
                    <span
                      className="min-w-0 flex-1 truncate font-serif text-sm tracking-[0.12em]"
                      style={{ color: isActive ? 'rgb(var(--tj-text-primary))' : 'rgba(var(--tj-text-primary), 0.85)' }}
                    >
                      {world.name}
                    </span>
                  )}
                  {world.builtin ? (
                    <span
                      className="shrink-0 px-2 py-0.5 text-[10px] tracking-[0.14em]"
                      style={{
                        color: 'rgba(var(--tj-accent-primary), 0.9)',
                        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.4)',
                      }}
                    >
                      内置
                    </span>
                  ) : null}
                  {isActive ? (
                    <span
                      className="shrink-0 px-2 py-0.5 text-[10px] tracking-[0.14em]"
                      style={{
                        color: 'rgba(var(--tj-bg-primary), 0.95)',
                        background: 'rgb(var(--tj-accent-primary))',
                      }}
                    >
                      当前世界
                    </span>
                  ) : null}
                </div>

                {isEditing ? (
                  <>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      maxLength={512}
                      rows={2}
                      className="w-full resize-none bg-transparent px-2 py-1 text-xs leading-relaxed outline-none"
                      style={{ color: 'rgba(var(--tj-text-secondary), 0.9)', boxShadow: 'inset 0 -1px 0 rgba(var(--tj-accent-primary), 0.3)' }}
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1 text-[11px] tracking-[0.12em] hover:opacity-80"
                        style={{ color: 'rgba(var(--tj-text-secondary), 0.9)' }}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdate(world.id)}
                        disabled={!editName.trim() || busy}
                        className="px-4 py-1 text-[11px] tracking-[0.14em] transition-all hover:opacity-90 disabled:opacity-40"
                        style={{ color: 'rgba(var(--tj-accent-primary), 0.95)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.5)' }}
                      >
                        保存修改
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {world.description ? (
                      <p className="px-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.75)' }}>
                        {world.description}
                      </p>
                    ) : null}
                    <div className="flex items-center justify-end gap-2">
                      {!isActive ? (
                        <button
                          type="button"
                          onClick={() => handleEnter(world.id)}
                          disabled={busy}
                          className="px-4 py-1.5 font-serif text-[11px] tracking-[0.14em] transition-all hover:opacity-90 disabled:opacity-40"
                          style={{
                            color: 'rgba(var(--tj-accent-primary), 0.95)',
                            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.55)',
                            clipPath: shellClip,
                          }}
                        >
                          进入此世界
                        </button>
                      ) : null}
                      {!world.builtin ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(world.id);
                              setEditName(world.name);
                              setEditDescription(world.description);
                            }}
                            disabled={busy}
                            className="px-3 py-1.5 text-[11px] tracking-[0.12em] hover:opacity-80 disabled:opacity-40"
                            style={{ color: 'rgba(var(--tj-text-secondary), 0.9)' }}
                          >
                            编辑
                          </button>
                          {confirmDeleteId === world.id ? (
                            <span className="flex items-center gap-2 text-[11px]">
                              <span style={{ color: 'rgba(var(--tj-text-secondary), 0.85)' }}>删除该世界及其全部存档？</span>
                              <button
                                type="button"
                                onClick={() => handleDelete(world.id)}
                                disabled={busy}
                                className="px-3 py-1 transition-all hover:opacity-85 disabled:opacity-40"
                                style={{ color: 'rgb(var(--tj-text-primary))', background: 'rgba(var(--tj-danger, 220,80,80), 0.85)' }}
                              >
                                确认删除
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 hover:opacity-80"
                                style={{ color: 'rgba(var(--tj-text-secondary), 0.9)' }}
                              >
                                取消
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(world.id)}
                              disabled={busy}
                              className="px-3 py-1.5 text-[11px] tracking-[0.12em] hover:opacity-80 disabled:opacity-40"
                              style={{ color: 'rgba(var(--tj-danger, 220,80,80), 0.9)' }}
                            >
                              删除
                            </button>
                          )}
                        </>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}