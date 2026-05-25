import { useEffect, useMemo, useState } from 'react';
import type { API设置, API配置项, AI提供商 } from '@/models/settings';
import {
  MAX_OUTPUT_TIERS,
  inferMaxOutputTier,
  matchModelRecommendation,
  type MaxOutputTier,
} from '@/data/modelRecommendations';
import { fetchModels, testConnection, type ConnectionTestResult } from '@/services/ai/apiTools';
import { saveSetting } from '@/services/dbService';

interface Props {
  settings: API设置;
  onChange: (s: API设置) => void;
}

const providerOptions: { value: AI提供商; label: string; defaultBaseUrl: string; defaultModel: string }[] = [
  { value: 'openai_compatible', label: 'OpenAI 兼容', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
  { value: 'openai', label: 'OpenAI', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
  { value: 'deepseek', label: 'DeepSeek', defaultBaseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  { value: 'claude', label: 'Claude', defaultBaseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-sonnet-4-5' },
  { value: 'gemini', label: 'Gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-2.5-pro' },
];

const cardClip =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

function makeNewConfig(provider: AI提供商): API配置项 {
  const meta = providerOptions.find((p) => p.value === provider) ?? providerOptions[0];
  return {
    id: `config_${Date.now()}`,
    name: `${meta.label} 配置`,
    provider,
    baseUrl: meta.defaultBaseUrl,
    apiKey: '',
    model: meta.defaultModel,
    maxTokens: 8192,
    temperature: 0.8,
    retryCount: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function ApiSettingsTab({ settings, onChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    settings.activeConfigId ?? settings.configs[0]?.id ?? null,
  );
  const [newProvider, setNewProvider] = useState<AI提供商>('openai_compatible');
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const selectedConfig = useMemo(
    () => settings.configs.find((c) => c.id === selectedId) ?? null,
    [settings.configs, selectedId],
  );

  // Reset model options when switching config
  useEffect(() => {
    setModelOptions([]);
    setTestResult(null);
    setMessage(null);
  }, [selectedId]);

  // 常驻默认配置：列表为空时自动补一个 OpenAI 兼容占位，避免右侧空状态。
  useEffect(() => {
    if (settings.configs.length === 0) {
      const created = makeNewConfig('openai_compatible');
      onChange({
        activeConfigId: created.id,
        configs: [created],
      });
      setSelectedId(created.id);
    } else if (!selectedId || !settings.configs.find((c) => c.id === selectedId)) {
      setSelectedId(settings.activeConfigId ?? settings.configs[0].id);
    }
  }, [settings.configs, settings.activeConfigId, selectedId, onChange]);

  const updateConfig = (patch: Partial<API配置项>) => {
    if (!selectedConfig) return;
    const next: API配置项 = {
      ...selectedConfig,
      ...patch,
      updatedAt: Date.now(),
    };
    onChange({
      ...settings,
      configs: settings.configs.map((c) => (c.id === next.id ? next : c)),
    });
  };

  const handleCreate = () => {
    const created = makeNewConfig(newProvider);
    onChange({
      activeConfigId: settings.activeConfigId ?? created.id,
      configs: [...settings.configs, created],
    });
    setSelectedId(created.id);
    setMessage({ kind: 'info', text: `已新增 ${providerOptions.find((p) => p.value === newProvider)?.label} 配置，请填写后启用。` });
  };

  const handleDelete = () => {
    if (!selectedConfig) return;
    const remaining = settings.configs.filter((c) => c.id !== selectedConfig.id);
    const fallback = remaining[0]?.id ?? null;
    onChange({
      activeConfigId:
        settings.activeConfigId === selectedConfig.id ? fallback : settings.activeConfigId,
      configs: remaining,
    });
    setSelectedId(fallback);
  };

  const handleActivate = () => {
    if (!selectedConfig) return;
    onChange({ ...settings, activeConfigId: selectedConfig.id });
  };

  const handleSave = async () => {
    if (!selectedConfig) return;
    // 显式构造新对象，然后同时写 React state 与 IndexedDB，避免依赖 setState 的异步时序。
    const updated: API设置 = {
      ...settings,
      configs: settings.configs.map((c) =>
        c.id === selectedConfig.id ? { ...c, updatedAt: Date.now() } : c,
      ),
    };
    onChange(updated);
    try {
      await saveSetting('apiSettings', updated);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1800);
    } catch (e) {
      setMessage({ kind: 'error', text: `保存失败：${(e as Error).message}` });
    }
  };

  const handleFetchModels = async () => {
    if (!selectedConfig) return;
    setLoadingModels(true);
    setMessage(null);
    try {
      const list = await fetchModels({ ...selectedConfig, retryCount: selectedConfig.retryCount ?? 2 });
      setModelOptions(list);
      setMessage({ kind: 'info', text: `获取到 ${list.length} 个模型。` });
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      setLoadingModels(false);
    }
  };

  const handleTest = async () => {
    if (!selectedConfig) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection({ ...selectedConfig, retryCount: selectedConfig.retryCount ?? 2 });
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  };

  const recommendation = selectedConfig ? matchModelRecommendation(selectedConfig.model) : null;
  const currentTier = inferMaxOutputTier(selectedConfig?.maxTokens);

  const handleTierChange = (tier: MaxOutputTier) => {
    if (!selectedConfig) return;
    const preset = MAX_OUTPUT_TIERS.find((p) => p.id === tier);
    if (!preset) return;
    if (preset.value !== undefined) {
      updateConfig({ maxTokens: preset.value });
    } else {
      // 自定义：保留当前值，让用户改输入框
      if (!selectedConfig.maxTokens || [8192, 32768, 65536].includes(selectedConfig.maxTokens)) {
        updateConfig({ maxTokens: 4096 });
      }
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      {/* ── 顶部：新建配置（横向铺满） ── */}
      <div
        className="flex items-center gap-3 px-4 py-2.5"
        style={{
          background: 'rgba(16, 14, 16, 0.55)',
          boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.22)',
          clipPath: cardClip,
        }}
      >
        <span
          className="font-serif text-xs tracking-[0.3em]"
          style={{ color: 'rgba(245, 217, 122, 0.85)' }}
        >
          ◆ 新建配置
        </span>
        <span style={{ color: 'rgba(245, 217, 122, 0.2)' }}>|</span>
        <span
          className="text-xs tracking-wider"
          style={{ color: 'rgba(200, 188, 158, 0.7)' }}
        >
          供应商
        </span>
        <select
          value={newProvider}
          onChange={(e) => setNewProvider(e.target.value as AI提供商)}
          className="kaituo-input px-2.5 py-1.5 text-sm"
          style={{ clipPath: smallClip, minWidth: 160 }}
        >
          {providerOptions.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          onClick={handleCreate}
          className="px-4 py-1.5 text-xs font-serif tracking-[0.25em] transition-all hover:opacity-90"
          style={{
            background: 'linear-gradient(135deg, rgba(245, 217, 122, 0.95), rgba(212, 177, 90, 0.95))',
            color: '#1a1325',
            boxShadow: 'inset 0 0 0 1px rgba(255, 245, 200, 0.5)',
            clipPath: smallClip,
          }}
        >
          ＋ 创建配置
        </button>
        <span
          className="ml-auto text-xs tracking-wider"
          style={{ color: 'rgba(160, 148, 120, 0.6)' }}
        >
          共 {settings.configs.length} 个配置
        </span>
      </div>

      {/* ── 主体：左列表 + 右详情 ── */}
      <div className="flex min-h-0 flex-1 gap-4">
        <aside className="flex w-[220px] flex-shrink-0 flex-col">
          <div className="flex-1 space-y-1.5 overflow-y-auto">
          {settings.configs.length === 0 && (
            <div
              className="px-3 py-4 text-center text-xs"
              style={{ color: 'rgba(160, 148, 120, 0.65)' }}
            >
              暂无配置
            </div>
          )}
          {settings.configs.map((c) => {
            const active = settings.activeConfigId === c.id;
            const selected = selectedId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="block w-full px-3 py-2 text-left transition-all"
                style={{
                  background: selected
                    ? 'linear-gradient(135deg, rgba(245, 217, 122, 0.14), rgba(196, 163, 90, 0.04))'
                    : 'rgba(16, 14, 16, 0.5)',
                  boxShadow: selected
                    ? 'inset 0 0 0 1px rgba(245, 217, 122, 0.55)'
                    : 'inset 0 0 0 1px rgba(245, 217, 122, 0.18)',
                  clipPath: smallClip,
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span style={{ color: active ? 'rgba(245, 217, 122, 0.95)' : 'rgba(245, 217, 122, 0.35)' }}>
                    {active ? '◆' : '◇'}
                  </span>
                  <span
                    className="truncate font-serif text-xs tracking-wider"
                    style={{ color: selected ? 'rgb(245, 217, 122)' : 'rgb(var(--tj-text-primary))' }}
                  >
                    {c.name || '（未命名）'}
                  </span>
                </div>
                <div
                  className="ml-4 mt-0.5 truncate text-[10px] tracking-wider"
                  style={{ color: 'rgba(200, 188, 158, 0.55)' }}
                >
                  {c.provider} · {c.model || '—'}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── 右侧：详情 ── */}
      <section className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        {!selectedConfig ? (
          <div
            className="flex h-full items-center justify-center text-sm"
            style={{ color: 'rgba(160, 148, 120, 0.6)' }}
          >
            请先在左侧创建并选择一个配置
          </div>
        ) : (
          <>
            {/* 顶部操作条 */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span style={{ color: 'rgba(245, 217, 122, 0.9)' }}>
                  {settings.activeConfigId === selectedConfig.id ? '◆' : '◇'}
                </span>
                <span
                  className="font-serif text-sm font-bold tracking-[0.25em]"
                  style={{
                    background: 'linear-gradient(135deg, #fff4d4 0%, #f5d97a 45%, #c4a35a 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {settings.activeConfigId === selectedConfig.id ? '当前使用中' : '未启用'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {settings.activeConfigId !== selectedConfig.id && (
                  <button
                    onClick={handleActivate}
                    className="px-2.5 py-1 text-xs font-serif tracking-wider transition-all hover:opacity-90"
                    style={{
                      background: 'linear-gradient(135deg, rgba(245, 217, 122, 0.95), rgba(212, 177, 90, 0.95))',
                      color: '#1a1325',
                      boxShadow: 'inset 0 0 0 1px rgba(255, 245, 200, 0.5)',
                      clipPath: smallClip,
                    }}
                  >
                    启用此配置
                  </button>
                )}
                <button
                  onClick={handleDelete}
                  className="px-2.5 py-1 text-xs font-serif tracking-wider transition-all hover:opacity-90"
                  style={{
                    color: 'rgba(220, 120, 120, 0.9)',
                    boxShadow: 'inset 0 0 0 1px rgba(220, 120, 120, 0.35)',
                    clipPath: smallClip,
                  }}
                >
                  删除
                </button>
              </div>
            </div>

            {/* 基本字段 */}
            <FieldRow label="配置名称">
              <input
                value={selectedConfig.name}
                onChange={(e) => updateConfig({ name: e.target.value })}
                className="kaituo-input w-full px-2.5 py-1.5 text-sm"
                style={{ clipPath: smallClip }}
              />
            </FieldRow>

            <FieldRow label="接口供应商">
              <select
                value={selectedConfig.provider}
                onChange={(e) => updateConfig({ provider: e.target.value as AI提供商 })}
                className="kaituo-input w-full px-2.5 py-1.5 text-sm"
                style={{ clipPath: smallClip }}
              >
                {providerOptions.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </FieldRow>

            <FieldRow label="Base URL">
              <input
                value={selectedConfig.baseUrl}
                onChange={(e) => updateConfig({ baseUrl: e.target.value })}
                placeholder="https://api.example.com/v1"
                className="kaituo-input w-full px-2.5 py-1.5 text-sm"
                style={{ clipPath: smallClip }}
              />
            </FieldRow>

            <FieldRow label="API Key">
              <input
                value={selectedConfig.apiKey}
                onChange={(e) => updateConfig({ apiKey: e.target.value })}
                type="password"
                placeholder="sk-..."
                className="kaituo-input w-full px-2.5 py-1.5 text-sm"
                style={{ clipPath: smallClip }}
              />
            </FieldRow>

            {/* 模型选择 */}
            <FieldRow label="模型">
              <div className="space-y-1.5">
                <div className="flex gap-1.5">
                  <input
                    value={selectedConfig.model}
                    onChange={(e) => updateConfig({ model: e.target.value })}
                    placeholder="模型 ID"
                    className="kaituo-input flex-1 px-2.5 py-1.5 text-sm"
                    style={{ clipPath: smallClip }}
                  />
                  <button
                    onClick={handleFetchModels}
                    disabled={loadingModels}
                    className="px-3 py-1.5 text-xs font-serif tracking-wider transition-all disabled:opacity-50"
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
                      if (e.target.value) updateConfig({ model: e.target.value });
                    }}
                    className="kaituo-input w-full px-2.5 py-1.5 text-xs"
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
              </div>
            </FieldRow>

            {/* 最大输出 token 档位 */}
            <FieldRow label="最大输出 Token">
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {MAX_OUTPUT_TIERS.map((tier) => {
                    const active = currentTier === tier.id;
                    return (
                      <button
                        key={tier.id}
                        onClick={() => handleTierChange(tier.id)}
                        className="px-2.5 py-1 text-xs font-serif tracking-wider transition-all"
                        style={{
                          background: active
                            ? 'linear-gradient(135deg, rgba(245, 217, 122, 0.95), rgba(212, 177, 90, 0.95))'
                            : 'transparent',
                          color: active ? '#1a1325' : 'rgba(200, 188, 158, 0.85)',
                          boxShadow: active
                            ? 'inset 0 0 0 1px rgba(255, 245, 200, 0.5)'
                            : 'inset 0 0 0 1px rgba(245, 217, 122, 0.3)',
                          clipPath: smallClip,
                        }}
                      >
                        {tier.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="number"
                  min={1}
                  value={selectedConfig.maxTokens ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateConfig({ maxTokens: v === '' ? undefined : Math.max(1, Number(v)) });
                  }}
                  placeholder="自定义数值（如 8192）"
                  className="kaituo-input w-full px-2.5 py-1.5 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </div>
            </FieldRow>

            <FieldRow label="温度（留空= 提供方默认）">
              <input
                type="number"
                step={0.1}
                min={0}
                max={2}
                value={selectedConfig.temperature ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  updateConfig({ temperature: v === '' ? undefined : Number(v) });
                }}
                placeholder="0.8"
                className="kaituo-input w-full px-2.5 py-1.5 text-sm"
                style={{ clipPath: smallClip }}
              />
            </FieldRow>

            {/* 推荐卡片 */}
            {recommendation && (
              <div
                className="p-3 text-xs"
                style={{
                  background: 'rgba(245, 217, 122, 0.04)',
                  boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.25)',
                  clipPath: smallClip,
                }}
              >
                <div
                  className="mb-1 font-serif tracking-[0.2em]"
                  style={{ color: 'rgba(245, 217, 122, 0.9)' }}
                >
                  ✦ {recommendation.providerLabel} · {recommendation.modelLabel}
                </div>
                <div className="leading-relaxed" style={{ color: 'rgba(220, 208, 178, 0.85)' }}>
                  官方最大输出：{recommendation.officialMaxOutput.toLocaleString()} · 建议档位：
                  {recommendation.suggestedSelection.toLocaleString()}
                  <br />
                  {recommendation.note}
                </div>
                <a
                  href={recommendation.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-[11px] underline-offset-2 hover:underline"
                  style={{ color: 'rgba(245, 217, 122, 0.6)' }}
                >
                  来源：{recommendation.sourceLabel}
                </a>
              </div>
            )}

            {/* 测试连接 */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleTest}
                disabled={testing}
                className="px-3 py-1.5 text-sm font-serif tracking-wider transition-all disabled:opacity-50"
                style={{
                  color: 'rgba(245, 217, 122, 0.9)',
                  boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.45)',
                  background: 'rgba(245, 217, 122, 0.06)',
                  clipPath: smallClip,
                }}
              >
                {testing ? '测试中…' : '测试连接'}
              </button>
              {message && (
                <span
                  className="text-xs tracking-wider"
                  style={{ color: message.kind === 'error' ? 'rgba(220, 120, 120, 0.9)' : 'rgba(200, 188, 158, 0.85)' }}
                >
                  {message.text}
                </span>
              )}
            </div>

            {testResult && (
              <div
                className="p-3 text-xs"
                style={{
                  background: testResult.ok ? 'rgba(120, 200, 140, 0.06)' : 'rgba(220, 120, 120, 0.06)',
                  boxShadow: testResult.ok
                    ? 'inset 0 0 0 1px rgba(120, 200, 140, 0.35)'
                    : 'inset 0 0 0 1px rgba(220, 120, 120, 0.35)',
                  clipPath: smallClip,
                }}
              >
                <div
                  className="mb-1 font-serif tracking-[0.2em]"
                  style={{ color: testResult.ok ? 'rgba(140, 220, 160, 0.95)' : 'rgba(240, 140, 140, 0.95)' }}
                >
                  {testResult.ok ? '✓ 连接成功' : '✕ 连接失败'}
                </div>
                <pre
                  className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed"
                  style={{ color: 'rgba(220, 208, 178, 0.85)' }}
                >
                  {testResult.detail}
                </pre>
              </div>
            )}

            {/* 底部保存按钮 */}
            <div className="mt-auto flex flex-col items-stretch gap-2 pt-3">
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
            </div>
          </>
        )}
      </section>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div
        className="mb-1 text-xs font-serif tracking-[0.25em]"
        style={{ color: 'rgba(220, 200, 160, 0.85)' }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}
