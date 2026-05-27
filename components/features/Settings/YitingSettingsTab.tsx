import { useMemo, useState } from 'react';
import type { AI提供商, API设置, 游戏设置, 忆庭API覆盖 } from '@/models/settings';
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

interface ResolvedApi {
  provider: AI提供商;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  retryCount: number;
}

export function YitingSettingsTab({ settings, onChange, apiSettings }: Props) {
  const memory = settings.记忆系统 ?? 创建默认记忆系统设置();
  const mainConfig = useMemo(
    () => apiSettings.configs.find((c) => c.id === apiSettings.activeConfigId) ?? null,
    [apiSettings.activeConfigId, apiSettings.configs],
  );

  const [recallLoadingModels, setRecallLoadingModels] = useState(false);
  const [recallModelOptions, setRecallModelOptions] = useState<string[]>([]);
  const [recallTestResult, setRecallTestResult] = useState<ConnectionTestResult | null>(null);
  const [recallMessage, setRecallMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);

  const [archiveLoadingModels, setArchiveLoadingModels] = useState(false);
  const [archiveModelOptions, setArchiveModelOptions] = useState<string[]>([]);
  const [archiveTestResult, setArchiveTestResult] = useState<ConnectionTestResult | null>(null);
  const [archiveMessage, setArchiveMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);

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

  const buildEffective = (api: 忆庭API覆盖): ResolvedApi => ({
    provider: (api.provider || mainConfig?.provider || 'openai_compatible') as AI提供商,
    baseUrl: api.baseUrl.trim() || mainConfig?.baseUrl || '',
    apiKey: api.apiKey.trim() || mainConfig?.apiKey || '',
    model: api.model.trim() || mainConfig?.model || '',
    maxTokens: api.maxTokens ?? mainConfig?.maxTokens,
    temperature: api.temperature ?? mainConfig?.temperature,
    retryCount: api.retryCount ?? mainConfig?.retryCount ?? 2,
  });

  const recallEffective = buildEffective(memory.忆庭召回API);
  const archiveEffective = buildEffective(memory.忆庭精炼API);

  const recallModelChoices = useMemo(() => uniqueModels([recallEffective.model, ...recallModelOptions]), [
    recallEffective.model,
    recallModelOptions,
  ]);
  const archiveModelChoices = useMemo(() => uniqueModels([archiveEffective.model, ...archiveModelOptions]), [
    archiveEffective.model,
    archiveModelOptions,
  ]);

  const patchRecallApi = (patch: Partial<typeof memory.忆庭召回API>) => {
    patchMemory({
      忆庭召回API: {
        ...memory.忆庭召回API,
        ...patch,
      },
    });
  };

  const patchArchiveApi = (patch: Partial<typeof memory.忆庭精炼API>) => {
    patchMemory({
      忆庭精炼API: {
        ...memory.忆庭精炼API,
        ...patch,
      },
    });
  };

  const fetchRecallModels = async () => {
    if (!recallEffective.baseUrl || !recallEffective.apiKey) {
      setRecallMessage({
        kind: 'error',
        text: mainConfig
          ? '忆庭召回会回退主 API；如果主 API 也没配，请先补全。'
          : '请先填写忆庭召回 API 的 Base URL 和 API Key，或先配置主 API。',
      });
      return;
    }
    setRecallLoadingModels(true);
    setRecallMessage(null);
    try {
      const list = await fetchModels({ ...recallEffective, name: '忆庭召回' });
      setRecallModelOptions(list);
      if (list.length > 0 && !list.includes(memory.忆庭召回API.model.trim())) {
        patchRecallApi({ model: list[0] });
      }
      setRecallMessage({ kind: 'info', text: `已获取 ${list.length} 个模型。` });
    } catch (err) {
      setRecallMessage({ kind: 'error', text: `获取模型失败：${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setRecallLoadingModels(false);
    }
  };

  const testRecall = async () => {
    if (!recallEffective.baseUrl || !recallEffective.apiKey || !recallEffective.model) {
      setRecallTestResult({ ok: false, detail: '请先补全忆庭召回 API 的 Base URL / API Key / Model。' });
      return;
    }
    try {
      const result = await testConnection({ ...recallEffective, name: '忆庭召回' });
      setRecallTestResult(result);
    } catch (err) {
      setRecallTestResult({ ok: false, detail: err instanceof Error ? err.message : String(err) });
    }
  };

  const fetchArchiveModels = async () => {
    if (!archiveEffective.baseUrl || !archiveEffective.apiKey) {
      setArchiveMessage({
        kind: 'error',
        text: mainConfig
          ? '忆庭精炼会回退主 API；如果主 API 也没配，请先补全。'
          : '请先填写忆庭精炼 API 的 Base URL 和 API Key，或先配置主 API。',
      });
      return;
    }
    setArchiveLoadingModels(true);
    setArchiveMessage(null);
    try {
      const list = await fetchModels({ ...archiveEffective, name: '忆庭精炼' });
      setArchiveModelOptions(list);
      if (list.length > 0 && !list.includes(memory.忆庭精炼API.model.trim())) {
        patchArchiveApi({ model: list[0] });
      }
      setArchiveMessage({ kind: 'info', text: `已获取 ${list.length} 个模型。` });
    } catch (err) {
      setArchiveMessage({ kind: 'error', text: `获取模型失败：${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setArchiveLoadingModels(false);
    }
  };

  const testArchive = async () => {
    if (!archiveEffective.baseUrl || !archiveEffective.apiKey || !archiveEffective.model) {
      setArchiveTestResult({ ok: false, detail: '请先补全忆庭精炼 API 的 Base URL / API Key / Model。' });
      return;
    }
    try {
      const result = await testConnection({ ...archiveEffective, name: '忆庭精炼' });
      setArchiveTestResult(result);
    } catch (err) {
      setArchiveTestResult({ ok: false, detail: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleSave = async () => {
    try {
      await saveSetting('gameSettings', settings);
      setSavedFlash(true);
      setSaveMessage({ kind: 'info', text: '忆庭设置已保存。' });
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
          color: 'rgba(var(--tj-text-secondary), 0.78)',
          background: 'rgba(var(--tj-accent-primary), 0.05)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
          clipPath: cardClip,
        }}
      >
        <div className="mb-1 font-serif text-[13px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.9)' }}>
          忆庭
        </div>
        回忆库的独立接口分成两层：召回负责检索可注入的记忆，精炼负责把材料压成可回看的摘要与原文层。
      </div>

      <Section title="系统开关">
        <ToggleField
          label="启用忆庭召回"
          desc="开启后，达到触发回合后会检索回忆档案并注入主剧情。关闭只停止召回，回合纪要仍会入库，方便之后重新开启。"
          checked={memory.忆庭启用 !== false}
          onChange={(checked) => patchMemory({ 忆庭启用: checked })}
        />
        <ToggleField
          label="启用独立精炼"
          desc="开启后，忆庭入库会调用精炼 API 生成概要；关闭时使用主剧情小总结和本地格式兜底。"
          checked={memory.忆庭独立精炼 === true}
          onChange={(checked) => patchMemory({ 忆庭独立精炼: checked })}
        />
      </Section>

      <ApiSection
        title="回忆接口"
        description="这里负责从回忆库里检索记忆，返回给主剧情做注入。"
        api={memory.忆庭召回API}
        effective={recallEffective}
        modelOptions={recallModelChoices}
        loadingModels={recallLoadingModels}
        message={recallMessage}
        testResult={recallTestResult}
        onPatch={patchRecallApi}
        onFetchModels={fetchRecallModels}
        onTest={testRecall}
      />

      <ApiSection
        title="精炼接口"
        description="这里负责把回合材料压成回忆档案的摘要与原文层。"
        api={memory.忆庭精炼API}
        effective={archiveEffective}
        modelOptions={archiveModelChoices}
        loadingModels={archiveLoadingModels}
        message={archiveMessage}
        testResult={archiveTestResult}
        onPatch={patchArchiveApi}
        onFetchModels={fetchArchiveModels}
        onTest={testArchive}
      />

      <Section title="召回规则">
        <TextareaField
          label="回忆库召回提示词"
          value={memory.忆庭召回提示词}
          onChange={(value) => patchMemory({ 忆庭召回提示词: value })}
          rows={8}
          hint="用于从回忆档案中挑出强回忆与弱回忆，优先保留能直接影响当前输入理解与后续行动的内容。"
        />
        <TextareaField
          label="回忆库精炼提示词"
          value={memory.忆庭精炼提示词}
          onChange={(value) => patchMemory({ 忆庭精炼提示词: value })}
          rows={8}
          hint="用于把多回合材料压成摘要与原文两层，摘要要短，原文要完整，不要变成新剧情。"
        />
      </Section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-2 text-sm font-semibold"
          style={{
            color: savedFlash ? '#102013' : '#1b1408',
            background: savedFlash
              ? 'linear-gradient(135deg, rgba(160, 220, 160, 0.98), rgba(110, 190, 120, 0.94))'
              : 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.98), rgba(var(--tj-accent-secondary), 0.94))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.34)',
            clipPath: smallClip,
          }}
        >
          ◆ 保 存 忆 庭
        </button>
      </div>

      {saveMessage && (
        <div
          className="px-3 py-2 text-xs"
          style={{
            color: saveMessage.kind === 'error' ? '#ffb7b7' : 'rgba(var(--tj-text-secondary), 0.95)',
            background: saveMessage.kind === 'error' ? 'rgba(120, 30, 30, 0.35)' : 'rgba(var(--tj-accent-primary), 0.05)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
            clipPath: smallClip,
          }}
        >
          {saveMessage.text}
        </div>
      )}
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
      style={{ boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.16)', clipPath: smallClip }}
    >
      <span>
        <span className="block font-serif text-[13px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.92)' }}>
          {label}
        </span>
        <span className="mt-1 block text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.74)' }}>
          {desc}
        </span>
      </span>
      <span
        className="relative h-7 w-12 shrink-0 transition-all"
        style={{
          background: checked ? 'rgba(var(--tj-accent-primary),0.26)' : 'rgba(80,75,68,0.45)',
          boxShadow: `inset 0 0 0 1px ${checked ? 'rgba(var(--tj-accent-primary),0.55)' : 'rgba(var(--tj-text-secondary),0.28)'}`,
          borderRadius: 999,
        }}
      >
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
        <span
          className="absolute top-1 h-5 w-5 rounded-full transition-all"
          style={{
            left: checked ? 24 : 4,
            background: checked ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-secondary),0.8)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
          }}
        />
      </span>
    </label>
  );
}

function ApiSection({
  title,
  description,
  api,
  effective,
  modelOptions,
  loadingModels,
  message,
  testResult,
  onPatch,
  onFetchModels,
  onTest,
}: {
  title: string;
  description: string;
  api: 忆庭API覆盖;
  effective: ResolvedApi;
  modelOptions: string[];
  loadingModels: boolean;
  message: { kind: 'info' | 'error'; text: string } | null;
  testResult: ConnectionTestResult | null;
  onPatch: (patch: Partial<忆庭API覆盖>) => void;
  onFetchModels: () => void;
  onTest: () => void;
}) {
  return (
    <Section title={title}>
      <div
        className="px-3 py-2 text-xs leading-relaxed"
        style={{
          color: 'rgba(var(--tj-text-secondary), 0.78)',
          background: 'rgba(var(--tj-accent-primary), 0.04)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
          clipPath: smallClip,
        }}
      >
        {description}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <SelectField
          label="供应商"
          value={effective.provider}
          onChange={(value) => onPatch({ provider: value as AI提供商 })}
          options={providerOptions.map((option) => ({ value: option.value, label: option.label }))}
        />
        <label className="block md:col-span-2">
          <div className="mb-1.5 font-serif text-[12px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.88)' }}>
            模型
          </div>
          <div className="flex gap-2">
            <input
              value={api.model}
              onChange={(e) => onPatch({ model: e.target.value })}
              className="kaituo-input flex-1 px-2.5 py-1.5 text-sm"
              style={{ clipPath: smallClip }}
              placeholder="模型 ID"
            />
            <button
              type="button"
              onClick={onFetchModels}
              className="px-3 py-1.5 text-xs font-serif tracking-wider transition-all disabled:opacity-50"
              style={{
                color: 'rgba(var(--tj-accent-primary), 0.9)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45)',
                background: 'rgba(var(--tj-accent-primary), 0.06)',
                clipPath: smallClip,
              }}
            >
              {loadingModels ? '获取中...' : '获取模型'}
            </button>
          </div>
          {modelOptions.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) onPatch({ model: e.target.value });
              }}
              className="kaituo-input mt-2 w-full px-2.5 py-1.5 text-xs"
              style={{ clipPath: smallClip }}
            >
              <option value="">— 从列表选择（{modelOptions.length}）—</option>
              {modelOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          )}
        </label>
        <InputField label="Base URL" value={api.baseUrl} onChange={(value) => onPatch({ baseUrl: value })} />
        <InputField label="API Key" value={api.apiKey} onChange={(value) => onPatch({ apiKey: value })} />
        <NumberField
          label="最大输出"
          value={api.maxTokens ?? 1024}
          onChange={(value) => onPatch({ maxTokens: Math.max(1, value) })}
          hint="留给该接口的最大输出 token。"
        />
        <NumberField
          label="温度"
          value={Math.round(((api.temperature ?? 0.2) * 100)) / 100}
          onChange={(value) => onPatch({ temperature: value })}
          hint="建议保持偏低，减少摘要和召回偏移。"
          step={0.05}
          min={0}
          max={2}
        />
        <NumberField
          label="重试"
          value={api.retryCount ?? 2}
          onChange={(value) => onPatch({ retryCount: Math.max(0, Math.trunc(value)) })}
          hint="获取模型和测试连接失败时自动重试的次数。"
          step={1}
          min={0}
          max={5}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onFetchModels}
          className="px-3 py-1.5 text-sm font-serif tracking-wider transition-all disabled:opacity-50"
          style={{
            color: 'rgba(var(--tj-accent-primary), 0.9)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45)',
            background: 'rgba(var(--tj-accent-primary), 0.06)',
            clipPath: smallClip,
          }}
        >
          {loadingModels ? '获取中...' : '获取模型'}
        </button>
        <button
          type="button"
          onClick={onTest}
          className="px-3 py-1.5 text-sm font-serif tracking-wider transition-all disabled:opacity-50"
          style={{
            color: 'rgba(var(--tj-accent-primary), 0.9)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45)',
            background: 'rgba(var(--tj-accent-primary), 0.06)',
            clipPath: smallClip,
          }}
        >
          测试连接
        </button>
      </div>

      {modelOptions.length > 0 && (
        <div className="mt-3 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.74)' }}>
          已获取模型：{modelOptions.slice(0, 8).join(' · ')}
        </div>
      )}

      {message && (
        <div
          className="mt-3 px-3 py-2 text-xs"
          style={{
            color: message.kind === 'error' ? '#ffb7b7' : 'rgba(var(--tj-text-secondary), 0.95)',
            background: message.kind === 'error' ? 'rgba(120, 30, 30, 0.35)' : 'rgba(var(--tj-accent-primary), 0.05)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
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
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
            clipPath: smallClip,
          }}
        >
          {testResult.detail}
        </div>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="px-4 py-4"
      style={{
        background: 'rgba(var(--tj-accent-primary), 0.035)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
        clipPath: cardClip,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="h-4 w-[3px]" style={{ background: 'rgb(var(--tj-accent-primary))' }} />
        <span className="font-serif text-[13px] font-semibold tracking-[0.28em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
          {title}
        </span>
        <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(var(--tj-accent-primary),0.35), transparent)' }} />
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
      <div className="mb-1.5 font-serif text-[12px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.88)' }}>
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
      <div className="mb-1.5 font-serif text-[12px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.88)' }}>
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
      <div className="mb-1.5 font-serif text-[12px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.88)' }}>
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
      <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
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
      <div className="mb-1.5 font-serif text-[12px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.88)' }}>
        {label}
      </div>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="kaituo-input w-full px-3 py-2 text-sm leading-relaxed"
        style={{ clipPath: smallClip }}
      />
      <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
        {hint}
      </div>
    </label>
  );
}

function uniqueModels(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}
