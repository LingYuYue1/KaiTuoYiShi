import { useState } from 'react';
import type { AI提供商, API配置项, API设置, 游戏设置, 变量API覆盖 } from '@/models/settings';
import { fetchModels } from '@/services/ai/apiTools';
import { saveSetting } from '@/services/dbService';

interface Props {
  gameSettings: 游戏设置;
  onGameSettingsChange: (s: 游戏设置) => void;
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

export function VariableUpdateTab({
  gameSettings,
  onGameSettingsChange,
  apiSettings,
}: Props) {
  const enabled = gameSettings.enableVariableUpdate;
  const override = gameSettings.variableApi;
  const mainConfig = apiSettings.configs.find((c) => c.id === apiSettings.activeConfigId) ?? null;

  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [fetchMessage, setFetchMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const patchOverride = (patch: Partial<变量API覆盖>) => {
    onGameSettingsChange({
      ...gameSettings,
      variableApi: { ...override, ...patch },
    });
  };

  // 计算「实际生效」的字段（用于回退提示和拉取模型）。
  const effective = {
    provider: override.provider || mainConfig?.provider || 'openai_compatible',
    baseUrl: override.baseUrl.trim() || mainConfig?.baseUrl || '',
    apiKey: override.apiKey.trim() || mainConfig?.apiKey || '',
    model: override.model.trim() || mainConfig?.model || '',
  };

  const usingMain = {
    provider: !override.provider,
    baseUrl: !override.baseUrl.trim(),
    apiKey: !override.apiKey.trim(),
    model: !override.model.trim(),
  };

  const noMainHint = !mainConfig
    ? '主 API 也没有可用配置 — 请先到「API 接口」配置至少一条'
    : null;

  const handleFetchModels = async () => {
    if (!effective.baseUrl || !effective.apiKey) {
      setFetchMessage({ kind: 'error', text: '缺少 Base URL 或 API Key（含主 API 回退后仍为空）' });
      return;
    }
    setLoadingModels(true);
    setFetchMessage(null);
    try {
      // 构造一个临时 config 给 fetchModels 用
      const tempConfig: API配置项 = {
        id: '__variable_override__',
        name: '变量模型',
        provider: effective.provider as AI提供商,
        baseUrl: effective.baseUrl,
        apiKey: effective.apiKey,
        model: effective.model,
        createdAt: 0,
        updatedAt: 0,
      };
      const list = await fetchModels(tempConfig);
      setModelOptions(list);
      setFetchMessage({ kind: 'info', text: `获取到 ${list.length} 个模型` });
    } catch (e) {
      setFetchMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSave = async () => {
    setSaveMessage(null);
    try {
      await saveSetting('gameSettings', gameSettings);
      setSavedFlash(true);
      setSaveMessage({ kind: 'info', text: '变量更新设置已保存。' });
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
          color: 'rgba(var(--tj-text-secondary), 0.78)',
          background: 'rgba(var(--tj-accent-primary), 0.05)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
          clipPath: cardClip,
        }}
      >
        <div className="font-serif tracking-wider text-[13px] mb-1" style={{ color: 'rgba(var(--tj-accent-primary), 0.9)' }}>
          ◉ 变量自动更新
        </div>
        开启后，每回合主模型回完正文，会再调用一次「变量模型」专门分析正文，把背包、伙伴好感、手机来信、命途进度等变化以命令形式落到对应面板。
        让讲故事的 AI 和算账的 AI 分工，既能写得流畅又能改得准。
      </div>

      <ToggleRow
        label="启用变量自动更新"
        desc="正文回完后追加一次变量模型调用；未启用时所有面板数据需手动改"
        checked={enabled}
        onChange={(v) => onGameSettingsChange({ ...gameSettings, enableVariableUpdate: v })}
      />

      <div style={{ opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? 'auto' : 'none' }}>
        <div
          className="px-3 py-2 text-[11px] mb-3"
          style={{
            color: 'rgba(var(--tj-text-secondary), 0.7)',
            background: 'rgba(var(--tj-bg-secondary), 0.45)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
            clipPath: smallClip,
          }}
        >
          下方任一字段留空时，将自动回退到「主 API」的同名字段。
          {noMainHint && <span style={{ color: 'rgba(220, 120, 120, 0.85)' }}>　{noMainHint}</span>}
        </div>

        <Field label="◆ 服务商">
          <select
            value={override.provider}
            onChange={(e) => patchOverride({ provider: e.target.value as AI提供商 })}
            className="kaituo-input w-full px-3 py-2 text-sm"
            style={{ clipPath: smallClip }}
          >
            {providerOptions.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="mt-3">
          <Field label="◆ Base URL">
            <input
              value={override.baseUrl}
              onChange={(e) => patchOverride({ baseUrl: e.target.value })}
              placeholder={mainConfig ? `留空则用主 API：${mainConfig.baseUrl}` : 'https://...'}
              className="kaituo-input w-full px-3 py-1.5 text-sm font-mono"
              style={{ clipPath: smallClip }}
            />
            {usingMain.baseUrl && mainConfig && (
              <FallbackHint text={`将复用主 API：${mainConfig.baseUrl}`} />
            )}
          </Field>
        </div>

        <div className="mt-3">
          <Field label="◆ API Key">
            <input
              type="password"
              value={override.apiKey}
              onChange={(e) => patchOverride({ apiKey: e.target.value })}
              placeholder={mainConfig?.apiKey ? '留空则用主 API 的 Key' : 'sk-...'}
              className="kaituo-input w-full px-3 py-1.5 text-sm font-mono"
              style={{ clipPath: smallClip }}
            />
            {usingMain.apiKey && mainConfig?.apiKey && (
              <FallbackHint text="将复用主 API 的 Key" />
            )}
          </Field>
        </div>

        <div className="mt-3">
          <Field label="◆ 模型">
            <div className="flex gap-1.5">
              <input
                value={override.model}
                onChange={(e) => patchOverride({ model: e.target.value })}
                placeholder={mainConfig?.model ? `留空则用主 API：${mainConfig.model}` : '模型 ID'}
                className="kaituo-input flex-1 px-2.5 py-1.5 text-sm font-mono"
                style={{ clipPath: smallClip }}
              />
              <button
                onClick={handleFetchModels}
                disabled={loadingModels}
                className="px-3 py-1.5 text-xs font-serif tracking-wider transition-all disabled:opacity-50"
                style={{
                  color: 'rgba(var(--tj-accent-primary), 0.85)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.35)',
                  background: 'rgba(var(--tj-accent-primary), 0.05)',
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
                  if (e.target.value) patchOverride({ model: e.target.value });
                }}
                className="kaituo-input mt-1.5 w-full px-2.5 py-1.5 text-xs"
                style={{ clipPath: smallClip }}
              >
                <option value="">— 从列表选择（{modelOptions.length}） —</option>
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
            {usingMain.model && mainConfig?.model && (
              <FallbackHint text={`将复用主 API：${mainConfig.model}`} />
            )}
          </Field>
        </div>

        <div className="mt-3">
          <Field label="◆ 失败重试次数">
            <input
              type="number"
              min={0}
              max={5}
              value={override.retryCount ?? 2}
              onChange={(e) => patchOverride({ retryCount: Math.max(0, Number(e.target.value) || 0) })}
              className="kaituo-input w-full px-3 py-1.5 text-sm"
              style={{ clipPath: smallClip }}
            />
            <div className="mt-1.5 text-[11px]" style={{ color: 'rgba(160, 200, 160, 0.7)' }}>
              失败后会自动重试，重试耗尽才提示变量更新失败。
            </div>
          </Field>
        </div>

        <div className="mt-5">
          <ToggleRow
            label="应用前需手动确认"
            desc="变量命令落地前在侧边面板等待玩家确认（适合调试，默认关闭）"
            checked={gameSettings.variableUpdateRequireConfirm}
            onChange={(v) => onGameSettingsChange({ ...gameSettings, variableUpdateRequireConfirm: v })}
          />
        </div>
      </div>

      <div
        className="px-4 py-3 text-[11px] leading-relaxed"
        style={{
          color: 'rgba(var(--tj-text-secondary), 0.7)',
          background: 'rgba(var(--tj-bg-secondary), 0.45)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.1)',
          clipPath: cardClip,
        }}
      >
        <div className="mb-1" style={{ color: 'rgba(var(--tj-accent-primary), 0.75)' }}>说明</div>
        变量模型推荐选用响应快、JSON 输出稳的模型（如 deepseek-chat / gpt-4o-mini）。它只负责按变量登记表写命令，不需要叙述能力。
      </div>

      <div className="flex flex-col items-stretch gap-2 pt-1">
        <button
          onClick={handleSave}
          className="w-full py-3 text-sm font-serif tracking-[0.4em] transition-all hover:opacity-90"
          style={{
            background: savedFlash
              ? 'linear-gradient(135deg, rgba(140, 220, 160, 0.95), rgba(100, 180, 130, 0.95))'
              : 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(212, 177, 90, 0.95))',
            color: 'rgb(var(--tj-on-accent))',
            boxShadow: savedFlash
              ? 'inset 0 0 0 1px rgba(220, 255, 230, 0.5), 0 0 18px rgba(140, 220, 160, 0.35)'
              : 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5), 0 0 18px rgba(var(--tj-accent-primary), 0.22)',
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
    <div>
      <label
        className="mb-1.5 block text-xs font-serif tracking-[0.2em]"
        style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function FallbackHint({ text }: { text: string }) {
  return (
    <div className="mt-1.5 text-[11px]" style={{ color: 'rgba(160, 200, 160, 0.7)' }}>
      ↳ {text}
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
        background: 'rgba(var(--tj-bg-secondary), 0.45)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
        clipPath:
          'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
      }}
    >
      <div className="min-w-0 mr-3">
        <div className="font-serif font-bold text-sm tracking-wider" style={{ color: 'rgb(var(--tj-text-primary))' }}>
          {label}
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}>
          {desc}
        </div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="relative h-6 w-11 flex-shrink-0 transition-all"
        style={{
          background: checked
            ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(212, 177, 90, 0.95))'
            : 'rgba(60, 55, 40, 0.7)',
          boxShadow: checked
            ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5), 0 0 10px rgba(var(--tj-accent-primary), 0.25)'
            : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
          clipPath:
            'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
        }}
      >
        <div
          className="absolute top-0.5 h-5 w-5 transition-transform"
          style={{
            left: checked ? 'calc(100% - 1.375rem)' : '0.125rem',
            background: checked ? 'rgb(var(--tj-bg-primary))' : 'rgba(220, 200, 160, 0.85)',
            clipPath:
              'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
          }}
        />
      </button>
    </div>
  );
}
