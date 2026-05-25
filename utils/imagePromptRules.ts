import type { 图片槽位 } from '@/models/imageGeneration';
import type { 角色数据结构 } from '@/models/character';
import type { NPC记录 } from '@/models/npc';
import type { PNG画风预设来源, 文生图PNG画风预设, 文生图画师串预设, 文生图模型规则集, 文生图规则模板, 文生图规则模板类型, 文生图规则中心设置, 画师串预设适用范围 } from '@/models/settings';

export type 生图Prompt模式 = 'avatar' | 'portrait' | 'scene' | 'phone_wallpaper' | 'nsfw';

export interface 生图Prompt结果 {
  prompt: string;
  negative: string;
}

const seedTime = 1;

export const 默认文生图规则模板列表: 文生图规则模板[] = [
  {
    id: 'transformer_nai_npc',
    名称: 'NAI · NPC角色生成',
    类型: 'npc',
    提示词: [
      '你是 NovelAI / NAI 角色提示词整理器。',
      '请把旅人或 NPC 档案转化为适合 NAI 的英文 Danbooru 风格 tags，使用逗号分隔。',
      '优先顺序：质量词、角色主体、年龄感、发型发色、眼睛、表情、体态、服装层次、材质配饰、身份道具、姿势、构图、背景与光影。',
      '标签要具体可见，不写剧情解释、心理分析、关系总结或抽象文学描述。',
      '原著角色必须保留官方辨识度；原创角色以档案的长期外貌、穿着和身份道具为锚点。',
      '避免过度权重、过量括号和互相冲突的标签；必要时使用少量强调即可。',
    ].join('\n'),
    角色锚定模式提示词: [
      '锚定模式下，稳定外观由角色锚点决定。',
      '只补充当前图片需要的 pose、expression、camera angle、lighting、background、temporary outfit 或 prop。',
      '不要重新发明发色、发型、眼睛、体型、常驻服饰和标志性配饰。',
    ].join('\n'),
    无锚点回退提示词: [
      '没有锚点时，根据档案保守补全稳定外观标签。',
      '资料不足时也要补出 hair, eyes, outfit, body type, expression, pose, background。',
      '不要把一次性场景细节写成永久外观。',
    ].join('\n'),
    输出格式提示词: '只输出英文逗号分隔 tags，不输出标题、解释、JSON 或中文。',
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: 'transformer_banana_npc',
    名称: 'GeminiBanana · NPC角色生成',
    类型: 'npc',
    提示词: [
      '你是 Gemini Banana 角色提示词整理器。',
      '请把角色档案整理成清晰、可执行、偏自然语言的英文角色图提示词。',
      '不要使用 NovelAI 权重语法，不要堆砌过碎的 Danbooru 标签。',
      '提示词顺序：主体身份、稳定外观、身材体态、常驻服装、配饰/武器、动作表情、镜头、光影、背景。',
      '保留崩坏：星穹铁道的科技幻想感、星际材质、金属饰边、能量细节和阵营风格。',
    ].join('\n'),
    角色锚定模式提示词: [
      '沿用锚点中的稳定外观，只补当前画面中的动作、表情、镜头、光影、临时服装变化与道具。',
      '不要把锚点已经确定的五官、体型、发型、服饰重新写成冗长描述。',
    ].join('\n'),
    无锚点回退提示词: '没有锚点时，根据档案补出稳定外观、服饰层次、身份道具和低冲突的长期形象。',
    输出格式提示词: '输出英文 prompt，短句清晰，避免解释。',
    createdAt: seedTime + 1,
    updatedAt: seedTime + 1,
  },
  {
    id: 'transformer_grok_npc',
    名称: 'Grok · NPC角色生成',
    类型: 'npc',
    提示词: [
      '你是 Grok 图像提示词整理器。',
      '请把角色档案整理成直接、具体、可执行的英文角色图提示词。',
      '提示词应像给画面调度下指令：主体是谁、稳定外观是什么、穿什么、拿什么、站在哪里、做什么动作、镜头如何取景、光线如何落下。',
      '把性格和关系转成可见的表情、姿态、距离、视线和手部动作，不写心理旁白。',
      '保留崩坏：星穹铁道的星际材质、阵营符号、科技幻想服装结构和干净高级的角色海报感。',
      '语言应自然但紧凑，不堆砌空泛赞美词，不写无法被画面验证的抽象描述。',
    ].join('\n'),
    角色锚定模式提示词: [
      '如果有角色锚点，稳定身份与外观完全沿用锚点。',
      '只描述当前画面的变化：pose, expression, framing, lighting, environment, temporary props。',
      '若文本与锚点冲突，除非明确写明换装或外观变化，否则以锚点为准。',
    ].join('\n'),
    无锚点回退提示词: '没有锚点时，基于档案补足清晰、低冲突、可长期复用的角色视觉设定。',
    输出格式提示词: '输出英文 image prompt，短句或短语均可，不输出解释。',
    createdAt: seedTime + 2,
    updatedAt: seedTime + 2,
  },
  {
    id: 'transformer_comfyui_npc',
    名称: 'ComfyUI · NPC角色生成',
    类型: 'npc',
    提示词: [
      '你是「开拓轶事」的 ComfyUI 角色提示词整理器。',
      '你的任务是把旅人或 NPC 档案转化为可直接用于角色生图的英文 prompt，并保持崩坏：星穹铁道式科幻奇幻质感。',
      '请按顺序整理：角色身份与年龄感、稳定外貌、发型发色、眼睛、体态、常驻服装、材质与配饰、武器或身份道具、姿态表情、镜头构图、光影。',
      '原著角色必须保留官方辨识度，不得擅自改成无关服装；原创角色以档案为长期锚点。',
      '把性格和关系转化为可见表情、姿态、视线、动作和光线，不写剧情解释、心理分析或抽象形容。',
      '输出应适合普通 ComfyUI workflow 的纯文本 prompt，不强依赖特定节点名。',
    ].join('\n'),
    角色锚定模式提示词: [
      '如果存在角色锚点，请沿用锚点中的稳定外观、体型、发色、眼睛、常驻服饰和主要配饰。',
      '锚定模式下只补充当前镜头需要的动作、姿态、表情、景别、临时道具、光影与背景。',
      '若当前描述与锚点冲突，以锚点为主；除非用户明确要求换装或剧情中已经发生外观变化。',
    ].join('\n'),
    无锚点回退提示词: [
      '没有锚点时，请根据档案保守补全稳定外观。',
      '补全优先低冲突、可长期复用的视觉设定，不要把角色写成一次性夸张造型。',
      '资料很少时也要补出年龄感、脸部气质、体态、衣着层次和身份道具。',
    ].join('\n'),
    输出格式提示词: '只输出可直接用于图片模型的 prompt 文本，不输出解释、标题或 JSON。',
    createdAt: seedTime,
    updatedAt: seedTime,
  },
  {
    id: 'transformer_comfyui_scene',
    名称: 'ComfyUI · 场景生成',
    类型: 'scene',
    提示词: [
      '你是「开拓轶事」的 ComfyUI 场景提示词整理器。',
      '把正文片段、新闻事件或地点描述转化为单帧可执行的英文场景 prompt。',
      '先建立地点、空间结构、时间、天气、光源、材质和前中远景，再写人物站位、动作关系、镜头与氛围。',
      '场景必须保持一个清晰时刻、一个主要视角、一个主光源和一个叙事焦点。',
      '黑塔空间站、雅利洛、仙舟、匹诺康尼等地点要优先保留原著气质和建筑/科技/文化风格。',
      '不要把连续剧情、多段动作或多视角塞进同一张图。',
    ].join('\n'),
    场景角色锚定模式提示词: [
      '如果场景中有人物且存在角色锚点，请沿用锚点外观。',
      '场景图中人物只写当前镜头必要的识别外观、动作、站位、视线和互动关系。',
      '不要把场景图写成多名角色立绘拼贴，环境仍然必须可读。',
    ].join('\n'),
    无锚点回退提示词: '无锚点时，只为主要人物补少量外观识别词；多人画面优先保留空间和关系清晰度。',
    输出格式提示词: '输出英文场景 prompt；纯场景可以不写人物，故事快照必须保留环境层级。',
    createdAt: seedTime + 2,
    updatedAt: seedTime + 2,
  },
  {
    id: 'transformer_banana_scene',
    名称: 'GeminiBanana · 场景生成',
    类型: 'scene',
    提示词: [
      '你是 Gemini Banana 场景提示词整理器。',
      '请把场景资料整理成自然语言英文提示词，适合生成地点壁纸、剧情剧照或手机背景。',
      '优先写地点、空间、材质、时间、光照、天气和镜头，再写人物位置与关系。',
      '保持单帧可执行，不写连续事件，不写解释腔。',
    ].join('\n'),
    场景角色锚定模式提示词: '角色外观来自锚点，请重点生成他们在场景中的位置、互动、动作、镜头设计与环境关系。',
    无锚点回退提示词: '用少量识别词帮助辨认人物，但不要让人物压过场景主体。',
    输出格式提示词: '输出英文 prompt，空间关系清楚，适合图像模型直接读取。',
    createdAt: seedTime + 3,
    updatedAt: seedTime + 3,
  },
  {
    id: 'transformer_hsr_scene_judge',
    名称: '通用 · 场景判定',
    类型: 'scene_judge',
    提示词: [
      '你负责判断当前文本更适合生成“风景场景”还是“故事快照”。',
      '只有文本能稳定对应到一个单一时刻、一个清晰地点、一个主要事件时，才判为故事快照。',
      '如果文本主要是对话、心理、设定说明、回忆、抽象氛围或连续动作，默认判为风景场景。',
      '故事快照至少应具备：明确地点、在场人物、可见动作、道具/站位/空间关系中的三项。',
      '即使判为故事快照，也必须保证地点和环境清晰可读，不允许变成人物拼贴。',
      '只输出“风景场景”或“故事快照”。',
    ].join('\n'),
    createdAt: seedTime + 4,
    updatedAt: seedTime + 4,
  },
];

