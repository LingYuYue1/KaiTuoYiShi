// 变量登记表 + 命令校验。
// 设计参考：墨色项目 utils/variableRegistry.ts。
//
// 用途：
// 1. 构建登记表 → 注入 system prompt 末尾，告诉 AI "只能写入这些路径"。
// 2. 校验命令 → AI 输出后逐条比对，路径不在白名单的直接拒绝（防止 AI 瞎编字段）。

import type { 变量命令 } from '@/models/variableCommand';
import { matchCanonical } from '@/data/canonicalCharacters';
import { 解析路径片段, 读取路径值 } from './variablePath';

/** 变量命令允许操作的根路径，全部对应 useGameState 的一个 setter。 */
export const VARIABLE_ROOT_KEYS = [
  '旅人',   // 旅人档案（含 属性/命途列表/装备/背包/状态效果）
  '世界',   // 世界状态
  '记忆',   // 记忆系统
  '忆庭',   // 忆庭回忆档案
  '智库',   // 原著资料库
  '手机',   // 手机通讯系统
  'NPC',    // 伙伴档案库（含 companion / extra / 图像预留 / NSFW 预留）
  '新闻',   // 新闻档案
  '剧情',   // 旧剧情节点兼容
] as const;

const NPC_ARRAY_ITEM_FIELDS = new Set([
  'id',
  '姓名',
  '别名',
  '阶位',
  '好感度',
  '关系',
  '同行',
  '初见回合',
  '最近回合',
  '性别',
  '对玩家称呼',
  '外貌',
  '穿着',
  '说话方式',
  '性格',
  '介绍',
  '装备摘要',
  '同行记忆',
  '备注',
  '原著角色',
  'NSFW档案',
  '图像档案',
  '头像',
]);

const NPC_NSFW_FIELDS = new Set([
  'enabled',
  '年龄确认',
  '亲密阶段',
  '边界',
  '偏好',
  '敏感点',
  '禁忌',
  '女性身体档案',
  '男性身体档案',
  '经历',
  '长期事实',
  '标签',
  '备注',
  '胸部',
  '女性私处',
  '后庭',
  '男性器',
  '体态',
  '体味',
]);

export type VariableRootKey = typeof VARIABLE_ROOT_KEYS[number];

type RootPolicy = 'writable' | 'partial' | 'readonly';

interface RootWritePolicy {
  label: string;
  policy: RootPolicy;
  owner: string;
  note: string;
  allowed?: string;
  forbidden?: string;
}

const ROOT_WRITE_POLICIES: Record<VariableRootKey, RootWritePolicy> = {
  旅人: {
    label: '旅人',
    policy: 'partial',
    owner: '变量系统 + 命途/装备/战技服务层',
    note: '玩家手写核心档案只读；变量系统只写运行时资产、装备引用、战技和已有命途进度。',
    allowed: 'push 旅人.背包；set 旅人.装备；玩家确认后 push/set 旅人.战技列表；add/sub 旅人.命途列表[id=...].进度。',
    forbidden: '不要写姓名、别名、性别、年龄、生日、身高、身份、外貌、性格、背景、专长知识、能力、头像、图像档案、属性、主命途、命途列表整条目、命途阶段、待升阶、是否主命途。',
  },
  世界: {
    label: '世界',
    policy: 'partial',
    owner: '变量系统 + 命途狭间服务层',
    note: '可写日期、时间、地点、开拓天数、全局事件和氛围变化。',
    allowed: 'set 世界.当前日期/当前时间/当前地点/氛围变化；add 世界.开拓天数；push 世界.全局事件。',
    forbidden: '不要写 进行中狭间、待触发狭间。',
  },
  记忆: {
    label: '记忆',
    policy: 'readonly',
    owner: '记忆系统',
    note: '即时、短期、长期记忆由记忆系统写入与压缩。',
    forbidden: '变量模型不得 set/push/delete 记忆 root 或其子字段。',
  },
  忆庭: {
    label: '忆庭',
    policy: 'readonly',
    owner: '忆庭服务',
    note: '回忆档案入库、召回和精炼由忆庭服务维护。',
    forbidden: '变量模型不得写入 回忆档案。',
  },
  智库: {
    label: '智库',
    policy: 'readonly',
    owner: '智库系统',
    note: '智库是原著资料库，不由每回合变量模型维护。',
    forbidden: '变量模型不得新增、修改或删除智库条目。',
  },
  手机: {
    label: '手机',
    policy: 'partial',
    owner: '变量系统 + 手机系统',
    note: '变量系统只负责入口事件：联系人、剧情群聊空频道、主动来信种子。',
    allowed: 'push 手机.contacts；push 手机.chats 空频道；push 手机.messageSeeds；set 未读状态类字段。',
    forbidden: '不要直接写完整 messages，不要压缩手机本地记忆。',
  },
  NPC: {
    label: 'NPC',
    policy: 'writable',
    owner: '变量系统',
    note: '伙伴与路人档案是变量系统重点维护对象。',
    allowed: 'push 新 NPC；set 已有 NPC 档案字段；push NPC[id=...].同行记忆。',
    forbidden: '不要把怪物、泛称敌人、一次性杂兵写入 NPC。',
  },
  新闻: {
    label: '新闻',
    policy: 'readonly',
    owner: '星际和平周报',
    note: '新闻由独立 API 生成和归档。',
    forbidden: '变量模型不得写入新闻 root；可改写成 世界.全局事件 或 手机.messageSeeds。',
  },
  剧情: {
    label: '剧情',
    policy: 'partial',
    owner: '旧剧情节点兼容',
    note: '旧剧情节点兼容保留。新剧情推进以剧情编织和新闻链路为主。',
    allowed: '仅在旧节点明确存在时更新状态；一般不要新增。',
    forbidden: '不要自动推进剧情编织，不要把原著剧情完成状态写到这里。',
  },
};

