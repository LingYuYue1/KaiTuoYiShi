import type { API配置项 } from '@/models/settings';
import type { 开局整理档案 } from '@/models/world';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { withRetries } from '@/services/ai/retry';
import { normalizeStructuredModelText, parseJsonWithRepair } from '@/services/ai/structuredOutputRepair';

export interface OpeningArchiveParseInput {
  regionName: string;
  chapterName: string;
  chapterSummary: string;
  playerText: string;
  defaultLocationHint?: string;
  defaultDateHint?: string;
  defaultTimeHint?: string;
  priorStoryState?: string;
  mainlineEnabled?: boolean;
  planetSource?: string;
  keyNpcs?: string[];
  sourceLabel?: string;
}

const OPENING_ARCHIVE_SYSTEM_PROMPT = `你是「开拓轶事」的开局整理模型。你的任务是把玩家的开局文本整理成一份结构化开局档案，供后续剧情长期引用。

## 目标
- 只整理，不扩写主线，不代替玩家做决定。
- 玩家文本优先，地区与章节锚点只作为背景参考。
- 章节锚点之前的原作主线只作既成背景或资料参考，不要把它整理成当前目标、当前地点或待推进事件。
- 如果主线坐标关闭，原作主线不会自动注入；玩家自建地点、NPC和设定是开局核心。
- 如果玩家明确写了原著之外的起始地点、原创组织、原创事件或原创势力，要承认它们成立，并整理进对应字段。
- 不要把玩家原创内容强行改写回原著地点；能兼容就温和兼容，不能兼容就保留为玩家自定义现实。
- 若存在冲突，优先做温和协调，不要把玩家写回默认黑塔空间站。
- 输出要能直接被正文系统、智库召回和开局总览读取。

## 输出格式
只输出合法 JSON，不要 Markdown，不要解释：
{
  "玩家身份": "",
  "来到此地原因": "",
  "当前目标": "",
  "起始情境": "",
  "自定义星球": "",
  "星球简介": "",
  "初始地点参考": "",
  "自定义起始地点": "",
  "原创地点说明": "",
  "原创事件说明": "",
  "原创组织说明": "",
  "初始NPC详情": [],
  "自制NPC": [
    {
      "姓名": "",
      "背景": "",
      "是否命途行者": false,
      "能力": "",
      "与玩家关系": "",
      "当前状态": ""
    }
  ],
  "世界设定补充": [],
  "主线参与程度": "",
  "初始日期参考": "",
  "初始时间参考": "",
  "关键角色参考": [],
  "已认识角色": [],
  "初始关系": [],
  "叙事倾向": [],
  "特别要求": [],
  "冲突协调": []
}

## 约束
- 不要输出空洞总结句。
- 关键角色参考可以写章节锚点相关的重要角色，供背景召回使用；它不代表玩家已认识，也不代表当前在场。
- 已认识角色只写玩家原文中确实点名并明确与玩家存在已知关系的角色；不要把已知关键角色自动搬进已认识角色。
- 初始关系必须可被后续正文承接，不能写成空泛的“很熟”。
- 特别要求要保留玩家原话中的有效约束。
- 冲突协调用于说明如何把玩家文本与章节锚点温和兼容。
- 主线参与程度用来说明主线坐标启用或关闭；地点来源用来说明已有地点或自创地点。
- 地点来源为已有地点时，不要强行补写星球简介、玩家身份、当前目标、局部冲突、组织势力或世界规则；只整理玩家明确写出的起始地点与补充自制 NPC。
- 地点来源为自创地点时，再整理自定义地点/星球、地点简介、NPC详情、当前目标、局部冲突、组织势力和世界设定补充；不要把章节锚点写成当前剧情入口。
- 自制NPC必须按对象数组输出；每个 NPC 至少要有姓名，能补则补背景、是否命途行者、能力、与玩家关系、当前状态。不要把云骑军、公司、家族、列车组、地火这类组织或群体写成自制NPC。
- 如果玩家写了“我和某某很熟/是旧识/欠人情/正在合作”，要把该角色写进已认识角色，并在初始关系中写成可承接的具体关系；如果是原创人物，也同步写入自制NPC。
`;

