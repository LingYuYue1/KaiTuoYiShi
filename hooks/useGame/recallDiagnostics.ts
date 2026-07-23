import type { 智库召回诊断 } from '@/services/zhikuRetrieval';

export function formatZhikuDiagnosticsPreview(diagnostics?: 智库召回诊断): string {
  if (!diagnostics) return '';
  return [
    '智库召回诊断：',
    `场景锚点：${diagnostics.场景锚点.join('、') || '无'}`,
    `相关角色：${diagnostics.相关角色.join('、') || '无'}`,
    `在场角色兜底召回：${diagnostics.在场角色兜底召回.join('、') || '无'}`,
    `关键词召回：${diagnostics.关键词召回.join('、') || '无'}`,
    `AI检索补充：${diagnostics.AI检索补充.join('、') || '无'}`,
    `关键词资料召回：${diagnostics.关键词资料召回.join('、') || '无'}`,
    `AI检索补充强资料：${diagnostics.AI检索补充强资料.join('、') || '无'}`,
    `AI检索补充弱资料：${diagnostics.AI检索补充弱资料.join('、') || '无'}`,
    `候选资料：${diagnostics.候选资料.join('、') || '无'}`,
    `AI候选资料：${diagnostics.AI候选资料.join('、') || '无'}`,
    `最终注入角色资料（已去重）：${diagnostics.角色相关资料.join('、') || '无'}`,
    `最终注入强资料：${diagnostics.强相关资料.join('、') || '无'}`,
    `最终注入弱资料：${diagnostics.弱相关资料.join('、') || '无'}`,
    `已注入资料：${diagnostics.已注入资料.join('、') || '无'}`,
    `角色故事层注入：${diagnostics.角色故事层注入?.join('；') || '无'}`,
    diagnostics.被门禁过滤.length
      ? `门禁过滤：${diagnostics.被门禁过滤.map((item) => `${item.标题}（${item.原因}）`).join('；')}`
      : '门禁过滤：无',
    diagnostics.检查项.length ? `检查项：${diagnostics.检查项.join('；')}` : '',
  ].filter(Boolean).join('\n');
}

function getZhikuEntryKind(title: string): string {
  if (/【人物】|角色|人物/.test(title)) return '角色';
  if (/【地点】|地点|空间站|列车|贝洛伯格|罗浮|仙舟|匹诺康尼|雅利洛/.test(title)) return '地点';
  if (/【组织】|阵营|组织|公司|列车组|天才俱乐部/.test(title)) return '组织';
  if (/【物品】|道具|奇物|星核|光锥/.test(title)) return '物品';
  if (/【敌人】|敌人|军团|裂界|怪物/.test(title)) return '敌人';
  return '资料';
}

function cleanRecallTitle(title: string): string {
  return String(title || '')
    .replace(/^【[^】]+】/, '')
    .split(/[｜|：:]/)[0]
    .replace(/\s+/g, '')
    .trim();
}

export function formatZhikuRecallSummary(diagnostics?: 智库召回诊断): string {
  if (!diagnostics) return '智库召回：无';
  const formatList = (titles: string[]) => {
    const items = titles
      .map((title) => {
        const name = cleanRecallTitle(title);
        return name ? `${getZhikuEntryKind(title)}${name}` : '';
      })
      .filter(Boolean);
    return items.length ? items.join('，') : '无';
  };
  return [
    `在场角色兜底召回：${formatList(diagnostics.在场角色兜底召回)}`,
    `关键词召回：${formatList(diagnostics.关键词召回)}`,
    `AI检索补充：${formatList(diagnostics.AI检索补充)}`,
    `关键词资料召回：${formatList(diagnostics.关键词资料召回)}`,
    `AI检索补充强资料：${formatList(diagnostics.AI检索补充强资料)}`,
    `AI检索补充弱资料：${formatList(diagnostics.AI检索补充弱资料)}`,
  ].join('\n');
}

export function formatYitingRecallSummary(previewText?: string): string {
  const text = String(previewText || '').trim();
  if (!text) return '记忆召回：无';
  const names = Array.from(
    new Set(
      text
        .split(/[|\n，,]/)
        .map((item) => item.replace(/^强回忆[:：]/, '').replace(/^弱回忆[:：]/, '').trim())
        .filter((item) => item && item !== '无'),
    ),
  );
  return `记忆召回：${names.length ? names.join('，') : '无'}`;
}