const READONLY_ROOTS = new Set<VariableRootKey>(
  Object.entries(ROOT_WRITE_POLICIES)
    .filter(([, policy]) => policy.policy === 'readonly')
    .map(([root]) => root as VariableRootKey),
);

const TRAVELER_PLAYER_AUTHORED_FIELDS = new Set([
  '姓名',
  '别名',
  '性别',
  '年龄',
  '生日',
  '身高',
  '身份',
  '外貌',
  '性格',
  '背景',
  '专长知识',
  '能力',
  '头像',
  '图像档案',
]);

interface ArraySchemaTemplate {
  path: string;
  title: string;
  actionHint: string;
  required: string[];
  recommended?: string[];
  example: string;
  forbidden?: string[];
}

const ARRAY_SCHEMA_TEMPLATES: ArraySchemaTemplate[] = [
  {
    path: 'NPC',
    title: 'NPC[] 伙伴/路人档案对象',
    actionHint: '新角色入档使用 `push NPC = {...完整对象...}`；已有角色更新使用 `NPC[id=xxx].字段`。',
    required: ['id', '姓名', '阶位'],
    recommended: ['好感度', '关系', '同行', '初见回合', '最近回合', '备注', '性别', '别名', '对玩家称呼', '外貌', '穿着', '说话方式', '性格', '介绍', '同行记忆', '原著角色', '图像档案', 'NSFW档案'],
    example: '{"id":"npc_march7th","姓名":"三月七","阶位":"companion","好感度":5,"关系":"acquaintance","同行":true,"初见回合":1,"最近回合":1,"备注":["星穹列车乘员"],"原著角色":true,"外貌":"粉色短发，蓝粉渐变眼眸，少女体态轻快，常带相机。","穿着":"星穹列车风格短外套与裙装，配色明亮。","说话方式":"语速轻快，常用吐槽和感叹把紧张气氛拉回来。","性格":"活泼外向，遇事先冲上去，但会认真记住同伴的安危。","介绍":"星穹列车乘员，失去过去记忆，却以开拓的热情面对旅途。"}',
    forbidden: ['怪物、泛称敌人、一次性杂兵不要入档。', '不要重复 push 同一人物的别称或状态称呼。', '对玩家称呼不明确时写“未知”，不要写“你”“喂”等临时指代。'],
  },
  {
    path: 'NPC[id=...].同行记忆',
    title: 'NPC同行记忆[] 对象',
    actionHint: '已有 NPC 本回合与玩家产生直接互动时，使用 `push NPC[id=xxx].同行记忆 = {...}`。',
    required: ['id', '回合', '摘要'],
    recommended: ['原文', '来源', '关联NPCID'],
    example: '{"id":"npc_mem_march7th_1_signal","回合":1,"摘要":"三月七与玩家在空间站警报中确认同行，并提醒玩家跟紧列车组行动。","来源":"变量","关联NPCID":["npc_march7th"]}',
    forbidden: ['不要把 A 的经历写进 B 的同行记忆。', '无法确认归属时不写同行记忆。'],
  },
  {
    path: '旅人.背包',
    title: '旅人.背包[] 物品对象',
    actionHint: '获得明确物品时使用 `push 旅人.背包 = {...完整对象...}`。',
    required: ['类别', '名称', '描述'],
    recommended: ['数量', '品质', '可堆叠', '装备槽位', '叙事效果', '使用效果', '来源', '来源描述', '获得时间'],
    example: '{"类别":"key","名称":"临时权限卡","描述":"黑塔空间站安保终端签发的临时通行卡，边缘还残留着微弱蓝光。","数量":1,"品质":"蓝","可堆叠":false,"来源":"剧情掉落","来源描述":"主控舱段撤离途中取得"}',
    forbidden: ['不要输出 `{id,名称,描述,...}` 这类占位对象。', '禁止生成 属性加成。', '装备只写叙事效果，不写旧数值加成。'],
  },
  {
    path: '旅人.战技列表',
    title: '旅人.战技列表[] 战技对象',
    actionHint: '普通战技和命途战技确实被玩家确认、系统创建或正文明确学会后，使用 `push 旅人.战技列表 = {...}`。',
    required: ['id', '名称', '类别', '槽位类型', '槽位序号', '描述', '来源'],
    recommended: ['关联命途', '关联阶段', '关键词', '消耗', '冷却', '备注', '已启用'],
    example: '{"id":"skill_hunt_threading_shot","名称":"穿星追矢","类别":"命途","槽位类型":"path","槽位序号":1,"描述":"锁定移动目标的破绽，以一记短促而精准的追击截断其行动。","来源":"玩家自创战技","关联命途":"hunt","关键词":["追击","精准","截断"],"消耗":"中","冷却":"短","已启用":true}',
    forbidden: ['普通战技通常由战技 UI 选择，不要凭空塞满。', '命途战技必须有已解锁槽位。', '不要因为正文里一次能力描写就自动入库。'],
  },
  {
    path: '手机.contacts',
    title: '手机.contacts[] 联系人对象',
    actionHint: '剧情明确建立通讯方式时，使用 `push 手机.contacts = {...}`。正式认识并交换联系方式、对方主动给出通讯权限、加入共同频道、或主动来信后都可以解锁；仅仅远远看见 NPC 不解锁。',
    required: ['id', 'name', 'available'],
    recommended: ['npcId', 'avatar', 'relationLabel', 'status', 'lastActiveTurn', 'unlockSource'],
    example: '{"id":"contact_march7th","npcId":"npc_march7th","name":"三月七","avatar":"","relationLabel":"伙伴","available":true,"status":"available","lastActiveTurn":1,"unlockSource":"story"}',
    forbidden: ['敌人、怪物、泛称 NPC 不进通讯录。', '未正式认识、未交换联系方式、未通过剧情频道建立通讯权限时不要写联系人。'],
  },
  {
    path: '手机.chats',
    title: '手机.chats[] 会话对象',
    actionHint: '仅剧情确有共同频道时，创建空群聊频道；玩家自建群聊由 UI 完成。',
    required: ['id', 'type', 'title', 'participantIds', 'messages', 'unread', 'updatedAt'],
    recommended: ['pinned', 'localArchive'],
    example: '{"id":"chat_station_temp","type":"group","title":"空间站临时联络频道","participantIds":["npc_march7th","npc_danheng"],"messages":[],"unread":0,"pinned":false,"updatedAt":1779580800000}',
    forbidden: ['不要直接写完整 messages。', '不要替手机系统压缩聊天记忆。'],
  },
  {
    path: '手机.messageSeeds',
    title: '手机.messageSeeds[] 主动来信种子',
    actionHint: '重要事件需要远方或不在场角色回应时，使用 `push 手机.messageSeeds = {...}`。',
    required: ['id', 'turn', 'source', 'triggerType', 'priority', 'targetType', 'targetId', 'title', 'context', 'relatedNpcIds', 'status'],
    recommended: ['expiresAfterTurns'],
    example: '{"id":"phone_seed_1_march_followup","turn":1,"source":"main_story","triggerType":"quest","priority":"normal","targetType":"private","targetId":"contact_march7th","title":"三月七确认撤离路线","context":"玩家刚与三月七在空间站警报中约定确认撤离路线，她可以稍后发短讯追问进展。","relatedNpcIds":["npc_march7th"],"expiresAfterTurns":6,"status":"pending"}',
    forbidden: ['每回合最多 0-2 条种子。', '普通寒暄不要生成来信种子。', 'source 禁止使用旧 battle。'],
  },
  {
    path: '世界.全局事件',
    title: '世界.全局事件[] 字符串',
    actionHint: '本回合发生了足以影响后续的事实时，使用 `push 世界.全局事件 = "..."`。',
    required: ['字符串'],
    example: '"黑塔空间站主控舱段响起入侵警报，反物质军团的袭击已影响撤离路线。"',
  },
];

