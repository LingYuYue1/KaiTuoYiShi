// 在场判定「新方案：系统在场记录 + 行为/提及消歧」可行性测试（40 回合）
// 对比三模式（全部模拟，召回链路用生产 retrieveZhikuContext 验证）：
//   now = 现状（同行变量 + 静态场景人物）
//   A   = 方案A（正文点名 && 最近回合 >= turn-1）——真实系统行为：回忆点名也会刷最近回合
//   NEW = 新方案：结算时正文扫描 + 三词表消歧（在场/提及/否定）→ 最近在场回合，
//         参与判定 present = 同行 || 场景 || 最近在场回合 >= turn-1
// 新增场景：回忆点名用提及词句式（想起/收到）；否定点名（X 没有出现）；路人角色（extra 阶位）
// 用法：node scripts/zhiku-presence-scheme-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = process.cwd();
const bundlePath = path.join(os.tmpdir(), `zhiku-presence-scheme-${process.pid}-${Date.now()}.mjs`);

await build({
  stdin: {
    contents: [
      "export * from './models/zhiku';",
      "export * from './services/zhikuRetrieval';",
      "export * from './hooks/useGame/historyWindow';",
    ].join('\n'),
    resolveDir: root,
    sourcefile: 'zhiku-presence-scheme-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: bundlePath,
  logLevel: 'silent',
  tsconfig: path.join(root, 'tsconfig.json'),
});

const api = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);
const { 获取智库显式触发词, 归一化智库系统, retrieveZhikuContext, buildZhikuKeywordRecallQuery, buildImmediateStoryReview } = api;

// ============ 消歧词表（新方案核心） ============
// 名字出现后按优先级判定：否定 > 提及 > 在场 > 无词保守不记录
const NEGATION_WORDS = ['没有出现', '没出现', '不在', '缺席', '没来', '未到', '未曾', '不在场', '没露面', '不见踪影', '没有来', '未曾露面'];
const MENTION_WORDS = ['想起', '记得', '回忆', '收到', '消息', '回信', '来信', '照片', '信中', '说过', '提到', '提及', '谈起', '梦见', '听说', '曾经', '往日', '画像', '肖像', '念叨', '怀念', '遗物', '纪念', '短信', '语音'];
const PRESENT_WORDS = ['说', '道', '站', '走', '看', '笑', '点头', '开口', '举起', '转身', '回头', '抬头', '伸手', '坐下', '起身', '望着', '盯着', '问', '答', '喊', '叫', '指', '拿', '放', '递', '抱', '拍', '迎', '带', '领', '陪', '跟', '注视', '靠近', '离开', '走进', '走出', '出现', '站在', '走向', '看着', '说道', '回应', '开口说', '插话', '沉默'];

// 判定名字在本回合文本里的语义（取名字后 24 字窗口）
function classifyAppearance(text, name) {
  const idx = text.indexOf(name);
  if (idx < 0) return 'absent';
  const window = text.slice(idx + name.length, idx + name.length + 24);
  if (NEGATION_WORDS.some((w) => window.includes(w) || text.slice(Math.max(0, idx - 8), idx).includes('没有'))) return 'absent';
  if (MENTION_WORDS.some((w) => window.includes(w))) return 'mention';
  if (PRESENT_WORDS.some((w) => window.includes(w))) return 'present';
  return 'none';
}

// ============ 剧本 ============
const STAGES = [
  { from: 1, to: 8, location: '贝洛伯格·下层区', named: ['希儿'], silent: ['娜塔莎'], travelWith: ['希儿'] },
  { from: 9, to: 16, location: '贝洛伯格·上层区', named: ['布洛妮娅'], silent: ['杰帕德'], travelWith: [] },
  { from: 17, to: 24, location: '星穹列车', named: ['三月七'], silent: ['姬子'], travelWith: ['三月七'] },
  { from: 25, to: 32, location: '仙舟·罗浮', named: ['符玄'], silent: ['青雀', '景元'], travelWith: ['符玄'] },
  { from: 33, to: 40, location: '匹诺康尼', named: ['流萤'], silent: ['砂金'], travelWith: [] },
];
const ALL_CHARACTERS = ['希儿', '娜塔莎', '布洛妮娅', '杰帕德', '三月七', '姬子', '符玄', '青雀', '景元', '流萤', '砂金', '丹恒'];
// 路人角色（extra 阶位）：正文出现也不会有同行记忆/最近回合更新（现状信号失效）
const EXTRA_CHARACTERS = new Set(['娜塔莎', '杰帕德', '砂金']);

// 回忆点名（提及词句式——真实 AI 正文）；否定点名（明确不在场）；通讯；路人点名（extra 角色在场）
const SPECIAL_EVENTS = [
  { turn: 6, name: '娜塔莎', kind: 'present', text: '娜塔莎端着药箱走过来，替伤员包扎伤口。' },
  { turn: 10, name: '希儿', kind: 'mention', text: '你想起希儿说过的话，心里有些感慨。' },
  { turn: 15, name: '三月七', kind: 'negation', text: '三月七没有出现，你四处张望也没找到她。' },
  { turn: 20, name: '丹恒', kind: 'mention', text: '你收到丹恒的短信，他说一切安好。' },
  { turn: 30, name: '三月七', kind: 'mention', text: '你翻看三月七拍的照片，回忆着列车上的日子。' },
];

