import { matchCanonical } from '@/data/canonicalCharacters';
import type { NPC记录, NPC性别, NPC_NSFW档案 } from '@/models/npc';
import type { 智库系统, 智库条目 } from '@/models/zhiku';
import { 获取智库人物名列表, 解析智库软结构标签, 比较智库人物节点 } from '@/models/zhiku';

type CanonicalArchiveBaseline = {
  性别?: NPC性别;
  外貌?: string;
  性格?: string;
  穿着?: string;
  说话方式?: string;
  介绍?: string;
  nsfw年龄确认?: NonNullable<NPC_NSFW档案['年龄确认']>;
};

const CANONICAL_ARCHIVE_BASELINES: Record<string, CanonicalArchiveBaseline> = {
  星: {
    性别: '女',
    穿着: '常见灰发少女开拓者装束，外形利落，行动时带着刚苏醒后的直接和莽劲。',
    说话方式: '刚苏醒时会先观察局势；熟悉同伴后会主动吐槽、接梗、追问，也会用简短直球把话题推进下去。',
    介绍: '星核载体之一，星穹列车开拓者。失忆不等于无个性，长期表现应有好奇心、行动感和冷不丁的幽默。',
    nsfw年龄确认: 'unknown',
  },
  穹: {
    性别: '男',
    穿着: '常见灰发少年开拓者装束，轮廓清爽，行动时带着刚苏醒后的直接和莽劲。',
    说话方式: '刚苏醒时会先观察局势；熟悉同伴后会主动吐槽、接梗、追问，也会用简短直球把话题推进下去。',
    介绍: '星核载体之一，星穹列车开拓者。失忆不等于无个性，长期表现应有好奇心、行动感和冷不丁的幽默。',
    nsfw年龄确认: 'unknown',
  },
  三月七: {
    性别: '女',
    穿着: '常穿星穹列车风格的浅色外套与短裙装束，随身带相机和六相冰弓。',
    说话方式: '语速轻快，常带感叹、吐槽和追问，熟悉后会主动接梗。',
    介绍: '星穹列车成员，失去过去记忆但行动积极，擅长用六相冰支援同伴。',
    nsfw年龄确认: 'unknown',
  },
  丹恒: {
    性别: '男',
    穿着: '衣着利落克制，常携长枪击云，整体偏冷色调与旅途实用感。',
    说话方式: '话少而准确，倾向先观察再判断，提醒风险时直接简短。',
    介绍: '星穹列车成员，负责整理智库资料与战斗支援，对自身过去保持克制。',
    nsfw年龄确认: 'unknown',
  },
  姬子: {
    性别: '女',
    穿着: '衣着优雅成熟，常与红发、金眸、咖啡和列车领航气质联系在一起。',
    说话方式: '语气温和从容，常带引导意味，关键时刻有明确主导权。',
    介绍: '星穹列车领航员，修复并重新启程列车的核心成员之一。',
    nsfw年龄确认: 'adult',
  },
  瓦尔特: {
    性别: '男',
    穿着: '常穿沉稳绅士式服装，佩戴眼镜或墨镜，手持权杖。',
    说话方式: '沉稳审慎，解释问题时条理清楚，常保留余地。',
    介绍: '星穹列车成员，见识广博，习惯以成熟判断守住队伍底线。',
    nsfw年龄确认: 'adult',
  },
  艾丝妲: {
    性别: '女',
    穿着: '空间站站长风格的精致制服，整体明亮、利落且有管理者气质。',
    说话方式: '热情而有效率，处理事务时果断，关心他人但不拖泥带水。',
    介绍: '黑塔空间站站长，负责协调空间站运转与危机应对。',
    nsfw年龄确认: 'adult',
  },
  景元: {
    性别: '男',
    穿着: '仙舟将军装束，白发长发，姿态松弛但不失威严。',
    说话方式: '温和含笑，常以轻松口吻铺开深层判断。',
    介绍: '仙舟罗浮神策将军，外表慵懒，实则擅长布局。',
    nsfw年龄确认: 'adult',
  },
  符玄: {
    性别: '女',
    穿着: '太卜司风格服饰，紫发与额间法眼使气质锐利醒目。',
    说话方式: '直接、自信，习惯用推演和结论压缩废话。',
    介绍: '仙舟罗浮太卜司之首，精于推演与预判。',
    nsfw年龄确认: 'adult',
  },
  希儿: {
    性别: '女',
    穿着: '利于行动的暗色战斗装束，紫发与锐利轮廓带有地下街气质。',
    说话方式: '直接、锋利，不喜欢绕弯，情绪常压在行动里。',
    介绍: '贝洛伯格下层区出身的战斗者，重视地下街同伴。',
    nsfw年龄确认: 'adult',
  },
};

