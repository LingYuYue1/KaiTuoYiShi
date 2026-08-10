// 记忆去芜存菁 · 可行性测试 v2
// 关键结论修正：未决事项不应从「记忆摘要」里挖（压缩会复制/有损），而应来自结构化数据
// （NPC 账本 / 剧情节点）。本版方案 B = 结构化未决注册表（100% 召回）+ 记忆相关性过滤（省 token）。
// 对比：现有窗口注入（A）vs 去芜存菁（B）。

// ── 可调参数 ────────────────────────────────────────────────
const TOTAL_TURNS = 4000;
const COMPRESS_RATIO = 15;
const SHORT_WINDOW = 12;
const MIDDLE_WINDOW = 10;
const LONG_WINDOW = 12;
const CONTEXT = { input: '你沿着走廊继续前进', location: '黑塔空间站·主控舱段', npc: '三月七' };

// ── 结构化未决注册表（模拟 NPC 账本未完成事项 / 剧情节点进行中）──
// 这是 B1 常驻块的真正数据源：每回合稳定存在，不经过记忆压缩。
const PENDING_REGISTRY = [
  { id: 'p1', turn: 5, source: 'NPC账本', content: '三月七｜未完成：帮她找丢失的相册（旧相册、贝洛伯格）' },
  { id: 'p2', turn: 42, source: 'NPC账本', content: '丹恒｜约定：调查空间站收容舱的异常信号' },
  { id: 'p3', turn: 87, source: 'NPC账本', content: '瓦尔特｜人情：去匹诺康尼时代为跑腿' },
  { id: 'p4', turn: 150, source: '剧情节点', content: '伏笔：封存舱播放器录音未听完（录音、封存舱）' },
  { id: 'p5', turn: 260, source: 'NPC账本', content: '姬子｜承诺：检查列车的曲速引擎' },
  { id: 'p6', turn: 400, source: '剧情节点', content: '进行中：解开星核谜团的约定' },
  { id: 'p7', turn: 620, source: 'NPC账本', content: '希儿｜人情：她说以后会来讨' },
  { id: 'p8', turn: 900, source: '剧情节点', content: '伏笔：贝洛伯格下层区打不开的门，钥匙在别处' },
];

// ── 模拟记忆池生成（同 v1，验证记忆链路本身） ───────────────
function makeEntry(turn, content, tags = [], pending = false) {
  return { turn, content, tags, pending };
}
function buildMemoryPool(totalTurns) {
  const pool = [];
  const daily = [
    '在舱段巡视', '与科员交谈', '查看终端', '修理设备', '整理物资', '巡逻警戒',
    '与同伴闲聊', '核对名单', '搬运箱子', '调试全息屏', '检查管道', '记录日志',
    '补充弹药', '清洁舱室', '测试对讲', '整理书架', '清点补给', '校准仪器',
  ];
  for (let t = 1; t <= totalTurns; t += 1) {
    pool.push(makeEntry(t, `${daily[(t + 13) % daily.length]}，没有特别的事`, ['日常']));
  }
  function compress(batch, layer) {
    const merged = [];
    for (let i = 0; i < batch.length; i += COMPRESS_RATIO) {
      const chunk = batch.slice(i, i + COMPRESS_RATIO);
      merged.push(makeEntry(chunk[0].turn, chunk[0].content, ['日常'], false));
    }
    return merged;
  }
  const shortPool = compress(pool, '短');
  const middlePool = compress(shortPool, '中');
  const longPool = compress(middlePool, '长');
  return { shortPool, middlePool, longPool };
}

// ── 相关性打分（原型） ──────────────────────────────────────
function scoreEntry(entry, ctx) {
  const text = entry.content + ' ' + entry.tags.join(' ');
  let s = 0;
  if (text.includes(ctx.npc)) s += 3;
  if (text.includes(ctx.location.slice(0, 4))) s += 3;
  const words = ctx.input.split(/[\s··]/).filter((w) => w.length >= 2);
  for (const w of words) if (text.includes(w)) s += 2;
  return s;
}

// ── 方案 A：现有窗口注入（从记忆取，未决靠记忆窗口） ────────
function existingWindowInjection(pool) {
  const { shortPool, middlePool, longPool } = pool;
  const take = (arr, n) => arr.slice(-n).reverse();
  const inject = [];
  inject.push(...take(shortPool, SHORT_WINDOW).map((e) => ({ ...e, layer: '短期' })));
  inject.push(...take(middlePool, MIDDLE_WINDOW).map((e) => ({ ...e, layer: '中期' })));
  inject.push(...take(longPool, LONG_WINDOW).map((e) => ({ ...e, layer: '长期' })));
  return inject;
}

