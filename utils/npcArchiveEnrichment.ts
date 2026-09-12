import { matchCanonical } from '@/data/canonicalCharacters';
import type { NPC记录, NPC性别 } from '@/models/npc';

export type CanonicalArchiveBaseline = {
  性别?: NPC性别;
  外貌?: string;
  性格?: string;
  穿着?: string;
  说话方式?: string;
  介绍?: string;
};

const CANONICAL_ARCHIVE_BASELINES: Record<string, CanonicalArchiveBaseline> = {
  星: {
    性别: '女',
    穿着: '常见灰发少女开拓者装束，外形利落，行动时带着刚苏醒后的直接和莽劲。',
    说话方式: '刚苏醒时会先观察局势；熟悉同伴后会主动吐槽、接梗、追问，也会用简短直球把话题推进下去。',
    介绍: '星核载体之一，星穹列车开拓者。失忆不等于无个性，长期表现应有好奇心、行动感和冷不丁的幽默。',
  },
  穹: {
    性别: '男',
    穿着: '常见灰发少年开拓者装束，轮廓清爽，行动时带着刚苏醒后的直接和莽劲。',
    说话方式: '刚苏醒时会先观察局势；熟悉同伴后会主动吐槽、接梗、追问，也会用简短直球把话题推进下去。',
    介绍: '星核载体之一，星穹列车开拓者。失忆不等于无个性，长期表现应有好奇心、行动感和冷不丁的幽默。',
  },
  三月七: {
    性别: '女',
    穿着: '常穿星穹列车风格的浅色外套与短裙装束，随身带相机和六相冰弓。',
    说话方式: '语速轻快，常带感叹、吐槽和追问，熟悉后会主动接梗。',
    介绍: '星穹列车成员，失去过去记忆但行动积极，擅长用六相冰支援同伴。',
  },
  丹恒: {
    性别: '男',
    穿着: '衣着利落克制，常携长枪击云，整体偏冷色调与旅途实用感。',
    说话方式: '话少而准确，倾向先观察再判断，提醒风险时直接简短。',
    介绍: '星穹列车成员，负责整理智库资料与战斗支援，对自身过去保持克制。',
  },
  姬子: {
    性别: '女',
    穿着: '衣着优雅成熟，常与红发、金眸、咖啡和列车领航气质联系在一起。',
    说话方式: '语气温和从容，常带引导意味，关键时刻有明确主导权。',
    介绍: '星穹列车领航员，修复并重新启程列车的核心成员之一。',
  },
  瓦尔特: {
    性别: '男',
    穿着: '常穿沉稳绅士式服装，佩戴眼镜或墨镜，手持权杖。',
    说话方式: '沉稳审慎，解释问题时条理清楚，常保留余地。',
    介绍: '星穹列车成员，见识广博，习惯以成熟判断守住队伍底线。',
  },
  艾丝妲: {
    性别: '女',
    穿着: '空间站站长风格的精致制服，整体明亮、利落且有管理者气质。',
    说话方式: '热情而有效率，处理事务时果断，关心他人但不拖泥带水。',
    介绍: '黑塔空间站站长，负责协调空间站运转与危机应对。',
  },
  景元: {
    性别: '男',
    穿着: '仙舟将军装束，白发长发，姿态松弛但不失威严。',
    说话方式: '温和含笑，常以轻松口吻铺开深层判断。',
    介绍: '仙舟罗浮神策将军，外表慵懒，实则擅长布局。',
  },
  符玄: {
    性别: '女',
    穿着: '太卜司风格服饰，紫发与额间法眼使气质锐利醒目。',
    说话方式: '直接、自信，习惯用推演和结论压缩废话。',
    介绍: '仙舟罗浮太卜司之首，精于推演与预判。',
  },
  希儿: {
    性别: '女',
    穿着: '利于行动的暗色战斗装束，紫发与锐利轮廓带有地下街气质。',
    说话方式: '直接、锋利，不喜欢绕弯，情绪常压在行动里。',
    介绍: '贝洛伯格下层区出身的战斗者，重视地下街同伴。',
  },
  帕姆: {
    性别: '其他',
    穿着: '列车长制服，小巧体型。',
    说话方式: '礼貌正式，偶尔带点自豪和唠叨。',
    介绍: '星穹列车列车长，认真负责的兔型助手。',
  },
  阿兰: {
    性别: '男',
    穿着: '黑塔空间站防卫科制服，简洁实用。',
    说话方式: '简短克制，不主动展开话题。',
    介绍: '黑塔空间站防卫科负责人，沉默但可靠。',
  },
  黑塔: {
    性别: '女',
    穿着: '天才少女人偶外形，精致但带有距离感。',
    说话方式: '高傲直接，兴趣驱动，不耐烦时会直接表达。',
    介绍: '天才俱乐部成员，黑塔空间站的实际主人。',
  },
  白露: {
    性别: '女',
    穿着: '龙角少女装束，活泼明亮。',
    说话方式: '轻快好奇，带医者的自信和孩子的任性。',
    介绍: '罗浮丹鼎司衔药龙女，持明族龙尊。',
  },
  '丹恒·饮月': {
    性别: '男',
    穿着: '与丹恒相近但更具龙裔威压的装束。',
    说话方式: '克制而沉静，用词比丹恒更古雅。',
    介绍: '丹恒的龙裔形态，持明族饮月君旧身。',
  },
  '三月七·巡猎': {
    性别: '女',
    穿着: '巡猎命途形态装束，比普通三月七更凌厉。',
    说话方式: '依旧活泼但更果断，行动优先于犹豫。',
    介绍: '三月七的巡猎命途形态。',
  },
};

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

