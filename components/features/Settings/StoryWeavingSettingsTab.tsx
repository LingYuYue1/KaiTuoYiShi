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
  { value: 'baidu', label: '百度千帆' },
  { value: 'opencode', label: 'OpenCode Zen' },
  { value: 'mimo', label: '小米 MiMo' },
  { value: 'ark', label: '火山方舟' },
  { value: 'cline', label: 'Cline' },
  { value: 'claude', label: 'Claude' },
  { value: 'claude_compatible', label: 'Claude 兼容' },
  { value: 'gemini', label: 'Gemini' },
];

export function StoryWeavingSettingsTab({ settings, onChange, apiSettings }: Props) {
  const story = settings.剧情编织系统;
  const mainConfig = apiSettings.configs.find((c) => c.id === apiSettings.activeConfigId) ?? apiSettings.configs[0] ?? null;
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  const patch = (patch: Partial<Omit<typeof story, 'api' | '推进判定API'>> & {
    api?: Partial<typeof story.api>;
    推进判定API?: Partial<typeof story.推进判定API>;
  }) => {
    onChange({
      ...settings,
      剧情编织系统: {
        ...story,
        ...patch,
        api: {
          ...story.api,
          ...(patch.api ?? {}),
        },
        推进判定API: {
          ...story.推进判定API,
          ...(patch.推进判定API ?? {}),
        },
      },
    });
  };

  const effectiveApi = {
    provider: story.api.provider || mainConfig?.provider || 'openai_compatible',
    baseUrl: story.api.baseUrl.trim() || mainConfig?.baseUrl || '',
    apiKey: story.api.apiKey.trim() || mainConfig?.apiKey || '',
    model: story.api.model.trim() || mainConfig?.model || '',
    enableClaudeMode: settings.enableClaudeMode === true,
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
        enableClaudeMode: effectiveApi.enableClaudeMode,
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
        <div className="mb-1 font-serif text-[13px] tracking-[0.18em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))' }}>
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

      <ToggleRow
        label="剧情推进 AI 判定（默认关闭）"
        desc="用独立 AI 语义判断本分段是否完成与实际进度，比关键词匹配更准。开启后每个普通回合额外消耗一次小请求；关闭时由 AI 申报 + 关键词校验推进。"
        checked={story.剧情推进AI判定 === true}
        onChange={(v) => patch({ 剧情推进AI判定: v })}
      />

      {story.剧情推进AI判定 === true && (
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
              推进判定 API（留空复用上方分解 API）
            </span>
          </div>
          <Field label="服务商">
            <select
              value={story.推进判定API.provider}
              onChange={(e) => patch({ 推进判定API: { provider: e.target.value as AI提供商 } })}
              className="kaituo-input w-full px-3 py-2 text-sm"
              style={{ clipPath: smallClip }}
            >
              {providerOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </Field>
          <Field label="Base URL">
            <input
              value={story.推进判定API.baseUrl}
              onChange={(e) => patch({ 推进判定API: { baseUrl: e.target.value } })}
              placeholder="留空则复用上方分解 API"
              className="kaituo-input w-full px-3 py-2 text-sm font-mono"
              style={{ clipPath: smallClip }}
            />
          </Field>
          <Field label="API Key">
            <input
              type="password"
              value={story.推进判定API.apiKey}
              onChange={(e) => patch({ 推进判定API: { apiKey: e.target.value } })}
              placeholder="留空则复用上方分解 API 的 Key"
              className="kaituo-input w-full px-3 py-2 text-sm font-mono"
              style={{ clipPath: smallClip }}
            />
          </Field>
          <Field label="模型">
            <input
              value={story.推进判定API.model}
              onChange={(e) => patch({ 推进判定API: { model: e.target.value } })}
              placeholder="留空则复用上方分解 API 的模型"
              className="kaituo-input w-full px-3 py-2 text-sm font-mono"
              style={{ clipPath: smallClip }}
            />
          </Field>
          <Field label="失败重试次数">
            <input
              type="number"
              min={0}
              max={5}
              value={story.推进判定API.retryCount ?? 2}
              onChange={(e) => patch({ 推进判定API: { retryCount: Number(e.target.value) } })}
              className="kaituo-input w-full px-3 py-2 text-sm"
              style={{ clipPath: smallClip }}
            />
          </Field>
        </div>
      )}

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
      <div className="flex flex-col items-stretch gap-2 pt-1">
        <button
          onClick={handleSave}
          className="w-full py-3 text-sm font-serif tracking-[0.4em] transition-all hover:opacity-90"
          style={{
            background: savedFlash
              ? 'linear-gradient(135deg, rgba(140, 220, 160, 0.95), rgba(100, 180, 130, 0.95))'
              : 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.96), rgba(var(--tj-btn-primary-end), 0.84))',
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
    <div
      className="flex items-center justify-between px-3 py-2"
      style={{
        background: 'rgba(var(--tj-bg-secondary), 0.45)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
        clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
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
            ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-btn-primary-end), 0.86))'
            : 'rgba(var(--tj-bg-secondary), 0.68)',
          boxShadow: checked
            ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5), 0 0 10px rgba(var(--tj-accent-primary), 0.25)'
            : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
          clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
        }}
      >
        <div
          className="absolute top-0.5 h-5 w-5 transition-transform"
          style={{
            left: checked ? 'calc(100% - 1.375rem)' : '0.125rem',
            background: checked ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.78)',
            clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
          }}
        />
      </button>
    </div>
  );
}