export async function parseOpeningArchiveWithAI(
  config: API配置项,
  input: OpeningArchiveParseInput,
  retryCount = 2,
  signal?: AbortSignal,
): Promise<开局整理档案> {
  const raw = await withRetries(
    () => chatCompletionNonStream(config, {
      systemPrompt: OPENING_ARCHIVE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            `来源：${input.sourceLabel || '自由开局'}`,
            `地区：${input.regionName}`,
            `章节锚点：${input.chapterName}`,
            `章节参考说明：${input.chapterSummary}`,
            input.priorStoryState ? `前置剧情处理：${input.priorStoryState}` : '',
            `主线坐标：${input.mainlineEnabled === false ? '关闭，原作主线需在剧情编织中手动启用' : '启用'}`,
            `地点来源：${input.planetSource === 'custom' ? '自创地点' : '已有地点'}`,
            input.defaultLocationHint ? `初始地点参考：${input.defaultLocationHint}` : '',
            input.defaultDateHint || input.defaultTimeHint ? `初始时间参考：${[input.defaultDateHint, input.defaultTimeHint].filter(Boolean).join(' · ')}` : '',
            input.keyNpcs?.length ? `已知关键角色：${input.keyNpcs.join('、')}` : '',
            '',
            '# 玩家介入原文',
            input.playerText.trim() || '（空）',
            '',
            '请整理成结构化开局档案，只输出 JSON。'
          ].filter(Boolean).join('\n'),
        },
      ],
      maxTokens: Math.max(700, Math.min(1600, config.maxTokens ?? 1200)),
      temperature: config.temperature ?? 0.35,
      signal,
    }),
    { retries: retryCount, signal, label: '开局整理' },
  );

  const parsed = parseOpeningArchiveJson(raw);
  return normalizeOpeningArchive(parsed, input);
}

function parseOpeningArchiveJson(raw: string): Partial<开局整理档案> {
  const text = normalizeStructuredModelText(raw);
  return parseJsonWithRepair<Partial<开局整理档案>>(text, 'object');
}

function normalizeOpeningArchive(
  raw: Partial<开局整理档案>,
  input: OpeningArchiveParseInput,
): 开局整理档案 {
  const npcList = Array.isArray(raw.已认识角色) ? raw.已认识角色 : [];
  const keyNpcList = Array.isArray(raw.关键角色参考) ? raw.关键角色参考 : [];
  const relationshipList = Array.isArray(raw.初始关系) ? raw.初始关系 : [];
  const constraintList = Array.isArray(raw.特别要求) ? raw.特别要求 : [];
  const coordinationList = Array.isArray(raw.冲突协调) ? raw.冲突协调 : [];
  const moodList = Array.isArray(raw.叙事倾向) ? raw.叙事倾向 : [];
  const customNpcs = normalizeCustomNpcs(raw.自制NPC);
  const playerText = input.playerText.trim();
  return {
    玩家身份: readText(raw.玩家身份) || inferIdentityFallback(playerText),
    来到此地原因: readText(raw.来到此地原因) || inferReasonFallback(playerText, input.regionName),
    当前目标: readText(raw.当前目标) || inferGoalFallback(playerText),
    起始情境: readText(raw.起始情境) || buildStartingSituationFallback(input),
    自定义星球: readText(raw.自定义星球),
    星球简介: readText(raw.星球简介),
    初始地点参考: readText(raw.初始地点参考) || input.defaultLocationHint || input.regionName,
    自定义起始地点: readText(raw.自定义起始地点),
    原创地点说明: readText(raw.原创地点说明),
    原创事件说明: readText(raw.原创事件说明),
    原创组织说明: readText(raw.原创组织说明),
    初始NPC详情: uniqueStrings(Array.isArray(raw.初始NPC详情) ? raw.初始NPC详情 : []),
    自制NPC: customNpcs,
    世界设定补充: uniqueStrings(Array.isArray(raw.世界设定补充) ? raw.世界设定补充 : []),
    主线参与程度: readText(raw.主线参与程度) || (input.mainlineEnabled === false ? '关闭主线坐标，按玩家自建开局工作台推进。' : '启用主线坐标，原作主线进度仅作背景参考。'),
    初始日期参考: readText(raw.初始日期参考) || input.defaultDateHint,
    初始时间参考: normalizeClock(readText(raw.初始时间参考)) || normalizeClock(input.defaultTimeHint),
    关键角色参考: uniqueStrings(keyNpcList).length ? uniqueStrings(keyNpcList) : uniqueStrings(input.keyNpcs ?? []),
    已认识角色: uniqueStrings([...npcList, ...customNpcs.map((npc) => npc.姓名)]),
    初始关系: uniqueStrings([
      ...relationshipList,
      ...customNpcs
        .map((npc) => npc.与玩家关系 ? `${npc.姓名}：${npc.与玩家关系}` : '')
        .filter(Boolean),
    ]),
    叙事倾向: uniqueStrings(moodList).length ? uniqueStrings(moodList) : ['自由介入', '背景参考优先'],
    特别要求: uniqueStrings(constraintList).length ? uniqueStrings(constraintList) : (playerText ? [playerText] : []),
    冲突协调: uniqueStrings(coordinationList).length
      ? uniqueStrings(coordinationList)
      : [
          input.mainlineEnabled === false
            ? '主线坐标已关闭：原作主线不会自动注入；若需要原作剧情，玩家需在剧情编织中手动启用对应主线。'
            : '若玩家自由设定与章节时间线轻微冲突，优先解释为提前结识、支线插入、委托、梦境、模拟宇宙或特殊经历。',
          input.mainlineEnabled === false ? '优先承接玩家自建星球、地点、NPC 与身份设定。' : '章节锚点只作为背景参考，不硬锁玩家介入方式。',
        ],
  };
}