const NSFW_BLOCKED_NAME_RE = /(帕姆|Pom-Pom|Pom Pom|佩佩|Peppy|白露|彦卿|虎克|克拉拉|怪物|怪兽|裂界生物|反物质|虚卒|机兵|机械|机器人|生物|动物|宠物|造物|傀儡|人偶|投影)/i;

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const WEAK_ARCHIVE_TEXT_RE = /^(未知|未记录|暂无|尚无|无|普通|一般|空|待补充|暂无记录|尚未记录|沉默寡言|冷静理性|开朗活泼)$/;

function isWeakArchiveText(value: unknown): boolean {
  if (!hasText(value)) return true;
  const text = value.trim();
  if (text.length <= 8) return true;
  if (WEAK_ARCHIVE_TEXT_RE.test(text)) return true;
  if (/^(性格|外貌|穿着|介绍|说话方式)[:：]?\s*(未知|暂无|待补充|未记录)?$/.test(text)) return true;
  return false;
}

function shouldPatchArchiveField(current: unknown, incoming: unknown): incoming is string {
  if (!hasText(incoming)) return false;
  if (!hasText(current)) return true;
  const currentText = current.trim();
  const incomingText = incoming.trim();
  return isWeakArchiveText(currentText) && incomingText.length >= currentText.length + 6;
}

function mergeList(existing: string[] | undefined, additions: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of [...(existing ?? []), ...additions]) {
    const text = item.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
  }
  return output;
}

function isNsfwBlockedNpc(npc: NPC记录, canonicalName?: string): boolean {
  const haystack = [
    canonicalName,
    npc.姓名,
    npc.别名,
    npc.外貌,
    npc.介绍,
    npc.备注?.join(' '),
  ].filter(Boolean).join(' ');
  return NSFW_BLOCKED_NAME_RE.test(haystack);
}

