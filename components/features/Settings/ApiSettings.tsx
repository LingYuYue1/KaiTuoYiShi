import { useEffect, useMemo, useState } from 'react';
import type { API设置, API配置项, AI提供商, 游戏设置 } from '@/models/settings';
import {
  MAX_OUTPUT_TIERS,
  inferMaxOutputTier,
  matchModelRecommendation,
  type MaxOutputTier,
} from '@/data/modelRecommendations';
import { fetchModels, testConnection, type ConnectionTestResult } from '@/services/ai/apiTools';
import { loadSetting, saveSetting } from '@/services/dbService';

interface Props {
  settings: API设置;
  onChange: (s: API设置) => void;
  gameSettings: 游戏设置;
  onGameSettingsChange: (s: 游戏设置) => void;
}

interface API配置包 {
  app: 'KaiTuoYiShi';
  kind: 'api-profile';
  version: 1;
  exportedAt: string;
  includeApiKeys: boolean;
  enableClaudeMode?: boolean;
  apiSettings: API设置;
  routes: {
    variableApi: 游戏设置['variableApi'];
    新闻系统: 游戏设置['新闻系统']['api'];
    手机系统: 游戏设置['手机系统']['api'];
    智库系统: 游戏设置['智库系统']['api'];
    剧情编织系统: 游戏设置['剧情编织系统']['api'];
    记忆总结API: 游戏设置['记忆系统']['记忆总结API'];
    忆庭召回API: 游戏设置['记忆系统']['忆庭召回API'];
    忆庭精炼API: 游戏设置['记忆系统']['忆庭精炼API'];
    文生图普通接口: 游戏设置['文生图系统']['普通接口'];
    文生图场景接口: 游戏设置['文生图系统']['场景接口'];
    文生图NSFW接口: 游戏设置['文生图系统']['NSFW接口'];
    文生图词组转化器API: 游戏设置['文生图系统']['词组转化器API'];
  };
}

interface API方案槽位 {
  id: string;
  name: string;
  savedAt: number;
  profile: API配置包;
}

const API_PROFILE_SLOTS_KEY = 'apiProfileSlots';