// ============ 参与判定（参数化） ============
// npcs 带 最近回合（现状信号）与 最近在场回合（新方案信号，由结算模拟维护）
function simulateParticipation({ npcs, world, history, userInput, turnCount, settings }, mode) {
  const sceneNames = new Set((world.当前时段?.人物 ?? []).map((n) => n.姓名.trim()).filter(Boolean));
  const currentText = userInput ?? '';
  const reviewTurns = Math.max(2, Math.trunc((settings?.即时转短期阈值 ?? 10) - 1) || 9);
  const recentText = history.slice(-reviewTurns * 2).map((m) => m.parsedResponse?.body || m.content).join('\n');
  const present = [];
  const mentioned = [];
  const background = [];
  const appearsInText = (npc) =>
    (npc.姓名 && (currentText.includes(npc.姓名) || recentText.includes(npc.姓名)))
    || (npc.别名 && (currentText.includes(npc.别名) || recentText.includes(npc.别名)));

  for (const npc of npcs) {
    const inScene = sceneNames.has(npc.姓名) || Boolean(npc.别名 && sceneNames.has(npc.别名));
    const textAppears = appearsInText(npc);
    let presentEvidence;
    if (mode === 'now') {
      presentEvidence = npc.同行 || inScene;
    } else if (mode === 'A') {
      // 方案A：正文点名 && 最近回合（互动记录）>= turn-1；真实系统行为下回忆点名也会刷最近回合
      presentEvidence = npc.同行 || inScene || (textAppears && Number(npc.最近回合 || 0) >= turnCount - 1);
    } else {
      // 新方案：同行 || 场景 || 最近在场回合（系统维护）>= turn-1
      presentEvidence = npc.同行 || inScene || Number(npc.最近在场回合 || 0) >= turnCount - 1;
    }
    if (presentEvidence) { if (!present.some((x) => x === npc.姓名)) present.push(npc.姓名); continue; }
    if (textAppears) { if (!mentioned.some((x) => x === npc.姓名)) mentioned.push(npc.姓名); continue; }
    if (Number(npc.最近回合 || 0) >= Math.max(1, turnCount - 3)) { if (!background.some((x) => x === npc.姓名)) background.push(npc.姓名); }
  }
  for (const name of sceneNames) if (!present.some((x) => x === name)) present.push(name);
  return { present, mentioned, background };
}

// ============ 数据准备 ============
const presetFiles = fs.readdirSync(path.join(root, 'public/zhiku-presets'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(root, 'public/zhiku-presets', f), 'utf8')));
const allEntries = presetFiles.flatMap((preset) => preset.entries ?? preset.条目 ?? []);
const system = 归一化智库系统({ 条目: allEntries });

const world = { 当前时段: { 人物: [] }, 原著主角: '星' };
const npcs = ALL_CHARACTERS.map((name) => ({
  id: `npc_${name}`,
  姓名: name,
  同行: false,
  最近回合: 0,
  最近在场回合: 0,
  阶位: EXTRA_CHARACTERS.has(name) ? 'extra' : 'companion',
  归档: false,
}));
const settings = { 即时转短期阈值: 10 };

// ============ 统计 ============
const stats = {
  now: { presentCover: 0, presentTotal: 0, misjudge: [] },
  A: { presentCover: 0, presentTotal: 0, misjudge: [] },
  NEW: { presentCover: 0, presentTotal: 0, misjudge: [], extraPresent: 0, extraTotal: 0 },
  recallMiss: [],
};
const history = [];
const turnSnapshots = [];

