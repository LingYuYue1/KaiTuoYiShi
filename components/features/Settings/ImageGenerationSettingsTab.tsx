import { useMemo, useState, type ReactNode } from 'react';
import type {
  自动NPC生图构图,
  自动NPC生图性别筛选,
  自动生图场景构图,
  游戏设置,
  NovelAI噪点表,
  NovelAI采样器,
  文生图API配置,
  文生图后端类型,
  文生图默认风格,
  文生图规则中心设置,
  文生图响应格式,
  文生图预设接口路径,
} from '@/models/settings';
import { saveSetting } from '@/services/dbService';
import { fetchComfyCheckpoints, testImageGenerationConnection } from '@/services/ai/imageGeneration';
import { ImageRuleTemplateEditor } from '@/components/features/ImageGeneration/ImageRuleTemplateEditor';

interface Props {
  settings: 游戏设置;
  onChange: (s: 游戏设置) => void;
}

type Page = 'overview' | 'normal' | 'scene' | 'nsfw' | 'rules' | 'tokenizer' | 'automation' | 'guide';
type ApiKey = '普通接口' | '场景接口' | 'NSFW接口';

const smallClip = 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';
const cardClip = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

const pages: { id: Page; label: string; desc: string }[] = [
  { id: 'overview', label: '总览', desc: '开关与隔离状态' },
  { id: 'normal', label: '普通接口', desc: '头像、立绘' },
  { id: 'scene', label: '场景接口', desc: '场景、壁纸、剧照' },
  { id: 'nsfw', label: 'NSFW接口', desc: '成人内容隔离' },
  { id: 'rules', label: '规则中心', desc: '生成提示词规范' },
  { id: 'tokenizer', label: '转化器', desc: '档案转 prompt' },
  { id: 'automation', label: '自动任务', desc: '后台队列预设' },
  { id: 'guide', label: '接口说明', desc: '后端填写参考' },
];