// ── 方案 B：去芜存菁（结构化未决 100% + 记忆相关性过滤） ───
function smartInjection(pool, ctx, registry) {
  const { shortPool, middlePool, longPool } = pool;
  const out = [];
  const seen = new Set();
  function similar(a, b) { return a.includes(b) || b.includes(a); }

  // ① 结构化未决：全部入选（来源 NPC账本/剧情节点，稳定存在）
  for (const p of registry) {
    out.push({ turn: p.turn, content: p.content, layer: '未决', source: p.source, reason: '未决常驻' });
  }

  // ② 记忆相关性过滤：只注入与当前上下文相关的（剔除无关流水账）
  function consider(entry, layer) {
    const s = scoreEntry(entry, ctx);
    if (s > 0 && !seen.has(entry.content)) {
      seen.add(entry.content);
      out.push({ ...entry, layer, reason: `相关(${s})` });
    }
  }
  shortPool.slice(-SHORT_WINDOW).forEach((e) => consider(e, '短期'));
  middlePool.slice(-MIDDLE_WINDOW).forEach((e) => consider(e, '中期'));
  longPool.slice(-LONG_WINDOW).forEach((e) => consider(e, '长期'));

  // ③ 保底：若相关性无命中，保留最近几条中期/短期，避免空
  if (out.filter((e) => e.reason.startsWith('相关')).length === 0) {
    [...shortPool.slice(-2), ...middlePool.slice(-2)].forEach((e) => {
      if (!out.some((x) => x.content === e.content)) out.push({ ...e, layer: '保底', reason: '保底' });
    });
  }
  return out;
}

// ── token 估算 ──────────────────────────────────────────────
const estTokens = (arr) => Math.round(arr.reduce((s, e) => s + e.content.length + 8, 0) / 1.5);

// ── 主流程 ──────────────────────────────────────────────────
const pool = buildMemoryPool(TOTAL_TURNS);
const injectA = existingWindowInjection(pool);
const injectB = smartInjection(pool, CONTEXT, PENDING_REGISTRY);

// 方案 A 的未决命中：靠记忆窗口里能否捞到注册表对应的早期未决
const pendingInA = PENDING_REGISTRY.filter((p) =>
  injectA.some((e) => e.content.includes(p.content.slice(0, 8)) || p.content.includes(e.content.slice(0, 8))),
);

console.log('═══ 记忆去芜存菁 · 可行性测试 v2 ═══');
console.log(`模拟回合: ${TOTAL_TURNS} | 记忆池 短${pool.shortPool.length}/中${pool.middlePool.length}/长${pool.longPool.length}`);
console.log(`结构化未决注册表: ${PENDING_REGISTRY.length} 条（NPC账本 ${PENDING_REGISTRY.filter((p) => p.source === 'NPC账本').length} + 剧情节点 ${PENDING_REGISTRY.filter((p) => p.source === '剧情节点').length}）`);
console.log(`当前上下文: "${CONTEXT.input}" / ${CONTEXT.location} / ${CONTEXT.npc}\n`);

console.log('── 方案 A：现有窗口注入（短12/中10/长12，未决靠记忆窗口）──');
console.log(`注入 ${injectA.length} 条 | 约 ${estTokens(injectA)} token`);
console.log(`早期未决召回: ${pendingInA.length}/${PENDING_REGISTRY.length}`);
console.log(`注入内容: ${injectA.slice(0, 4).map((e) => `[${e.layer}]${e.content.slice(0, 12)}`).join(' | ')}...\n`);

console.log('── 方案 B：去芜存菁（结构化未决 + 记忆相关性过滤）──');
const bPending = injectB.filter((e) => e.reason === '未决常驻');
const bRelated = injectB.filter((e) => e.reason.startsWith('相关'));
const bFallback = injectB.filter((e) => e.reason === '保底');
console.log(`注入 ${injectB.length} 条 | 约 ${estTokens(injectB)} token`);
console.log(`未决常驻块: ${bPending.length}/${PENDING_REGISTRY.length} 条（${estTokens(bPending)} token）`);
console.log(`记忆相关性补充: ${bRelated.length} 条${bFallback.length ? `（保底 ${bFallback.length}）` : ''}`);
console.log(`早期未决召回: ${bPending.length}/${PENDING_REGISTRY.length}（100%，来自结构化数据）`);

console.log('\n── 对比 ──');
const saved = estTokens(injectA) - estTokens(injectB);
console.log(`token: ${estTokens(injectA)} → ${estTokens(injectB)}（${saved >= 0 ? '省' : '增'} ${Math.abs(saved)}，${(Math.abs(saved) / estTokens(injectA) * 100).toFixed(0)}%）`);
console.log(`未决召回: A ${pendingInA.length}/${PENDING_REGISTRY.length} vs B ${bPending.length}/${PENDING_REGISTRY.length}`);
console.log(`去冗余: B 剔除了 ${injectA.length - injectB.length} 条无关流水账/重复`);
console.log(`\n常驻未决块体量: ${estTokens(bPending)} token/回合（<1000，可接受）`);
