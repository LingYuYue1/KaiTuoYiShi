import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type {
  AI提供商,
  API配置项,
  API设置,
  游戏设置,
  NovelAIUcPreset,
  NovelAI噪点表,
  NovelAI参数模式,
  NovelAI采样器,
  文生图API配置,
  文生图后端类型,
  文生图响应格式,
  文生图预设接口路径,
  文生图词组转化器API覆盖,
} from '@/models/settings';
import type { NovelAIContentMode } from '@/models/imageGeneration';
import { saveSetting } from '@/services/dbService';
import { fetchModels } from '@/services/ai/apiTools';
import { fetchComfyWorkflowCandidates, fetchImageGenerationModels, testImageGenerationConnection, type ComfyWorkflowCandidate } from '@/services/ai/imageGeneration';

interface Props {
  settings: 游戏设置;
  onChange: (s: 游戏设置) => void;
  apiSettings: API设置;
}

type Page = 'overview' | 'normal' | 'nsfw' | 'reference' | 'narrative' | 'tokenizer' | 'guide';
type ApiKey = '普通接口' | 'NSFW接口';

const smallClip = 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';
const cardClip = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
const settingsGridLayer = 'linear-gradient(90deg, rgba(var(--tj-accent-primary),0.052) 1px, transparent 1px), linear-gradient(180deg, rgba(var(--tj-tech-cyan),0.04) 1px, transparent 1px)';
const settingsHeroSurface = `${settingsGridLayer}, radial-gradient(circle at 14% 0%, rgba(var(--tj-tech-cyan), 0.12), transparent 34%), linear-gradient(180deg, rgba(var(--tj-surface),0.76), rgba(var(--tj-bg-primary),0.94))`;
const settingsGridSize = '26px 26px, 26px 26px, auto, auto';
const activeAccentSurface = 'linear-gradient(135deg, rgb(var(--tj-accent-primary)) 0%, rgba(var(--tj-accent-mid),0.96) 48%, rgb(var(--tj-tech-cyan)) 100%)';


const pages: { id: Page; label: string; desc: string }[] = [
  { id: 'overview', label: '总览', desc: '开关与隔离状态' },
  { id: 'normal', label: '统一接口', desc: '头像、立绘、场景' },
  { id: 'nsfw', label: 'NSFW接口', desc: '成人内容隔离' },
  { id: 'reference', label: '参考图', desc: '参与生成与后端能力' },
  { id: 'narrative', label: '正文插图', desc: '剧情插图生成' },
  { id: 'tokenizer', label: '转化器', desc: '档案转 prompt' },
  { id: 'guide', label: '接口说明', desc: '后端填写参考' },
];

const backendOptions: { value: 文生图后端类型; label: string }[] = [
  { value: 'openai_compatible', label: 'OpenAI 兼容图片接口' },
  { value: 'novelai', label: 'NovelAI 官方' },
  { value: 'sd_webui', label: 'Stable Diffusion WebUI' },
  { value: 'comfyui', label: 'ComfyUI' },
];

const providerOptions: { value: AI提供商 | ''; label: string }[] = [
  { value: '', label: '跟随主 API' },
  { value: 'openai_compatible', label: 'OpenAI 兼容' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'baidu', label: '百度千帆' },
  { value: 'opencode', label: 'OpenCode Zen' },
  { value: 'mimo', label: '小米 MiMo' },
  { value: 'ark', label: '火山方舟' },
  { value: 'claude', label: 'Claude' },
  { value: 'claude_compatible', label: 'Claude 兼容' },
  { value: 'gemini', label: 'Gemini' },
];

const responseOptions: { value: 文生图响应格式; label: string }[] = [
  { value: 'url', label: 'URL' },
  { value: 'b64_json', label: 'b64_json' },
  { value: 'dataUrl', label: 'dataUrl' },
];

const presetPathOptions: Record<文生图后端类型, { value: 文生图预设接口路径; label: string }[]> = {
  openai_compatible: [{ value: 'openai_images', label: '/images/generations' }],
  novelai: [{ value: 'novelai_generate', label: '/ai/generate-image' }],
  sd_webui: [{ value: 'sd_txt2img', label: '/sdapi/v1/txt2img' }],
  comfyui: [{ value: 'comfyui_prompt', label: '/prompt' }],
};

const samplerOptions: { value: NovelAI采样器; label: string }[] = [
  { value: 'k_euler_ancestral', label: 'Euler Ancestral' },
  { value: 'k_euler', label: 'Euler' },
  { value: 'k_dpmpp_2m', label: 'DPM++ 2M' },
  { value: 'k_dpmpp_2s_ancestral', label: 'DPM++ 2S Ancestral' },
  { value: 'k_dpmpp_sde', label: 'DPM++ SDE' },
  { value: 'k_dpmpp_2m_sde', label: 'DPM++ 2M SDE' },
];

const noiseOptions: { value: NovelAI噪点表; label: string }[] = [
  { value: 'karras', label: 'Karras' },
  { value: 'native', label: 'Native' },
  { value: 'exponential', label: 'Exponential' },
  { value: 'polyexponential', label: 'Polyexponential' },
];

const novelAIUcPresetOptions: { value: NovelAIUcPreset; label: string }[] = [
  { value: 'recommended', label: '推荐（跟随模型）' },
  { value: 'heavy', label: 'Heavy' },
  { value: 'light', label: 'Light' },
  { value: 'furry_focus', label: 'Furry Focus' },
  { value: 'human_focus', label: 'Human Focus' },
  { value: 'none', label: 'None' },
];

const novelAIContentModeOptions: { value: NovelAIContentMode; label: string }[] = [
  { value: 'official', label: '官方' },
  { value: 'append', label: '官方 + 自定义' },
  { value: 'replace', label: '替换为自定义' },
  { value: 'off', label: '关闭' },
];

const novelAIParameterModeOptions: { value: NovelAI参数模式; label: string; desc: string }[] = [
  { value: 'model_default', label: '模型推荐', desc: '自动使用当前模型的推荐步数与 CFG' },
  { value: 'custom', label: '自定义', desc: '使用下方手动设置的步数与 CFG' },
];

const novelAIOfficialAdvancedDefaults: 文生图API配置['novelAIAdvanced'] = {
  qualityMode: 'official',
  qualityText: '',
  ucMode: 'official',
  ucText: '',
  basePromptPrefix: '',
  basePromptSuffix: '',
  characterPromptPrefix: '',
  characterPromptSuffix: '',
  negativePromptAppend: '',
  activeRulePresetId: '',
};

const modelSuggestions: Record<文生图后端类型, string[]> = {
  openai_compatible: ['gpt-image-2', 'gpt-image-1'],
  novelai: ['nai-diffusion-4-5-full', 'nai-diffusion-4-5-curated', 'nai-diffusion-4-full'],
  sd_webui: ['由 WebUI 当前模型决定，可留空', 'AnythingV5', 'Counterfeit-V3.0'],
  comfyui: ['由 Workflow 决定，可留空'],
};

type WorkflowImportStatus = { tone: 'idle' | 'ok' | 'error'; text: string };