/** 一份精简版游戏 state，用于变量系统读写（不包含 UI/loading 等 transient state）。 */
export type VariableState = Record<VariableRootKey, unknown>;

export interface RegistryOptions {
  /** 最大递归深度，避免对象层级太深炸栈 */
  maxDepth?: number;
  /** 最大行数，超出截断；避免 prompt 膨胀 */
  maxLines?: number;
}

/** 把单个值的可达路径递归收集到 result 里。 */
function 收集路径(value: unknown, prefix: string, result: string[], depth: number) {
  result.push(prefix);
  if (depth <= 0 || value === null || value === undefined || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    if (value.length > 0) {
      // 数组用 [] 表示"任意 index 都合法"，并展开第一个元素的字段（作为同类元素的字段模板）
      result.push(`${prefix}[]`);
      收集路径(value[0], `${prefix}[0]`, result, depth - 1);
    }
    return;
  }

  Object.keys(value as Record<string, unknown>)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
    .forEach((k) => {
      收集路径((value as Record<string, unknown>)[k], `${prefix}.${k}`, result, depth - 1);
    });
}

function buildRootPolicyPrompt(): string[] {
  return [
    '## Root 写入策略',
    '',
    ...VARIABLE_ROOT_KEYS.flatMap((root) => {
      const policy = ROOT_WRITE_POLICIES[root];
      const stateLabel = policy.policy === 'writable' ? '可写' : policy.policy === 'partial' ? '半可写' : '只读';
      return [
        `- ${root}（${stateLabel}）：${policy.note}`,
        `  - 维护者：${policy.owner}`,
        policy.allowed ? `  - 允许：${policy.allowed}` : '',
        policy.forbidden ? `  - 禁止：${policy.forbidden}` : '',
      ].filter(Boolean);
    }),
    '',
  ];
}