export const 默认文生图画师串预设列表: 文生图画师串预设[] = [
  {
    id: 'artist_hsr_character_default',
    名称: '崩铁 · 角色基础画风',
    适用范围: 'npc',
    画师串: '',
    正面提示词: [
      'premium anime game illustration',
      'Honkai: Star Rail character key visual style',
      'clean linework, refined face, readable silhouette, detailed outfit materials',
    ].join(', '),
    负面提示词: 'low quality, blurry, bad anatomy, extra fingers, watermark, text, logo',
    createdAt: seedTime + 10,
    updatedAt: seedTime + 10,
  },
  {
    id: 'artist_hsr_scene_default',
    名称: '崩铁 · 场景基础画风',
    适用范围: 'scene',
    画师串: '',
    正面提示词: [
      'cinematic sci-fi fantasy environment',
      'Honkai: Star Rail location concept art mood',
      'layered foreground midground background, polished lighting, atmospheric depth',
    ].join(', '),
    负面提示词: 'low quality, blurry, flat lighting, cluttered composition, text, watermark, logo',
    createdAt: seedTime + 11,
    updatedAt: seedTime + 11,
  },
];

export const 默认文生图PNG画风预设列表: 文生图PNG画风预设[] = [
  {
    id: 'png_hsr_clean_default',
    名称: '崩铁 · 清晰通用画风',
    来源: 'unknown',
    画师串: '',
    正面提示词: 'sharp focus, clean rendering, luminous sci-fi details, polished game visual',
    负面提示词: 'muddy color, lowres, jpeg artifacts, text, watermark',
    createdAt: seedTime + 20,
    updatedAt: seedTime + 20,
  },
];