export function ImageGenerationSettingsTab({ settings, onChange, apiSettings }: Props) {
  const [activePage, setActivePage] = useState<Page>('overview');
  const [message, setMessage] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [testingKey, setTestingKey] = useState<ApiKey | null>(null);
  const [tokenizerModels, setTokenizerModels] = useState<string[]>([]);
  const [tokenizerModelLoading, setTokenizerModelLoading] = useState(false);
  const [tokenizerModelMessage, setTokenizerModelMessage] = useState('');
  const [testMessages, setTestMessages] = useState<Record<ApiKey, string>>({
    普通接口: '',
    NSFW接口: '',
  });
  const image = settings.文生图系统;
  const mainConfig = apiSettings.configs.find((config) => config.id === apiSettings.activeConfigId) ?? apiSettings.configs[0] ?? null;
  const nsfwUsable = settings.enableNsfw && image.enableNsfwImageGeneration && image.NSFW接口.enabled;

  const patchSystem = (patch: Partial<typeof image>) => {
    onChange({ ...settings, 文生图系统: { ...image, ...patch } });
  };

  const patchApi = (key: ApiKey, patch: Partial<文生图API配置>) => {
    onChange({
      ...settings,
      文生图系统: {
        ...image,
        [key]: {
          ...image[key],
          ...patch,
        },
      },
    });
  };

  const patchTokenizerApi = (patch: Partial<文生图词组转化器API覆盖>) => {
    patchSystem({
      词组转化器API: {
        ...image.词组转化器API,
        ...patch,
      },
    });
  };

  const patchReference = (patch: Partial<typeof image.参考图>) => {
    patchSystem({ 参考图: { ...image.参考图, ...patch } });
  };

  const tokenizerEffective = {
    provider: image.词组转化器API.provider || mainConfig?.provider || 'openai_compatible',
    baseUrl: image.词组转化器API.baseUrl.trim() || mainConfig?.baseUrl || '',
    apiKey: image.词组转化器API.apiKey.trim() || mainConfig?.apiKey || '',
    model: image.词组转化器API.model.trim() || mainConfig?.model || '',
    enableClaudeMode: settings.enableClaudeMode === true,
  };

  const handleFetchTokenizerModels = async () => {
    if (!tokenizerEffective.baseUrl || !tokenizerEffective.apiKey) {
      setTokenizerModelMessage('缺少 Base URL 或 API Key（含主 API 回退后仍为空）。');
      return;
    }
    setTokenizerModelLoading(true);
    setTokenizerModelMessage('');
    try {
      const tempConfig: API配置项 = {
        id: '__image_prompt_tokenizer_models__',
        name: '文生图词组转化器',
        provider: tokenizerEffective.provider as AI提供商,
        baseUrl: tokenizerEffective.baseUrl,
        apiKey: tokenizerEffective.apiKey,
        model: tokenizerEffective.model,
        enableClaudeMode: tokenizerEffective.enableClaudeMode,
        createdAt: 0,
        updatedAt: 0,
      };
      const list = await fetchModels(tempConfig);
      setTokenizerModels(list);
      setTokenizerModelMessage(`获取到 ${list.length} 个模型。`);
    } catch (err) {
      setTokenizerModelMessage(`获取失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTokenizerModelLoading(false);
    }
  };

  const statusCards = useMemo(() => [
    { label: '总开关', value: image.enabled ? '已开启' : '未开启', tone: image.enabled ? 'ok' : 'muted' },
    { label: '统一接口', value: image.普通接口.enabled ? backendLabel(image.普通接口.backend) : '未启用', tone: image.普通接口.enabled ? 'ok' : 'muted' },
    { label: '正文生图', value: image.正文生图.enabled ? '已开启' : '未开启', tone: image.正文生图.enabled ? 'info' : 'muted' },
    { label: 'NSFW隔离', value: nsfwUsable ? '独立可用' : '未启用', tone: nsfwUsable ? 'nsfw' : 'muted' },
  ], [image, nsfwUsable]);

  const handleSave = async () => {
    try {
      await saveSetting('gameSettings', settings);
      setMessage('文生图设置已保存。');
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1600);
    } catch (err) {
      setMessage(`保存失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleTest = async (key: ApiKey, api: 文生图API配置) => {
    setTestingKey(key);
    setTestMessages((prev) => ({ ...prev, [key]: '正在测试连接...' }));
    try {
      const result = await testImageGenerationConnection(api);
      setTestMessages((prev) => ({ ...prev, [key]: result }));
    } catch (err) {
      setTestMessages((prev) => ({ ...prev, [key]: `连接失败：${err instanceof Error ? err.message : String(err)}` }));
    } finally {
      setTestingKey(null);
    }
  };

  return (
    <div className="space-y-5" >
      <div
        className="px-4 py-4"
        style={{
          background: settingsHeroSurface,
          backgroundSize: settingsGridSize,
          backgroundPosition: '0 0, 0 0, center, center',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.24), 0 0 26px rgba(var(--tj-tech-cyan), 0.06)',
          clipPath: cardClip,
        }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="font-serif text-lg font-bold tracking-[0.24em]" style={{ color: 'rgb(var(--tj-ui-title))' }}>
              文生图控制台
            </div>
            <div className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-ui-body), 0.82)' }}>
              相册是所有图片的中转站。头像、立绘、场景、手机背景与故事快照统一走同一个接口；NSFW 仍独立隔离，避免正常游玩时混入成人内容。
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:min-w-[520px] lg:grid-cols-5">
            {statusCards.map((item) => <StatusCard key={item.label} label={item.label} value={item.value} tone={item.tone as StatusTone} />)}
          </div>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-7">
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            onClick={() => setActivePage(page.id)}
            className="px-3 py-3 text-left transition-all"
            style={{
              color: activePage === page.id ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-ui-body), 0.82)',
              background: activePage === page.id
                ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.95), rgba(var(--tj-btn-primary-end),0.82))'
                : 'rgba(var(--tj-ui-panel-strong), 0.42)',
              boxShadow: activePage === page.id
                ? 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.4), 0 0 18px rgba(var(--tj-tech-cyan),0.14)'
                : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.16)',
              clipPath: smallClip,
            }}
          >
            <div className="font-serif text-sm font-bold tracking-[0.16em]">{page.label}</div>
            <div className="mt-1 text-[11px] opacity-75">{page.desc}</div>
          </button>
        ))}
      </div>

      <div className="min-w-0 space-y-4">
        {activePage === 'overview' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Panel title="基础开关">
            <ToggleRow label="启用文生图" desc="开启后，相册显示手动生成入口；关闭时保留已有图片和挂载关系。" checked={image.enabled} onChange={(v) => patchSystem({ enabled: v })} />
            <ToggleRow label="词组转化器" desc="把伙伴档案、场景摘要和 NSFW 档案整理成适合模型的 prompt。" checked={image.enablePromptTokenizer} onChange={(v) => patchSystem({ enablePromptTokenizer: v })} />
            <ToggleRow label="启用正文生图" desc="控制剧情正文中的故事快照生成入口。解析走转化器，出图走统一接口。" checked={image.正文生图.enabled} onChange={(v) => patchSystem({ 正文生图: { ...image.正文生图, enabled: v } })} />
            <ToggleRow label="启用 NSFW 生图" desc="受 NSFW 总开关约束。开启后仍只会使用 NSFW 独立接口，不复用统一接口。" checked={Boolean(settings.enableNsfw && image.enableNsfwImageGeneration)} disabled={!settings.enableNsfw} onChange={(v) => patchSystem({ enableNsfwImageGeneration: settings.enableNsfw ? v : false })} />
          </Panel>
          <Panel title="工作流说明">
            <InfoLine label="统一资源" value="伙伴头像、角色立绘、地点壁纸、手机背景、剧情快照、新闻配图。" />
            <InfoLine label="正文插图" value="总览控制开关；正文插图页只负责触发模式和生成时机。" />
            <InfoLine label="NSFW资源" value="只读取 NSFW 档案，只进 NSFW 相册过滤，不参与普通手动任务。" nsfw />
            <InfoLine label="任务保存" value="图片先进入相册，再由玩家挂载到对应槽位。" />
          </Panel>
        </div>
      )}

        {activePage === 'normal' && (
        <ApiBlock
          title="统一文生图接口"
          desc="用于头像、立绘、场景图、手机背景和故事快照等所有非成人视觉资源。"
          apiKey="普通接口"
          api={image.普通接口}
          naiRules={image.rules.NAI规则预设列表}
          onChange={(p) => patchApi('普通接口', p)}
          onTest={() => handleTest('普通接口', image.普通接口)}
          testMessage={testMessages.普通接口}
          testing={testingKey === '普通接口'}
        />
      )}

        {activePage === 'nsfw' && (
        <Panel title="NSFW 生图隔离">
          <Notice nsfw>
            NSFW 生图必须同时满足：NSFW 总开关开启、NSFW 生图开关开启、NSFW 接口启用。它不会自动回退到统一接口。
          </Notice>
          <ToggleRow label="启用 NSFW 生图" desc="关闭时相册不显示 NSFW 生成按钮，也不会向 NSFW 独立接口提交图片任务。" checked={Boolean(settings.enableNsfw && image.enableNsfwImageGeneration)} disabled={!settings.enableNsfw} onChange={(v) => patchSystem({ enableNsfwImageGeneration: settings.enableNsfw ? v : false })} />
          {settings.enableNsfw && image.enableNsfwImageGeneration ? (
            <ApiBlock
              title="NSFW 独立接口"
              desc="用于 NSFW 档案部位图。推荐 NovelAI、SD WebUI 或 ComfyUI，并使用单独模型或工作流。"
              apiKey="NSFW接口"
              api={image.NSFW接口}
              naiRules={image.rules.NAI规则预设列表}
              onChange={(p) => patchApi('NSFW接口', p)}
              onTest={() => handleTest('NSFW接口', image.NSFW接口)}
              testMessage={testMessages.NSFW接口}
              testing={testingKey === 'NSFW接口'}
              nsfw
            />
          ) : (
            <Notice>NSFW 总开关或 NSFW 生图开关未开启，因此这里不会提交任何成人生图任务。</Notice>
          )}
        </Panel>
      )}

        {activePage === 'reference' && (
        <Panel title="参考图设置">
          <Notice>
            图片由图库中的“设为参考图”管理。开启后，角色生成会使用该角色当前指定的参考图片；关闭时素材会保留，但不会发送给图片接口。
          </Notice>
          <ToggleRow label="启用参考图" desc="仅在当前后端支持时把图库参考图片传入生成流程。" checked={image.参考图.enabled} onChange={(enabled) => patchReference({ enabled })} />
          <ToggleRow label="允许 OpenAI 兼容接口发送参考图" desc="部分中转供应商不支持参考图，如参考图生成失败请关闭该开关。" checked={image.参考图.enableOpenAICompatibleReference} onChange={(enableOpenAICompatibleReference) => patchReference({ enableOpenAICompatibleReference })} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="SD WebUI 参考强度">
              <input type="range" min={0.05} max={0.95} step={0.05} value={image.参考图.sdWebuiDenoisingStrength} onChange={(event) => patchReference({ sdWebuiDenoisingStrength: Number(event.target.value) })} className="w-full" />
              <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-ui-muted),0.72)' }}>denoising strength：{image.参考图.sdWebuiDenoisingStrength.toFixed(2)}</div>
            </Field>
            <ToggleRow label="允许 ComfyUI 工作流参考图" desc="仅在工作流包含 __REFERENCE_IMAGE__ 或 {{reference_image}} 占位符时开启。" checked={image.参考图.enableComfyWorkflowReference} onChange={(enableComfyWorkflowReference) => patchReference({ enableComfyWorkflowReference })} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <InfoLine label="SD WebUI" value="启用后使用 img2img 传入参考图。" />
            <InfoLine label="ComfyUI" value={image.参考图.enableComfyWorkflowReference ? '已允许；工作流必须声明参考图占位符。' : '默认关闭；确认工作流后再开启。'} />
            <InfoLine label="OpenAI 兼容" value={image.参考图.enableOpenAICompatibleReference ? '已允许通过图片编辑接口发送参考图。' : '默认只保存素材，不自动传图。'} />
            <InfoLine label="NovelAI" value="vibe transfer 尚未接入，当前只保存素材。" />
          </div>
        </Panel>
      )}

        {activePage === 'tokenizer' && (
        <Panel title="词组转化器">
          <ToggleRow label="启用词组转化器" desc="开启后，相册会优先把档案整理成提示词草稿，玩家仍可手动编辑。" checked={image.enablePromptTokenizer} onChange={(v) => patchSystem({ enablePromptTokenizer: v })} />
          <SubPanel title="词组转化器 API">
            <Notice>
              这里负责角色锚点、伙伴档案、场景摘要到图片 Prompt 的文本整理，不是最终图片生成接口。字段留空时回退主 API。
            </Notice>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="服务商">
                <select value={image.词组转化器API.provider} onChange={(e) => patchTokenizerApi({ provider: e.target.value as AI提供商 | '' })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                  {providerOptions.map((item) => <option key={item.value || 'main'} value={item.value}>{item.label}</option>)}
                </select>
              </Field>
              <Field label="失败重试">
                <input type="number" min={0} max={5} value={image.词组转化器API.retryCount ?? 2} onChange={(e) => patchTokenizerApi({ retryCount: Math.max(0, Number(e.target.value) || 0) })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
              </Field>
            </div>
            <Field label="Base URL">
              <input value={image.词组转化器API.baseUrl} onChange={(e) => patchTokenizerApi({ baseUrl: e.target.value })} placeholder={mainConfig ? `留空则用主 API：${mainConfig.baseUrl}` : 'https://...'} className="kaituo-input w-full px-3 py-2 text-sm font-mono" style={{ clipPath: smallClip }} />
              {!image.词组转化器API.baseUrl.trim() && mainConfig?.baseUrl && <FallbackHint text={`将复用主 API：${mainConfig.baseUrl}`} />}
            </Field>
            <Field label="API Key">
              <input type="password" value={image.词组转化器API.apiKey} onChange={(e) => patchTokenizerApi({ apiKey: e.target.value })} placeholder={mainConfig?.apiKey ? '留空则用主 API 的 Key' : 'sk-...'} className="kaituo-input w-full px-3 py-2 text-sm font-mono" style={{ clipPath: smallClip }} />
              {!image.词组转化器API.apiKey.trim() && mainConfig?.apiKey && <FallbackHint text="将复用主 API 的 Key" />}
            </Field>
            <Field label="模型">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input value={image.词组转化器API.model} onChange={(e) => patchTokenizerApi({ model: e.target.value })} placeholder={mainConfig?.model ? `留空则用主 API：${mainConfig.model}` : '模型 ID'} className="kaituo-input min-w-0 flex-1 px-3 py-2 text-sm font-mono" style={{ clipPath: smallClip }} />
                <button type="button" onClick={() => void handleFetchTokenizerModels()} disabled={tokenizerModelLoading} className="px-3 py-2 text-xs font-serif tracking-[0.14em] disabled:opacity-45" style={{ color: 'rgb(var(--tj-accent-primary))', background: 'rgba(var(--tj-accent-primary),0.055)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.22)', clipPath: smallClip }}>
                  {tokenizerModelLoading ? '获取中' : '获取列表'}
                </button>
              </div>
              {tokenizerModels.length > 0 && (
                <select value="" onChange={(e) => e.target.value && patchTokenizerApi({ model: e.target.value })} className="kaituo-input mt-2 w-full px-3 py-2 text-xs" style={{ clipPath: smallClip }}>
                  <option value="">— 从列表选择（{tokenizerModels.length}） —</option>
                  {tokenizerModels.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
              )}
              {tokenizerModelMessage && (
                <div className="mt-2 text-xs leading-relaxed" style={{ color: tokenizerModelMessage.startsWith('获取失败') ? 'rgba(255,180,180,0.9)' : 'rgba(165,230,170,0.88)' }}>
                  {tokenizerModelMessage}
                </div>
              )}
              {!image.词组转化器API.model.trim() && mainConfig?.model && <FallbackHint text={`将复用主 API：${mainConfig.model}`} />}
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="最大输出 Token">
                <input type="number" min={256} max={4096} value={image.词组转化器API.maxTokens ?? 1600} onChange={(e) => patchTokenizerApi({ maxTokens: Math.max(256, Number(e.target.value) || 1600) })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
              </Field>
              <Field label="温度">
                <input type="number" min={0} max={2} step={0.05} value={image.词组转化器API.temperature ?? 0.45} onChange={(e) => patchTokenizerApi({ temperature: Number(e.target.value) })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
              </Field>
            </div>
          </SubPanel>
          <Field label="转化器系统提示词">
            <textarea
              value={image.promptTokenizerSystemPrompt}
              onChange={(e) => patchSystem({ promptTokenizerSystemPrompt: e.target.value })}
              rows={12}
              className="kaituo-input w-full resize-y px-3 py-2 text-sm leading-relaxed"
              style={{ clipPath: smallClip }}
            />
          </Field>
          <div className="grid gap-3 md:grid-cols-3">
            <GuideCard title="角色头像" desc="抓外貌、发型、服饰、表情、脸部辨识度，不写长剧情。" />
            <GuideCard title="场景剧照" desc="抓地点、时间、光线、镜头关系和一瞬间的动作。" />
            <GuideCard title="手机背景" desc="抓地点气质、留白、竖屏适配和不遮挡图标的构图。" />
          </div>
        </Panel>
      )}

        {activePage === 'guide' && <GuidePage />}

        {activePage === 'narrative' && (
        <NarrativeImageSettings
          settings={settings}
          onChange={onChange}
          apiSettings={apiSettings}
        />
      )}
      </div>

      <div className="sticky bottom-0 z-10 pt-3" style={{ background: 'linear-gradient(180deg, rgba(var(--tj-bg-primary),0), rgba(var(--tj-bg-primary),0.98) 30%)' }}>
        {message && (
          <div className="mb-2 text-right text-xs" style={{ color: message.startsWith('保存失败') ? 'rgba(255,180,180,0.92)' : 'rgba(165,230,170,0.92)' }}>
            {message}
          </div>
        )}
        <button
          type="button"
          onClick={handleSave}
          className="w-full py-3 font-serif text-sm font-bold tracking-[0.32em]"
          style={{
            color: savedFlash ? '#122015' : 'rgb(var(--tj-bg-primary))',
            background: savedFlash
              ? 'linear-gradient(135deg, rgba(165, 230, 170, 0.96), rgba(105, 190, 130, 0.92))'
              : activeAccentSurface,
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.52), 0 0 18px rgba(var(--tj-tech-cyan),0.16)',
            clipPath: smallClip,
          }}
        >
          {savedFlash ? '✓ 已 保 存' : '◆ 保存文生图设置'}
        </button>
      </div>
    </div>
  );
}

function ApiBlock({
  title,
  desc,
  apiKey,
  api,
  naiRules,
  onChange,
  onTest,
  testMessage,
  testing,
  nsfw = false,
}: {
  title: string;
  desc: string;
  apiKey: ApiKey;
  api: 文生图API配置;
  naiRules: import('@/models/settings').文生图NAI规则预设[];
  onChange: (p: Partial<文生图API配置>) => void;
  onTest: () => void;
  testMessage: string;
  testing: boolean;
  nsfw?: boolean;
}) {
  const endpoint = endpointPreview(api);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelMessage, setModelMessage] = useState('');
  const [workflowLoading, setWorkflowLoading] = useState<'queue' | 'history' | null>(null);
  const [workflowCandidates, setWorkflowCandidates] = useState<ComfyWorkflowCandidate[]>([]);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowImportStatus>({ tone: 'idle', text: '' });
  const workflowFileRef = useRef<HTMLInputElement | null>(null);
  const suggestions = fetchedModels.length ? fetchedModels : modelSuggestions[api.backend];
  const patchNovelAIAdvanced = (patch: Partial<文生图API配置['novelAIAdvanced']>) => {
    onChange({ novelAIAdvanced: { ...api.novelAIAdvanced, ...patch } });
  };
  const resetNovelAIAdvanced = () => {
    onChange({
      novelAIUcPreset: 'recommended',
      novelAIParameterMode: 'model_default',
      novelAIAdvanced: { ...novelAIOfficialAdvancedDefaults, activeRulePresetId: 'nai_rule_official_baseline' },
    });
  };
  const selectNovelAIRule = (id: string) => {
    const preset = naiRules.find((item) => item.id === id);
    if (!preset) return;
    onChange({
      novelAIAdvanced: {
        qualityMode: preset.qualityMode,
        qualityText: preset.qualityText,
        ucMode: preset.ucMode,
        ucText: preset.ucText,
        basePromptPrefix: preset.basePromptPrefix,
        basePromptSuffix: preset.basePromptSuffix,
        characterPromptPrefix: preset.characterPromptPrefix,
        characterPromptSuffix: preset.characterPromptSuffix,
        negativePromptAppend: preset.negativePromptAppend,
        activeRulePresetId: preset.id,
      },
    });
  };
  const handleFetchImageModels = async () => {
    setModelLoading(true);
    setModelMessage(api.backend === 'novelai' ? '正在载入 NovelAI 图片模型列表...' : '正在读取生图模型列表...');
    try {
      const models = await fetchImageGenerationModels(api);
      setFetchedModels(models);
      if (models.length) {
        if (!api.model || !models.includes(api.model)) onChange({ model: models[0] });
        setModelMessage(`已读取 ${models.length} 个模型。`);
      } else {
        setModelMessage('没有读取到模型列表。');
      }
    } catch (err) {
      setModelMessage(`读取失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setModelLoading(false);
    }
  };

  const handleImportWorkflowFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      JSON.parse(text);
      onChange({ comfyWorkflowJson: text, useDefaultComfyWorkflow: false });
      setWorkflowCandidates([]);
      setWorkflowStatus({ tone: 'ok', text: `已导入本地工作流：${file.name}` });
    } catch (err) {
      setWorkflowStatus({ tone: 'error', text: `导入失败：${err instanceof Error ? err.message : String(err)}` });
    }
  };

  const handleFetchWorkflowCandidates = async (source: 'queue' | 'history') => {
    if (!api.baseUrl.trim()) {
      setWorkflowStatus({ tone: 'error', text: '请先填写 ComfyUI Base URL。' });
      return;
    }
    setWorkflowLoading(source);
    setWorkflowStatus({ tone: 'idle', text: source === 'queue' ? '正在读取当前队列工作流...' : '正在读取最近历史工作流...' });
    try {
      const list = await fetchComfyWorkflowCandidates(api, source);
      setWorkflowCandidates(list);
      if (list.length) {
        setWorkflowStatus({ tone: 'ok', text: `已读取 ${list.length} 条${source === 'queue' ? '队列' : '历史'}工作流，可直接导入。` });
      } else {
        setWorkflowStatus({ tone: 'error', text: `${source === 'queue' ? '队列' : '历史'}中没有可导入的 API 工作流。` });
      }
    } catch (err) {
      setWorkflowStatus({ tone: 'error', text: `读取失败：${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setWorkflowLoading(null);
    }
  };

  const handleSelectWorkflowCandidate = (candidate: ComfyWorkflowCandidate) => {
    onChange({ comfyWorkflowJson: candidate.workflowJson, useDefaultComfyWorkflow: false });
    setWorkflowStatus({ tone: 'ok', text: `已导入${candidate.source === 'queue' ? '队列' : '历史'}工作流：${candidate.title}` });
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="font-serif text-base font-bold tracking-[0.24em]" style={{ color: nsfw ? '#f1b7ce' : 'rgb(var(--tj-accent-primary))' }}>{title}</div>
          <div className="mt-1 text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>{desc}</div>
        </div>
        <button type="button" onClick={onTest} disabled={testing || !api.enabled} className="px-4 py-2 text-xs font-serif tracking-[0.18em] disabled:opacity-45" style={{ color: nsfw ? '#f1b7ce' : 'rgb(var(--tj-accent-primary))', background: nsfw ? 'rgba(214,142,174,0.08)' : 'rgba(var(--tj-accent-primary),0.055)', boxShadow: nsfw ? 'inset 0 0 0 1px rgba(214,142,174,0.3)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.28)', clipPath: smallClip }}>
          {testing ? '测试中...' : '测试连接'}
        </button>
      </div>

      <ToggleRow label="启用此接口" desc="关闭后，相册不会向这个接口提交任务。" checked={api.enabled} onChange={(v) => onChange({ enabled: v })} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="后端类型">
              <select
                value={api.backend}
                onChange={(e) => {
                  const backend = e.target.value as 文生图后端类型;
                  onChange({ backend, presetPath: presetPathOptions[backend][0]?.value ?? api.presetPath });
                }}
                className="kaituo-input w-full px-3 py-2 text-sm"
                style={{ clipPath: smallClip }}
              >
                {backendOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </Field>
            <Field label="响应格式">
              <select value={api.responseFormat} onChange={(e) => onChange({ responseFormat: e.target.value as 文生图响应格式 })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                {responseOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Base URL">
            <input value={api.baseUrl} onChange={(e) => onChange({ baseUrl: e.target.value })} placeholder={baseUrlPlaceholder(api.backend)} className="kaituo-input w-full px-3 py-2 text-sm font-mono" style={{ clipPath: smallClip }} />
          </Field>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="接口路径模式">
              <select value={api.pathMode} onChange={(e) => onChange({ pathMode: e.target.value === 'custom' ? 'custom' : 'preset' })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                <option value="preset">预设路径</option>
                <option value="custom">自定义路径</option>
              </select>
            </Field>
            <Field label="预设路径">
              <select value={api.presetPath} onChange={(e) => onChange({ presetPath: e.target.value as 文生图预设接口路径 })} disabled={api.pathMode === 'custom'} className="kaituo-input w-full px-3 py-2 text-sm disabled:opacity-50" style={{ clipPath: smallClip }}>
                {presetPathOptions[api.backend].map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </Field>
          </div>

          {api.pathMode === 'custom' && (
            <Field label="自定义路径">
              <input value={api.customPath} onChange={(e) => onChange({ customPath: e.target.value })} placeholder={readPresetPath(api.backend)} className="kaituo-input w-full px-3 py-2 text-sm font-mono" style={{ clipPath: smallClip }} />
            </Field>
          )}

          <Field label="API Key / Token">
            <input type="password" value={api.apiKey} onChange={(e) => onChange({ apiKey: e.target.value })} placeholder={api.backend === 'sd_webui' || api.backend === 'comfyui' ? '本地后端通常可留空' : '请填写密钥或 Token'} className="kaituo-input w-full px-3 py-2 text-sm font-mono" style={{ clipPath: smallClip }} />
          </Field>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label={api.backend === 'comfyui' ? 'Checkpoint / 模型名' : '模型'}>
              <div className="flex gap-2">
                <input value={api.model} onChange={(e) => onChange({ model: e.target.value })} placeholder={api.backend === 'comfyui' ? '填写本机已有 ckpt_name，例如 novaAnimeXL_v70Happyhalloween.safetensors' : suggestions[0] ?? '模型 ID'} list={`${apiKey}-models`} className="kaituo-input min-w-0 flex-1 px-3 py-2 text-sm font-mono" style={{ clipPath: smallClip }} />
                <button type="button" onClick={handleFetchImageModels} disabled={modelLoading || (api.backend !== 'novelai' && !api.baseUrl.trim()) || (api.backend === 'openai_compatible' && !api.apiKey.trim())} className="px-3 py-2 text-xs font-serif tracking-[0.14em] disabled:opacity-45" style={{ color: 'rgb(var(--tj-accent-primary))', background: 'rgba(var(--tj-accent-primary),0.055)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.22)', clipPath: smallClip }}>
                  {modelLoading ? '读取中' : '获取'}
                </button>
              </div>
              <datalist id={`${apiKey}-models`}>
                {suggestions.map((item) => <option key={item} value={item} />)}
              </datalist>
              {modelMessage && (
                <div className="mt-2 text-xs leading-relaxed" style={{ color: modelMessage.startsWith('读取失败') ? 'rgba(255,180,180,0.9)' : 'rgba(165,230,170,0.88)' }}>
                  {modelMessage}
                </div>
              )}
            </Field>
            <Field label="默认尺寸">
              <input value={api.defaultSize} onChange={(e) => onChange({ defaultSize: e.target.value })} placeholder="1024x1024" className="kaituo-input w-full px-3 py-2 text-sm font-mono" style={{ clipPath: smallClip }} />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {api.backend === 'novelai' && api.novelAIParameterMode === 'model_default' ? (
              <>
                <ReadOnlyValue label="步数" value="由模型决定" />
                <ReadOnlyValue label="CFG" value="由模型决定" />
              </>
            ) : (
              <>
                <Field label="步数">
                  <input type="number" min={1} max={80} value={api.steps} onChange={(e) => onChange({ steps: Math.max(1, Number(e.target.value) || 1) })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
                </Field>
                <Field label="CFG">
                  <input type="number" min={0} max={30} step={0.5} value={api.cfgScale} onChange={(e) => onChange({ cfgScale: Math.max(0, Number(e.target.value) || 0) })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
                </Field>
              </>
            )}
            <Field label="Seed">
              <input type="number" value={api.seed} onChange={(e) => onChange({ seed: Number(e.target.value) || -1 })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
            </Field>
          </div>
        </div>

        <div className="space-y-3">
          <SubPanel title="端点预览">
            <div className="break-all rounded px-3 py-2 text-xs font-mono" style={{ color: 'rgba(var(--tj-text-secondary),0.8)', background: 'rgba(var(--tj-bg-primary),0.58)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)' }}>
              {endpoint || '填写 Base URL 后显示完整端点'}
            </div>
            {backendHints(api.backend).map((line) => <div key={line} className="text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>{line}</div>)}
          </SubPanel>
          <SubPanel title="接口稳定性">
            <Notice>
              画风、画师串、负面词由规则中心统一控制；这里仅保留接口调用和失败重试。
            </Notice>
            <Field label="失败重试">
              <input type="number" min={0} max={5} value={api.retryCount} onChange={(e) => onChange({ retryCount: Math.max(0, Number(e.target.value) || 0) })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
            </Field>
          </SubPanel>
          {testMessage && (
            <div className="px-3 py-2 text-xs leading-relaxed" style={{ color: testMessage.startsWith('连接失败') ? 'rgba(255,180,180,0.92)' : 'rgba(165,230,170,0.9)', background: 'rgba(var(--tj-bg-primary),0.46)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)', clipPath: smallClip }}>
              {testMessage}
            </div>
          )}
        </div>
      </div>

      {api.backend === 'novelai' && (
        <details
          className="group min-w-0 overflow-hidden"
          style={{ background: 'rgba(var(--tj-bg-primary),0.34)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)', clipPath: cardClip }}
        >
          <summary className="flex min-w-0 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0">
              <div className="font-serif text-sm font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>NovelAI 高级设置</div>
              <div className="mt-1 truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.64)' }}>
                {api.novelAIParameterMode === 'model_default' ? '模型推荐参数' : '自定义参数'} · UC {novelAIUcPresetOptions.find((item) => item.value === api.novelAIUcPreset)?.label ?? api.novelAIUcPreset}
              </div>
            </div>
            <span className="flex-shrink-0 text-xs transition-transform group-open:rotate-90" aria-hidden="true" style={{ color: 'rgba(var(--tj-accent-primary),0.76)' }}>▶</span>
          </summary>

          <div className="min-w-0 space-y-5 px-4 pb-4 pt-1">
            <section className="min-w-0 space-y-3 border-t pt-4" style={{ borderColor: 'rgba(var(--tj-accent-primary),0.14)' }}>
              <div className="font-serif text-xs tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.82)' }}>参数模式</div>
              <Field label="NAI 规则预设">
                <select value={api.novelAIAdvanced.activeRulePresetId || 'nai_rule_official_baseline'} onChange={(event) => selectNovelAIRule(event.target.value)} className="kaituo-input w-full min-w-0 px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                  {naiRules.map((preset) => <option key={preset.id} value={preset.id}>{preset.名称}</option>)}
                </select>
              </Field>
              <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                {novelAIParameterModeOptions.map((option) => {
                  const active = api.novelAIParameterMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onChange({ novelAIParameterMode: option.value })}
                      className="min-w-0 px-3 py-2 text-left transition-all"
                      style={{
                        color: active ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-ui-body),0.82)',
                        background: active ? 'rgba(var(--tj-accent-primary),0.16)' : 'rgba(var(--tj-bg-secondary),0.42)',
                        boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.42)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)',
                        clipPath: smallClip,
                      }}
                    >
                      <span className="block font-serif text-xs font-bold tracking-[0.12em]">{option.label}</span>
                      <span className="mt-1 block text-[11px] leading-relaxed opacity-70">{option.desc}</span>
                    </button>
                  );
                })}
              </div>
              <div className="grid min-w-0 gap-3 md:grid-cols-3">
                <Field label="NovelAI 采样器">
                  <select value={api.sampler} onChange={(e) => onChange({ sampler: e.target.value as NovelAI采样器 })} className="kaituo-input w-full min-w-0 px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                    {samplerOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </Field>
                <Field label="噪点表">
                  <select value={api.noiseSchedule} onChange={(e) => onChange({ noiseSchedule: e.target.value as NovelAI噪点表 })} className="kaituo-input w-full min-w-0 px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                    {noiseOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </Field>
                <Field label="UC Preset">
                  <select value={api.novelAIUcPreset} onChange={(e) => onChange({ novelAIUcPreset: e.target.value as NovelAIUcPreset })} className="kaituo-input w-full min-w-0 px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                    {novelAIUcPresetOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </Field>
              </div>
            </section>

            <section className="min-w-0 space-y-3 border-t pt-4" style={{ borderColor: 'rgba(var(--tj-accent-primary),0.14)' }}>
              <div className="font-serif text-xs tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.82)' }}>Quality 与 UC</div>
              <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <div className="min-w-0 space-y-3">
                  <Field label="Quality Tags 模式">
                    <select value={api.novelAIAdvanced.qualityMode} onChange={(e) => patchNovelAIAdvanced({ qualityMode: e.target.value as NovelAIContentMode })} className="kaituo-input w-full min-w-0 px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                      {novelAIContentModeOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Quality Tags 自定义字符串">
                    <textarea
                      value={api.novelAIAdvanced.qualityText}
                      onChange={(e) => patchNovelAIAdvanced({ qualityText: e.target.value })}
                      rows={4}
                      className="kaituo-input w-full min-w-0 resize-y px-3 py-2 text-xs"
                      style={{ clipPath: smallClip }}
                    />
                  </Field>
                </div>
                <div className="min-w-0 space-y-3">
                  <Field label="UC 模式">
                    <select value={api.novelAIAdvanced.ucMode} onChange={(e) => patchNovelAIAdvanced({ ucMode: e.target.value as NovelAIContentMode })} className="kaituo-input w-full min-w-0 px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                      {novelAIContentModeOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </Field>
                  <Field label="UC 自定义字符串">
                    <textarea
                      value={api.novelAIAdvanced.ucText}
                      onChange={(e) => patchNovelAIAdvanced({ ucText: e.target.value })}
                      rows={4}
                      className="kaituo-input w-full min-w-0 resize-y px-3 py-2 text-xs"
                      style={{ clipPath: smallClip }}
                    />
                  </Field>
                </div>
              </div>
            </section>

            <section className="min-w-0 space-y-3 border-t pt-4" style={{ borderColor: 'rgba(var(--tj-accent-primary),0.14)' }}>
              <div className="font-serif text-xs tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.82)' }}>提示词拼接</div>
              <div className="grid min-w-0 gap-3 md:grid-cols-2">
                <PromptTextArea label="Base Prompt 前缀" value={api.novelAIAdvanced.basePromptPrefix} onChange={(value) => patchNovelAIAdvanced({ basePromptPrefix: value })} />
                <PromptTextArea label="Base Prompt 后缀" value={api.novelAIAdvanced.basePromptSuffix} onChange={(value) => patchNovelAIAdvanced({ basePromptSuffix: value })} />
                <PromptTextArea label="Character Prompt 前缀" value={api.novelAIAdvanced.characterPromptPrefix} onChange={(value) => patchNovelAIAdvanced({ characterPromptPrefix: value })} />
                <PromptTextArea label="Character Prompt 后缀" value={api.novelAIAdvanced.characterPromptSuffix} onChange={(value) => patchNovelAIAdvanced({ characterPromptSuffix: value })} />
              </div>
              <PromptTextArea label="Negative Prompt 追加" value={api.novelAIAdvanced.negativePromptAppend} onChange={(value) => patchNovelAIAdvanced({ negativePromptAppend: value })} rows={3} />
            </section>

            <div className="flex min-w-0 flex-wrap justify-end gap-2 border-t pt-4" style={{ borderColor: 'rgba(var(--tj-accent-primary),0.14)' }}>
              <button
                type="button"
                onClick={resetNovelAIAdvanced}
                className="max-w-full px-3 py-2 text-xs font-serif tracking-[0.12em]"
                style={{ color: 'rgba(var(--tj-accent-primary),0.9)', background: 'rgba(var(--tj-accent-primary),0.055)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.24)', clipPath: smallClip }}
              >
                恢复 NovelAI 官方默认
              </button>
            </div>
          </div>
        </details>
      )}

      <Field label="默认负面提示词">
        <textarea value={api.negativePrompt} onChange={(e) => onChange({ negativePrompt: e.target.value })} rows={3} className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
      </Field>

      {api.backend === 'comfyui' && (
        <>
          <ToggleRow label="使用默认工作流" desc="当前项目还没有内置可直接运行的 ComfyUI 工作流；如果开启但没有 JSON，生成时会提示补齐。" checked={api.useDefaultComfyWorkflow} onChange={(v) => onChange({ useDefaultComfyWorkflow: v })} />
          <Notice>
            ComfyUI 的 Checkpoint 必须填写本机模型列表里存在的 ckpt_name。Workflow 可使用 __MODEL__ / __CKPT_NAME__ / __SAMPLER__ / __SCHEDULER__ / __PROMPT__ / __NEGATIVE_PROMPT__ 等占位符，提交前会自动替换。
          </Notice>
          <div className="flex flex-wrap gap-2">
            <input ref={workflowFileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportWorkflowFile} />
            <button type="button" onClick={() => workflowFileRef.current?.click()} className="px-3 py-2 text-xs font-serif tracking-[0.14em]" style={{ color: 'rgb(var(--tj-accent-primary))', background: 'rgba(var(--tj-accent-primary),0.055)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.22)', clipPath: smallClip }}>
              导入 JSON
            </button>
            <button type="button" onClick={() => handleFetchWorkflowCandidates('queue')} disabled={workflowLoading !== null || !api.baseUrl.trim()} className="px-3 py-2 text-xs font-serif tracking-[0.14em] disabled:opacity-45" style={{ color: 'rgb(var(--tj-accent-primary))', background: 'rgba(var(--tj-accent-primary),0.055)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.22)', clipPath: smallClip }}>
              {workflowLoading === 'queue' ? '读取队列中' : '读取队列'}
            </button>
            <button type="button" onClick={() => handleFetchWorkflowCandidates('history')} disabled={workflowLoading !== null || !api.baseUrl.trim()} className="px-3 py-2 text-xs font-serif tracking-[0.14em] disabled:opacity-45" style={{ color: 'rgb(var(--tj-accent-primary))', background: 'rgba(var(--tj-accent-primary),0.055)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.22)', clipPath: smallClip }}>
              {workflowLoading === 'history' ? '读取历史中' : '读取历史'}
            </button>
          </div>
          <Notice>
            可导入本地 JSON，或从 ComfyUI 的 API 队列 / 历史记录提取已提交过的工作流。画布里尚未提交的当前编辑态无法通过接口直接读取。
          </Notice>
          {workflowStatus.text && (
            <div className="text-xs leading-relaxed" style={{ color: workflowStatus.tone === 'error' ? 'rgba(255,180,180,0.92)' : workflowStatus.tone === 'ok' ? 'rgba(165,230,170,0.92)' : 'rgba(var(--tj-text-secondary),0.74)' }}>
              {workflowStatus.text}
            </div>
          )}
          {workflowCandidates.length > 0 && (
            <div className="space-y-2">
              {workflowCandidates.map((candidate) => (
                <button
                  key={`${candidate.source}_${candidate.id}`}
                  type="button"
                  onClick={() => handleSelectWorkflowCandidate(candidate)}
                  className="w-full px-3 py-2 text-left transition-all hover:opacity-90"
                  style={{ background: 'rgba(var(--tj-bg-primary),0.42)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.16)', clipPath: smallClip }}
                >
                  <div className="text-xs font-serif tracking-[0.12em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                    {candidate.title}
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>
                    点击导入这条{candidate.source === 'queue' ? '队列' : '历史'}工作流到当前接口配置
                  </div>
                </button>
              ))}
            </div>
          )}
          <Field label="ComfyUI Workflow JSON">
            <textarea value={api.comfyWorkflowJson} onChange={(e) => onChange({ comfyWorkflowJson: e.target.value })} rows={10} placeholder="支持 __MODEL__ / __CKPT_NAME__ / __SAMPLER__ / __SCHEDULER__ / __PROMPT__ / __NEGATIVE_PROMPT__ / __WIDTH__ / __HEIGHT__ / __STEPS__ / __CFG__ / __SEED__ 占位符" className="kaituo-input w-full resize-y px-3 py-2 text-xs font-mono" style={{ clipPath: smallClip }} />
          </Field>
        </>
      )}
    </div>
  );
}

function GuidePage() {
  return (
    <Panel title="接口填写参考">
      <div className="grid gap-3 md:grid-cols-2">
        <GuideCard title="OpenAI 兼容" desc="Base URL 通常是服务根地址，路径用 /images/generations。需要 API Key 和模型名，响应格式可选 URL 或 b64_json。" />
        <GuideCard title="NovelAI" desc="Base URL 可填 https://image.novelai.net，路径 /ai/generate-image。Token 必填，模型建议使用 nai-diffusion 系列。" />
        <GuideCard title="SD WebUI" desc="Base URL 通常是 http://127.0.0.1:7860，路径 /sdapi/v1/txt2img。API Key 常可留空，模型可留空使用当前 checkpoint。" />
        <GuideCard title="ComfyUI" desc="Base URL 通常是 http://127.0.0.1:8188，路径 /prompt。必须提供 Workflow JSON；模型名要填写本机 ckpt_name，采样器和调度器会从设置自动映射。" />
      </div>
    </Panel>
  );
}

function PromptTextArea({ label, value, onChange, rows = 2 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return (
    <Field label={label}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="kaituo-input w-full min-w-0 resize-y px-3 py-2 text-xs"
        style={{ clipPath: smallClip }}
      />
    </Field>
  );
}

function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <Field label={label}>
      <div className="kaituo-input w-full px-3 py-2 text-sm" style={{ color: 'rgba(var(--tj-text-secondary),0.68)', clipPath: smallClip }}>
        {value}
      </div>
    </Field>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 font-serif text-[12px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.75)' }}>{label}</div>
      {children}
    </label>
  );
}

function ToggleRow({ label, desc, checked, disabled = false, onChange }: { label: string; desc: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2" style={{ opacity: disabled ? 0.58 : 1, background: 'rgba(var(--tj-bg-secondary), 0.45)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)', clipPath: smallClip }}>
      <div className="min-w-0">
        <div className="font-serif text-sm font-bold tracking-wider" style={{ color: 'rgb(var(--tj-text-primary))' }}>{label}</div>
        <div className="mt-0.5 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}>{desc}</div>
      </div>
      <button type="button" disabled={disabled} onClick={() => onChange(!checked)} className="relative h-6 w-11 flex-shrink-0 transition-all disabled:cursor-not-allowed" style={{ background: checked ? activeAccentSurface : 'rgba(var(--tj-bg-secondary), 0.68)', boxShadow: checked ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5), 0 0 10px rgba(var(--tj-tech-cyan), 0.22)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)', clipPath: smallClip }}>
        <div className="absolute top-0.5 h-5 w-5 transition-transform" style={{ left: checked ? 'calc(100% - 1.375rem)' : '0.125rem', background: checked ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.78)', clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)' }} />
      </button>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-4 px-4 py-4" style={{ background: 'rgba(var(--tj-bg-secondary),0.48)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.16)', clipPath: cardClip }}>
      <div className="font-serif text-sm font-bold tracking-[0.24em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>{title}</div>
      {children}
    </div>
  );
}

function SubPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 px-3 py-3" style={{ background: 'rgba(var(--tj-bg-primary),0.38)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)', clipPath: smallClip }}>
      <div className="font-serif text-xs tracking-[0.2em]" style={{ color: 'rgba(var(--tj-accent-primary),0.82)' }}>{title}</div>
      {children}
    </div>
  );
}

function Notice({ children, nsfw = false }: { children: ReactNode; nsfw?: boolean }) {
  return (
    <div className="px-3 py-2 text-xs leading-relaxed" style={{ color: nsfw ? 'rgba(241,183,206,0.9)' : 'rgba(var(--tj-text-secondary),0.76)', background: nsfw ? 'rgba(214,142,174,0.08)' : 'rgba(var(--tj-accent-primary),0.055)', boxShadow: nsfw ? 'inset 0 0 0 1px rgba(214,142,174,0.24)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.16)', clipPath: smallClip }}>
      {children}
    </div>
  );
}

function GuideCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="px-3 py-3" style={{ background: 'rgba(var(--tj-bg-primary),0.38)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)', clipPath: smallClip }}>
      <div className="font-serif text-sm font-bold tracking-[0.16em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>{title}</div>
      <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>{desc}</div>
    </div>
  );
}

type StatusTone = 'ok' | 'muted' | 'info' | 'nsfw';
function StatusCard({ label, value, tone }: { label: string; value: string; tone: StatusTone }) {
  const color = tone === 'ok' ? 'rgba(165,230,170,0.95)' : tone === 'info' ? 'rgba(160,205,235,0.92)' : tone === 'nsfw' ? 'rgba(241,183,206,0.95)' : 'rgba(var(--tj-text-secondary),0.72)';
  return (
    <div className="px-3 py-2" style={{ background: 'rgba(var(--tj-bg-primary),0.42)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)', clipPath: smallClip }}>
      <div className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.62)' }}>{label}</div>
      <div className="mt-1 truncate font-serif text-sm font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function InfoLine({ label, value, nsfw = false }: { label: string; value: string; nsfw?: boolean }) {
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-3 text-xs leading-relaxed">
      <span style={{ color: nsfw ? 'rgba(241,183,206,0.88)' : 'rgba(var(--tj-accent-primary),0.72)' }}>{label}</span>
      <span style={{ color: 'rgba(var(--tj-text-secondary),0.74)' }}>{value}</span>
    </div>
  );
}

function FallbackHint({ text }: { text: string }) {
  return (
    <div className="mt-1.5 text-[11px]" style={{ color: 'rgba(160, 200, 160, 0.72)' }}>
      → {text}
    </div>
  );
}

function backendLabel(backend: 文生图后端类型): string {
  return backendOptions.find((item) => item.value === backend)?.label ?? backend;
}

function readPresetPath(backend: 文生图后端类型): string {
  return presetPathOptions[backend][0]?.label ?? '/images/generations';
}

function readPath(api: 文生图API配置): string {
  if (api.pathMode === 'custom' && api.customPath.trim()) return api.customPath.trim();
  return readPresetPath(api.backend);
}

function normalizeOpenAICompatibleImagePath(path: string): string {
  const raw = String(path || '').trim() || '/images/generations';
  const clean = raw.replace(/\/+$/, '');
  if (/\/v1$/i.test(clean) || /^v1$/i.test(clean)) {
    return `${clean.startsWith('/') || /^https?:\/\//i.test(clean) ? clean : `/${clean}`}/images/generations`;
  }
  return raw;
}

function endpointPreview(api: 文生图API配置): string {
  if (!api.baseUrl.trim()) return '';
  const path = api.backend === 'openai_compatible' ? normalizeOpenAICompatibleImagePath(readPath(api)) : readPath(api);
  return `${api.baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function baseUrlPlaceholder(backend: 文生图后端类型): string {
  if (backend === 'novelai') return 'https://image.novelai.net';
  if (backend === 'sd_webui') return 'http://127.0.0.1:7860';
  if (backend === 'comfyui') return 'http://127.0.0.1:8188';
  return 'https://api.example.com/v1';
}

function backendHints(backend: 文生图后端类型): string[] {
  if (backend === 'novelai') return ['NovelAI 返回图片流或压缩包时会自动转成 dataUrl。', 'Token 必填，建议为 NSFW 单独准备接口配置。'];
  if (backend === 'sd_webui') return ['本地 WebUI 需要开启 API 参数。', '模型可留空，系统会使用当前 WebUI checkpoint。'];
  if (backend === 'comfyui') return ['ComfyUI 必须提供 Workflow JSON。', '工作流中至少要能通过占位符替换 prompt 和尺寸。'];
  return ['OpenAI 兼容接口通常需要 API Key 与模型名。', '如果服务商要求 /v1 前缀，请把它写进 Base URL。'];
}

/** 暗色主题模型选择列表，替代浏览器原生 datalist */
function ModelSuggestList({ models, current, onSelect }: {
  models: string[];
  current: string;
  onSelect: (model: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  if (!models.length) return null;
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-xs mb-1 flex items-center gap-1"
        style={{ color: 'rgba(var(--tj-text-secondary), 0.55)' }}
      >
        <span>{expanded ? '▼' : '▶'}</span>
        <span>可选模型（{models.length}）</span>
      </button>
      {expanded && (
        <div
          className="max-h-40 overflow-y-auto"
          style={{
            background: 'rgba(var(--tj-bg-secondary), 0.95)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
          }}
        >
          {models.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { onSelect(m); setExpanded(false); }}
              className="w-full text-left px-3 py-1.5 text-xs font-mono transition-colors"
              style={{
                color: m === current
                  ? 'rgb(var(--tj-accent-primary))'
                  : 'rgba(var(--tj-text-primary), 0.75)',
                background: m === current
                  ? 'rgba(var(--tj-accent-primary), 0.1)'
                  : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (m !== current) (e.target as HTMLElement).style.background = 'rgba(var(--tj-accent-primary), 0.06)';
              }}
              onMouseLeave={(e) => {
                if (m !== current) (e.target as HTMLElement).style.background = 'transparent';
              }}
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 正文生图设置页 */
function NarrativeImageSettings({ settings, onChange, apiSettings }: {
  settings: 游戏设置;
  onChange: (s: 游戏设置) => void;
  apiSettings: API设置;
}) {
  const img = settings.文生图系统;
  const narrative = img.正文生图;
  {
    const mainConfig = apiSettings.configs.find((c) => c.id === apiSettings.activeConfigId) ?? apiSettings.configs[0] ?? null;
    const tokenizerOverride = img.词组转化器API;
    const tokenizerLabel = img.enablePromptTokenizer
      ? (tokenizerOverride.model.trim() || mainConfig?.model || '跟随主 API')
      : '未启用';
  const imageApiLabel = img.普通接口.enabled ? `统一接口：${backendLabel(img.普通接口.backend)}` : '统一接口未启用';
    const updateNarrative = (partial: Partial<typeof narrative>) => {
      onChange({
        ...settings,
        文生图系统: {
          ...img,
          正文生图: { ...narrative, ...partial },
        },
      });
    };

    return (
      <div className="grid gap-4">
        <Panel title="正文插图参数">
          <Notice>
            正文生图总开关已迁移到“总览”。这里仅配置触发方式；提示词解析复用“转化器”，出图复用统一文生图接口。
          </Notice>
          <div
            className="px-3 py-2 text-sm"
            style={{
              color: narrative.enabled ? 'rgba(165,230,170,0.92)' : 'rgba(var(--tj-text-secondary),0.78)',
              background: narrative.enabled ? 'rgba(100,220,140,0.07)' : 'rgba(var(--tj-bg-secondary),0.42)',
              boxShadow: narrative.enabled ? 'inset 0 0 0 1px rgba(130,230,160,0.22)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)',
              clipPath: smallClip,
            }}
          >
            当前状态：{narrative.enabled ? '已在总览开启' : '未在总览开启'}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="触发模式">
              <select
                value={narrative.mode}
                onChange={(e) => updateNarrative({ mode: e.target.value as 'auto' | 'manual' })}
                disabled={!narrative.enabled}
                className="kaituo-input w-full px-3 py-2 text-sm disabled:opacity-50"
                style={{ clipPath: smallClip }}
              >
                <option value="auto">自动</option>
                <option value="manual">手动</option>
              </select>
            </Field>
            <Field label="玩家出镜">
              <select
                value={narrative.playerAppearanceMode}
                onChange={(e) => updateNarrative({ playerAppearanceMode: e.target.value as 'off' | 'auto' | 'force' })}
                disabled={!narrative.enabled}
                className="kaituo-input w-full px-3 py-2 text-sm disabled:opacity-50"
                style={{ clipPath: smallClip }}
              >
                <option value="off">关闭</option>
                <option value="auto">自动</option>
                <option value="force">强制出镜</option>
              </select>
            </Field>
            <Field label="快照类型">
              <div
                className="px-3 py-2 text-sm"
                style={{
                  color: 'rgba(var(--tj-text-primary),0.86)',
                  background: 'rgba(var(--tj-bg-secondary),0.42)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)',
                  clipPath: smallClip,
                }}
              >
                故事快照
              </div>
            </Field>
            <Field label="生成时机">
              <select
                value={narrative.timing}
                onChange={(e) => updateNarrative({ timing: e.target.value as typeof narrative.timing })}
                disabled={!narrative.enabled}
                className="kaituo-input w-full px-3 py-2 text-sm disabled:opacity-50"
                style={{ clipPath: smallClip }}
              >
                <option value="immediate">立即阻塞</option>
                <option value="queue_current">回合内排队</option>
                <option value="queue_async">纯异步</option>
              </select>
            </Field>
          </div>
        </Panel>

        <Panel title="运行来源">
          <div className="grid gap-3 md:grid-cols-2">
            <SubPanel title="提示词解析">
              <InfoLine label="使用模块" value="文生图词组转化器" />
              <InfoLine label="当前模型" value={tokenizerLabel} />
              <InfoLine label="配置入口" value="设置 > 转化器" />
            </SubPanel>
            <SubPanel title="出图接口">
              <InfoLine label="使用接口" value={imageApiLabel} />
              <InfoLine label="选择规则" value="头像、立绘、场景、手机背景和故事快照都走统一接口。" />
              <InfoLine label="配置入口" value="设置 >统一接口" />
            </SubPanel>
          </div>
        </Panel>

        <Panel title="兼容说明">
          <Notice>
            旧版本存档里的历史字段会继续保留用于读档兼容，但新版本不再读取或展示这些配置。
          </Notice>
          <InfoLine label="自动正文生图" value="需要总览开启正文生图、转化器启用、并至少有一个可用的主文生图接口。" />
          <InfoLine label="手动故事快照" value="相册创作页会走同一套转化器与主文生图接口，不再单独配置 API。" />
        </Panel>
      </div>
    );
  }
}
