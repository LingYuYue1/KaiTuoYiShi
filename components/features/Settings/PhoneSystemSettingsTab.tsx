import { useState } from 'react';
import type { AI提供商, API配置项, API设置, 游戏设置 } from '@/models/settings';
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

export function PhoneSystemSettingsTab({ settings, onChange, apiSettings }: Props) {
  const phone = settings.手机系统;
  const mainConfig = apiSettings.configs.find((c) => c.id === apiSettings.activeConfigId) ?? apiSettings.configs[0] ?? null;
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [fetchMessage, setFetchMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  type PhonePatch = Partial<Omit<typeof phone, 'api'>> & { api?: Partial<typeof phone.api> };

  const patch = (patch: PhonePatch) => {
    onChange({
      ...settings,
      手机系统: {
        ...phone,
        ...patch,
        api: {
          ...phone.api,
          ...(patch.api ?? {}),
        },
      },
    });
  };

  const effectiveApi = {
    provider: phone.api.provider || mainConfig?.provider || 'openai_compatible',
    baseUrl: phone.api.baseUrl.trim() || mainConfig?.baseUrl || '',
    apiKey: phone.api.apiKey.trim() || mainConfig?.apiKey || '',
    model: phone.api.model.trim() || mainConfig?.model || '',
  };

  const handleFetchModels = async () => {
    if (!effectiveApi.baseUrl || !effectiveApi.apiKey) {
      setFetchMessage({ kind: 'error', text: '请填写手机 API，或先配置主 API 作为回退。' });
      return;
    }
    setLoadingModels(true);
    setFetchMessage(null);
    try {
      const tempConfig: API配置项 = {
        id: '__phone_override__',
        name: '手机系统',
        provider: effectiveApi.provider,
        baseUrl: effectiveApi.baseUrl,
        apiKey: effectiveApi.apiKey,
        model: effectiveApi.model,
        retryCount: phone.api.retryCount ?? mainConfig?.retryCount ?? 2,
        createdAt: 0,
        updatedAt: 0,
      };
      const list = await fetchModels(tempConfig);
      setModelOptions(list);
      setFetchMessage({ kind: 'info', text: `获取到 ${list.length} 个模型` });
    } catch (err) {
      const text = (err as Error).message;
      setFetchMessage({ kind: 'error', text });
      window.alert(`手机系统获取模型失败：${text}`);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSave = async () => {
    setSaveMessage(null);
    try {
      await saveSetting('gameSettings', settings);
      setSavedFlash(true);
      setSaveMessage({ kind: 'info', text: '手机系统设置已保存。' });
      window.setTimeout(() => setSavedFlash(false), 1800);
    } catch (err) {
      setSavedFlash(false);
      setSaveMessage({ kind: 'error', text: `保存失败：${(err as Error).message}` });
    }
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
          星际通讯终端
        </div>
        手机系统独立于主剧情，用于私聊、群聊和主动来信。它会读取主剧情记忆与 NPC 档案，但用单独 API 生成通讯内容。
      </div>

      <ToggleRow
        label="启用手机系统"
        desc="关闭后，左侧手机入口仍可查看记录，但不会生成新通讯。"
        checked={phone.enabled}
        onChange={(v) => patch({ enabled: v })}
      />

      <ToggleRow
        label="自动生成主动来信种子"
        desc="开启后，变量模型可根据主剧情事件写入待处理来信。"
        checked={phone.autoGenerateSeeds}
        onChange={(v) => patch({ autoGenerateSeeds: v })}
      />

      <Field label="每回合最多来信种子">
        <input
          type="number"
          min={0}
          max={5}
          value={phone.maxSeedsPerTurn}
          onChange={(e) => patch({ maxSeedsPerTurn: Number(e.target.value) })}
          className="kaituo-input w-full px-3 py-2 text-sm"
          style={{ clipPath: smallClip }}
        />
      </Field>

      <Field label="同一联系人冷却回合">
        <input
          type="number"
          min={0}
          max={12}
          value={phone.contactCooldownTurns}
          onChange={(e) => patch({ contactCooldownTurns: Number(e.target.value) })}
          className="kaituo-input w-full px-3 py-2 text-sm"
          style={{ clipPath: smallClip }}
        />
      </Field>

      <Field label="同一群聊冷却回合">
        <input
          type="number"
          min={0}
          max={12}
          value={phone.groupCooldownTurns}
          onChange={(e) => patch({ groupCooldownTurns: Number(e.target.value) })}
          className="kaituo-input w-full px-3 py-2 text-sm"
          style={{ clipPath: smallClip }}
        />
      </Field>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="私聊本地压缩阈值">
          <input
            type="number"
            min={3}
            max={30}
            value={phone.privateArchiveThreshold}
            onChange={(e) => patch({ privateArchiveThreshold: Number(e.target.value) })}
            className="kaituo-input w-full px-3 py-2 text-sm"
            style={{ clipPath: smallClip }}
          />
        </Field>

        <Field label="群聊本地压缩阈值">
          <input
            type="number"
            min={6}
            max={40}
            value={phone.groupArchiveThreshold}
            onChange={(e) => patch({ groupArchiveThreshold: Number(e.target.value) })}
            className="kaituo-input w-full px-3 py-2 text-sm"
            style={{ clipPath: smallClip }}
          />
        </Field>
      </div>

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
            手机 API
          </span>
        </div>

        <Field label="服务商">
          <select
            value={phone.api.provider}
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
            value={phone.api.baseUrl}
            onChange={(e) => patch({ api: { baseUrl: e.target.value } })}
            placeholder={mainConfig?.baseUrl ? `留空则使用主 API：${mainConfig.baseUrl}` : 'https://...'}
            className="kaituo-input w-full px-3 py-2 text-sm font-mono"
            style={{ clipPath: smallClip }}
          />
        </Field>

        <Field label="API Key">
          <input
            type="password"
            value={phone.api.apiKey}
            onChange={(e) => patch({ api: { apiKey: e.target.value } })}
            placeholder={mainConfig?.apiKey ? '留空则使用主 API 的 Key' : 'sk-...'}
            className="kaituo-input w-full px-3 py-2 text-sm font-mono"
            style={{ clipPath: smallClip }}
          />
        </Field>

        <Field label="模型">
          <div className="flex gap-1.5">
            <input
              value={phone.api.model}
              onChange={(e) => patch({ api: { model: e.target.value } })}
              placeholder={mainConfig?.model ? `留空则使用主 API：${mainConfig.model}` : '模型 ID'}
              className="kaituo-input flex-1 px-2.5 py-2 text-sm font-mono"
              style={{ clipPath: smallClip }}
            />
            <button
              type="button"
              onClick={handleFetchModels}
              disabled={loadingModels}
              className="px-3 py-2 text-xs font-serif tracking-wider transition-all disabled:opacity-50"
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
            value={phone.api.retryCount ?? 2}
            onChange={(e) => patch({ api: { retryCount: Math.max(0, Number(e.target.value) || 0) } })}
            className="kaituo-input w-full px-3 py-2 text-sm"
            style={{ clipPath: smallClip }}
          />
        </Field>

        <div className="text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
          字段留空时会回退主 API，方便用主模型先跑通；后续可以改成更便宜的通讯模型。
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          className="w-full py-3 text-sm font-serif tracking-[0.4em] transition-all hover:opacity-90"
          style={{
            background: savedFlash
              ? 'linear-gradient(135deg, rgba(140, 220, 160, 0.95), rgba(100, 180, 130, 0.95))'
              : 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(212, 177, 90, 0.95))',
            color: 'rgb(var(--tj-on-accent))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5), 0 0 18px rgba(var(--tj-accent-primary), 0.22)',
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 font-serif text-xs tracking-[0.22em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.82)' }}>
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
    <label
      className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3"
      style={{
        background: 'rgba(var(--tj-bg-secondary), 0.45)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
        clipPath: smallClip,
      }}
    >
      <span>
        <span className="block font-serif text-sm tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.9)' }}>
          {label}
        </span>
        <span className="mt-0.5 block text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
          {desc}
        </span>
      </span>
      <span
        className="relative h-6 w-11 flex-shrink-0 transition-all"
        style={{
          background: checked
            ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.92), rgba(212,177,90,0.92))'
            : 'rgba(80, 72, 58, 0.45)',
          boxShadow: checked
            ? 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.5), 0 0 10px rgba(var(--tj-accent-primary),0.2)'
            : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.22)',
          borderRadius: 999,
        }}
      >
        <span
          className="absolute top-1 h-4 w-4 transition-transform"
          style={{
            left: 4,
            transform: checked ? 'translateX(20px)' : 'translateX(0)',
            background: checked ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.82)',
            borderRadius: 999,
            boxShadow: '0 1px 4px rgba(0,0,0,0.45)',
          }}
        />
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
    </label>
  );
}