function buildArraySchemaPrompt(): string[] {
  return [
    '## 数组对象 schema 模板',
    '',
    '即使当前数组为空，以下数组路径也视为可 `push`。必须传入完整 JSON，不要输出字段列表、占位符或省略号。',
    '',
    ...ARRAY_SCHEMA_TEMPLATES.flatMap((template) => [
      `### ${template.title}`,
      `- 路径：${template.path}`,
      `- 用法：${template.actionHint}`,
      `- 必填：${template.required.join('、')}`,
      ...(template.recommended?.length ? [`- 推荐：${template.recommended.join('、')}`] : []),
      ...(template.forbidden?.length ? template.forbidden.map((item) => `- 禁止：${item}`) : []),
      `- 示例：\`${template.example}\``,
      '',
    ]),
  ];
}

/** 扫存档生成路径清单，作为 AI 命令白名单。 */
export function buildVariableRegistry(state: Partial<VariableState>, options?: RegistryOptions): string[] {
  const maxDepth = Math.max(1, options?.maxDepth ?? 4);
  const maxLines = Math.max(20, options?.maxLines ?? 300);
  const result: string[] = [];

  for (const root of VARIABLE_ROOT_KEYS) {
    if (READONLY_ROOTS.has(root)) continue;
    if (!(root in state)) continue;
    收集路径(state[root], root, result, maxDepth);
    if (result.length >= maxLines) break;
  }

  return Array.from(new Set(result))
    .filter((path) => path !== '旅人' && !isTravelerPlayerAuthoredPath(path))
    .slice(0, maxLines);
}

/** 把登记表格式化成 prompt 注入文本。 */
export function buildVariableRegistryPrompt(state: Partial<VariableState>): string {
  const paths = buildVariableRegistry(state);
  if (paths.length === 0) return '';
  return [
    '# 变量路径登记表',
    '',
    '变量系统只负责把本回合正文中已经发生的事实落成结构化状态。请先遵守 root 写入策略，再参考 schema 模板，最后才看当前路径清单。',
    '',
    ...buildRootPolicyPrompt(),
    ...buildArraySchemaPrompt(),
    '## 当前存档可达路径',
    '',
    '- `set/add/sub/delete` 只能写入清单中已存在的路径，或写入 schema 模板声明的标准数组对象字段。',
    '- 数组新增条目请对清单中标 `[]` 或 schema 模板中的数组路径使用 `push`，传入完整的新对象。',
    '- 已存在的数组条目也可以使用 `id` 选择器定位，例如 `NPC[id=silverwolf].最近回合`；前提是该 id 能在当前存档中找到对应对象。',
    '- 如果 `NPC[id=xxx]`、`手机.contacts[id=xxx]` 等 id 选择器找不到对象，不要 set 子字段；应先 push 对应数组的完整对象。',
    '- 不在清单中的字段视为未登记变量，本回合不要写入；如必须新增，请通过 push 到对应数组。',
    '',
    ...paths.map((p) => `- ${p}`),
  ].join('\n');
}