const backendOptions: { value: 文生图后端类型; label: string }[] = [
  { value: 'openai_compatible', label: 'OpenAI 兼容图片接口' },
  { value: 'novelai', label: 'NovelAI 官方' },
  { value: 'sd_webui', label: 'Stable Diffusion WebUI' },
  { value: 'comfyui', label: 'ComfyUI' },
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

const styleOptions: { value: 文生图默认风格; label: string }[] = [
  { value: 'hsr', label: '崩铁质感' },
  { value: 'anime', label: '二次元' },
  { value: 'realistic', label: '写实' },
  { value: 'custom', label: '自定义' },
];

const sceneCompositionOptions: { value: 自动生图场景构图; label: string }[] = [
  { value: '纯场景', label: '纯场景' },
  { value: '故事快照', label: '故事快照' },
  { value: '剧照', label: '剧照' },
];

const npcCompositionOptions: { value: 自动NPC生图构图; label: string }[] = [
  { value: '头像', label: '头像' },
  { value: '半身', label: '半身' },
  { value: '立绘', label: '立绘' },
];

const genderFilterOptions: { value: 自动NPC生图性别筛选; label: string }[] = [
  { value: '全部', label: '全部' },
  { value: '男', label: '男性' },
  { value: '女', label: '女性' },
];

const modelSuggestions: Record<文生图后端类型, string[]> = {
  openai_compatible: ['gpt-image-2', 'gpt-image-1'],
  novelai: ['nai-diffusion-4-5-full', 'nai-diffusion-4-5-curated', 'nai-diffusion-4-full'],
  sd_webui: ['由 WebUI 当前模型决定，可留空', 'AnythingV5', 'Counterfeit-V3.0'],
  comfyui: ['由 Workflow 决定，可留空'],
};

export function ImageGenerationSettingsTab({ settings, onChange }: Props) {
  const [activePage, setActivePage] = useState<Page>('overview');
  const [message, setMessage] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [testingKey, setTestingKey] = useState<ApiKey | null>(null);
  const [testMessages, setTestMessages] = useState<Record<ApiKey, string>>({
    普通接口: '',
    场景接口: '',
    NSFW接口: '',
  });
  const image = settings.文生图系统;
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

  const patchRules = (patch: Partial<文生图规则中心设置>) => {
    patchSystem({ rules: { ...image.rules, ...patch } });
  };

  const statusCards = useMemo(() => [
    { label: '总开关', value: image.enabled ? '已开启' : '未开启', tone: image.enabled ? 'ok' : 'muted' },
    { label: '普通接口', value: image.普通接口.enabled ? backendLabel(image.普通接口.backend) : '未启用', tone: image.普通接口.enabled ? 'ok' : 'muted' },
    { label: '场景接口', value: image.useSeparateSceneApi ? (image.场景接口.enabled ? backendLabel(image.场景接口.backend) : '独立未启用') : '复用普通', tone: image.useSeparateSceneApi ? 'info' : 'muted' },
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
    <div className="space-y-5">
      <div
        className="px-4 py-4"
        style={{
          background: 'radial-gradient(circle at top left, rgba(var(--tj-accent-primary), 0.16), transparent 38%), linear-gradient(135deg, rgba(var(--tj-bg-secondary),0.88), rgba(var(--tj-bg-primary),0.94))',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.28), 0 0 26px rgba(var(--tj-accent-primary), 0.08)',
          clipPath: cardClip,
        }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="font-serif text-lg font-bold tracking-[0.24em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
              文生图控制台
            </div>
            <div className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
              相册是所有图片的中转站。普通、场景、NSFW 三类接口分开配置；NSFW 不会回退到普通接口，避免正常游玩时混入成人内容。
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[420px]">
            {statusCards.map((item) => <StatusCard key={item.label} label={item.label} value={item.value} tone={item.tone as StatusTone} />)}
          </div>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-8">
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            onClick={() => setActivePage(page.id)}
            className="px-3 py-3 text-left transition-all"
            style={{
              color: activePage === page.id ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-accent-primary), 0.88)',
              background: activePage === page.id
                ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.96), rgba(var(--tj-accent-secondary),0.92))'
                : 'rgba(var(--tj-accent-primary), 0.055)',
              boxShadow: activePage === page.id
                ? 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.45), 0 0 16px rgba(var(--tj-accent-primary),0.12)'
                : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)',
              clipPath: smallClip,
            }}
          >
            <div className="font-serif text-sm font-bold tracking-[0.16em]">{page.label}</div>
            <div className="mt-1 text-[11px] opacity-75">{page.desc}</div>
          </button>
        ))}
      </div>

      {activePage === 'overview' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Panel title="基础开关">
            <ToggleRow label="启用文生图" desc="开启后，相册显示手动生成入口；关闭时保留已有图片和挂载关系。" checked={image.enabled} onChange={(v) => patchSystem({ enabled: v })} />
            <ToggleRow label="词组转化器" desc="把伙伴档案、场景摘要和 NSFW 档案整理成适合模型的 prompt。" checked={image.enablePromptTokenizer} onChange={(v) => patchSystem({ enablePromptTokenizer: v })} />
            <ToggleRow label="场景使用独立接口" desc="场景图、手机背景、剧情剧照可以使用更适合横图/场景的模型；关闭时复用普通接口。" checked={image.useSeparateSceneApi} onChange={(v) => patchSystem({ useSeparateSceneApi: v })} />
            <ToggleRow label="启用 NSFW 生图" desc="受 NSFW 总开关约束。开启后仍只会使用 NSFW 独立接口，不复用普通或场景接口。" checked={Boolean(settings.enableNsfw && image.enableNsfwImageGeneration)} disabled={!settings.enableNsfw} onChange={(v) => patchSystem({ enableNsfwImageGeneration: settings.enableNsfw ? v : false })} />
          </Panel>
          <Panel title="工作流说明">
            <InfoLine label="普通资源" value="伙伴头像、正文头像、手机头像、角色立绘。" />
            <InfoLine label="场景资源" value="地点壁纸、手机背景、剧情快照、新闻配图。" />
            <InfoLine label="NSFW资源" value="只读取 NSFW 档案，只进 NSFW 相册过滤，不参与普通自动任务。" nsfw />
            <InfoLine label="任务保存" value="图片先进入相册，再由玩家挂载到对应槽位。" />
          </Panel>
        </div>
      )}

      {activePage === 'normal' && (
        <ApiBlock
          title="普通文生图接口"
          desc="用于头像、立绘和非成人视觉资源。建议先把这里调通，再配置场景或 NSFW。"
          apiKey="普通接口"
          api={image.普通接口}
          onChange={(p) => patchApi('普通接口', p)}
          onTest={() => handleTest('普通接口', image.普通接口)}
          testMessage={testMessages.普通接口}
          testing={testingKey === '普通接口'}
        />
      )}

      {activePage === 'scene' && (
        <Panel title="场景生图策略">
          <ToggleRow label="场景使用独立接口" desc="开启后，场景、壁纸、剧照走下方接口；关闭时相册会复用普通接口。" checked={image.useSeparateSceneApi} onChange={(v) => patchSystem({ useSeparateSceneApi: v })} />
          {!image.useSeparateSceneApi && (
            <Notice>当前场景生图会复用普通接口。若你使用的普通模型偏头像，可以开启独立场景接口。</Notice>
          )}
          {image.useSeparateSceneApi && (
            <ApiBlock
              title="场景文生图接口"
              desc="用于地点、手机背景、剧情剧照。推荐横屏尺寸，如 1280x720 或 1536x864。"
              apiKey="场景接口"
              api={image.场景接口}
              onChange={(p) => patchApi('场景接口', p)}
              onTest={() => handleTest('场景接口', image.场景接口)}
              testMessage={testMessages.场景接口}
              testing={testingKey === '场景接口'}
            />
          )}
        </Panel>
      )}

      {activePage === 'nsfw' && (
        <Panel title="NSFW 生图隔离">
          <Notice nsfw>
            NSFW 生图必须同时满足：NSFW 总开关开启、NSFW 生图开关开启、NSFW 接口启用。它不会自动回退到普通接口或场景接口。
          </Notice>
          <ToggleRow label="启用 NSFW 生图" desc="关闭时相册不显示 NSFW 生成按钮，自动任务也不会生成成人图片。" checked={Boolean(settings.enableNsfw && image.enableNsfwImageGeneration)} disabled={!settings.enableNsfw} onChange={(v) => patchSystem({ enableNsfwImageGeneration: settings.enableNsfw ? v : false })} />
          {settings.enableNsfw && image.enableNsfwImageGeneration ? (
            <ApiBlock
              title="NSFW 独立接口"
              desc="用于 NSFW 档案部位图。推荐 NovelAI、SD WebUI 或 ComfyUI，并使用单独模型或工作流。"
              apiKey="NSFW接口"
              api={image.NSFW接口}
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

      {activePage === 'rules' && (
        <Panel title="生成提示词规则中心">
          <Notice>
            相册里的“生成 Prompt 草稿”会读取这里。这里改为墨色同构的规则模板：NPC 转化规则、场景转化规则和场景判定规则分开维护，并可分别选择当前生效模板。
          </Notice>
          <ImageRuleTemplateEditor rules={image.rules} onChange={patchRules} />
        </Panel>
      )}

      {activePage === 'tokenizer' && (
        <Panel title="词组转化器">
          <ToggleRow label="启用词组转化器" desc="开启后，相册会优先把档案整理成提示词草稿，玩家仍可手动编辑。" checked={image.enablePromptTokenizer} onChange={(v) => patchSystem({ enablePromptTokenizer: v })} />
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

      {activePage === 'automation' && (
        <Panel title="自动任务配置">
          <Notice>这里先保存自动任务策略，实际排队会在后续接入伙伴、背包、新闻和剧情回合。默认全部关闭，避免突然消耗生图额度。</Notice>
          <div className="grid gap-4 xl:grid-cols-2">
            <SubPanel title="场景自动生图">
              <ToggleRow label="启用场景队列" desc="后续用于关键地点、新闻事件或章节切换时自动排队。" checked={image.enableAutoSceneGeneration} onChange={(v) => patchSystem({ enableAutoSceneGeneration: v })} />
              <Field label="触发间隔回合">
                <input type="number" min={1} max={20} value={image.autoSceneIntervalTurns} onChange={(e) => patchSystem({ autoSceneIntervalTurns: Math.max(1, Number(e.target.value) || 1) })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
              </Field>
              <Field label="构图要求">
                <select value={image.autoSceneComposition} onChange={(e) => patchSystem({ autoSceneComposition: e.target.value as 自动生图场景构图 })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                  {sceneCompositionOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </Field>
              <Field label="默认尺寸">
                <input value={image.autoSceneSize} onChange={(e) => patchSystem({ autoSceneSize: e.target.value })} className="kaituo-input w-full px-3 py-2 text-sm font-mono" style={{ clipPath: smallClip }} />
              </Field>
            </SubPanel>
            <SubPanel title="伙伴自动生图">
              <ToggleRow label="启用伙伴队列" desc="后续用于原著角色、重要伙伴或无头像联系人自动补图。" checked={image.enableAutoNpcGeneration} onChange={(v) => patchSystem({ enableAutoNpcGeneration: v })} />
              <Field label="性别筛选">
                <select value={image.autoNpcGenderFilter} onChange={(e) => patchSystem({ autoNpcGenderFilter: e.target.value as 自动NPC生图性别筛选 })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                  {genderFilterOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </Field>
              <ToggleRow label="只生成重要伙伴" desc="开启后路人、泛称 NPC 不进入自动生图队列。" checked={image.autoNpcImportantOnly} onChange={(v) => patchSystem({ autoNpcImportantOnly: v })} />
              <Field label="默认构图">
                <select value={image.autoNpcComposition} onChange={(e) => patchSystem({ autoNpcComposition: e.target.value as 自动NPC生图构图 })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                  {npcCompositionOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </Field>
              <Field label="默认尺寸">
                <input value={image.autoNpcSize} onChange={(e) => patchSystem({ autoNpcSize: e.target.value })} className="kaituo-input w-full px-3 py-2 text-sm font-mono" style={{ clipPath: smallClip }} />
              </Field>
            </SubPanel>
          </div>
        </Panel>
      )}

      {activePage === 'guide' && <GuidePage />}

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
              : 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.96), rgba(212, 177, 90, 0.94))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.52), 0 0 18px rgba(var(--tj-accent-primary),0.16)',
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
  const suggestions = fetchedModels.length ? fetchedModels : modelSuggestions[api.backend];
  const handleFetchComfyModels = async () => {
    setModelLoading(true);
    setModelMessage('正在读取 ComfyUI 模型列表...');
    try {
      const models = await fetchComfyCheckpoints(api);
      setFetchedModels(models);
      if (models.length) {
        if (!api.model || !models.includes(api.model)) onChange({ model: models[0] });
        setModelMessage(`已读取 ${models.length} 个 checkpoint。`);
      } else {
        setModelMessage('没有从 ComfyUI 读取到 checkpoint 列表。');
      }
    } catch (err) {
      setModelMessage(`读取失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setModelLoading(false);
    }
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
                {api.backend === 'comfyui' && (
                  <button type="button" onClick={handleFetchComfyModels} disabled={modelLoading || !api.baseUrl.trim()} className="px-3 py-2 text-xs font-serif tracking-[0.14em] disabled:opacity-45" style={{ color: 'rgb(var(--tj-accent-primary))', background: 'rgba(var(--tj-accent-primary),0.055)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.22)', clipPath: smallClip }}>
                    {modelLoading ? '读取中' : '获取'}
                  </button>
                )}
              </div>
              <datalist id={`${apiKey}-models`}>
                {suggestions.map((item) => <option key={item} value={item} />)}
              </datalist>
              {api.backend === 'comfyui' && modelMessage && (
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
            <Field label="步数">
              <input type="number" min={1} max={80} value={api.steps} onChange={(e) => onChange({ steps: Math.max(1, Number(e.target.value) || 1) })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
            </Field>
            <Field label="CFG">
              <input type="number" min={0} max={30} step={0.5} value={api.cfgScale} onChange={(e) => onChange({ cfgScale: Math.max(0, Number(e.target.value) || 0) })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
            </Field>
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
          <SubPanel title="风格与重试">
            <Field label="默认风格">
              <select value={api.defaultStyle} onChange={(e) => onChange({ defaultStyle: e.target.value as 文生图默认风格 })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                {styleOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </Field>
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
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="NovelAI 采样器">
            <select value={api.sampler} onChange={(e) => onChange({ sampler: e.target.value as NovelAI采样器 })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
              {samplerOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </Field>
          <Field label="噪点表">
            <select value={api.noiseSchedule} onChange={(e) => onChange({ noiseSchedule: e.target.value as NovelAI噪点表 })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
              {noiseOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </Field>
        </div>
      )}

      <Field label="默认负面提示词">
        <textarea value={api.negativePrompt} onChange={(e) => onChange({ negativePrompt: e.target.value })} rows={3} className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
      </Field>

      {api.defaultStyle === 'custom' && (
        <Field label="自定义风格">
          <textarea value={api.customStyle} onChange={(e) => onChange({ customStyle: e.target.value })} rows={3} className="kaituo-input w-full resize-none px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
        </Field>
      )}

      {api.backend === 'comfyui' && (
        <>
          <ToggleRow label="使用默认工作流" desc="当前项目还没有内置可直接运行的 ComfyUI 工作流；如果开启但没有 JSON，生成时会提示补齐。" checked={api.useDefaultComfyWorkflow} onChange={(v) => onChange({ useDefaultComfyWorkflow: v })} />
          <Notice>
            ComfyUI 的 Checkpoint 必须填写本机模型列表里存在的 ckpt_name。Workflow 可使用 __MODEL__ / __CKPT_NAME__ / __SAMPLER__ / __SCHEDULER__ / __PROMPT__ / __NEGATIVE_PROMPT__ 等占位符，提交前会自动替换。
          </Notice>
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
      <button type="button" disabled={disabled} onClick={() => onChange(!checked)} className="relative h-6 w-11 flex-shrink-0 transition-all disabled:cursor-not-allowed" style={{ background: checked ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(212, 177, 90, 0.95))' : 'rgba(60, 55, 40, 0.7)', boxShadow: checked ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5), 0 0 10px rgba(var(--tj-accent-primary), 0.25)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)', clipPath: smallClip }}>
        <div className="absolute top-0.5 h-5 w-5 transition-transform" style={{ left: checked ? 'calc(100% - 1.375rem)' : '0.125rem', background: checked ? 'rgb(var(--tj-bg-primary))' : 'rgba(220, 200, 160, 0.85)', clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)' }} />
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

function endpointPreview(api: 文生图API配置): string {
  if (!api.baseUrl.trim()) return '';
  return `${api.baseUrl.replace(/\/+$/, '')}${readPath(api).startsWith('/') ? readPath(api) : `/${readPath(api)}`}`;
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