export function enrichNpcArchives(records: NPC记录[]): { records: NPC记录[]; changed: boolean } {
  let changed = false;
  const next = records.map((npc) => {
    const canonical = npc.NPC来源 === 'custom'
      ? null
      : matchCanonical(npc.姓名) ?? (npc.别名 ? matchCanonical(npc.别名) : null);
    // 静态档案补全只服务于原著角色；NSFW 档案只由明确的 nsfw_archive 事实维护。
    const baseline: CanonicalArchiveBaseline | undefined = canonical
      ? {
          外貌: canonical.appearance,
          性格: canonical.personality,
          ...CANONICAL_ARCHIVE_BASELINES[canonical.name],
        }
      : undefined;
    let updated = npc;
    const patch: Partial<NPC记录> = {};

    if (canonical && baseline) {
      if (shouldPatchArchiveField(updated.外貌, baseline.外貌)) patch.外貌 = baseline.外貌;
      if (shouldPatchArchiveField(updated.性格, baseline.性格)) patch.性格 = baseline.性格;
      if (shouldPatchArchiveField(updated.穿着, baseline.穿着)) patch.穿着 = baseline.穿着;
      if (shouldPatchArchiveField(updated.说话方式, baseline.说话方式)) patch.说话方式 = baseline.说话方式;
      if (shouldPatchArchiveField(updated.介绍, baseline.介绍)) patch.介绍 = baseline.介绍;
      if (!updated.性别 && baseline.性别) patch.性别 = baseline.性别;
      if (!updated.原著角色) patch.原著角色 = true;
      // 手动阶位覆盖是权威：canonical 补全不得改写阶位或阶位来源（含手动降级的原著角色）。
      if (updated.手动阶位覆盖 === undefined) {
        if (updated.阶位 !== 'companion') patch.阶位 = 'companion';
        if (updated.阶位来源 !== 'manual') patch.阶位来源 = 'canonical';
      }
    }

    if (Object.keys(patch).length) {
      updated = { ...updated, ...patch };
    }

    if (updated !== npc) changed = true;
    return updated;
  });

  return { records: next, changed };
}