export interface CommandValidation {
  allowed: boolean;
  reason?: string;
  /** 解析出的根路径，便于执行器路由 */
  root?: VariableRootKey;
  /** 去掉根的剩余路径 */
  rest?: string;
}

/** 提取根路径：从 "旅人.属性.力量" 中取出 "旅人" + ".属性.力量"。 */
export function extractRoot(rawKey: string): { root: VariableRootKey; rest: string } | null {
  const key = (rawKey || '').trim();
  if (!key) return null;
  for (const root of VARIABLE_ROOT_KEYS) {
    if (key === root) return { root, rest: '' };
    if (key.startsWith(`${root}.`)) return { root, rest: key.slice(root.length + 1) };
    if (key.startsWith(`${root}[`)) return { root, rest: key.slice(root.length) };
  }
  return null;
}

/** 判断同数组其它对象里是否存在该字段（用于允许 set/add 给数组对象新增字段）。 */
function 同数组其它对象存在字段(rootValue: unknown, rawPath: string): boolean {
  const tokens = 解析路径片段(rawPath);
  const lastToken = tokens[tokens.length - 1];
  if (typeof lastToken !== 'string') return false;

  for (let i = tokens.length - 2; i >= 0; i--) {
    if (typeof tokens[i] !== 'number') continue;
    const arrayPath = tokens
      .slice(0, i)
      .map((t) => (typeof t === 'number' ? `[${t}]` : `.${t}`))
      .join('')
      .replace(/^\./, '');
    const { exists, value } = 读取路径值(rootValue, arrayPath);
    if (!exists || !Array.isArray(value)) return false;
    return value.some(
      (item) => item && typeof item === 'object' && !Array.isArray(item) && lastToken in (item as Record<string, unknown>),
    );
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasIdSelector(rawPath: string): boolean {
  return /\[[^\]]+=/.test(rawPath);
}

function getArrayPathBeforeSelector(rawPath: string): string {
  const index = rawPath.search(/\[[^\]]+=/);
  if (index < 0) return rawPath;
  return rawPath.slice(0, index).replace(/\.$/, '');
}

function getLastPathField(rawPath: string): string | null {
  const tokens = 解析路径片段(rawPath);
  const last = tokens[tokens.length - 1];
  return typeof last === 'string' && !last.startsWith('[') ? last : null;
}

function joinRootPath(root: VariableRootKey, rest: string): string {
  if (!rest) return root;
  return rest.startsWith('[') ? `${root}${rest}` : `${root}.${rest}`;
}

function normalizeSchemaPath(path: string): string {
  return path
    .replace(/\.\[/g, '[')
    .replace(/\[[^\]=]+=[^\]]+\]/g, (selector) => {
      const eq = selector.indexOf('=');
      const field = selector.slice(1, eq).trim();
      return `[${field}=...]`;
    });
}

function findSchemaTemplate(path: string): ArraySchemaTemplate | undefined {
  const normalized = normalizeSchemaPath(path);
  return ARRAY_SCHEMA_TEMPLATES.find((template) => template.path === path || template.path === normalized);
}

function isSchemaArrayPath(root: VariableRootKey, rest: string): boolean {
  const fullPath = joinRootPath(root, rest);
  return Boolean(findSchemaTemplate(fullPath));
}

function isKnownSchemaItemField(root: VariableRootKey, rest: string): boolean {
  const arrayPath = getArrayPathBeforeSelector(rest);
  const fullArrayPath = joinRootPath(root, arrayPath);
  const template = findSchemaTemplate(fullArrayPath);
  if (!template) return false;
  const field = getLastPathField(rest);
  if (!field) return false;
  return [...template.required, ...(template.recommended ?? [])].includes(field);
}

function selectorTargetExists(rootValue: unknown, rest: string): boolean {
  if (!hasIdSelector(rest)) return true;
  const arrayPath = getArrayPathBeforeSelector(rest);
  const selectorMatch = rest.slice(arrayPath.length).match(/^\[([^\]]+)\]/);
  if (!selectorMatch) return true;
  const eq = selectorMatch[1].indexOf('=');
  if (eq < 0) return true;
  const field = selectorMatch[1].slice(0, eq).trim();
  const expected = selectorMatch[1].slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  const targetArray = arrayPath ? 读取路径值(rootValue, arrayPath).value : rootValue;
  if (!Array.isArray(targetArray)) return false;
  return targetArray.some((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    const candidates = field === 'id'
      ? [record.id, record.姓名, record.name, record.名称, record.名字, record.别名]
      : [record[field]];
    return candidates.some((candidate) => {
      if (typeof candidate !== 'string') return false;
      return candidate.trim() === expected || candidate.trim().toLowerCase() === expected.toLowerCase();
    });
  });
}