export const 默认文生图模型规则集列表: 文生图模型规则集[] = [
  {
    id: 'model_rule_comfyui_default',
    名称: 'ComfyUI · 默认规则集',
    模型专属提示词: [
      'Use plain positive prompt and negative prompt text compatible with ComfyUI workflow placeholders.',
      'Keep the prompt modular: style layer, subject layer, camera/composition layer, lighting/environment layer.',
      'Do not output JSON unless explicitly required by the caller.',
    ].join('\n'),
    锚定模式模型提示词: [
      'When character anchor is available, do not rewrite stable identity. Only add current pose, expression, camera, lighting and temporary context.',
    ].join('\n'),
    是否启用: true,
    NPC词组转化器提示词预设ID: 'transformer_comfyui_npc',
    场景词组转化器提示词预设ID: 'transformer_comfyui_scene',
    场景判定提示词预设ID: 'transformer_hsr_scene_judge',
    createdAt: seedTime + 30,
    updatedAt: seedTime + 30,
  },
  {
    id: 'model_rule_banana_default',
    名称: 'GeminiBanana · 默认规则集',
    模型专属提示词: [
      'Use natural English image prompt sentences and short phrases.',
      'Avoid NovelAI weight syntax and overly fragmented tags.',
      'Keep the visual instruction direct, concrete and executable.',
    ].join('\n'),
    锚定模式模型提示词: 'Use the anchor as fixed identity; only describe the new scene/action variation.',
    是否启用: false,
    NPC词组转化器提示词预设ID: 'transformer_banana_npc',
    场景词组转化器提示词预设ID: 'transformer_banana_scene',
    场景判定提示词预设ID: 'transformer_hsr_scene_judge',
    createdAt: seedTime + 31,
    updatedAt: seedTime + 31,
  },
];

