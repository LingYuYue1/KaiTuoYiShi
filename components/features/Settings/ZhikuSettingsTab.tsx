import type { ReactNode } from 'react';
import { useState } from 'react';
import type { AI提供商, API设置, 游戏设置, 原著约束强度 } from '@/models/settings';
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

const constraintOptions: { value: 原著约束强度; label: string; desc: string }[] = [
  { value: 'loose', label: '宽松', desc: '只参考设定，不锁剧情' },
  { value: 'standard', label: '标准', desc: '关键设定不变，剧情可分支' },
  { value: 'strict', label: '严格', desc: '尽量贴近原著轨道' },
];

type ZhikuPatch = Partial<Omit<游戏设置['智库系统'], 'api'>> & {
  api?: Partial<游戏设置['智库系统']['api']>;
};

export function ZhikuSettingsTab({ settings, onChange, apiSettings }: Props) {
  const zhiku = settings.智库系统;
  const mainConfig = apiSettings.configs.find((c) => c.id === apiSettings.activeConfigId) ?? null;
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [fetchMessage, setFetchMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const patch = (partial: ZhikuPatch) => {
    onChange({
      ...settings,
      智库系统: {
        ...zhiku,
        ...partial,
        api: {
          ...zhiku.api,
          ...(partial.api ?? {}),
        },
      },
    });
  };

  const effective = {
    provider: zhiku.api.provider || mainConfig?.provider || 'openai_compatible',
    baseUrl: zhiku.api.baseUrl.trim() || mainConfig?.baseUrl || '',
    apiKey: zhiku.api.apiKey.trim() || mainConfig?.apiKey || '',
    model: zhiku.api.model.trim() || mainConfig?.model || '',
  };

  const handleFetchModels = async () => {
    if (!effective.baseUrl || !effective.apiKey) {
      setFetchMessage({
        kind: 'error',
        text: mainConfig
          ? '智库当前使用主 API 回退；如主 API 也未配置，请先补全。'
          : '请先填写智库 API 的 Base URL 和 API Key，或先配置主 API。',
      });
      return;
    }
    setLoadingModels(true);
    setFetchMessage(null);
    try {
      const tempConfig = {
        id: '__zhiku_override__',
        name: '智库',
        provider: effective.provider,
        baseUrl: effective.baseUrl,
        apiKey: effective.apiKey,
        model: effective.model,
        retryCount: zhiku.api.retryCount ?? mainConfig?.retryCount ?? 2,
        createdAt: 0,
        updatedAt: 0,
      };
      const list = await fetchModels(tempConfig);
      setModelOptions(list);
      setFetchMessage({ kind: 'info', text: '获取到 ' + list.length + ' 个模型' });
    } catch (err) {
      const text = (err as Error).message;
      setFetchMessage({ kind: 'error', text });
      window.alert(`智库获取模型失败：${text}`);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSave = async () => {
    setSaveMessage(null);
    try {
      await saveSetting('gameSettings', settings);
      setSavedFlash(true);
      setSaveMessage({ kind: 'info', text: '智库设置已保存。' });
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
          智库
        </div>
        这是原著资料中枢的独立配置。后续它会为周报、剧情和其他系统提供摘要、检索和约束，不直接替代主剧情模型。
      </div>

      <Field label="启用智库">
        <ToggleRow
          label="启用智库"
          desc="关闭后，资料终端和联动检索都不会参与生成。"
          checked={zhiku.enabled}
          onChange={(v) => patch({ enabled: v })}
        />
      </Field>

      <div className="grid gap-3 md:grid-cols-3">
        {constraintOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => patch({ 原著约束: opt.value })}
            className="px-3 py-3 text-left transition-all"
            style={{
              background:
                zhiku.原著约束 === opt.value
                  ? 'linear-gradient(135deg, rgba(245, 217, 122, 0.14), rgba(245, 217, 122, 0.03))'
                  : 'rgba(16, 14, 16, 0.45)',
              boxShadow:
                zhiku.原著约束 === opt.value
                  ? 'inset 0 0 0 1px rgba(245, 217, 122, 0.55)'
                  : 'inset 0 0 0 1px rgba(245, 217, 122, 0.16)',
              clipPath: smallClip,
            }}
          >
            <div className="font-serif text-sm tracking-[0.22em]" style={{ color: 'rgb(245, 217, 122)' }}>
              {opt.label}
            </div>
            <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(200, 188, 158, 0.7)' }}>
              {opt.desc}
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="联动上限">
          <input
            type="number"
            min={1}
            max={12}
            value={zhiku.maxRelatedEntries}
            onChange={(e) => patch({ maxRelatedEntries: Math.max(1, Number(e.target.value) || 1) })}
            className="kaituo-input w-full px-3 py-2 text-sm"
            style={{ clipPath: smallClip }}
          />
        </Field>

        <Field label="导入后自动摘要">
          <ToggleRow
            label="自动压缩条目"
            desc="导入原著资料后，自动生成更短的检索摘要。"
            checked={zhiku.autoSummarizeOnImport}
            onChange={(v) => patch({ autoSummarizeOnImport: v })}
          />
        </Field>
      </div>

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
            智库 API
          </span>
        </div>

        <Field label="服务商">
          <select
            value={zhiku.api.provider}
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
            value={zhiku.api.baseUrl}
            onChange={(e) => patch({ api: { baseUrl: e.target.value } })}
            placeholder={mainConfig?.baseUrl ? `留空则使用主 API：${mainConfig.baseUrl}` : 'https://...'}
            className="kaituo-input w-full px-3 py-2 text-sm font-mono"
            style={{ clipPath: smallClip }}
          />
        </Field>

        <Field label="API Key">
          <input
            type="password"
            value={zhiku.api.apiKey}
            onChange={(e) => patch({ api: { apiKey: e.target.value } })}
            placeholder={mainConfig?.apiKey ? '留空则使用主 API 的 Key' : 'sk-...'}
            className="kaituo-input w-full px-3 py-2 text-sm font-mono"
            style={{ clipPath: smallClip }}
          />
        </Field>

        <Field label="模型">
          <div className="flex gap-1.5">
            <input
              value={zhiku.api.model}
              onChange={(e) => patch({ api: { model: e.target.value } })}
              placeholder={mainConfig?.model ? `留空则使用主 API：${mainConfig.model}` : '模型 ID'}
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
            value={zhiku.api.retryCount ?? 2}
            onChange={(e) => patch({ api: { retryCount: Math.max(0, Number(e.target.value) || 0) } })}
            className="kaituo-input w-full px-3 py-2 text-sm"
            style={{ clipPath: smallClip }}
          />
        </Field>

        <div className="text-[11px] leading-relaxed" style={{ color: 'rgba(200, 188, 158, 0.68)' }}>
          这里建议使用便宜、稳定、偏检索型的模型。智库负责整理和召回，不追求长篇文采。
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
          {savedFlash ? '✓ 已 保存' : '◆ 保存 配置'}
        </button>
        {saveMessage && (
          <div
            className="px-3 py-2 text-xs"
            style={{
              color: saveMessage.kind === 'error' ? 'rgba(220, 120, 120, 0.9)' : 'rgba(160, 200, 160, 0.85)',
              background: saveMessage.kind === 'error' ? 'rgba(220, 120, 120, 0.06)' : 'rgba(120, 200, 140, 0.06)',
              boxShadow:
                saveMessage.kind === 'error'
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
    <label className="block">
      <div className="mb-1.5 block text-xs font-serif tracking-[0.2em]" style={{ color: 'rgba(245, 217, 122, 0.85)' }}>
        {label}
      </div>
      {children}
    </label>
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
        clipPath: smallClip,
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