function namesLikelySame(a: string | undefined, b: string | undefined): boolean {
  const left = a?.replace(/\s+/g, '').trim();
  const right = b?.replace(/\s+/g, '').trim();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function buildZhikuArchiveBaseline(npc: NPC记录, zhiku?: 智库系统): CanonicalArchiveBaseline | undefined {
  const entries = zhiku?.条目 ?? [];
  if (!entries.length) return undefined;
  const matched = entries
    .filter((entry) => entry.分类 === 'character' && entry.可用于联动 !== false)
    .filter((entry) => {
      const names = 获取智库人物名列表(entry);
      return names.some((name) => namesLikelySame(name, npc.姓名) || namesLikelySame(name, npc.别名));
    })
    .sort(比较智库人物节点)
    .slice(0, 4);
  if (!matched.length) return undefined;

  const pickMeta = (selector: (meta: ReturnType<typeof 解析智库软结构标签>) => string | undefined) => {
    for (const entry of matched) {
      const value = selector(解析智库软结构标签(entry));
      if (hasText(value)) return value;
    }
    return undefined;
  };
  const pickSummary = (entries: 智库条目[]) => {
    const subject = entries.find((entry) => {
      const meta = 解析智库软结构标签(entry);
      return `${meta.资料类型 ?? ''}${meta.节点 ?? ''}`.includes('主体');
    }) ?? entries[0];
    return hasText(subject?.摘要) ? subject.摘要 : undefined;
  };

  return {
    外貌: pickMeta((meta) => meta.外貌锚点),
    性格: pickMeta((meta) => meta.性格锚点),
    说话方式: pickMeta((meta) => meta.说话方式),
    介绍: pickSummary(matched),
  };
}

function shouldCreateNsfwBaseline(
  npc: NPC记录,
  baseline: CanonicalArchiveBaseline | undefined,
  options: { nsfwEnabled: boolean; maleNsfwArchiveEnabled: boolean },
): boolean {
  if (!options.nsfwEnabled) return false;
  if (isNsfwBlockedNpc(npc, npc.姓名)) return false;
  const gender = baseline?.性别 ?? npc.性别;
  if (gender === '男' && !options.maleNsfwArchiveEnabled) return false;
  return npc.阶位 === 'companion' || npc.同行 || npc.原著角色 === true;
}

function buildNsfwBaseline(npc: NPC记录, baseline?: CanonicalArchiveBaseline): NPC_NSFW档案 {
  const existing = npc.NSFW档案 ?? {};
  const age = existing.年龄确认 ?? baseline?.nsfw年龄确认 ?? 'unknown';
  return {
    ...existing,
    enabled: true,
    年龄确认: age,
    亲密阶段: existing.亲密阶段 ?? '未建立',
    边界: existing.边界 ?? '仅作为私密档案预留；未确认成人、明确同意与关系边界前，不写具体身体细节或亲密经历。',
    长期事实: mergeList(existing.长期事实, [
      'NSFW 总开关开启后创建的保守基线档案；不代表已发生亲密剧情。',
    ]),
    标签: mergeList(existing.标签, ['保守基线', '等待剧情事实补充']),
    备注: existing.备注 ?? '该档案只承接后续已发生的成人向长期事实，普通外貌、性格与同行记忆保持隔离。',
  };
}

function archiveChanged(a: NPC_NSFW档案 | undefined, b: NPC_NSFW档案): boolean {
  return JSON.stringify(a ?? null) !== JSON.stringify(b);
}

export function enrichNpcArchives(
  records: NPC记录[],
  options: { nsfwEnabled: boolean; maleNsfwArchiveEnabled: boolean; zhiku?: 智库系统 },
): { records: NPC记录[]; changed: boolean } {
  let changed = false;
  const next = records.map((npc) => {
    const canonical = matchCanonical(npc.姓名) ?? (npc.别名 ? matchCanonical(npc.别名) : null);
    const zhikuBaseline = buildZhikuArchiveBaseline(npc, options.zhiku);
    if (!canonical && !zhikuBaseline) return npc;
    const baseline = {
      ...(canonical ? {
        外貌: canonical.appearance,
        性格: canonical.personality,
      } : {}),
      ...(canonical ? CANONICAL_ARCHIVE_BASELINES[canonical.name] : {}),
      ...(zhikuBaseline ?? {}),
    };
    let updated = npc;
    const patch: Partial<NPC记录> = {};

    if (shouldPatchArchiveField(updated.外貌, baseline.外貌)) patch.外貌 = baseline.外貌;
    if (shouldPatchArchiveField(updated.性格, baseline.性格)) patch.性格 = baseline.性格;
    if (shouldPatchArchiveField(updated.穿着, baseline.穿着)) patch.穿着 = baseline.穿着;
    if (shouldPatchArchiveField(updated.说话方式, baseline.说话方式)) patch.说话方式 = baseline.说话方式;
    if (shouldPatchArchiveField(updated.介绍, baseline.介绍)) patch.介绍 = baseline.介绍;
    if (!updated.性别 && baseline?.性别) patch.性别 = baseline.性别;
    if (!updated.原著角色) patch.原著角色 = true;
    if (updated.阶位 !== 'companion') patch.阶位 = 'companion';

    if (Object.keys(patch).length) {
      updated = { ...updated, ...patch };
    }

    if (shouldCreateNsfwBaseline(updated, baseline, options)) {
      const archive = buildNsfwBaseline(updated, baseline);
      if (archiveChanged(updated.NSFW档案, archive)) {
        updated = { ...updated, NSFW档案: archive };
      }
    }

    if (updated !== npc) changed = true;
    return updated;
  });

  return { records: next, changed };
}