export const 默认文生图规则中心: 文生图规则中心设置 = {
  画师串预设列表: 默认文生图画师串预设列表,
  当前NPC画师串预设ID: 'artist_hsr_character_default',
  当前场景画师串预设ID: 'artist_hsr_scene_default',
  PNG画风预设列表: 默认文生图PNG画风预设列表,
  当前NPCPNG画风预设ID: 'png_hsr_clean_default',
  当前场景PNG画风预设ID: 'png_hsr_clean_default',
  模型词组转化器预设列表: 默认文生图模型规则集列表,
  词组转化器提示词预设列表: 默认文生图规则模板列表,
  当前NPC词组转化器提示词预设ID: 'transformer_comfyui_npc',
  当前场景词组转化器提示词预设ID: 'transformer_comfyui_scene',
  当前场景判定提示词预设ID: 'transformer_hsr_scene_judge',
  hsrBaseStyle: [
    'Honkai: Star Rail inspired sci-fi fantasy illustration',
    'premium anime game key visual quality',
    'clean silhouette, refined material design, readable character identity',
    'astral technology, elegant metallic trims, luminous energy details',
    'no text, no logo, no watermark, no UI overlay',
  ].join(', '),
  compositionRule: [
    'choose composition by final slot before writing prompt',
    'avatar: square head and shoulders, face clarity first',
    'portrait: full body or knees-up, outfit layers and silhouette first',
    'scene: wide cinematic frame, location and spatial relation first',
    'phone wallpaper: clean icon-safe negative space',
  ].join(', '),
  hsrCharacterAnchorRule: [
    'keep stable character anchors across generations',
    'anchor hair color, hairstyle, eye color, skin tone, age impression, body type, iconic accessories and faction motifs',
    'for official characters, preserve recognizable canon design; do not redesign into unrelated outfit unless explicitly requested',
    'for original characters, use traveler/NPC archive as canon anchor and keep it consistent',
  ].join(', '),
  promptTokenizerOutputRule: [
    'output compact image tags or short visual phrases, not prose',
    'prefer concrete visual tags: appearance, outfit, material, pose, expression, lighting, lens, background',
    'remove plot explanation, inner psychology, relationship analysis and abstract adjectives unless converted into visible details',
    'return a clear positive prompt and negative prompt',
  ].join(', '),
  modelCompatibilityRule: [
    'NovelAI prefers comma-separated English tags and concise quality tags',
    'SD WebUI prefers stable positive/negative prompt blocks and can use LoRA/style tokens when provided by presets',
    'ComfyUI prompt must remain plain text compatible with workflow placeholders',
    'OpenAI-compatible image models accept natural language, but still keep visual facts dense and unambiguous',
  ].join(', '),
  artistPresetPositive: [
    'masterpiece, best quality, detailed anime game illustration',
    'cinematic lighting, sharp focus, polished rendering',
  ].join(', '),
  artistPresetNegative: [
    'low quality, worst quality, blurry, bad anatomy, bad hands',
    'text, watermark, logo, signature, username, speech bubble',
  ].join(', '),
  pngStyleRule: [
    'PNG style preset is a reusable style layer extracted from reference metadata',
    'it should affect rendering texture, lighting, color grading, brush quality and model flavor',
    'it must not overwrite character identity, canon outfit, NSFW boundary or target slot composition',
  ].join(', '),
  avatarRule: [
    'single character portrait, head and shoulders',
    'clear face focus, recognizable hairstyle and eye shape',
    'readable expression, clean background, suitable for small UI avatar',
  ].join(', '),
  portraitRule: [
    'single character full body illustration',
    'complete outfit, clear pose, readable silhouette',
    'show clothing layers, accessories, weapon or faction detail when available',
  ].join(', '),
  sceneRule: [
    'one clear story moment, cinematic composition',
    'show location, time, lighting, spatial relationship and atmosphere',
    'avoid UI overlays and speech bubbles',
  ].join(', '),
  sceneCharacterRule: [
    'if scene contains characters, keep character count controlled',
    'use character anchors only for people visibly present in the scene',
    'background characters should be simplified and must not steal focus',
    'do not merge two characters into one design',
  ].join(', '),
  phoneWallpaperRule: [
    'phone wallpaper composition',
    'clean negative space for app icons',
    'vertical-friendly or calm background, no readable text',
  ].join(', '),
  itemIconRule: '',
  itemDisplayRule: '',
  nsfwRule: [
    'adult character only',
    'use only confirmed NSFW archive facts',
    'single anatomical reference image, no minors, no text',
  ].join(', '),
  nsfwPartRule: [
    'part image must match selected slot only',
    'female chest, female genital, male genital, rear and body reference must not be mixed in one image unless explicitly requested',
    'use NPC NSFW archive as source of truth; do not invent anatomy for unknown or minor-blocked characters',
  ].join(', '),
  nsfwIsolationRule: [
    'NSFW images must use NSFW interface and NSFW album flag',
    'ordinary avatar, portrait, scene and phone wallpaper prompts must never inherit NSFW tags',
    'male genital generation requires male NSFW archive switch enabled',
  ].join(', '),
  commonNegative: [
    'text, watermark, logo, signature, username, UI overlay, speech bubble',
    'blurry, low quality, bad anatomy, bad hands, extra fingers',
    'duplicate face, multiple people, cropped head, deformed body',
  ].join(', '),
  nsfwNegative: [
    'minor, child, teen, loli, shota',
    'text, watermark, mosaic censor, extra anatomy, duplicate anatomy',
    'collage, split screen, reference sheet, multiple panels',
  ].join(', '),
  sizePresetRule: [
    'recommended sizes: 1024x1024 for avatars',
    '1024x1365 or 832x1216 for portraits',
    '1280x720 or 1536x864 for landscape scenes',
    '720x1280 or 864x1536 for phone wallpaper',
  ].join(', '),
  autoQueueRule: [
    'automatic generation must only create queued suggestions by default',
    'do not spend image quota silently during story turns',
    'prioritize important companions, unlocked phone contacts, major scene changes and manually requested assets',
  ].join(', '),
  profileRule: [
    'image profile bundles backend, model, size, style preset, tokenizer preset, artist preset and target scope',
    'NPC and scene profiles should be switchable independently',
    'profile switching must not alter existing album assets',
  ].join(', '),
};

