import type { 图片槽位, StorySnapshotRenderContext } from '@/models/imageGeneration';
import { normalizeStorySnapshotRenderContext } from '@/models/imageGeneration';
import type { 角色数据结构 } from '@/models/character';
import type { NPC记录 } from '@/models/npc';
import { 筛选活跃NPC } from '@/models/npc';
import type { API配置项, 文生图规则中心设置 } from '@/models/settings';
import {
  buildSceneImagePrompt,
  获取当前故事快照解析规则,
  应用场景角色锚点锁,
  应用质量增强提示词,
} from '@/utils/imagePromptRules';
import {
  parseStorySnapshotPrompt,
  StorySnapshotParseError,
  type 故事快照解析角色,
} from './narrativeImageParse';

export interface StorySnapshotSummary {
  title: string;
  characters: string[];
  location: string;
  atmosphere: string;
  action: string;
  camera: string;
  avoid: string;
}

export interface StorySnapshotResolution {
  summary: StorySnapshotSummary;
  sceneText: string;
  prompt: string;
  negativePrompt: string;
  sourcePrompt: string;
  renderContext: StorySnapshotRenderContext;
  source: 'model' | 'local';
  warning?: string;
  diagnosticRawText?: string;
}

export interface ResolveStorySnapshotParams {
  apiConfig: API配置项 | null;
  body: string;
  traveler: 角色数据结构;
  presentNpcs: NPC记录[];
  playerAppearanceMode?: 'off' | 'auto' | 'force';
  rules: 文生图规则中心设置;
  extraRequirement?: string;
  size?: string;
  slot?: 图片槽位;
  signal?: AbortSignal;
}

export function trimStorySnapshotSource(text: string): string {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<变量事实>[\s\S]*?<\/变量事实>/g, '')
    .replace(/<变量更新>[\s\S]*?<\/变量更新>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 1800);
}