for (let turn = 1; turn <= 40; turn++) {
  const stage = STAGES.find((s) => turn >= s.from && turn <= s.to);
  const namedOnStage = stage ? stage.named : [];
  const silentOnStage = stage ? stage.silent : [];
  const onStage = [...namedOnStage, ...silentOnStage];
  const special = SPECIAL_EVENTS.find((e) => e.turn === turn);

  // 系统维护（真实行为）：在场角色 最近回合 = 本回合（同行记忆追加），回忆点名也会刷（companion）
  for (const name of onStage) {
    const npc = npcs.find((n) => n.姓名 === name);
    if (npc) npc.最近回合 = turn;
  }
  // 模型行为：只对 travelWith 写同行
  for (const npc of npcs) npc.同行 = stage ? stage.travelWith.includes(npc.姓名) : false;

  // 正文构造：named 点名（在场词句式），silent 用「她/他」；特殊事件用指定句式
  let body = `${stage?.location ?? '旅途中'}。`;
  for (const name of namedOnStage) body += `${name}出现在前方，笑着向你走来。`;
  for (const _ of silentOnStage) body += '那个同行者安静地跟在旁边。';
  if (special) body += special.text;

  const userInput = '我们继续前进。';
  history.push({ id: `u${turn}`, role: 'user', content: userInput, parsedResponse: undefined, gameTime: `第${turn}日` });
  history.push({ id: `a${turn}`, role: 'assistant', content: '正文内容', parsedResponse: { body }, gameTime: `第${turn}日` });

  // ===== 新方案：回合结算在场记录（正文扫描 + 消歧） =====
  // 真实行为模拟：正文出现名字 → 回忆点名也刷「最近回合」（方案A的污染源）
  const scanText = `${userInput}\n${body}`;
  for (const npc of npcs) {
    if (!scanText.includes(npc.姓名)) continue;
    // 方案A 依赖的「最近回合」：回忆点名也会触发同行记忆追加（companion 角色）
    const isCompanion = npc.阶位 === 'companion' || npc.同行;
    if (isCompanion && turn - Number(npc.最近回合 || 0) <= 4) npc.最近回合 = turn;
    // 新方案的「最近在场回合」：消歧后才记录
    const kind = classifyAppearance(scanText, npc.姓名);
    if (kind === 'present') npc.最近在场回合 = turn;
  }

  const input = { npcs, world, history, userInput, turnCount: turn, settings };
  const pNow = simulateParticipation(input, 'now');
  const pA = simulateParticipation(input, 'A');
  const pNew = simulateParticipation(input, 'NEW');
  turnSnapshots.push({ turn, onStage, namedOnStage, silentOnStage, special: special?.text, parties: { now: pNow, A: pA, NEW: pNew } });

  for (const mode of ['now', 'A', 'NEW']) {
    const p = { now: pNow, A: pA, NEW: pNew }[mode];
    const st = stats[mode];
    const presentCovered = onStage.filter((n) => p.present.includes(n));
    st.presentCover += presentCovered.length;
    st.presentTotal += onStage.length;
    if (mode === 'NEW') {
      st.extraPresent += onStage.filter((n) => EXTRA_CHARACTERS.has(n) && p.present.includes(n)).length;
      st.extraTotal += onStage.filter((n) => EXTRA_CHARACTERS.has(n)).length;
    }
    // 误判：特殊事件角色（回忆/否定/通讯）被判 present——这是消歧的核心验证
    if (special && special.kind !== 'present') {
      const npc = npcs.find((n) => n.姓名 === special.name);
      const lastOn = npc && !onStage.includes(special.name);
      if (lastOn && p.present.includes(special.name)) st.misjudge.push(`t${turn}:${special.name}`);
    }
  }

  // 每 5 回合跑真实关键词召回（新方案名单）
  if (turn % 5 === 0) {
    const query = buildZhikuKeywordRecallQuery({ userInput, history, immediateStoryReview: buildImmediateStoryReview(history, 9) });
    const recall = retrieveZhikuContext(system, query, 5, { presentNpcNamesForFallback: pNew.present, mentionedNpcNames: pNew.mentioned, originalProtagonist: '星' });
    const entryHit = (name) => recall.entries.some((e) => 获取智库显式触发词(e).includes(name));
    for (const name of onStage) {
      if (!entryHit(name)) stats.recallMiss.push(`t${turn}:${name}`);
    }
  }
}
// ============ 输出 ============
console.log('===== 在场判定对比（40 回合，真实系统行为模拟） =====');
for (const mode of ['now', 'A', 'NEW']) {
  const st = stats[mode];
  console.log(`${mode === 'now' ? '现状' : mode === 'A' ? '方案A(真实行为)' : '新方案(在场记录+消歧)'}: present 覆盖 ${st.presentCover}/${st.presentTotal} (${(st.presentCover / st.presentTotal * 100).toFixed(1)}%), 误判 ${st.misjudge.length} 次 ${st.misjudge.slice(0, 6).join(' ') || ''}`);
}
const extra = stats.NEW;
console.log(`新方案 路人角色(extra)在场覆盖: ${extra.extraPresent}/${extra.extraTotal}（娜塔莎/杰帕德/砂金正文点名但模型不会写同行）`);
console.log('\n===== 关键回合 =====');
for (const snap of turnSnapshots.filter((s) => [8, 10, 15, 20, 24, 30, 40].includes(s.turn))) {
  console.log(`t${snap.turn} 在场=[${snap.onStage.join('/')}]${snap.special ? ` 特殊:${snap.special}` : ''}`);
  console.log(`  现状: present=[${snap.parties.now.present}] mentioned=[${snap.parties.now.mentioned}]`);
  console.log(`  方案A: present=[${snap.parties.A.present}]`);
  console.log(`  新方案: present=[${snap.parties.NEW.present}] mentioned=[${snap.parties.NEW.mentioned}]`);
}

fs.rmSync(bundlePath, { force: true });
console.log('\n测试完成');
