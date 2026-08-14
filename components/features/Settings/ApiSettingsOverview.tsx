import type { AI提供商 } from '@/models/settings';
import { MAX_OUTPUT_TIERS } from '@/data/modelRecommendations';
import { cardClip, providerOptions, smallClip } from './settingsShared';
import { useApiOverviewSettings, type ApiSettingsOverviewProps } from '@/hooks/useApiOverviewSettings';

export type { ApiSettingsOverviewProps } from '@/hooks/useApiOverviewSettings';

export function ApiSettingsOverviewTab(props: ApiSettingsOverviewProps) {
  const {
    selectedId,
    setSelectedId,
    newProvider,
    setNewProvider,
    modelOptions,
    loadingModels,
    testing,
    testResult,
    message,
    savedFlash,
    profileSlots,
    auxForm,
    auxModelOptions,
    loadingAuxModels,
    auxFetchMessage,
    selectedConfig,
    recommendation,
    currentTier,
    settings,
    updateConfig,
    persistAuxForm,
    handleCreate,
    handleDelete,
    handleActivate,
    handleSave,
    handleSaveProfileSlot,
    handleLoadProfileSlot,
    handleDeleteProfileSlot,
    handleExportProfile,
    handleImportProfile,
    handleApplyAuxModel,
    handleFetchAuxModels,
    handleFetchModels,
    handleTest,
    handleTierChange,
  } = useApiOverviewSettings(props);

  return (
    <div className="kaituo-settings-pane flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-y-auto pr-1">
      <div
        className="flex min-w-0 flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:px-4"
        style={{ clipPath: cardClip }}
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
              color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))',
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
              color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.28)',
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
            onClick={() => void handleSaveProfileSlot()}
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
                    color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))',
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

      <div
        className="px-3 py-3 text-xs leading-relaxed sm:px-4"
        style={{ color: 'rgba(var(--tj-text-secondary), 0.78)', clipPath: cardClip }}
      >
        <div className="font-serif tracking-[0.22em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))' }}>
          ◆ API 配置提示
        </div>
        <div className="mt-1.5 space-y-0.5">
          <div>安全包：不会保存 Key 数据，适合分享配置模板。</div>
          <div>私人包：会保存 Key 数据，请不要发给其他人。</div>
          <div>个别功能需要手动开启；主剧情和变量推荐使用智商高一点的模型，例如 3.1 Pro。</div>
        </div>
      </div>

      {/* ── 新建配置（移动到提示下方） ── */}
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
            background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(var(--tj-accent-primary), 0.92))',
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
                <span style={{ color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))' }}>
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
                      background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.96), rgba(var(--tj-accent-primary), 0.84))',
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
              {selectedConfig.provider === 'mimo' && (
                <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
                  小米 MiMo 官方 OpenAI 兼容接口默认填 https://api.xiaomimimo.com/v1。系统会自动使用 max_completion_tokens，并默认关闭深度思考，避免思维链挤占正文或污染格式。
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
                    onClick={() => void handleFetchModels()}
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
                正文继续使用上方主模型；这里可以批量修改变量、新闻、手机、智库、剧情编织、记忆与忆庭的供应商、Base URL、Key 和模型 ID，不影响文生图。
              </div>
              <div
                className="leading-relaxed"
                style={{
                  color: 'rgba(var(--tj-text-primary), 0.92)',
                  background: 'rgba(var(--tj-accent-primary), 0.05)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
                  clipPath: smallClip,
                  padding: '0.45rem 0.6rem',
                }}
              >
                怎么选：其他功能用 Gemini 或通用中转时，选 Gemini / OpenAI 兼容；其他功能也用 Claude 时，选 Claude 或 Claude 兼容。系统会让 Claude 模型走 Claude 通道，并避免 Gemini 被送进 Claude 专用接口。
              </div>
              <div className="grid gap-1.5 sm:grid-cols-[180px_minmax(0,1fr)]">
                <select
                  value={auxForm.provider}
                  onChange={(e) => {
                    const nextProvider = e.target.value as AI提供商;
                    const meta = providerOptions.find((p) => p.value === nextProvider);
                    void persistAuxForm({
                      provider: nextProvider,
                      baseUrl: meta?.defaultBaseUrl ?? auxForm.baseUrl,
                      apiKey: auxForm.apiKey,
                      model: meta?.defaultModel ?? auxForm.model,
                    });
                  }}
                  className="kaituo-input min-w-0 px-2.5 py-1.5 text-sm"
                  style={{ clipPath: smallClip }}
                >
                  {providerOptions.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <input
                  value={auxForm.baseUrl}
                  onChange={(e) => void persistAuxForm({ ...auxForm, baseUrl: e.target.value })}
                  placeholder="其他 API Base URL"
                  className="kaituo-input min-w-0 px-2.5 py-1.5 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </div>
              <input
                value={auxForm.apiKey}
                onChange={(e) => void persistAuxForm({ ...auxForm, apiKey: e.target.value })}
                placeholder="其他 API Key"
                type="password"
                className="kaituo-input w-full px-2.5 py-1.5 text-sm"
                style={{ clipPath: smallClip }}
              />
              <div className="flex flex-col gap-1.5 sm:flex-row">
                <input
                  value={auxForm.model}
                  onChange={(e) => void persistAuxForm({ ...auxForm, model: e.target.value })}
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
                      if (e.target.value) void persistAuxForm({ ...auxForm, model: e.target.value });
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
                            ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(var(--tj-accent-primary), 0.86))'
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
                  style={{ color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))' }}
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
                onClick={() => void handleTest()}
                disabled={testing}
                className="px-3 py-1.5 text-sm font-serif tracking-wider transition-all disabled:opacity-50"
                style={{
                  color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))',
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
                onClick={() => void handleSave()}
                className="w-full py-3 text-sm font-serif tracking-[0.4em] transition-all hover:opacity-90"
                style={{
                  background: savedFlash
                    ? 'linear-gradient(135deg, rgba(140, 220, 160, 0.95), rgba(100, 180, 130, 0.95))'
                    : 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.96), rgba(var(--tj-accent-primary), 0.84))',
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
        style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}