export function normalizeImageRules(input?: Partial<文生图规则中心设置> | null): 文生图规则中心设置 {
  const defaults = 默认文生图规则中心;
  if (!input) return defaults;
  const artistPresets = normalizeArtistPresets(input.画师串预设列表);
  const pngPresets = normalizePngStylePresets(input.PNG画风预设列表);
  const presets = normalizeRuleTemplates(input.词组转化器提示词预设列表);
  const modelRules = normalizeModelRuleSets(input.模型词组转化器预设列表, presets);
  return {
    画师串预设列表: artistPresets,
    当前NPC画师串预设ID: resolveArtistPresetId(input.当前NPC画师串预设ID, artistPresets, 'npc'),
    当前场景画师串预设ID: resolveArtistPresetId(input.当前场景画师串预设ID, artistPresets, 'scene'),
    PNG画风预设列表: pngPresets,
    当前NPCPNG画风预设ID: resolvePngPresetId(input.当前NPCPNG画风预设ID, pngPresets),
    当前场景PNG画风预设ID: resolvePngPresetId(input.当前场景PNG画风预设ID, pngPresets),
    模型词组转化器预设列表: modelRules,
    词组转化器提示词预设列表: presets,
    当前NPC词组转化器提示词预设ID: resolveActiveTemplateId(input.当前NPC词组转化器提示词预设ID, presets, 'npc'),
    当前场景词组转化器提示词预设ID: resolveActiveTemplateId(input.当前场景词组转化器提示词预设ID, presets, 'scene'),
    当前场景判定提示词预设ID: resolveActiveTemplateId(input.当前场景判定提示词预设ID, presets, 'scene_judge'),
    hsrBaseStyle: String(input.hsrBaseStyle ?? defaults.hsrBaseStyle),
    compositionRule: String(input.compositionRule ?? defaults.compositionRule),
    hsrCharacterAnchorRule: String(input.hsrCharacterAnchorRule ?? defaults.hsrCharacterAnchorRule),
    promptTokenizerOutputRule: String(input.promptTokenizerOutputRule ?? defaults.promptTokenizerOutputRule),
    modelCompatibilityRule: String(input.modelCompatibilityRule ?? defaults.modelCompatibilityRule),
    artistPresetPositive: String(input.artistPresetPositive ?? defaults.artistPresetPositive),
    artistPresetNegative: String(input.artistPresetNegative ?? defaults.artistPresetNegative),
    pngStyleRule: String(input.pngStyleRule ?? defaults.pngStyleRule),
    avatarRule: String(input.avatarRule ?? defaults.avatarRule),
    portraitRule: String(input.portraitRule ?? defaults.portraitRule),
    sceneRule: String(input.sceneRule ?? defaults.sceneRule),
    sceneCharacterRule: String(input.sceneCharacterRule ?? defaults.sceneCharacterRule),
    phoneWallpaperRule: String(input.phoneWallpaperRule ?? defaults.phoneWallpaperRule),
    itemIconRule: '',
    itemDisplayRule: '',
    nsfwRule: String(input.nsfwRule ?? defaults.nsfwRule),
    nsfwPartRule: String(input.nsfwPartRule ?? defaults.nsfwPartRule),
    nsfwIsolationRule: String(input.nsfwIsolationRule ?? defaults.nsfwIsolationRule),
    commonNegative: String(input.commonNegative ?? defaults.commonNegative),
    nsfwNegative: String(input.nsfwNegative ?? defaults.nsfwNegative),
    sizePresetRule: String(input.sizePresetRule ?? defaults.sizePresetRule),
    autoQueueRule: String(input.autoQueueRule ?? defaults.autoQueueRule),
    profileRule: String(input.profileRule ?? defaults.profileRule),
  };
}

export function 获取规则模板列表(rules: 文生图规则中心设置, type: 文生图规则模板类型): 文生图规则模板[] {
  return rules.词组转化器提示词预设列表.filter((preset) => preset.类型 === type);
}

export function 获取当前规则模板(rules: 文生图规则中心设置, type: 文生图规则模板类型): 文生图规则模板 | null {
  const activeModelRule = 获取当前模型规则集(rules);
  const modelBoundId =
    type === 'npc'
      ? activeModelRule?.NPC词组转化器提示词预设ID
      : type === 'scene'
        ? activeModelRule?.场景词组转化器提示词预设ID
        : activeModelRule?.场景判定提示词预设ID;
  const activeId = modelBoundId || (type === 'npc'
      ? rules.当前NPC词组转化器提示词预设ID
      : type === 'scene'
        ? rules.当前场景词组转化器提示词预设ID
        : rules.当前场景判定提示词预设ID);
  const list = 获取规则模板列表(rules, type);
  return list.find((preset) => preset.id === activeId) ?? list[0] ?? null;
}

export function 获取当前模型规则集(rules: 文生图规则中心设置): 文生图模型规则集 | null {
  return rules.模型词组转化器预设列表.find((preset) => preset.是否启用) ?? null;
}

export function 获取当前画师串预设(rules: 文生图规则中心设置, scope: 'npc' | 'scene'): 文生图画师串预设 | null {
  const id = scope === 'scene' ? rules.当前场景画师串预设ID : rules.当前NPC画师串预设ID;
  const list = rules.画师串预设列表.filter((preset) => preset.适用范围 === scope || preset.适用范围 === 'all');
  return list.find((preset) => preset.id === id) ?? list[0] ?? null;
}

export function 获取当前PNG画风预设(rules: 文生图规则中心设置, scope: 'npc' | 'scene'): 文生图PNG画风预设 | null {
  const id = scope === 'scene' ? rules.当前场景PNG画风预设ID : rules.当前NPCPNG画风预设ID;
  return rules.PNG画风预设列表.find((preset) => preset.id === id) ?? rules.PNG画风预设列表[0] ?? null;
}

