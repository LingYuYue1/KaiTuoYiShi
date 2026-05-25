import { useMemo, useState } from 'react';
import type { AI提供商, API设置, 游戏设置 } from '@/models/settings';
import { 创建默认记忆系统设置 } from '@/models/settings';
import { fetchModels, testConnection, type ConnectionTestResult } from '@/services/ai/apiTools';
import { saveSetting } from '@/services/dbService';

interface Props {
  settings: 游戏设置;
  onChange: (s: 游戏设置) => void;
  apiSettings: API设置;
}

const providerOptions: { value: AI提供商; label: string; defaultBaseUrl: string; defaultModel: string }[] = [
  { value: 'openai_compatible', label: 'OpenAI 兼容', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
  { value: 'openai', label: 'OpenAI', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
  { value: 'deepseek', label: 'DeepSeek', defaultBaseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  { value: 'claude', label: 'Claude', defaultBaseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-sonnet-4-5' },
  { value: 'gemini', label: 'Gemini', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-2.5-pro' },
];

const cardClip = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
const smallClip = 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

export function MemorySystemSettingsTab({ settings, onChange, apiSettings }: Props) {
  const memory = settings.记忆系统 ?? 创建默认记忆系统设置();
  const mainConfig = useMemo(
    () => apiSettings.configs.find((c) => c.id === apiSettings.activeConfigId) ?? null,
    [apiSettings.activeConfigId, apiSettings.configs],
  );
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);

  const patchMemory = (patch: Partial<typeof memory>) => {
    onChange({
      ...settings,
      记忆系统: {
        ...memory,
        ...patch,
      },
    });
  };

  const effectiveApi = {
    provider: memory.记忆总结API.provider || mainConfig?.provider || 'openai_compatible',
    baseUrl: memory.记忆总结API.baseUrl.trim() || mainConfig?.baseUrl || '',
    apiKey: memory.记忆总结API.apiKey.trim() || mainConfig?.apiKey || '',
    model: memory.记忆总结API.model.trim() || mainConfig?.model || '',
    maxTokens: memory.记忆总结API.maxTokens ?? mainConfig?.maxTokens,
    temperature: memory.记忆总结API.temperature ?? mainConfig?.temperature,
    retryCount: memory.记忆总结API.retryCount ?? mainConfig?.retryCount ?? 2,
  };

  const modelChoices = useMemo(() => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const value of [effectiveApi.model, ...modelOptions]) {
      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      merged.push(trimmed);
    }
    return merged;
  }, [effectiveApi.model, modelOptions]);

  const patchApi = (patch: Partial<typeof memory.记忆总结API>) => {
    patchMemory({
      记忆总结API: {
        ...memory.记忆总结API,
        ...patch,
      },
    });
  };

  const handleFetchModels = async () => {
    if (!effectiveApi.baseUrl || !effectiveApi.apiKey) {
      setMessage({
        kind: 'error',
        text: mainConfig
          ? '记忆总结 API 将回退主 API；如果主 API 也未配置，请先补全。'
          : '请先填写记忆总结 API 的 Base URL 和 API Key，或先配置主 API。',
      });
      return;
    }
    setLoadingModels(true);
    setMessage(null);
    try {
      const list = await fetchModels({ ...effectiveApi, name: '记忆总结' });
      setModelOptions(list);
      if (list.length > 0 && !list.includes(memory.记忆总结API.model.trim())) {
        patchApi({ model: list[0] });
      }
      setMessage({ kind: 'info', text: `已获取 ${list.length} 个模型。` });
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      setMessage({ kind: 'error', text: `获取模型失败：${text}` });
    } finally {
      setLoadingModels(false);
    }
  };

  const handleTestConnection = async () => {
    if (!effectiveApi.baseUrl || !effectiveApi.apiKey || !effectiveApi.model) {
      setTestResult({ ok: false, detail: '请先补全记忆总结 API 的 Base URL / API Key / Model。' });
      return;
    }
    try {
      const result = await testConnection({ ...effectiveApi, name: '记忆总结' });
      setTestResult(result);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      setTestResult({ ok: false, detail: text });
    }
  };

  const handleSave = async () => {
    try {
      await saveSetting('gameSettings', settings);
      setSavedFlash(true);
      setSaveMessage({ kind: 'info', text: '记忆系统设置已保存。' });
      window.setTimeout(() => setSavedFlash(false), 1800);
    } catch (err) {
      setSavedFlash(false);
      setSaveMessage({ kind: 'error', text: `保存失败：${err instanceof Error ? err.message : String(err)}` });
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
          记忆系统管理
        </div>
        这里负责即时、短期、长期与 NPC 同行记忆的自动压缩。记忆总结 API 放在最上方，先决定压缩时用哪一个模型，再往下调阈值和提示词。
      </div>

      <Section title="系统开关">
        <ToggleField
          label="启用记忆注入"
          desc="开启后，主剧情生成前会注入即时 / 短期 / 长期记忆。关闭后仍保留记忆入库和压缩，方便之后重新开启。"
          checked={settings.enableMemoryInjection}
          onChange={(checked) => onChange({ ...settings, enableMemoryInjection: checked })}
        />
      </Section>

      <Section title="记忆总结 API">
        <div className="grid gap-3 md:grid-cols-2">
          <SelectField
            label="供应商"
            value={effectiveApi.provider}
            onChange={(value) => patchApi({ provider: value as AI提供商 })}
            options={providerOptions.map((option) => ({ value: option.value, label: option.label }))}
          />
          <label className="block md:col-span-2">
            <div className="mb-1.5 font-serif text-[12px] tracking-[0.18em]" style={{ color: 'rgba(245, 217, 122, 0.88)' }}>
              模型
            </div>
            <div className="flex gap-2">
              <input
                value={memory.记忆总结API.model}
                onChange={(e) => patchApi({ model: e.target.value })}
                className="kaituo-input flex-1 px-2.5 py-1.5 text-sm"
                style={{ clipPath: smallClip }}
                placeholder="模型 ID"
              />
              <button
                type="button"
                onClick={handleFetchModels}
                className="px-3 py-1.5 text-xs font-serif tracking-wider transition-all disabled:opacity-50"
                style={{
                  color: 'rgba(245, 217, 122, 0.9)',
                  boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.45)',
                  background: 'rgba(245, 217, 122, 0.06)',
                  clipPath: smallClip,
                }}
              >
                {loadingModels ? '获取中...' : '获取模型'}
              </button>
            </div>
            {modelChoices.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) patchApi({ model: e.target.value });
                }}
                className="kaituo-input mt-2 w-full px-2.5 py-1.5 text-xs"
                style={{ clipPath: smallClip }}
              >
                <option value="">— 从列表选择（{modelChoices.length}）—</option>
                {modelChoices.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            )}
          </label>
          <InputField
            label="Base URL"
            value={memory.记忆总结API.baseUrl}
            onChange={(value) => patchApi({ baseUrl: value })}
          />
          <InputField
            label="API Key"
            value={memory.记忆总结API.apiKey}
            onChange={(value) => patchApi({ apiKey: value })}
          />
          <NumberField
            label="最大输出"
            value={memory.记忆总结API.maxTokens ?? 1024}
            onChange={(value) => patchApi({ maxTokens: Math.max(1, value) })}
            hint="留给记忆压缩用，过小会丢细节，过大则浪费 token。"
          />
          <NumberField
            label="温度"
            value={Math.round(((memory.记忆总结API.temperature ?? 0.2) * 100)) / 100}
            onChange={(value) => patchApi({ temperature: value })}
            hint="压缩建议偏低温度，尽量稳定地保留重点。"
            step={0.05}
            min={0}
            max={2}
          />
          <NumberField
            label="重试"
            value={memory.记忆总结API.retryCount ?? 2}
            onChange={(value) => patchApi({ retryCount: Math.max(0, Math.trunc(value)) })}
            hint="获取模型或压缩失败时自动重试的次数。"
            step={1}
            min={0}
            max={5}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleFetchModels}
            className="px-3 py-1.5 text-sm font-serif tracking-wider transition-all disabled:opacity-50"
            style={{
              color: 'rgba(245, 217, 122, 0.9)',
              boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.45)',
              background: 'rgba(245, 217, 122, 0.06)',
              clipPath: smallClip,
            }}
          >
            {loadingModels ? '获取中...' : '获取模型'}
          </button>
          <button
            type="button"
            onClick={handleTestConnection}
            className="px-3 py-1.5 text-sm font-serif tracking-wider transition-all disabled:opacity-50"
            style={{
              color: 'rgba(245, 217, 122, 0.9)',
              boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.45)',
              background: 'rgba(245, 217, 122, 0.06)',
              clipPath: smallClip,
            }}
          >
            测试连接
          </button>
        </div>

        {modelChoices.length > 0 && (
          <div className="mt-3 text-[11px] leading-relaxed" style={{ color: 'rgba(200, 188, 158, 0.74)' }}>
            已获取模型：{modelChoices.slice(0, 8).join(' · ')}
          </div>
        )}

        {message && (
          <div
            className="mt-3 px-3 py-2 text-xs"
            style={{
              color: message.kind === 'error' ? '#ffb7b7' : 'rgba(220, 208, 178, 0.95)',
              background: message.kind === 'error' ? 'rgba(120, 30, 30, 0.35)' : 'rgba(245, 217, 122, 0.05)',
              boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.12)',
              clipPath: smallClip,
            }}
          >
            {message.text}
          </div>
        )}

        {testResult && (
          <div
            className="mt-3 px-3 py-2 text-xs leading-relaxed"
            style={{
              color: testResult.ok ? 'rgba(220, 240, 220, 0.95)' : '#ffb7b7',
              background: testResult.ok ? 'rgba(60, 120, 70, 0.28)' : 'rgba(120, 30, 30, 0.35)',
              boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.12)',
              clipPath: smallClip,
            }}
          >
            {testResult.detail}
          </div>
        )}

      </Section>

      <Section title="自动压缩阈值">
        <div className="grid gap-3 md:grid-cols-3">
          <NumberField
            label="即时 → 短期"
            value={memory.即时转短期阈值}
            onChange={(value) => patchMemory({ 即时转短期阈值: Math.max(1, Math.trunc(value)) })}
            hint="达到这个条数时，系统会自动把即时记忆整理进短期。"
          />
          <NumberField
            label="短期 → 长期"
            value={memory.短期转长期阈值}
            onChange={(value) => patchMemory({ 短期转长期阈值: Math.max(1, Math.trunc(value)) })}
            hint="达到这个条数时，系统会自动把短期记忆整理进长期。"
          />
          <NumberField
            label="NPC 记忆"
            value={memory.NPC记忆压缩阈值}
            onChange={(value) => patchMemory({ NPC记忆压缩阈值: Math.max(1, Math.trunc(value)) })}
            hint="伙伴的与你同行记忆达到这个条数后会自动压缩。"
          />
        </div>
      </Section>

      <Section title="提示词配置">
        <TextareaField
          label="即时转短期"
          value={memory.即时转短期提示词}
          onChange={(value) => patchMemory({ 即时转短期提示词: value })}
          rows={7}
          hint="整理每回合原始记录，保留剧情推进、玩家选择、NPC 态度、物品变化与当前目标。"
        />
        <TextareaField
          label="短期转长期"
          value={memory.短期转长期提示词}
          onChange={(value) => patchMemory({ 短期转长期提示词: value })}
          rows={7}
          hint="把多回合短期记忆压成稳定事实，保留主线转折、关系变化、不可逆后果与长期目标。"
        />
        <TextareaField
          label="NPC 记忆压缩"
          value={memory.NPC记忆压缩提示词}
          onChange={(value) => patchMemory({ NPC记忆压缩提示词: value })}
          rows={7}
          hint="只整理对应 NPC 的同行记忆，重点保留称呼变化、承诺、亏欠、信任/冲突原因与私人细节。"
        />
      </Section>

      <div className="flex flex-col items-end gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          className="px-5 py-2.5 text-sm font-serif tracking-[0.28em] transition-all hover:opacity-90"
          style={{
            background: savedFlash
              ? 'linear-gradient(135deg, rgba(140, 220, 160, 0.95), rgba(100, 180, 130, 0.95))'
              : 'linear-gradient(135deg, rgba(245, 217, 122, 0.95), rgba(212, 177, 90, 0.95))',
            color: '#1a1325',
            boxShadow: savedFlash
              ? 'inset 0 0 0 1px rgba(220, 255, 230, 0.5), 0 0 18px rgba(140, 220, 160, 0.35)'
              : 'inset 0 0 0 1px rgba(255, 245, 200, 0.5), 0 0 18px rgba(245, 217, 122, 0.22)',
            clipPath: smallClip,
          }}
        >
          {savedFlash ? '✓ 已 保 存' : '◆ 保存记忆设置'}
        </button>
        {saveMessage && (
          <div
            className="px-3 py-2 text-xs"
            style={{
              color: saveMessage.kind === 'error' ? '#ffb7b7' : 'rgba(220, 208, 178, 0.95)',
              background: saveMessage.kind === 'error' ? 'rgba(120, 30, 30, 0.35)' : 'rgba(245, 217, 122, 0.05)',
              boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.12)',
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

function ToggleField({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className="flex cursor-pointer items-center justify-between gap-4 px-3 py-3"
      style={{ boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.16)', clipPath: smallClip }}
    >
      <span>
        <span className="block font-serif text-[13px] tracking-[0.18em]" style={{ color: 'rgba(245,217,122,0.92)' }}>
          {label}
        </span>
        <span className="mt-1 block text-xs leading-relaxed" style={{ color: 'rgba(200,188,158,0.74)' }}>
          {desc}
        </span>
      </span>
      <span
        className="relative h-7 w-12 shrink-0 transition-all"
        style={{
          background: checked ? 'rgba(245,217,122,0.26)' : 'rgba(80,75,68,0.45)',
          boxShadow: `inset 0 0 0 1px ${checked ? 'rgba(245,217,122,0.55)' : 'rgba(160,148,120,0.28)'}`,
          borderRadius: 999,
        }}
      >
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
        <span
          className="absolute top-1 h-5 w-5 rounded-full transition-all"
          style={{
            left: checked ? 24 : 4,
            background: checked ? '#f5d97a' : 'rgba(200,188,158,0.8)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
          }}
        />
      </span>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
      <div
        className="px-4 py-4"
        style={{
          background: 'rgba(245, 217, 122, 0.035)',
          boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.18)',
        clipPath: cardClip,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="h-4 w-[3px]" style={{ background: '#f5d97a' }} />
        <span className="font-serif text-[13px] font-semibold tracking-[0.28em]" style={{ color: '#f5d97a' }}>
          {title}
        </span>
        <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(245,217,122,0.35), transparent)' }} />
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 font-serif text-[12px] tracking-[0.18em]" style={{ color: 'rgba(245, 217, 122, 0.88)' }}>
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="kaituo-input w-full px-3 py-2 text-sm"
        style={{ clipPath: smallClip }}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <div className="mb-1.5 font-serif text-[12px] tracking-[0.18em]" style={{ color: 'rgba(245, 217, 122, 0.88)' }}>
        {label}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="kaituo-input w-full px-3 py-2 text-sm"
        style={{ clipPath: smallClip }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  hint,
  step = 1,
  min = 1,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint: string;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 font-serif text-[12px] tracking-[0.18em]" style={{ color: 'rgba(245, 217, 122, 0.88)' }}>
        {label}
      </div>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || min)}
        className="kaituo-input w-full px-3 py-2 text-sm"
        style={{ clipPath: smallClip }}
      />
      <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(200, 188, 158, 0.7)' }}>
        {hint}
      </div>
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  rows,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  hint: string;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 font-serif text-[12px] tracking-[0.18em]" style={{ color: 'rgba(245, 217, 122, 0.88)' }}>
        {label}
      </div>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="kaituo-input w-full px-3 py-2 text-sm leading-relaxed"
        style={{ clipPath: smallClip }}
      />
      <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(200, 188, 158, 0.7)' }}>
        {hint}
      </div>
    </label>
  );
}
