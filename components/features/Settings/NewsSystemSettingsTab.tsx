import type { ReactNode } from 'react';
import { useState } from 'react';
import type { AI提供商, API设置, 游戏设置, 新闻API覆盖 } from '@/models/settings';
import { fetchModels } from '@/services/ai/apiTools';
import { saveSetting } from '@/services/dbService';

interface Props {
  settings: 游戏设置;
  onChange: (s: 游戏设置) => void;
  apiSettings: API设置;
}

const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';
const cardClip =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

const providerOptions: { value: AI提供商; label: string }[] = [
  { value: 'openai_compatible', label: 'OpenAI 兼容' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'claude', label: 'Claude' },
  { value: 'gemini', label: 'Gemini' },
];

export function NewsSystemSettingsTab({ settings, onChange, apiSettings }: Props) {
  const news = settings.新闻系统;
  const mainConfig = apiSettings.configs.find((c) => c.id === apiSettings.activeConfigId) ?? null;
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [fetchMessage, setFetchMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  type NewsPatch = Partial<Omit<typeof news, 'api'>> & {
    api?: Partial<typeof news.api>;
  };

  const patch = (patch: NewsPatch) => {
    onChange({
      ...settings,
      新闻系统: {
        ...news,
        ...patch,
        api: {
          ...news.api,
          ...(patch.api ?? {}),
        },
      },
    });
  };

  const effectiveApi = {
    provider: news.api.provider || mainConfig?.provider || 'openai_compatible',
    baseUrl: news.api.baseUrl.trim() || mainConfig?.baseUrl || '',
    apiKey: news.api.apiKey.trim() || mainConfig?.apiKey || '',
    model: news.api.model.trim() || mainConfig?.model || '',
  };

  const handleFetchModels = async () => {
    if (!effectiveApi.baseUrl || !effectiveApi.apiKey) {
      setFetchMessage({
        kind: 'error',
        text: mainConfig
          ? '新闻系统当前为空，将自动回退主 API。若主 API 也未配置，请先到「API 接口」补全。'
          : '请先填写新闻系统的 Base URL 和 API Key，或先配置主 API。',
      });
      return;
    }
    setLoadingModels(true);
    setFetchMessage(null);
    try {
      const tempConfig = {
        id: '__news_override__',
        name: '星际和平周报',
        provider: effectiveApi.provider,
        baseUrl: effectiveApi.baseUrl,
        apiKey: effectiveApi.apiKey,
        model: effectiveApi.model,
        retryCount: news.api.retryCount ?? mainConfig?.retryCount ?? 2,
        createdAt: 0,
        updatedAt: 0,
      };
      const list = await fetchModels(tempConfig);
      setModelOptions(list);
      setFetchMessage({ kind: 'info', text: '获取到 ' + list.length + ' 个模型' });
    } catch (err) {
      const text = (err as Error).message;
      setFetchMessage({ kind: 'error', text });
      window.alert(`星际和平周报获取模型失败：${text}`);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSave = async () => {
    setSaveMessage(null);
    try {
      await saveSetting('gameSettings', settings);
      setSavedFlash(true);
      setSaveMessage({ kind: 'info', text: '星际和平周报设置已保存。' });
      window.setTimeout(() => setSavedFlash(false), 1800);
    } catch (e) {
      setSavedFlash(false);
      setSaveMessage({ kind: 'error', text: `保存失败：${(e as Error).message}` });
    }
  };

  return (
    <div className="space-y-5">
      <div
        className="px-4 py-3 text-xs leading-relaxed"
        style={{
          color: 'rgba(200, 188, 158, 0.78)',
          background: 'rgba(245, 217, 122, 0.05)',
          boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.15)',
          clipPath: cardClip,
        }}
      >
        <div className="mb-1 font-serif text-[13px] tracking-[0.18em]" style={{ color: 'rgba(245, 217, 122, 0.9)' }}>
          星际和平周报
        </div>
        这是一个独立于变量系统的新闻演进引擎。它会读取每回合的正文、世界状态和旧新闻，自动生成「即将发生 / 进行中 / 已完成 / 归档新闻」四个栏位的条目。
      </div>

      <ToggleRow
        label="启用星际和平周报"
        desc="关闭后，本系统不会在每回合自动生成新闻。"
        checked={news.enabled}
        onChange={(v) => patch({ enabled: v })}
      />

      <ToggleRow
        label="按间隔自动生成"
        desc="开启后，主流程结算完成时会在设定间隔回合自动调用新闻 AI。"
        checked={news.autoGenerate}
        onChange={(v) => patch({ autoGenerate: v })}
      />

      <Field label="✓ 每回合最大新增条数">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={news.maxNewEntriesPerTurn}
            onChange={(e) => patch({ maxNewEntriesPerTurn: Number(e.target.value) })}
            className="flex-1 accent-[#f5d97a]"
          />
          <span className="min-w-12 text-right text-xs font-serif tracking-wider" style={{ color: 'rgba(245, 217, 122, 0.85)' }}>
            {news.maxNewEntriesPerTurn} 条
          </span>
        </div>
      </Field>

      <Field label="✓ 触发间隔（5-10回合）">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={5}
            max={10}
            step={1}
            value={news.generateIntervalTurns}
            onChange={(e) => patch({ generateIntervalTurns: Number(e.target.value) })}
            className="flex-1 accent-[#f5d97a]"
          />
          <span className="min-w-12 text-right text-xs font-serif tracking-wider" style={{ color: 'rgba(245, 217, 122, 0.85)' }}>
            {news.generateIntervalTurns} 回合
          </span>
        </div>
      </Field>

      <div
        className="px-4 py-4 space-y-3"
        style={{
          background: 'rgba(16, 14, 16, 0.45)',
          boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.18)',
          clipPath: cardClip,
        }}
      >
        <div className="flex items-center gap-2">
          <span className="h-4 w-[3px]" style={{ background: '#f5d97a' }} />
          <span className="font-serif text-[13px] font-semibold tracking-[0.28em]" style={{ color: '#f5d97a' }}>
            新闻 API
          </span>
        </div>

        <Field label="服务商">
          <select
            value={news.api.provider}
            onChange={(e) => patch({ api: { provider: e.target.value as AI提供商 } })}
            className="kaituo-input w-full px-3 py-2 text-sm"
            style={{ clipPath: smallClip }}
          >
            {providerOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Base URL">
          <input
            value={news.api.baseUrl}
            onChange={(e) => patch({ api: { baseUrl: e.target.value } })}
            placeholder={mainConfig?.baseUrl ? '留空则使用主 API：' + mainConfig.baseUrl : 'https://...'}
            className="kaituo-input w-full px-3 py-2 text-sm font-mono"
            style={{ clipPath: smallClip }}
          />
        </Field>

        <Field label="API Key">
          <input
            type="password"
            value={news.api.apiKey}
            onChange={(e) => patch({ api: { apiKey: e.target.value } })}
            placeholder={mainConfig?.apiKey ? '留空则使用主 API 的 Key' : 'sk-...'}
            className="kaituo-input w-full px-3 py-2 text-sm font-mono"
            style={{ clipPath: smallClip }}
          />
        </Field>

        <Field label="模型">
          <div className="flex gap-1.5">
            <input
              value={news.api.model}
              onChange={(e) => patch({ api: { model: e.target.value } })}
              placeholder={mainConfig?.model ? '留空则使用主 API：' + mainConfig.model : '模型 ID'}
              className="kaituo-input flex-1 px-2.5 py-2 text-sm font-mono"
              style={{ clipPath: smallClip }}
            />
            <button
              onClick={handleFetchModels}
              disabled={loadingModels}
              className="px-3 py-2 text-xs font-serif tracking-wider transition-all disabled:opacity-50"
              style={{
                color: 'rgba(245, 217, 122, 0.85)',
                boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.35)',
                background: 'rgba(245, 217, 122, 0.05)',
                clipPath: smallClip,
              }}
            >
              {loadingModels ? '获取中…' : '获取列表'}
            </button>
          </div>
          {modelOptions.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) patch({ api: { model: e.target.value } });
              }}
              className="kaituo-input mt-1.5 w-full px-2.5 py-1.5 text-xs"
              style={{ clipPath: smallClip }}
            >
              <option value="">从列表选择（{modelOptions.length}）</option>
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
          {fetchMessage && (
            <div
              className="mt-1.5 text-[11px]"
              style={{
                color: fetchMessage.kind === 'error' ? 'rgba(220, 120, 120, 0.9)' : 'rgba(160, 200, 160, 0.8)',
              }}
            >
              {fetchMessage.text}
            </div>
          )}
        </Field>

        <Field label="失败重试次数">
          <input
            type="number"
            min={0}
            max={5}
            value={news.api.retryCount ?? 2}
            onChange={(e) => patch({ api: { retryCount: Math.max(0, Number(e.target.value) || 0) } })}
            className="kaituo-input w-full px-3 py-2 text-sm"
            style={{ clipPath: smallClip }}
          />
        </Field>

        <div className="text-[11px] leading-relaxed" style={{ color: 'rgba(200, 188, 158, 0.68)' }}>
          这套配置不会回退到变量系统，也不会借用变量系统的 API 覆盖。留空时，新闻系统会直接跳过生成。
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-2 pt-1">
        <button
          onClick={handleSave}
          className="w-full py-3 text-sm font-serif tracking-[0.4em] transition-all hover:opacity-90"
          style={{
            background: savedFlash
              ? 'linear-gradient(135deg, rgba(140, 220, 160, 0.95), rgba(100, 180, 130, 0.95))'
              : 'linear-gradient(135deg, rgba(245, 217, 122, 0.95), rgba(212, 177, 90, 0.95))',
            color: '#1a1325',
            boxShadow: savedFlash
              ? 'inset 0 0 0 1px rgba(220, 255, 230, 0.5), 0 0 18px rgba(140, 220, 160, 0.35)'
              : 'inset 0 0 0 1px rgba(255, 245, 200, 0.5), 0 0 18px rgba(245, 217, 122, 0.22)',
            clipPath: cardClip,
          }}
        >
          {savedFlash ? '✓ 已 保 存' : '◆ 保 存 配 置'}
        </button>
        {saveMessage && (
          <div
            className="px-3 py-2 text-xs"
            style={{
              color: saveMessage.kind === 'error' ? 'rgba(220, 120, 120, 0.9)' : 'rgba(160, 200, 160, 0.85)',
              background: saveMessage.kind === 'error' ? 'rgba(220, 120, 120, 0.06)' : 'rgba(120, 200, 140, 0.06)',
              boxShadow: saveMessage.kind === 'error'
                ? 'inset 0 0 0 1px rgba(220, 120, 120, 0.25)'
                : 'inset 0 0 0 1px rgba(120, 200, 140, 0.25)',
              clipPath: smallClip,
            }}
          >
            {saveMessage.text}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-serif tracking-[0.2em]" style={{ color: 'rgba(245, 217, 122, 0.85)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2"
      style={{
        background: 'rgba(16, 14, 16, 0.45)',
        boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.15)',
        clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
      }}
    >
      <div className="min-w-0 mr-3">
        <div className="font-serif font-bold text-sm tracking-wider" style={{ color: 'rgb(var(--tj-text-primary))' }}>
          {label}
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'rgba(200, 188, 158, 0.65)' }}>
          {desc}
        </div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="relative h-6 w-11 flex-shrink-0 transition-all"
        style={{
          background: checked
            ? 'linear-gradient(135deg, rgba(245, 217, 122, 0.95), rgba(212, 177, 90, 0.95))'
            : 'rgba(60, 55, 40, 0.7)',
          boxShadow: checked
            ? 'inset 0 0 0 1px rgba(255, 245, 200, 0.5), 0 0 10px rgba(245, 217, 122, 0.25)'
            : 'inset 0 0 0 1px rgba(245, 217, 122, 0.2)',
          clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
        }}
      >
        <div
          className="absolute top-0.5 h-5 w-5 transition-transform"
          style={{
            left: checked ? 'calc(100% - 1.375rem)' : '0.125rem',
            background: checked ? '#1a1325' : 'rgba(220, 200, 160, 0.85)',
            clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
          }}
        />
      </button>
    </div>
  );
}