function getMissingSelectorTargetReason(root: VariableRootKey, rest: string, rootValue: unknown): string | null {
  if (!hasIdSelector(rest)) return null;
  if (selectorTargetExists(rootValue, rest)) return null;
  if (root === 'NPC' && isAutoEnsurableCanonicalNpcSelector(rest)) return null;
  const arrayPath = getArrayPathBeforeSelector(rest);
  const fullArrayPath = joinRootPath(root, arrayPath);
  const template = findSchemaTemplate(fullArrayPath);
  if (!template) return null;
  return `${fullArrayPath} 中找不到该 id。若这是新对象，请先使用 push ${fullArrayPath} = ${template.example}`;
}

function isAutoEnsurableCanonicalNpcSelector(rest: string): boolean {
  const selector = rest.match(/^\[([^\]]+)\]/);
  if (!selector) return false;
  const eq = selector[1].indexOf('=');
  if (eq < 0) return false;
  const field = selector[1].slice(0, eq).trim();
  if (field !== 'id' && field !== '姓名' && field !== '名称' && field !== '名字' && field !== '别名') return false;
  const rawValue = selector[1].slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  return Boolean(matchCanonical(npcSelectorValueToCanonicalName(rawValue)));
}

function npcSelectorValueToCanonicalName(value: string): string {
  const normalized = value.replace(/^npc[_-]/i, '').toLowerCase();
  const map: Record<string, string> = {
    march7th: '三月七',
    march7: '三月七',
    march: '三月七',
    danheng: '丹恒',
    dan_heng: '丹恒',
    himeko: '姬子',
    welt: '瓦尔特',
    pompom: '帕姆',
    'pom-pom': '帕姆',
    herta: '黑塔',
    asta: '艾丝妲',
    arlan: '阿兰',
    stelle: '星',
    caelus: '穹',
  };
  return map[normalized] ?? value;
}

function validateSchemaPushValue(root: VariableRootKey, rest: string, value: unknown): string | null {
  const fullPath = joinRootPath(root, rest);
  const template = findSchemaTemplate(fullPath);
  if (!template) return null;

  if (template.required.length === 1 && template.required[0] === '字符串') {
    return typeof value === 'string' && value.trim() ? null : `${fullPath} push 值必须是非空字符串`;
  }

  if (!isRecord(value)) return `${fullPath} push 值必须是完整 JSON 对象`;
  const missing = template.required.filter((field) => !(field in value));
  if (missing.length) return `${fullPath} push 对象缺少必填字段：${missing.join('、')}`;

  if (template.path === '旅人.背包') {
    const name = typeof value.名称 === 'string' ? value.名称.trim() : '';
    const desc = typeof value.描述 === 'string' ? value.描述.trim() : '';
    if (!name || name === '名称' || name === '物品' || name === '未知物品' || name.includes('...')) {
      return '背包物品名称不能是占位符';
    }
    if (!desc || desc === '描述' || desc.includes('...')) return '背包物品描述不能是占位符';
    if ('属性加成' in value) return '背包物品.属性加成 是旧数值装备字段，变量模型不得继续写入';
  }

  if (template.path === '手机.messageSeeds') {
    const source = typeof value.source === 'string' ? value.source : '';
    const allowedSources = new Set(['main_story', 'news', 'memory', 'plot', 'system']);
    if (!allowedSources.has(source)) return '手机.messageSeeds.source 只能是 main_story / news / memory / plot / system';
    const triggerType = typeof value.triggerType === 'string' ? value.triggerType : '';
    const allowedTriggerTypes = new Set([
      'injury',
      'victory',
      'defeat',
      'location_change',
      'important_item',
      'relationship',
      'news',
      'quest',
      'time',
      'custom',
    ]);
    if (!allowedTriggerTypes.has(triggerType)) return '手机.messageSeeds.triggerType 不是已登记类型';
    const priority = typeof value.priority === 'string' ? value.priority : '';
    if (!new Set(['low', 'normal', 'high', 'urgent']).has(priority)) return '手机.messageSeeds.priority 只能是 low / normal / high / urgent';
    const targetType = typeof value.targetType === 'string' ? value.targetType : '';
    if (!new Set(['private', 'group']).has(targetType)) return '手机.messageSeeds.targetType 只能是 private / group';
    if (value.status !== 'pending') return '手机.messageSeeds.status 新种子必须写 pending';
  }

  if (template.path === '手机.chats') {
    const messages = value.messages;
    if (!Array.isArray(messages)) return '手机.chats 新会话必须提供 messages: []';
    if (messages.length > 0) return '变量模型只允许创建空会话频道，不允许直接写完整聊天 messages';
  }

  return null;
}