const providerOptions: { value: AI提供商; label: string; defaultBaseUrl: string; defaultModel: string }[] = [
  { value: 'openai_compatible', label: 'OpenAI 兼容', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
  { value: 'openai', label: 'OpenAI', defaultBaseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
  { value: 'deepseek', label: 'DeepSeek', defaultBaseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  { value: 'baidu', label: '百度千帆', defaultBaseUrl: 'https://qianfan.baidubce.com/v2', defaultModel: 'ernie-4.5-turbo-128k' },
  { value: 'claude', label: 'Claude', defaultBaseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-sonnet-4-5' },
  { value: 'claude_compatible', label: 'Claude 兼容', defaultBaseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-sonnet-4-5' },
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

function cloneWithoutKeys<T>(value: T, includeApiKeys: boolean): T {
  const cloned = JSON.parse(JSON.stringify(value)) as T;
  if (includeApiKeys) return cloned;
  const clear = (target: unknown) => {
    if (target && typeof target === 'object' && 'apiKey' in target) {
      (target as { apiKey?: string }).apiKey = '';
    }
  };
  const root = cloned as unknown as API配置包;
  for (const config of root.apiSettings?.configs ?? []) clear(config);
  for (const item of Object.values(root.routes ?? {})) clear(item);
  return cloned;
}

function buildApiProfile(settings: API设置, gameSettings: 游戏设置, includeApiKeys: boolean): API配置包 {
  return cloneWithoutKeys({
    app: 'KaiTuoYiShi',
    kind: 'api-profile',
    version: 1,
    exportedAt: new Date().toISOString(),
    includeApiKeys,
    enableClaudeMode: gameSettings.enableClaudeMode === true,
    apiSettings: settings,
    routes: {
      variableApi: gameSettings.variableApi,
      新闻系统: gameSettings.新闻系统.api,
      手机系统: gameSettings.手机系统.api,
      智库系统: gameSettings.智库系统.api,
      剧情编织系统: gameSettings.剧情编织系统.api,
      记忆总结API: gameSettings.记忆系统.记忆总结API,
      忆庭召回API: gameSettings.记忆系统.忆庭召回API,
      忆庭精炼API: gameSettings.记忆系统.忆庭精炼API,
      文生图普通接口: gameSettings.文生图系统.普通接口,
      文生图场景接口: gameSettings.文生图系统.场景接口,
      文生图NSFW接口: gameSettings.文生图系统.NSFW接口,
      文生图词组转化器API: gameSettings.文生图系统.词组转化器API,
    },
  }, includeApiKeys);
}

function validateApiProfile(input: unknown): API配置包 {
  const data = input as Partial<API配置包>;
  if (!data || typeof data !== 'object' || data.app !== 'KaiTuoYiShi' || data.kind !== 'api-profile') {
    throw new Error('不是有效的开拓轶事 API 配置包。');
  }
  if (data.version !== 1) {
    throw new Error('API 配置包版本不兼容，请更新客户端后再导入。');
  }
  if (!data.apiSettings || !Array.isArray(data.apiSettings.configs) || !data.routes) {
    throw new Error('API 配置包缺少必要配置。');
  }
  return data as API配置包;
}

function downloadApiProfile(profile: API配置包): void {
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.download = `KaiTuoYiShi-api-profile-${profile.includeApiKeys ? 'private' : 'safe'}-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ApiSettingsTab({ settings, onChange, gameSettings, onGameSettingsChange }: Props) {
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
  const [profileSlots, setProfileSlots] = useState<API方案槽位[]>([]);
  const [auxModel, setAuxModel] = useState('gemini-2.5-flash');
  const [auxModelOptions, setAuxModelOptions] = useState<string[]>([]);
  const [loadingAuxModels, setLoadingAuxModels] = useState(false);
  const [auxFetchMessage, setAuxFetchMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);

  const selectedConfig = useMemo(
    () => settings.configs.find((c) => c.id === selectedId) ?? null,
    [settings.configs, selectedId],
  );

  // Reset model options when switching config
  useEffect(() => {
    setModelOptions([]);
    setAuxModelOptions([]);
    setTestResult(null);
    setMessage(null);
    setAuxFetchMessage(null);
  }, [selectedId]);

  useEffect(() => {
    loadSetting<API方案槽位[]>(API_PROFILE_SLOTS_KEY)
      .then((slots) => setProfileSlots(Array.isArray(slots) ? slots : []))
      .catch(() => setProfileSlots([]));
  }, []);

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

  const applyApiProfile = async (profile: API配置包) => {
    const nextApiSettings: API设置 = {
      activeConfigId: profile.apiSettings.activeConfigId,
      configs: profile.apiSettings.configs.map((config) => ({
        ...config,
        updatedAt: Date.now(),
      })),
    };
    const nextGameSettings: 游戏设置 = {
      ...gameSettings,
      enableClaudeMode: profile.enableClaudeMode ?? gameSettings.enableClaudeMode ?? false,
      variableApi: profile.routes.variableApi,
      新闻系统: { ...gameSettings.新闻系统, api: profile.routes.新闻系统 },
      手机系统: { ...gameSettings.手机系统, api: profile.routes.手机系统 },
      智库系统: { ...gameSettings.智库系统, api: profile.routes.智库系统 },
      剧情编织系统: { ...gameSettings.剧情编织系统, api: profile.routes.剧情编织系统 },
      记忆系统: {
        ...gameSettings.记忆系统,
        记忆总结API: profile.routes.记忆总结API,
        忆庭召回API: profile.routes.忆庭召回API,
        忆庭精炼API: profile.routes.忆庭精炼API,
      },
      文生图系统: {
        ...gameSettings.文生图系统,
            普通接口: profile.routes.文生图普通接口,
            场景接口: profile.routes.文生图场景接口,
            NSFW接口: profile.routes.文生图NSFW接口,
            词组转化器API: profile.routes.文生图词组转化器API,
          },
    };
    onChange(nextApiSettings);
    onGameSettingsChange(nextGameSettings);
    setSelectedId(nextApiSettings.activeConfigId ?? nextApiSettings.configs[0]?.id ?? null);
    await saveSetting('apiSettings', nextApiSettings);
    await saveSetting('gameSettings', nextGameSettings);
  };

  const persistProfileSlots = async (slots: API方案槽位[]) => {
    setProfileSlots(slots);
    await saveSetting(API_PROFILE_SLOTS_KEY, slots);
  };

  const handleSaveProfileSlot = async () => {
    const defaultName = selectedConfig?.name || `API 方案 ${profileSlots.length + 1}`;
    const name = window.prompt('给当前 API 方案起个名字：', defaultName)?.trim();
    if (!name) return;
    const slot: API方案槽位 = {
      id: `api_profile_${Date.now()}`,
      name,
      savedAt: Date.now(),
      profile: buildApiProfile(settings, gameSettings, true),
    };
    await persistProfileSlots([slot, ...profileSlots].slice(0, 12));
    setMessage({ kind: 'info', text: `已保存 API 方案：${name}` });
  };

  const handleLoadProfileSlot = async (slot: API方案槽位) => {
    await applyApiProfile(slot.profile);
    setMessage({ kind: 'info', text: `已切换到 API 方案：${slot.name}` });
  };

  const handleDeleteProfileSlot = async (slot: API方案槽位) => {
    if (!window.confirm(`删除 API 方案「${slot.name}」？`)) return;
    await persistProfileSlots(profileSlots.filter((item) => item.id !== slot.id));
    setMessage({ kind: 'info', text: `已删除 API 方案：${slot.name}` });
  };

  const handleExportProfile = (includeApiKeys: boolean) => {
    if (
      includeApiKeys &&
      !window.confirm('私人 API 配置包会包含 API Key。只适合自己换设备迁移，不要发给别人。确认导出吗？')
    ) {
      return;
    }
    downloadApiProfile(buildApiProfile(settings, gameSettings, includeApiKeys));
    setMessage({
      kind: 'info',
      text: includeApiKeys ? '已导出私人 API 配置包，请勿分享。' : '已导出安全 API 配置包，API Key 已清空。',
    });
  };

  const handleImportProfile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const profile = validateApiProfile(JSON.parse(await file.text()));
        await applyApiProfile(profile);
        setMessage({
          kind: 'info',
          text: profile.includeApiKeys ? '已导入私人 API 配置包。' : '已导入 API 配置包；如未包含 Key，请补填密钥。',
        });
      } catch (e) {
        setMessage({ kind: 'error', text: `导入失败：${(e as Error).message}` });
      }
    };
    input.click();
  };

  const handleApplyAuxModel = async () => {
    const model = auxModel.trim();
    if (!model) {
      setMessage({ kind: 'error', text: '请先填写要套用到其他 API 的模型 ID。' });
      return;
    }
    const nextGameSettings: 游戏设置 = {
      ...gameSettings,
      variableApi: { ...gameSettings.variableApi, model },
      新闻系统: { ...gameSettings.新闻系统, api: { ...gameSettings.新闻系统.api, model } },
      手机系统: { ...gameSettings.手机系统, api: { ...gameSettings.手机系统.api, model } },
      智库系统: { ...gameSettings.智库系统, api: { ...gameSettings.智库系统.api, model } },
      剧情编织系统: { ...gameSettings.剧情编织系统, api: { ...gameSettings.剧情编织系统.api, model } },
      记忆系统: {
        ...gameSettings.记忆系统,
        记忆总结API: { ...gameSettings.记忆系统.记忆总结API, model },
        忆庭召回API: { ...gameSettings.记忆系统.忆庭召回API, model },
        忆庭精炼API: { ...gameSettings.记忆系统.忆庭精炼API, model },
      },
    };
    onGameSettingsChange(nextGameSettings);
    await saveSetting('gameSettings', nextGameSettings);
    setMessage({ kind: 'info', text: `已把其他文本 API 模型统一改为：${model}` });
  };

  const handleFetchAuxModels = async () => {
    if (!selectedConfig) return;
    setLoadingAuxModels(true);
    setAuxFetchMessage(null);
    try {
      const list = await fetchModels({
        ...selectedConfig,
        enableClaudeMode: gameSettings.enableClaudeMode === true,
        retryCount: selectedConfig.retryCount ?? 2,
      });
      setAuxModelOptions(list);
      setAuxFetchMessage({ kind: 'info', text: `获取到 ${list.length} 个模型，请从列表选择。` });
    } catch (e) {
      setAuxFetchMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      setLoadingAuxModels(false);
    }
  };

  const handleFetchModels = async () => {
    if (!selectedConfig) return;
    setLoadingModels(true);
    setMessage(null);
    try {
      const list = await fetchModels({
        ...selectedConfig,
        enableClaudeMode: gameSettings.enableClaudeMode === true,
        retryCount: selectedConfig.retryCount ?? 2,
      });
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
      const result = await testConnection({
        ...selectedConfig,
        enableClaudeMode: gameSettings.enableClaudeMode === true,
        retryCount: selectedConfig.retryCount ?? 2,
      });
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
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-y-auto pr-1">
      <div
        className="px-3 py-3 text-xs leading-relaxed sm:px-4"
        style={{
          color: 'rgba(var(--tj-text-secondary), 0.78)',
          background: 'rgba(var(--tj-accent-primary), 0.045)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
          clipPath: cardClip,
        }}
      >
        <div className="font-serif tracking-[0.22em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.9)' }}>
          ◆ API 配置提示
        </div>
        <div className="mt-1.5 space-y-0.5">
          <div>安全包：不会保存 Key 数据，适合分享配置模板。</div>
          <div>私人包：会保存 Key 数据，请不要发给其他人。</div>
          <div>个别功能需要手动开启；主剧情和变量推荐使用智商高一点的模型，例如 3.1 Pro。</div>
        </div>
      </div>

      {/* ── 顶部：新建配置（横向铺满） ── */}
      <div
        className="flex min-w-0 flex-col items-stretch gap-3 px-3 py-3 sm:flex-row sm:items-center sm:px-4 sm:py-2.5"
        style={{
          background: 'rgba(var(--tj-bg-secondary), 0.55)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22)',
          clipPath: cardClip,
        }}
      >
        <span
          className="font-serif text-xs tracking-[0.3em]"
          style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}
        >
          ◆ 新建配置
        </span>
        <span style={{ color: 'rgba(var(--tj-accent-primary), 0.2)' }}>|</span>
        <span
          className="text-xs tracking-wider"
          style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}
        >
          供应商
        </span>
        <select
          value={newProvider}
          onChange={(e) => setNewProvider(e.target.value as AI提供商)}
          className="kaituo-input min-w-0 px-2.5 py-1.5 text-sm"
          style={{ clipPath: smallClip }}
        >
          {providerOptions.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          onClick={handleCreate}
          className="px-4 py-2 text-xs font-serif tracking-[0.18em] transition-all hover:opacity-90 sm:py-1.5 sm:tracking-[0.25em]"
          style={{
            background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(212, 177, 90, 0.95))',
            color: 'rgb(var(--tj-on-accent))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5)',
            clipPath: smallClip,
          }}
        >
          ＋ 创建配置
        </button>
        <span
          className="text-xs tracking-wider sm:ml-auto"
          style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}
        >
          共 {settings.configs.length} 个配置
        </span>
      </div>

      <div
        className="flex min-w-0 flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:px-4"
        style={{
          background: 'rgba(var(--tj-bg-secondary), 0.45)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
          clipPath: cardClip,
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="font-serif text-xs tracking-[0.24em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}>
            ◆ API 配置包
          </div>
          <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
            导入/导出主 API 与变量、新闻、手机、智库、剧情编织、记忆、文生图等独立接口。安全导出会清空 API Key。
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-shrink-0">
          <button
            onClick={() => handleExportProfile(false)}
            className="px-2.5 py-1.5 text-xs font-serif tracking-wider transition-all hover:opacity-90"
            style={{
              color: 'rgba(var(--tj-accent-primary), 0.9)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.35)',
              clipPath: smallClip,
            }}
          >
            导出安全包
          </button>
          <button
            onClick={() => handleExportProfile(true)}
            className="px-2.5 py-1.5 text-xs font-serif tracking-wider transition-all hover:opacity-90"
            style={{
              color: 'rgba(255, 190, 120, 0.92)',
              boxShadow: 'inset 0 0 0 1px rgba(255, 190, 120, 0.35)',
              clipPath: smallClip,
            }}
          >
            导出私人包
          </button>
          <button
            onClick={handleImportProfile}
            className="px-2.5 py-1.5 text-xs font-serif tracking-wider transition-all hover:opacity-90"
            style={{
              background: 'rgba(var(--tj-accent-primary), 0.08)',
              color: 'rgba(var(--tj-text-primary), 0.92)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.3)',
              clipPath: smallClip,
            }}
          >
            导入配置包
          </button>
        </div>
      </div>

      <div
        className="flex min-w-0 flex-col gap-3 px-3 py-3 sm:px-4"
        style={{
          background: 'rgba(var(--tj-bg-secondary), 0.38)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
          clipPath: cardClip,
        }}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="font-serif text-xs tracking-[0.24em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}>
              ◆ 本机 API 方案
            </div>
            <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
              像存档一样保存当前整套 API 配置，之后可在本机一键切换。方案槽位会保留 API Key，请不要把浏览器数据交给他人。
            </div>
          </div>
          <button
            onClick={handleSaveProfileSlot}
            className="px-3 py-1.5 text-xs font-serif tracking-wider transition-all hover:opacity-90"
            style={{
              background: 'rgba(var(--tj-accent-primary), 0.08)',
              color: 'rgba(var(--tj-accent-primary), 0.92)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.35)',
              clipPath: smallClip,
            }}
          >
            保存当前方案
          </button>
        </div>

        {profileSlots.length === 0 ? (
          <div className="px-3 py-2 text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
            暂无本机 API 方案。
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {profileSlots.map((slot) => (
              <div
                key={slot.id}
                className="flex min-w-0 items-center gap-2 px-3 py-2"
                style={{
                  background: 'rgba(var(--tj-bg-secondary), 0.48)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
                  clipPath: smallClip,
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-serif text-xs tracking-wider" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                    {slot.name}
                  </div>
                  <div className="mt-0.5 truncate text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
                    {new Date(slot.savedAt).toLocaleString('zh-CN')} · {slot.profile.apiSettings.configs.length} 个主 API
                  </div>
                </div>
                <button
                  onClick={() => void handleLoadProfileSlot(slot)}
                  className="px-2.5 py-1 text-xs font-serif tracking-wider transition-all hover:opacity-90"
                  style={{
                    color: 'rgba(var(--tj-accent-primary), 0.9)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.32)',
                    clipPath: smallClip,
                  }}
                >
                  读取
                </button>
                <button
                  onClick={() => void handleDeleteProfileSlot(slot)}
                  className="px-2.5 py-1 text-xs font-serif tracking-wider transition-all hover:opacity-90"
                  style={{
                    color: 'rgba(220, 120, 120, 0.88)',
                    boxShadow: 'inset 0 0 0 1px rgba(220, 120, 120, 0.28)',
                    clipPath: smallClip,
                  }}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 主体：左列表 + 右详情 ── */}
      <div className="flex min-w-0 flex-col gap-4 md:flex-row">
        <aside className="flex max-h-[32dvh] w-full flex-shrink-0 flex-col md:max-h-none md:w-[220px]">
          <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
          {settings.configs.length === 0 && (
            <div
              className="px-3 py-4 text-center text-xs"
              style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}
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
                    ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.14), rgba(var(--tj-accent-secondary), 0.04))'
                    : 'rgba(var(--tj-bg-secondary), 0.5)',
                  boxShadow: selected
                    ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.55)'
                    : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
                  clipPath: smallClip,
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span style={{ color: active ? 'rgba(var(--tj-accent-primary), 0.95)' : 'rgba(var(--tj-accent-primary), 0.35)' }}>
                    {active ? '◆' : '◇'}
                  </span>
                  <span
                    className="truncate font-serif text-xs tracking-wider"
                    style={{ color: selected ? 'rgb(var(--tj-accent-primary))' : 'rgb(var(--tj-text-primary))' }}
                  >
                    {c.name || '（未命名）'}
                  </span>
                </div>
                <div
                  className="ml-4 mt-0.5 truncate text-[10px] tracking-wider"
                  style={{ color: 'rgba(var(--tj-text-secondary), 0.55)' }}
                >
                  {c.provider} · {c.model || '—'}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── 右侧：详情 ── */}
      <section className="flex min-w-0 flex-1 flex-col gap-3 pr-1">
        {!selectedConfig ? (
          <div
            className="flex h-full items-center justify-center text-sm"
            style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}
          >
            请先在左侧创建并选择一个配置
          </div>
        ) : (
          <>
            {/* 顶部操作条 */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <span style={{ color: 'rgba(var(--tj-accent-primary), 0.9)' }}>
                  {settings.activeConfigId === selectedConfig.id ? '◆' : '◇'}
                </span>
                <span
                  className="min-w-0 truncate font-serif text-sm font-bold tracking-[0.18em] sm:tracking-[0.25em]"
                  style={{
                    background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 45%, rgb(var(--tj-accent-secondary)) 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {settings.activeConfigId === selectedConfig.id ? '当前使用中' : '未启用'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {settings.activeConfigId !== selectedConfig.id && (
                  <button
                    onClick={handleActivate}
                    className="px-2.5 py-1 text-xs font-serif tracking-wider transition-all hover:opacity-90"
                    style={{
                      background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(212, 177, 90, 0.95))',
                      color: 'rgb(var(--tj-on-accent))',
                      boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5)',
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
                placeholder={selectedConfig.provider === 'baidu' ? 'https://qianfan.baidubce.com/v2 或 /v2/coding' : 'https://api.example.com/v1'}
                className="kaituo-input w-full px-2.5 py-1.5 text-sm"
                style={{ clipPath: smallClip }}
              />
              {selectedConfig.provider === 'baidu' && (
                <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
                  普通千帆填 https://qianfan.baidubce.com/v2；Coding Plan 填 https://qianfan.baidubce.com/v2/coding。若复制了完整 chat/completions 地址也会自动兼容。
                </div>
              )}
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
                <div className="flex flex-col gap-1.5 sm:flex-row">
                  <input
                    value={selectedConfig.model}
                    onChange={(e) => updateConfig({ model: e.target.value })}
                    placeholder="模型 ID"
                    className="kaituo-input min-w-0 flex-1 px-2.5 py-1.5 text-sm"
                    style={{ clipPath: smallClip }}
                  />
                  <button
                    onClick={handleFetchModels}
                    disabled={loadingModels}
                    className="px-3 py-2 text-xs font-serif tracking-wider transition-all disabled:opacity-50 sm:py-1.5"
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

            <div
              className="space-y-2 p-3 text-xs"
              style={{
                background: 'rgba(var(--tj-bg-secondary), 0.42)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
                clipPath: smallClip,
              }}
            >
              <div className="font-serif tracking-[0.22em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.86)' }}>
                ◆ 其他 API 模型设置
              </div>
              <div className="leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
                正文继续使用上方主模型；这里只批量修改变量、新闻、手机、智库、剧情编织、记忆与忆庭的模型 ID，不改 Base URL / Key，也不影响文生图。
              </div>
              <div className="flex flex-col gap-1.5 sm:flex-row">
                <input
                  value={auxModel}
                  onChange={(e) => setAuxModel(e.target.value)}
                  placeholder="例如 gemini-2.5-flash"
                  className="kaituo-input min-w-0 flex-1 px-2.5 py-1.5 text-sm"
                  style={{ clipPath: smallClip }}
                />
                <button
                  onClick={() => void handleFetchAuxModels()}
                  disabled={loadingAuxModels}
                  className="px-3 py-1.5 text-xs font-serif tracking-wider transition-all hover:opacity-90 disabled:opacity-50"
                  style={{
                    color: 'rgba(var(--tj-accent-primary), 0.86)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.32)',
                    clipPath: smallClip,
                  }}
                >
                  {loadingAuxModels ? '获取中…' : '获取列表'}
                </button>
                <button
                  onClick={() => void handleApplyAuxModel()}
                  className="px-3 py-1.5 text-xs font-serif tracking-wider transition-all hover:opacity-90"
                  style={{
                    background: 'rgba(var(--tj-accent-primary), 0.08)',
                    color: 'rgba(var(--tj-accent-primary), 0.92)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.35)',
                    clipPath: smallClip,
                  }}
                >
                  一键套用到其他 API
                </button>
              </div>
              {auxModelOptions.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setAuxModel(e.target.value);
                  }}
                  className="kaituo-input w-full px-2.5 py-1.5 text-xs"
                  style={{ clipPath: smallClip }}
                >
                  <option value="">— 从列表选择（{auxModelOptions.length}） —</option>
                  {auxModelOptions.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              )}
              {auxFetchMessage && (
                <div
                  className="text-[11px]"
                  style={{
                    color: auxFetchMessage.kind === 'error' ? 'rgba(220, 120, 120, 0.9)' : 'rgba(160, 200, 160, 0.78)',
                  }}
                >
                  {auxFetchMessage.text}
                </div>
              )}
            </div>

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
                            ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(212, 177, 90, 0.95))'
                            : 'transparent',
                          color: active ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.85)',
                          boxShadow: active
                            ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5)'
                            : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.3)',
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
                  background: 'rgba(var(--tj-accent-primary), 0.04)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.25)',
                  clipPath: smallClip,
                }}
              >
                <div
                  className="mb-1 font-serif tracking-[0.2em]"
                  style={{ color: 'rgba(var(--tj-accent-primary), 0.9)' }}
                >
                  ✦ {recommendation.providerLabel} · {recommendation.modelLabel}
                </div>
                <div className="leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.85)' }}>
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
                  style={{ color: 'rgba(var(--tj-accent-primary), 0.6)' }}
                >
                  来源：{recommendation.sourceLabel}
                </a>
              </div>
            )}

            {/* 测试连接 */}
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
              <button
                onClick={handleTest}
                disabled={testing}
                className="px-3 py-1.5 text-sm font-serif tracking-wider transition-all disabled:opacity-50"
                style={{
                  color: 'rgba(var(--tj-accent-primary), 0.9)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45)',
                  background: 'rgba(var(--tj-accent-primary), 0.06)',
                  clipPath: smallClip,
                }}
              >
                {testing ? '测试中…' : '测试连接'}
              </button>
              {message && (
                <span
                  className="text-xs tracking-wider"
                  style={{ color: message.kind === 'error' ? 'rgba(220, 120, 120, 0.9)' : 'rgba(var(--tj-text-secondary), 0.85)' }}
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
                  className="max-w-full whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed"
                  style={{ color: 'rgba(var(--tj-text-secondary), 0.85)' }}
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
                    : 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(212, 177, 90, 0.95))',
                  color: 'rgb(var(--tj-on-accent))',
                  boxShadow: savedFlash
                    ? 'inset 0 0 0 1px rgba(220, 255, 230, 0.5), 0 0 18px rgba(140, 220, 160, 0.35)'
                    : 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5), 0 0 18px rgba(var(--tj-accent-primary), 0.22)',
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