function normalizeRuleTemplates(input: unknown): 文生图规则模板[] {
  const normalized = Array.isArray(input)
    ? input
        .map((item) => {
          const source = item as Partial<文生图规则模板> | null | undefined;
          const type = normalizeTemplateType(source?.类型);
          const id = String(source?.id || `template_${type}_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          return {
            id,
            名称: String(source?.名称 || templateTypeLabel(type)),
            类型: type,
            提示词: String(source?.提示词 || ''),
            角色锚定模式提示词: source?.角色锚定模式提示词 ? String(source.角色锚定模式提示词) : undefined,
            场景角色锚定模式提示词: source?.场景角色锚定模式提示词 ? String(source.场景角色锚定模式提示词) : undefined,
            无锚点回退提示词: source?.无锚点回退提示词 ? String(source.无锚点回退提示词) : undefined,
            输出格式提示词: source?.输出格式提示词 ? String(source.输出格式提示词) : undefined,
            createdAt: Number(source?.createdAt) || Date.now(),
            updatedAt: Number(source?.updatedAt) || Date.now(),
          } satisfies 文生图规则模板;
        })
    : [];
  const merged = new Map<string, 文生图规则模板>();
  [...默认文生图规则模板列表, ...normalized].forEach((item) => merged.set(item.id, item));
  return Array.from(merged.values());
}

function normalizeArtistPresets(input: unknown): 文生图画师串预设[] {
  const normalized = Array.isArray(input)
    ? input.map((item, index) => {
        const source = item as Partial<文生图画师串预设> | null | undefined;
        const scope = normalizeArtistScope(source?.适用范围);
        return {
          id: String(source?.id || `artist_${scope}_${Date.now()}_${index}`),
          名称: String(source?.名称 || (scope === 'scene' ? '场景画师串' : 'NPC画师串')),
          适用范围: scope,
          画师串: String(source?.画师串 ?? ''),
          正面提示词: String(source?.正面提示词 ?? ''),
          负面提示词: String(source?.负面提示词 ?? ''),
          createdAt: Number(source?.createdAt) || Date.now(),
          updatedAt: Number(source?.updatedAt) || Date.now(),
        } satisfies 文生图画师串预设;
      })
    : [];
  const merged = new Map<string, 文生图画师串预设>();
  [...默认文生图画师串预设列表, ...normalized].forEach((item) => merged.set(item.id, item));
  return Array.from(merged.values());
}

function normalizePngStylePresets(input: unknown): 文生图PNG画风预设[] {
  const normalized = Array.isArray(input)
    ? input.map((item, index) => {
        const source = item as Partial<文生图PNG画风预设> | null | undefined;
        return {
          id: String(source?.id || `png_style_${Date.now()}_${index}`),
          名称: String(source?.名称 || 'PNG画风预设'),
          来源: normalizePngSource(source?.来源),
          画师串: String(source?.画师串 ?? ''),
          正面提示词: String(source?.正面提示词 ?? ''),
          负面提示词: String(source?.负面提示词 ?? ''),
          原始正面提示词: source?.原始正面提示词 ? String(source.原始正面提示词) : undefined,
          原始负面提示词: source?.原始负面提示词 ? String(source.原始负面提示词) : undefined,
          参数: source?.参数 && typeof source.参数 === 'object' ? source.参数 : undefined,
          createdAt: Number(source?.createdAt) || Date.now(),
          updatedAt: Number(source?.updatedAt) || Date.now(),
        } satisfies 文生图PNG画风预设;
      })
    : [];
  const merged = new Map<string, 文生图PNG画风预设>();
  [...默认文生图PNG画风预设列表, ...normalized].forEach((item) => merged.set(item.id, item));
  return Array.from(merged.values());
}

function normalizeModelRuleSets(input: unknown, templates: 文生图规则模板[]): 文生图模型规则集[] {
  const normalized = Array.isArray(input)
    ? input.map((item, index) => {
        const source = item as Partial<文生图模型规则集> | null | undefined;
        return {
          id: String(source?.id || `model_rule_${Date.now()}_${index}`),
          名称: String(source?.名称 || '模型规则集'),
          模型专属提示词: String(source?.模型专属提示词 ?? ''),
          锚定模式模型提示词: source?.锚定模式模型提示词 ? String(source.锚定模式模型提示词) : undefined,
          是否启用: source?.是否启用 === true,
          NPC词组转化器提示词预设ID: resolveActiveTemplateId(source?.NPC词组转化器提示词预设ID, templates, 'npc'),
          场景词组转化器提示词预设ID: resolveActiveTemplateId(source?.场景词组转化器提示词预设ID, templates, 'scene'),
          场景判定提示词预设ID: resolveActiveTemplateId(source?.场景判定提示词预设ID, templates, 'scene_judge'),
          createdAt: Number(source?.createdAt) || Date.now(),
          updatedAt: Number(source?.updatedAt) || Date.now(),
        } satisfies 文生图模型规则集;
      })
    : [];
  const merged = new Map<string, 文生图模型规则集>();
  [...默认文生图模型规则集列表, ...normalized].forEach((item) => merged.set(item.id, item));
  return Array.from(merged.values());
}

function normalizeArtistScope(value: unknown): 画师串预设适用范围 {
  if (value === 'scene' || value === 'all' || value === 'npc') return value;
  return 'npc';
}

function normalizePngSource(value: unknown): PNG画风预设来源 {
  if (value === 'novelai' || value === 'sd_webui' || value === 'comfyui' || value === 'unknown') return value;
  return 'unknown';
}

function resolveArtistPresetId(inputId: unknown, presets: 文生图画师串预设[], scope: 'npc' | 'scene'): string {
  const id = String(inputId || '').trim();
  const scoped = presets.filter((preset) => preset.适用范围 === scope || preset.适用范围 === 'all');
  if (id && scoped.some((preset) => preset.id === id)) return id;
  return scoped[0]?.id ?? '';
}

function resolvePngPresetId(inputId: unknown, presets: 文生图PNG画风预设[]): string {
  const id = String(inputId || '').trim();
  if (id && presets.some((preset) => preset.id === id)) return id;
  return presets[0]?.id ?? '';
}

function normalizeTemplateType(value: unknown): 文生图规则模板类型 {
  if (value === 'scene' || value === 'scene_judge' || value === 'npc') return value;
  return 'npc';
}

function resolveActiveTemplateId(inputId: unknown, presets: 文生图规则模板[], type: 文生图规则模板类型): string {
  const id = String(inputId || '').trim();
  if (id && presets.some((preset) => preset.id === id && preset.类型 === type)) return id;
  return presets.find((preset) => preset.类型 === type)?.id ?? '';
}

function templateTypeLabel(type: 文生图规则模板类型): string {
  if (type === 'scene') return '场景转化规则';
  if (type === 'scene_judge') return '场景判定规则';
  return 'NPC 转化规则';
}

function compactJoin(parts: Array<string | undefined>): string {
  return parts.map((item) => item?.trim()).filter(Boolean).join(', ');
}

function stylePromptParts(rules: 文生图规则中心设置, scope: 'npc' | 'scene', anchored: boolean): Array<string | undefined> {
  const modelRule = 获取当前模型规则集(rules);
  const artist = 获取当前画师串预设(rules, scope);
  const png = 获取当前PNG画风预设(rules, scope);
  return [
    modelRule?.模型专属提示词,
    anchored ? modelRule?.锚定模式模型提示词 : undefined,
    artist?.画师串,
    artist?.正面提示词,
    png?.画师串,
    png?.正面提示词,
  ];
}

function styleNegativeParts(rules: 文生图规则中心设置, scope: 'npc' | 'scene'): Array<string | undefined> {
  const artist = 获取当前画师串预设(rules, scope);
  const png = 获取当前PNG画风预设(rules, scope);
  return [artist?.负面提示词, png?.负面提示词];
}

function ruleForMode(mode: 生图Prompt模式, rules: 文生图规则中心设置): string {
  if (mode === 'avatar') return rules.avatarRule;
  if (mode === 'portrait') return rules.portraitRule;
  if (mode === 'phone_wallpaper') return rules.phoneWallpaperRule;
  if (mode === 'nsfw') return rules.nsfwRule;
  return rules.sceneRule;
}

function readNsfwArchive(npc: NPC记录): string {
  const archive = npc.NSFW档案;
  if (!archive?.enabled) return '';
  const female = archive.女性身体档案
    ? Object.entries(archive.女性身体档案).map(([key, value]) => `${key}: ${value}`).join(', ')
    : '';
  const male = archive.男性身体档案
    ? Object.entries(archive.男性身体档案).map(([key, value]) => `${key}: ${value}`).join(', ')
    : '';
  return compactJoin([
    archive.年龄确认 ? `age confirmation: ${archive.年龄确认}` : undefined,
    female,
    male,
    archive.备注,
  ]);
}

function readNpcCharacterAnchorPrompt(npc: NPC记录): string {
  const anchor = npc.图像档案?.角色锚点;
  if (!anchor || anchor.是否启用 === false) return '';
  const features = anchor.结构化特征
    ? Object.entries(anchor.结构化特征)
        .flatMap(([key, values]) => values?.length ? [`${key}: ${values.join(', ')}`] : [])
        .join('\n')
    : '';
  return [
    anchor.名称 ? `character anchor name: ${anchor.名称}` : undefined,
    anchor.正面提示词 ? `character anchor positive prompt: ${anchor.正面提示词}` : undefined,
    features ? `structured anchor features:\n${features}` : undefined,
  ].filter(Boolean).join('\n');
}

function readNpcCharacterAnchorNegative(npc: NPC记录): string {
  const anchor = npc.图像档案?.角色锚点;
  if (!anchor || anchor.是否启用 === false) return '';
  return anchor.负面提示词 || '';
}

export function buildNpcImagePrompt(params: {
  npc: NPC记录;
  mode: Exclude<生图Prompt模式, 'scene' | 'phone_wallpaper'>;
  rules: 文生图规则中心设置;
  extraRequirement?: string;
  size?: string;
}): 生图Prompt结果 {
  const { npc, mode, rules, extraRequirement, size } = params;
  const template = 获取当前规则模板(rules, 'npc');
  const archiveText = mode === 'nsfw' ? readNsfwArchive(npc) : '';
  const anchorPrompt = readNpcCharacterAnchorPrompt(npc);
  const anchorNegative = readNpcCharacterAnchorNegative(npc);
  const hasAnchor = Boolean(anchorPrompt || npc.外貌 || npc.穿着 || npc.图像档案?.头像提示词 || npc.图像档案?.立绘提示词);
  const prompt = compactJoin([
    rules.hsrBaseStyle,
    rules.compositionRule,
    rules.hsrCharacterAnchorRule,
    rules.modelCompatibilityRule,
    rules.artistPresetPositive,
    ...stylePromptParts(rules, 'npc', hasAnchor),
    template?.提示词,
    hasAnchor ? template?.角色锚定模式提示词 : template?.无锚点回退提示词,
    template?.输出格式提示词,
    ruleForMode(mode, rules),
    mode === 'nsfw' ? rules.nsfwIsolationRule : undefined,
    mode === 'nsfw' ? rules.nsfwPartRule : undefined,
    npc.原著角色 ? 'faithful to official Honkai: Star Rail character design' : undefined,
    `character name: ${npc.姓名}`,
    npc.性别 ? `gender: ${npc.性别}` : undefined,
    npc.外貌 ? `appearance: ${npc.外貌}` : undefined,
    npc.穿着 ? `outfit: ${npc.穿着}` : undefined,
    npc.性格 ? `visible personality impression: ${npc.性格}` : undefined,
    npc.装备摘要 ? `equipment: ${npc.装备摘要}` : undefined,
    anchorPrompt,
    mode === 'avatar' ? npc.图像档案?.头像提示词 : npc.图像档案?.立绘提示词,
    archiveText,
    size ? `target canvas size: ${size}` : undefined,
    extraRequirement ? `extra requirement: ${extraRequirement}` : undefined,
  ]);
  return {
    prompt,
    negative: compactJoin([rules.artistPresetNegative, ...styleNegativeParts(rules, 'npc'), anchorNegative, rules.commonNegative, mode === 'nsfw' ? rules.nsfwNegative : undefined]),
  };
}

export function buildTravelerImagePrompt(params: {
  traveler: 角色数据结构;
  mode: Extract<生图Prompt模式, 'avatar' | 'portrait'>;
  rules: 文生图规则中心设置;
  extraRequirement?: string;
  size?: string;
}): 生图Prompt结果 {
  const { traveler, mode, rules, extraRequirement, size } = params;
  const template = 获取当前规则模板(rules, 'npc');
  const hasAnchor = Boolean(traveler.外貌 || traveler.身份 || traveler.能力?.length);
  const prompt = compactJoin([
    rules.hsrBaseStyle,
    rules.compositionRule,
    rules.hsrCharacterAnchorRule,
    rules.modelCompatibilityRule,
    rules.artistPresetPositive,
    ...stylePromptParts(rules, 'npc', hasAnchor),
    template?.提示词,
    hasAnchor ? template?.角色锚定模式提示词 : template?.无锚点回退提示词,
    template?.输出格式提示词,
    ruleForMode(mode, rules),
    `player character name: ${traveler.姓名 || 'Traveler'}`,
    traveler.性别 ? `gender: ${traveler.性别}` : undefined,
    traveler.年龄 ? `age: ${traveler.年龄}` : undefined,
    traveler.身高 ? `height: ${traveler.身高}` : undefined,
    traveler.身份 ? `identity: ${traveler.身份}` : undefined,
    traveler.外貌 ? `appearance: ${traveler.外貌}` : undefined,
    traveler.性格 ? `visible personality impression: ${traveler.性格}` : undefined,
    traveler.能力?.length ? `abilities: ${traveler.能力.join(', ')}` : undefined,
    traveler.主命途 ? `path: ${traveler.主命途}` : undefined,
    size ? `target canvas size: ${size}` : undefined,
    extraRequirement ? `extra requirement: ${extraRequirement}` : undefined,
  ]);
  return {
    prompt,
    negative: compactJoin([rules.artistPresetNegative, ...styleNegativeParts(rules, 'npc'), rules.commonNegative]),
  };
}

export function buildSceneImagePrompt(params: {
  text: string;
  mode: Extract<生图Prompt模式, 'scene' | 'phone_wallpaper'>;
  rules: 文生图规则中心设置;
  extraRequirement?: string;
  size?: string;
  slot?: 图片槽位;
}): 生图Prompt结果 {
  const { text, mode, rules, extraRequirement, size } = params;
  const template = 获取当前规则模板(rules, 'scene');
  return {
    prompt: compactJoin([
      rules.hsrBaseStyle,
      rules.compositionRule,
      rules.modelCompatibilityRule,
      rules.artistPresetPositive,
      ...stylePromptParts(rules, 'scene', true),
      template?.提示词,
      template?.场景角色锚定模式提示词,
      template?.无锚点回退提示词,
      template?.输出格式提示词,
      ruleForMode(mode, rules),
      mode === 'scene' ? rules.sceneCharacterRule : undefined,
      text,
      size ? `target canvas size: ${size}` : undefined,
      extraRequirement ? `extra requirement: ${extraRequirement}` : undefined,
    ]),
    negative: compactJoin([rules.artistPresetNegative, ...styleNegativeParts(rules, 'scene'), rules.commonNegative]),
  };
}