export function selectPresentStorySnapshotNpcs(npcs: NPC记录[], body: string): NPC记录[] {
  const text = body.trim();
  return 筛选活跃NPC(npcs)
    .map((npc) => ({
      npc,
      score: (text && (text.includes(npc.姓名) || Boolean(npc.别名 && text.includes(npc.别名))) ? 100 : 0)
        + (npc.同行 ? 80 : 0)
        + (npc.图像档案?.角色锚点?.正面提示词 ? 20 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.npc.最近回合 - a.npc.最近回合)
    .map((item) => item.npc)
    .slice(0, 4);
}

function pickSentence(text: string, keywords: string[]): string {
  const sentences = text.split(/[。！？!?]/).map((item) => item.trim()).filter(Boolean);
  return sentences.find((sentence) => keywords.some((keyword) => sentence.includes(keyword))) || sentences[0] || '';
}

function inferSnapshotAtmosphere(text: string): string {
  if (/紧张|警惕|危险|压迫|战斗|爆炸|追逐|枪|刃|血/.test(text)) return '紧张、压迫、带有行动前后的张力';
  if (/温暖|笑|点心|午后|柔和|安静|闲聊|放松/.test(text)) return '温暖、安静、日常感';
  if (/雨|夜|霓虹|阴影|沉默|低声|秘密/.test(text)) return '低调、潮湿、带一点悬疑感';
  if (/实验|数据|屏幕|机械|空间站|装置/.test(text)) return '冷光、科技感、理性而克制';
  return '贴合正文情绪，保留剧情现场感';
}

function buildSnapshotTitle(location: string, action: string): string {
  const subject = location.replace(/^当前剧情发生/, '').slice(0, 10) || '故事瞬间';
  const actionHint = action.replace(/[“”"']/g, '').slice(0, 12);
  return `${subject}${actionHint ? ` · ${actionHint}` : ''}`;
}

const LOCAL_SCENE_TAG_RULES: ReadonlyArray<{ pattern: RegExp; tags: string[] }> = [
  { pattern: /黑塔/, tags: ['Herta Space Station'] },
  { pattern: /空间站/, tags: ['futuristic orbital research station interior'] },
  { pattern: /星穹列车|列车/, tags: ['Astral Express interior'] },
  { pattern: /观景车厢/, tags: ['panoramic observation lounge'] },
  { pattern: /雅利洛|贝洛伯格/, tags: ['Belobog', 'snow-covered industrial fantasy city'] },
  { pattern: /仙舟|罗浮/, tags: ['Xianzhou Luofu', 'celestial ship architecture', 'jade and gold details'] },
  { pattern: /匹诺康尼/, tags: ['Penacony dreamscape', 'Art Deco fantasy city'] },
  { pattern: /走廊|长廊/, tags: ['metallic corridor'] },
  { pattern: /大厅/, tags: ['spacious futuristic hall'] },
  { pattern: /舷窗|星海|星空|星河/, tags: ['panoramic space window', 'visible starfield'] },
  { pattern: /警报|红色警示|红色警报/, tags: ['red emergency lighting'] },
  { pattern: /冷光|冷蓝/, tags: ['cool blue lighting'] },
  { pattern: /终端|全息/, tags: ['glowing holographic terminal'] },
  { pattern: /破裂|碎片|残骸/, tags: ['damaged metal structure', 'drifting debris'] },
  { pattern: /反物质军团/, tags: ['Antimatter Legion threat in the distance'] },
  { pattern: /雨|潮湿/, tags: ['rainy atmosphere', 'wet reflective surfaces'] },
  { pattern: /夜|霓虹/, tags: ['night scene', 'neon rim lighting'] },
  { pattern: /雪|永冬/, tags: ['snowfall', 'cold winter haze'] },
];

const LOCAL_CHARACTER_TAG_RULES: ReadonlyArray<{ pattern: RegExp; tags: string[] }> = [
  { pattern: /银(?:色)?(?:长)?发/, tags: ['silver hair'] },
  { pattern: /白(?:色)?(?:长)?发/, tags: ['white hair'] },
  { pattern: /黑(?:色)?(?:长)?发/, tags: ['black hair'] },
  { pattern: /金(?:色)?(?:长)?发|金发/, tags: ['blonde hair'] },
  { pattern: /棕(?:色)?(?:长)?发|棕发/, tags: ['brown hair'] },
  { pattern: /红(?:色)?(?:长)?发|红发/, tags: ['red hair'] },
  { pattern: /蓝(?:色)?(?:长)?发|蓝发/, tags: ['blue hair'] },
  { pattern: /粉(?:色)?(?:长)?发|粉发/, tags: ['pink hair'] },
  { pattern: /紫(?:色)?(?:长)?发|紫发/, tags: ['purple hair'] },
  { pattern: /绿(?:色)?(?:长)?发|绿发/, tags: ['green hair'] },
  { pattern: /长发/, tags: ['long hair'] },
  { pattern: /短发/, tags: ['short hair'] },
  { pattern: /马尾/, tags: ['ponytail'] },
  { pattern: /编发|辫子/, tags: ['braided hair'] },
  { pattern: /金瞳|金色眼(?:睛)?/, tags: ['golden eyes'] },
  { pattern: /蓝瞳|蓝色眼(?:睛)?/, tags: ['blue eyes'] },
  { pattern: /红瞳|红色眼(?:睛)?/, tags: ['red eyes'] },
  { pattern: /绿瞳|绿色眼(?:睛)?/, tags: ['green eyes'] },
  { pattern: /紫瞳|紫色眼(?:睛)?/, tags: ['purple eyes'] },
  { pattern: /黑色长外套|黑.*外套/, tags: ['black long coat'] },
  { pattern: /白色长外套|白.*外套/, tags: ['white long coat'] },
  { pattern: /长外套/, tags: ['long coat'] },
  { pattern: /旅行装/, tags: ['practical traveler outfit'] },
  { pattern: /制服/, tags: ['fitted uniform'] },
  { pattern: /礼服|长裙/, tags: ['elegant dress'] },
  { pattern: /短裙/, tags: ['short skirt'] },
  { pattern: /盔甲|铠甲/, tags: ['detailed armor'] },
  { pattern: /斗篷|披风/, tags: ['flowing cape'] },
  { pattern: /眼镜/, tags: ['glasses'] },
  { pattern: /耳钉|耳环/, tags: ['earrings'] },
  { pattern: /清瘦|纤细/, tags: ['slender build'] },
  { pattern: /高挑/, tags: ['tall build'] },
  { pattern: /健壮|结实/, tags: ['athletic build'] },
  { pattern: /挥手|招手/, tags: ['waving gesture'] },
  { pattern: /站在|站立/, tags: ['standing pose'] },
  { pattern: /坐在|坐下/, tags: ['seated pose'] },
  { pattern: /握住|拿着|手持/, tags: ['holding an object'] },
  { pattern: /注视|望向|看向/, tags: ['focused gaze toward the distance'] },
  { pattern: /笑|微笑/, tags: ['gentle smile'] },
  { pattern: /战斗|交锋|攻击/, tags: ['dynamic combat pose'] },
];

function readCharacterActionSource(source: string, primary: string, alias?: string): string {
  const names = [primary, alias].filter(Boolean) as string[];
  if (!names.length) return '';
  return source
    .split(/[。！？!?\n]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && names.some((name) => sentence.includes(name)))
    .join(' ');
}

function buildLocalCharacterVisualPrompt(source: string | undefined, fallback: string): string {
  const text = source?.trim() ?? '';
  const tags = text
    .split(/[\n,;，；]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment && !/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(segment) && /[a-z]/i.test(segment));
  for (const rule of LOCAL_CHARACTER_TAG_RULES) {
    if (rule.pattern.test(text)) tags.push(...rule.tags);
  }
  if (!tags.length) tags.push(fallback);
  const hasSpecificLongCoat = tags.some((tag) => /^(?:black|white) long coat$/i.test(tag));
  const seen = new Set<string>();
  return tags.filter((tag) => {
    if (hasSpecificLongCoat && tag.toLowerCase() === 'long coat') return false;
    const key = tag.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(', ');
}

function buildLocalStoryScenePrompt(source: string, summary: StorySnapshotSummary): string {
  const searchable = [source, summary.location, summary.atmosphere, summary.action, summary.camera].join(' ');
  const tags = [
    'anime illustration',
    'sci-fi fantasy',
    'cinematic composition',
    'detailed environment',
  ];
  for (const rule of LOCAL_SCENE_TAG_RULES) {
    if (rule.pattern.test(searchable)) tags.push(...rule.tags);
  }
  if (/中远景/.test(summary.camera)) tags.push('medium wide shot');
  else if (/中景/.test(summary.camera)) tags.push('medium shot');
  else if (/近景|特写/.test(summary.camera)) tags.push('close-up shot');
  else if (/远景|全景/.test(summary.camera)) tags.push('wide shot');
  if (/低视角|仰视/.test(summary.camera)) tags.push('low angle');
  if (/俯视|高视角/.test(summary.camera)) tags.push('high angle');
  tags.push('one readable focal point', 'cinematic lighting', 'atmospheric depth', 'clean rendering', 'no text', 'no watermark');

  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(', ');
}

export function extractLocalStorySnapshot(
  text: string,
  traveler: 角色数据结构,
  npcs: NPC记录[],
): StorySnapshotSummary {
  const source = trimStorySnapshotSource(text);
  const compact = source.replace(/\s+/g, ' ').trim();
  const names = [
    traveler.姓名 || '旅人',
    ...npcs.map((npc) => npc.姓名),
    ...npcs.flatMap((npc) => npc.别名 ? [npc.别名] : []),
  ]
    .filter(Boolean)
    .filter((name, index, list) => list.indexOf(name) === index);
  const characters = names.filter((name) => compact.includes(name)).slice(0, 5);
  const locationMatch = compact.match(/(?:在|于|来到|抵达|走进|进入)([^，。！？；]{2,18}(?:车厢|房间|大厅|街道|广场|港口|空间站|列车|仙舟|实验室|走廊|庭院|舱室|店|馆|城|镇|星球|裂界))/);
  const location = locationMatch?.[1]?.trim() || '当前剧情发生地点';
  const actionSentence = pickSentence(
    compact,
    ['走', '看', '握', '站', '坐', '伸', '转', '推', '接', '递', '笑', '沉默', '望', '靠近', '离开'],
  ) || compact.slice(0, 80) || '角色在当前情境中形成一个可视化瞬间';
  const atmosphere = inferSnapshotAtmosphere(compact);
  return {
    title: buildSnapshotTitle(location, actionSentence),
    characters,
    location,
    atmosphere,
    action: actionSentence,
    camera: characters.length >= 2 ? '中景，保留人物站位关系与环境线索' : '中远景，先交代环境，再突出主体动作',
    avoid: '避免无关角色、现代摄影棚感、过度拥挤构图、与正文矛盾的服装或地点',
  };
}

export function formatStorySnapshotSceneText(summary: StorySnapshotSummary): string {
  return [
    `画面标题：${summary.title}`,
    `出场人物：${summary.characters.length ? summary.characters.join('、') : '按正文片段决定'}`,
    `地点：${summary.location}`,
    `氛围：${summary.atmosphere}`,
    `关键动作：${summary.action}`,
    `镜头构图：${summary.camera}`,
    `不要出现：${summary.avoid}`,
  ].join('\n');
}

function matchesSnapshotName(name: string, primary: string, alias?: string): boolean {
  const normalized = name.trim().toLowerCase();
  return Boolean(normalized) && [primary, alias]
    .filter(Boolean)
    .some((candidate) => candidate!.trim().toLowerCase() === normalized);
}

function subjectTypeFromGender(gender?: string): 'girl' | 'boy' | 'other' {
  const normalized = gender?.trim().toLowerCase() ?? '';
  if (normalized === '女' || normalized === 'female' || normalized === 'girl') return 'girl';
  if (normalized === '男' || normalized === 'male' || normalized === 'boy') return 'boy';
  return 'other';
}

function readActualSnapshotNpcs(params: ResolveStorySnapshotParams, summary: StorySnapshotSummary): NPC记录[] {
  return params.presentNpcs.filter((npc) => summary.characters.some((name) => matchesSnapshotName(name, npc.姓名, npc.别名)));
}

function findParsedCharacter(
  characters: 故事快照解析角色[],
  primary: string,
  alias?: string,
): 故事快照解析角色 | undefined {
  return characters.find((character) => matchesSnapshotName(character.name, primary, alias));
}

function buildStorySnapshotRenderContext(
  params: ResolveStorySnapshotParams,
  summary: StorySnapshotSummary,
  scenePrompt: string,
  sceneNegativePrompt: string,
  parsedCharacters: 故事快照解析角色[] = [],
): StorySnapshotRenderContext {
  const characters: StorySnapshotRenderContext['characters'] = [];
  const travelerVisible = params.playerAppearanceMode === 'force'
    || (params.playerAppearanceMode !== 'off' && summary.characters.some((name) => matchesSnapshotName(name, params.traveler.姓名, params.traveler.别名)));
  if (travelerVisible) {
    const parsed = findParsedCharacter(parsedCharacters, params.traveler.姓名, params.traveler.别名);
    const travelerVisualSource = params.traveler.图像档案?.角色锚点?.正面提示词 || params.traveler.外貌;
    const travelerNegativeSource = params.traveler.图像档案?.角色锚点?.负面提示词;
    const travelerActionSource = summary.characters.length === 1
      ? params.body
      : readCharacterActionSource(params.body, params.traveler.姓名, params.traveler.别名);
    characters.push({
      name: params.traveler.姓名 || params.traveler.别名 || 'Traveler',
      subjectType: parsed?.subjectType ?? subjectTypeFromGender(params.traveler.性别),
      visualPrompt: parsed?.visualPrompt
        || buildLocalCharacterVisualPrompt([travelerVisualSource, travelerActionSource].filter(Boolean).join('，'), 'traveler, player character'),
      negativePrompt: parsed?.negativePrompt
        || (travelerNegativeSource ? buildLocalCharacterVisualPrompt(travelerNegativeSource, '') : ''),
      source: 'traveler',
      enabled: true,
    });
  }
  for (const npc of readActualSnapshotNpcs(params, summary)) {
    const parsed = findParsedCharacter(parsedCharacters, npc.姓名, npc.别名);
    const npcVisualSource = npc.图像档案?.角色锚点?.正面提示词 || [npc.外貌, npc.穿着].filter(Boolean).join(', ');
    const npcNegativeSource = npc.图像档案?.角色锚点?.负面提示词;
    const npcActionSource = summary.characters.length === 1
      ? params.body
      : readCharacterActionSource(params.body, npc.姓名, npc.别名);
    characters.push({
      name: npc.姓名,
      subjectType: parsed?.subjectType ?? subjectTypeFromGender(npc.性别),
      visualPrompt: parsed?.visualPrompt
        || buildLocalCharacterVisualPrompt([npcVisualSource, npcActionSource].filter(Boolean).join('，'), 'supporting character'),
      negativePrompt: parsed?.negativePrompt
        || (npcNegativeSource ? buildLocalCharacterVisualPrompt(npcNegativeSource, '') : ''),
      source: 'npc',
      enabled: true,
    });
  }
  return normalizeStorySnapshotRenderContext({
    schemaVersion: 1,
    scenePrompt,
    sceneNegativePrompt,
    characters,
  })!;
}

function buildLocalResolution(
  params: ResolveStorySnapshotParams,
  warning?: string,
  diagnosticRawText?: string,
): StorySnapshotResolution {
  const summary = extractLocalStorySnapshot(params.body, params.traveler, params.presentNpcs);
  const sceneText = formatStorySnapshotSceneText(summary);
  const actualNpcs = readActualSnapshotNpcs(params, summary);
  const travelerVisible = params.playerAppearanceMode === 'force'
    || (params.playerAppearanceMode !== 'off' && summary.characters.some((name) => matchesSnapshotName(name, params.traveler.姓名, params.traveler.别名)));
  const visibleTraveler = travelerVisible ? params.traveler : undefined;
  const built = buildSceneImagePrompt({
    text: sceneText,
    mode: 'scene',
    rules: params.rules,
    traveler: visibleTraveler,
    forceTravelerVisible: params.playerAppearanceMode === 'force',
    presentNpcs: actualNpcs,
    extraRequirement: params.extraRequirement,
    size: params.size,
    slot: params.slot,
  });
  const renderContext = buildStorySnapshotRenderContext(
    params,
    summary,
    buildLocalStoryScenePrompt(params.body, summary),
    built.negative,
  );
  return {
    summary,
    sceneText,
    prompt: built.prompt,
    negativePrompt: built.negative,
    sourcePrompt: built.prompt,
    renderContext,
    source: 'local',
    warning,
    diagnosticRawText,
  };
}

export async function resolveStorySnapshot(
  params: ResolveStorySnapshotParams,
): Promise<StorySnapshotResolution> {
  if (!params.apiConfig) {
    return buildLocalResolution(params, '故事快照解析模型未配置，已使用本地草稿。');
  }

  try {
    const parsed = await parseStorySnapshotPrompt(params.apiConfig, {
      body: params.body,
      semanticRules: 获取当前故事快照解析规则(params.rules).语义规则,
      traveler: params.playerAppearanceMode === 'off' ? undefined : {
        name: params.traveler.姓名 || params.traveler.别名 || '玩家角色',
        gender: params.traveler.性别 || undefined,
        appearance: params.traveler.外貌 || undefined,
        identity: params.traveler.身份 || undefined,
        anchorPrompt: params.traveler.图像档案?.角色锚点
          ? JSON.stringify(params.traveler.图像档案.角色锚点)
          : undefined,
      },
      playerAppearanceMode: params.playerAppearanceMode ?? 'auto',
      presentNpcs: params.presentNpcs.map((npc) => ({
        name: npc.姓名,
        appearance: npc.外貌,
        clothing: npc.穿着,
      })),
    }, params.signal);
    const summary: StorySnapshotSummary = {
      title: parsed.title,
      characters: parsed.characters,
      location: parsed.location,
      atmosphere: parsed.atmosphere,
      action: parsed.action,
      camera: parsed.camera,
      avoid: parsed.avoid,
    };
    const sceneText = formatStorySnapshotSceneText(summary);
    const actualNpcs = readActualSnapshotNpcs(params, summary);
    const travelerVisible = params.playerAppearanceMode === 'force'
      || (params.playerAppearanceMode !== 'off' && summary.characters.some((name) => matchesSnapshotName(name, params.traveler.姓名, params.traveler.别名)));
    const lockedPrompt = 应用场景角色锚点锁({
      prompt: parsed.prompt,
      negative: parsed.negativePrompt,
      traveler: travelerVisible ? params.traveler : undefined,
      forceTravelerVisible: params.playerAppearanceMode === 'force',
      presentNpcs: actualNpcs,
    });
    const refined = 应用质量增强提示词(params.rules, lockedPrompt.prompt, lockedPrompt.negative);
    const renderContext = buildStorySnapshotRenderContext(
      params,
      summary,
      parsed.prompt,
      parsed.negativePrompt,
      parsed.characterPrompts,
    );
    return {
      summary,
      sceneText,
      prompt: refined.prompt,
      negativePrompt: refined.negative,
      sourcePrompt: parsed.prompt,
      renderContext,
      source: 'model',
    };
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    const warning = error instanceof Error ? error.message : String(error);
    const diagnosticRawText = error instanceof StorySnapshotParseError
      ? error.rawText.slice(0, 1200)
      : undefined;
    return buildLocalResolution(params, warning, diagnosticRawText);
  }
}