// 命途狭间状态机硬只读名单:这些字段只能由 服务层(踏入命途狭间 / 应用狭间结果 / 推进命途进度)写,
// 变量模型一旦碰到必须拒绝——否则 AI 误判「踏入虚境」当成「狭间完成」,会清掉 进行中狭间,
// 下一回合就退回主剧情 scope,AI 不知道是评判回合,直接卡死虚境。
function isAwakeningProtectedPath(rawKey: string, action: 变量命令['action']): boolean {
  const k = rawKey.trim();
  // 世界·狭间状态机字段:任何 action 都拒
  if (k === '世界.进行中狭间' || k === '世界.待触发狭间') return true;
  if (k.startsWith('世界.进行中狭间.') || k.startsWith('世界.待触发狭间.')) return true;

  // 旅人.命途列表:整个数组只读(新命途条目只能由 踏上命途 服务层创建,
  // 否则变量模型会凭空造 id=path_xxx 的伪条目,导致升阶找不到正确的命途)。
  if (k === '旅人.命途列表') {
    return true;
  }
  // 命途列表[i] / 命途列表[id=xxx] 整条目:也禁止 push/delete/set,避免覆盖整条
  if (/^旅人\.命途列表\[[^\]]+\]$/.test(k)) return true;
  // 命途列表[i].阶段:阶段变化只能走 升阶 / 星神授力 服务层
  if (/^旅人\.命途列表\[[^\]]+\]\.阶段$/.test(k)) return true;
  // 命途列表[i].待升阶:状态机字段,只能由 推进命途进度 / 应用狭间结果 写
  if (/^旅人\.命途列表\[[^\]]+\]\.待升阶$/.test(k)) return true;
  // 命途列表[i].是否主命途 / 主命途:主命途选择是玩家行为,不允许 AI 改
  if (/^旅人\.命途列表\[[^\]]+\]\.是否主命途$/.test(k)) return true;
  if (k === '旅人.主命途') return true;
  // 进度由 reduceVariableCommands 的专用通道处理(走 24h cap),这里不拦,直通专用通道。
  // 备注 / 觉醒于 等叙事字段允许 AI 写。
  return false;
}

function isDeprecatedProtectedPath(rawKey: string): string | null {
  const k = rawKey.trim();
  if (/^NPC(?:\[[^\]]+\])?\.阵营ID$/.test(k)) {
    return '独立派系/阵营变量已废弃；NPC 阵营归属只作为原著/开局资料保留，变量模型不得维护';
  }
  if (/^NPC(?:\[[^\]]+\])?\.好感$/.test(k)) {
    return 'NPC 好感字段正式名称是 好感度，请改用 NPC[id=...].好感度';
  }
  if (k === '旅人.属性' || k.startsWith('旅人.属性.')) {
    return '旅人.属性 是旧五维/属性系统字段，当前项目不再由变量模型维护';
  }
  if (/^旅人\.背包\[[^\]]+\]\.属性加成/.test(k)) {
    return '背包物品.属性加成 是旧数值装备字段，变量模型不得继续写入';
  }
  return null;
}

function isTravelerPlayerAuthoredPath(rawKey: string): boolean {
  const parsed = extractRoot(rawKey);
  if (parsed?.root !== '旅人') return false;
  if (!parsed.rest) return false;
  const tokens = 解析路径片段(parsed.rest);
  const first = tokens[0];
  return typeof first === 'string' && TRAVELER_PLAYER_AUTHORED_FIELDS.has(first);
}

export function isTravelerPlayerAuthoredVariablePath(rawKey: string): boolean {
  const key = rawKey.trim();
  return key === '旅人' || key === '旅人.穿着' || isTravelerPlayerAuthoredPath(key);
}

