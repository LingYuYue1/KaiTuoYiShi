import { useState } from 'react';
import type { AI提供商, API设置, 游戏设置 } from '@/models/settings';
import { fetchModels } from '@/services/ai/apiTools';
import { saveSetting } from '@/services/dbService';

interface Props {
  settings: 游戏设置;
  onChange: (s: 游戏设置) => void;
  apiSettings: API设置;
}

const smallClip = 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';
const cardClip = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

const providerOptions: { value: AI提供商; label: string }[] = [
  { value: 'openai_compatible', label: 'OpenAI 兼容' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'claude', label: 'Claude' },
  { value: 'gemini', label: 'Gemini' },
];

export function StoryWeavingSettingsTab({ settings, onChange, apiSettings }: Props) {
  const story = settings.剧情编织系统;
  const mainConfig = apiSettings.configs.find((c) => c.id === apiSettings.activeConfigId) ?? apiSettings.configs[0] ?? null;
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  const patch = (patch: Partial<Omit<typeof story, 'api'>> & { api?: Partial<typeof story.api> }) => {
    onChange({
      ...settings,
      剧情编织系统: {
        ...story,
        ...patch,
        api: {
          ...story.api,
          ...(patch.api ?? {}),
        },
      },
    });
  };

  const effectiveApi = {
    provider: story.api.provider || mainConfig?.provider || 'openai_compatible',
    baseUrl: story.api.baseUrl.trim() || mainConfig?.baseUrl || '',
    apiKey: story.api.apiKey.trim() || mainConfig?.apiKey || '',
    model: story.api.model.trim() || mainConfig?.model || '',
  };

  const handleFetchModels = async () => {
    if (!effectiveApi.baseUrl || !effectiveApi.apiKey) {
      setMessage('请先填写剧情编织 API，或在 API 接口里配置主 API。');
      return;
    }
    setLoadingModels(true);
    setMessage('');
    try {
      const list = await fetchModels({
        id: '__story_weaving__',
        name: '剧情编织',
        provider: effectiveApi.provider,
        baseUrl: effectiveApi.baseUrl,
        apiKey: effectiveApi.apiKey,
        model: effectiveApi.model,
        createdAt: 0,
        updatedAt: 0,
      });
      setModelOptions(list);
      setMessage(`获取到 ${list.length} 个模型。`);
    } catch (err) {
      const text = (err as Error).message;
      setMessage(`获取失败：${text}`);
      window.alert(`剧情编织获取模型失败：${text}`);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSave = async () => {
    await saveSetting('gameSettings', settings);
    setSavedFlash(true);
    setMessage('剧情编织设置已保存。');
    window.setTimeout(() => setSavedFlash(false), 1600);
  };

  return (
    <div className="space-y-5">
      <div
        className="px-4 py-3 text-xs leading-relaxed"
        style={{
          color: 'rgba(var(--tj-text-secondary), 0.78)',
          background: 'rgba(var(--tj-accent-primary), 0.05)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
          clipPath: cardClip,
        }}
      >
        <div className="mb-1 font-serif text-[13px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.9)' }}>
          剧情编织
        </div>
        用于玩家导入 TXT 剧情，拆章并分解成“当前段 / 前一段 / 下一段”的运行时滑窗。它不负责世界演变；世界演变仍由星际和平周报承接。
      </div>

      <ToggleRow
        label="启用剧情编织注入"
        desc="关闭后，导入的剧情仍保留，但不会注入主剧情上下文。"
        checked={story.enabled}
        onChange={(v) => patch({ enabled: v })}
      />

      <ToggleRow
        label="使用当前滑窗"
        desc="开启后只注入当前分段附近内容，避免整篇 TXT 挤爆上下文。"
        checked={story.currentWindow}
        onChange={(v) => patch({ currentWindow: v })}
      />

      <Field label="默认每段章数">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={5}
            value={story.chaptersPerSegment}
            onChange={(e) => patch({ chaptersPerSegment: Number(e.target.value) })}
            className="flex-1 accent-[rgb(var(--tj-accent-primary))]"
          />
          <span className="min-w-12 text-right text-xs font-serif" style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}>
            {story.chaptersPerSegment} 章
          </span>
        </div>
      </Field>

      <div
        className="space-y-3 px-4 py-4"
        style={{
          background: 'rgba(var(--tj-bg-secondary), 0.45)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
          clipPath: cardClip,
        }}
      >
        <div className="flex items-center gap-2">
          <span className="h-4 w-[3px]" style={{ background: 'rgb(var(--tj-accent-primary))' }} />
          <span className="font-serif text-[13px] font-semibold tracking-[0.28em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
            分解 API
          </span>
        </div>

        <Field label="服务商">
          <select
            value={story.api.provider}
            onChange={(e) => patch({ api: { provider: e.target.value as AI提供商 } })}
            className="kaituo-input w-full px-3 py-2 text-sm"
            style={{ clipPath: smallClip }}
          >
            {providerOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </Field>

        <Field label="Base URL">
          <input
            value={story.api.baseUrl}
            onChange={(e) => patch({ api: { baseUrl: e.target.value } })}
            placeholder={mainConfig?.baseUrl ? `留空则使用主 API：${mainConfig.baseUrl}` : 'https://...'}
            className="kaituo-input w-full px-3 py-2 text-sm font-mono"
            style={{ clipPath: smallClip }}
          />
        </Field>

        <Field label="API Key">
          <input
            type="password"
            value={story.api.apiKey}
            onChange={(e) => patch({ api: { apiKey: e.target.value } })}
            placeholder={mainConfig?.apiKey ? '留空则使用主 API 的 Key' : 'sk-...'}
            className="kaituo-input w-full px-3 py-2 text-sm font-mono"
            style={{ clipPath: smallClip }}
          />
        </Field>

        <Field label="模型">
          <div className="flex gap-1.5">
            <input
              value={story.api.model}
              onChange={(e) => patch({ api: { model: e.target.value } })}
              placeholder={mainConfig?.model ? `留空则使用主 API：${mainConfig.model}` : '模型 ID'}
              className="kaituo-input flex-1 px-2.5 py-2 text-sm font-mono"
              style={{ clipPath: smallClip }}
            />
            <button
              onClick={handleFetchModels}
              disabled={loadingModels}
              className="px-3 py-2 text-xs font-serif tracking-wider disabled:opacity-50"
              style={{
                color: 'rgba(var(--tj-accent-primary), 0.85)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.35)',
                background: 'rgba(var(--tj-accent-primary), 0.05)',
                clipPath: smallClip,
              }}
            >
              {loadingModels ? '获取中...' : '获取列表'}
            </button>
          </div>
          {modelOptions.length > 0 && (
            <select
              value=""
              onChange={(e) => e.target.value && patch({ api: { model: e.target.value } })}
              className="kaituo-input mt-1.5 w-full px-2.5 py-1.5 text-xs"
              style={{ clipPath: smallClip }}
            >
              <option value="">从列表选择（{modelOptions.length}）</option>
              {modelOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </Field>

        <Field label="失败重试次数">
          <input
            type="number"
            min={0}
            max={5}
            value={story.api.retryCount ?? 2}
            onChange={(e) => patch({ api: { retryCount: Math.max(0, Number(e.target.value) || 0) } })}
            className="kaituo-input w-28 px-3 py-2 text-sm"
            style={{ clipPath: smallClip }}
          />
        </Field>
      </div>

      {message && <div className="text-xs" style={{ color: message.includes('失败') ? 'rgba(220,120,120,0.9)' : 'rgba(160,200,160,0.85)' }}>{message}</div>}
      <button
        onClick={handleSave}
        className="w-full px-4 py-3 font-serif text-sm font-bold tracking-[0.3em]"
        style={{
          color: savedFlash ? 'rgba(var(--tj-bg-primary), 0.95)' : 'rgba(var(--tj-accent-primary), 0.95)',
          background: savedFlash ? 'linear-gradient(90deg, #9ad8a0, rgb(var(--tj-accent-primary)))' : 'rgba(var(--tj-accent-primary), 0.06)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.35)',
          clipPath: cardClip,
        }}
      >
        {savedFlash ? '已保存' : '保存剧情编织设置'}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 font-serif text-[12px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.75)' }}>
        {label}
      </div>
      {children}
    </label>
  );
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3" style={{ background: 'rgba(var(--tj-accent-primary), 0.04)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)', clipPath: cardClip }}>
      <div>
        <div className="font-serif text-sm tracking-[0.16em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.9)' }}>{label}</div>
        <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(190, 178, 148, 0.72)' }}>{desc}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="relative h-7 w-14 shrink-0 transition-all"
        style={{
          borderRadius: 999,
          background: checked ? 'rgba(var(--tj-accent-primary), 0.28)' : 'rgba(120, 110, 95, 0.22)',
          boxShadow: `inset 0 0 0 1px ${checked ? 'rgba(var(--tj-accent-primary), 0.55)' : 'rgba(var(--tj-text-secondary), 0.28)'}`,
        }}
      >
        <span
          className="absolute top-1 h-5 w-5 transition-all"
          style={{
            left: checked ? 'calc(100% - 24px)' : '4px',
            borderRadius: 999,
            background: checked ? 'rgb(var(--tj-accent-primary))' : 'rgba(180, 170, 145, 0.8)',
            boxShadow: checked ? '0 0 12px rgba(var(--tj-accent-primary), 0.45)' : 'none',
          }}
        />
      </button>
    </div>
  );
}