function normalizeCustomNpcs(value: unknown): NonNullable<开局整理档案['自制NPC']> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): NonNullable<开局整理档案['自制NPC']>[number] | null => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Record<string, unknown>;
      const name = readText(raw.姓名 ?? raw.name);
      if (!isUsableCustomNpcName(name)) return null;
      return {
        姓名: name,
        背景: readText(raw.背景 ?? raw.background),
        是否命途行者: typeof raw.是否命途行者 === 'boolean' ? raw.是否命途行者 : undefined,
        能力: readText(raw.能力 ?? raw.ability),
        与玩家关系: readText(raw.与玩家关系 ?? raw.relationship),
        当前状态: readText(raw.当前状态 ?? raw.status),
      };
    })
    .filter((item): item is NonNullable<开局整理档案['自制NPC']>[number] => !!item)
    .slice(0, 12);
}

function isUsableCustomNpcName(value: string): boolean {
  if (!value || value.length > 12) return false;
  if (/军|兵|士兵|卫兵|守卫|护卫|巡逻|队伍|小队|舰队|商会|公司|家族|组织|势力|部门|司|府|族|民众|路人|乘客|旅客|研究员|科员|医士|医者|商人|店员|怪物|丰饶孽物|反物质军团$/u.test(value)) return false;
  return !['云骑军', '银鬃铁卫', '地火', '家族', '公司', '星际和平公司', 'IPC', '列车组', '无名客'].includes(value);
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.map((item) => readText(item)).filter(Boolean)));
}

function normalizeClock(value?: string): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  const embedded = raw.match(/(\d{1,2}:\d{2})/);
  if (embedded) return clampClock(embedded[1]);
  if (/^\d{1,2}:\d{2}$/.test(raw)) return clampClock(raw);
  const legacyMap: Record<string, string> = {
    清晨: '06:40',
    上午: '09:40',
    午后: '14:10',
    黄昏: '18:20',
    夜晚: '21:30',
    深夜: '00:30',
  };
  return legacyMap[raw] ?? raw;
}

function clampClock(value: string): string {
  const [hoursRaw, minutesRaw] = value.split(':').map((part) => Number(part));
  const hours = Number.isFinite(hoursRaw) ? Math.max(0, Math.min(23, hoursRaw)) : 0;
  const minutes = Number.isFinite(minutesRaw) ? Math.max(0, Math.min(59, minutesRaw)) : 0;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

function inferIdentityFallback(text: string): string | undefined {
  if (!text) return undefined;
  const patterns = [/我是([^，。；\n]{2,36})/, /身份是([^，。；\n]{2,36})/, /作为([^，。；\n]{2,36})/];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '由玩家自由开局文本定义的介入者';
}

function inferReasonFallback(text: string, regionName: string): string | undefined {
  if (!text) return undefined;
  const reasonKeywords = ['委托', '调查', '追踪', '邀请', '逃亡', '旅行', '寻找', '护送', '交易', '救援', '误入'];
  const matched = reasonKeywords.find((kw) => text.includes(kw));
  return matched ? `因${matched}相关事件来到${regionName}` : `玩家自由文本指定其来到${regionName}`;
}

function inferGoalFallback(text: string): string | undefined {
  if (!text) return undefined;
  const goalPatterns = [/想要([^，。；\n]{2,40})/, /目标是([^，。；\n]{2,40})/, /希望([^，。；\n]{2,40})/, /准备([^，。；\n]{2,40})/];
  for (const pattern of goalPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '按玩家自由介入文本推进当前目标';
}

function buildStartingSituationFallback(input: OpeningArchiveParseInput): string {
  const text = input.playerText.trim();
  if (text) return `玩家自由介入${input.regionName}「${input.chapterName}」背景：${truncateText(text, 160)}`;
  return `玩家以自由开局介入${input.regionName}「${input.chapterName}」背景。`;
}

function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}