/** 校验一条命令是否符合登记表。 */
export function validateCommand(cmd: 变量命令, state: Partial<VariableState>): CommandValidation {
  if (!cmd || typeof cmd.key !== 'string') {
    return { allowed: false, reason: '命令格式错误：缺少 key' };
  }
  if (isTravelerPlayerAuthoredVariablePath(cmd.key) && cmd.key.trim() === '旅人.穿着') {
    return { allowed: false, reason: '旅人.穿着 未登记；旅人外观/服装属于玩家手写档案，变量模型不得维护；NPC 服装才写 NPC[id=...].穿着' };
  }
  if (isTravelerPlayerAuthoredVariablePath(cmd.key)) {
    return {
      allowed: false,
      reason: `旅人核心档案 ${cmd.key} 由玩家手写维护，变量模型不得 ${cmd.action}。请改写为 NPC 记忆、世界事件、物品或剧情正文承接。`,
    };
  }
  // 狭间状态机 + 命途结构字段:变量模型只能读不能写,违者直接拒
  if (isAwakeningProtectedPath(cmd.key, cmd.action)) {
    return {
      allowed: false,
      reason: `命途/狭间状态机字段 ${cmd.key} 只能由服务层维护,变量模型不许 ${cmd.action}`,
    };
  }
  const deprecatedReason = isDeprecatedProtectedPath(cmd.key);
  if (deprecatedReason) {
    return { allowed: false, reason: deprecatedReason };
  }
  const parsed = extractRoot(cmd.key);
  if (!parsed) {
    return { allowed: false, reason: `根路径未登记。允许的根：${VARIABLE_ROOT_KEYS.join(' / ')}` };
  }
  if (READONLY_ROOTS.has(parsed.root)) {
    const policy = ROOT_WRITE_POLICIES[parsed.root];
    return { allowed: false, reason: `${parsed.root} 由${policy.owner}维护，变量模型不可写入。${policy.forbidden ?? ''}` };
  }
  const rootValue = state[parsed.root];
  if (rootValue === undefined) {
    return { allowed: false, reason: `根 ${parsed.root} 在当前存档中不存在` };
  }

  // 整段根：始终允许（push/set/delete 根本身）
  if (parsed.rest.length === 0) {
    if (parsed.root === '旅人') {
      return {
        allowed: false,
        reason: `旅人根对象包含玩家手写核心档案，变量模型不得 ${cmd.action} 整个旅人。请写入 旅人.背包 / 旅人.装备 / 旅人.战技列表 / 旅人.命途列表[id=...].进度 等允许路径。`,
      };
    }
    if (cmd.action === 'push' && !Array.isArray(rootValue)) {
      return { allowed: false, reason: `push 目标 ${parsed.root} 不是数组` };
    }
    if (cmd.action === 'push') {
      const schemaError = validateSchemaPushValue(parsed.root, parsed.rest, cmd.value);
      if (schemaError) return { allowed: false, reason: schemaError };
    }
    return { allowed: true, root: parsed.root, rest: parsed.rest };
  }

  if (cmd.action === 'push' && isSchemaArrayPath(parsed.root, parsed.rest)) {
    const selectorMissingReason = getMissingSelectorTargetReason(parsed.root, parsed.rest, rootValue);
    if (selectorMissingReason) return { allowed: false, reason: selectorMissingReason };
    const schemaError = validateSchemaPushValue(parsed.root, parsed.rest, cmd.value);
    if (schemaError) return { allowed: false, reason: schemaError };
    return { allowed: true, root: parsed.root, rest: parsed.rest };
  }

  // 有子路径：先看路径是否已存在
  const { exists, value: targetValue } = 读取路径值(rootValue, parsed.rest);
  if (exists) {
    if (cmd.action === 'push' && !Array.isArray(targetValue)) {
      return { allowed: false, reason: `push 目标 ${cmd.key} 不是数组` };
    }
    return { allowed: true, root: parsed.root, rest: parsed.rest };
  }

  const selectorMissingReason = getMissingSelectorTargetReason(parsed.root, parsed.rest, rootValue);
  if (selectorMissingReason) {
    return { allowed: false, reason: selectorMissingReason };
  }

  // 路径不存在：仅在 set/add/sub 给「同数组其它对象已有字段」时允许（让 AI 可以补全可选字段）
  if ((cmd.action === 'set' || cmd.action === 'add' || cmd.action === 'sub') && 同数组其它对象存在字段(rootValue, parsed.rest)) {
    return { allowed: true, root: parsed.root, rest: parsed.rest };
  }

  if ((cmd.action === 'set' || cmd.action === 'add' || cmd.action === 'sub') && isKnownSchemaItemField(parsed.root, parsed.rest)) {
    return { allowed: true, root: parsed.root, rest: parsed.rest };
  }

  if (parsed.root === 'NPC' && isKnownNpcArchivePath(parsed.rest)) {
    return { allowed: true, root: parsed.root, rest: parsed.rest };
  }

  return { allowed: false, reason: `路径 ${cmd.key} 未登记。如需新增条目，请 push 到对应数组` };
}

function isKnownNpcArchivePath(rawPath: string): boolean {
  const tokens = 解析路径片段(rawPath);
  if (tokens.length < 2) return false;
  const last = tokens[tokens.length - 1];
  if (typeof last !== 'string') return false;
  const hasKnownField = NPC_ARRAY_ITEM_FIELDS.has(last) || NPC_NSFW_FIELDS.has(last);
  if (!hasKnownField) return false;
  return tokens.some(
    (token) => typeof token === 'number' || (typeof token === 'string' && token.startsWith('[') && token.endsWith(']')),
  );
}
