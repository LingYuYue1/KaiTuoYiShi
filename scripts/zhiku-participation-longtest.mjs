// 智智库在场参与判定「方案 A / A+B」可行性测试：40 回合五阶段剧本
// 生产代码未落地：方案逻辑在 simulateParticipation 中参数化模拟（与生产 npcPresence 同构），
// 召回链路用生产 retrieveZhikuContext 真实验证。
//   now = 现状（同行变量 + 场景人物）
//   A   = 方案A：正文点名 && 最近1回合互动 → present
//   AB  = 方案A + 方案B：background 并入兜底名单（merged 直塞 presentNpcNamesForFallback 的最小改动形态，
//         同时监控注入分组污染——证明必须用独立名单）
// 用法：node scripts/zhiku-participation-longtest.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = process.cwd();
const bundlePath = path.join(os.tmpdir(), `zhiku-participation-longtest-${process.pid}-${Date.now()}.mjs`);

await build({
  stdin: {
    contents: [
      "export * from './models/zhiku';",
      "export * from './services/zhikuRetrieval';",
      "export * from './hooks/useGame/historyWindow';",
    ].join('\n'),
    resolveDir: root,
    sourcefile: 'zhiku-participation-longtest-entry.ts',
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

// ============ 剧本 ============
// named = 正文点名；silent = 在场但正文不点名（模型写不全的痛点）；travelWith = 模型写了同行的
const STAGES = [
  { from: 1, to: 8, location: '贝洛伯格·下层区', named: ['希儿'], silent: ['娜塔莎'], travelWith: ['希儿'] },
  { from: 9, to: 16, location: '贝洛伯格·上层区', named: ['布洛妮娅'], silent: ['杰帕德'], travelWith: [] },
  { from: 17, to: 24, location: '星穹列车', named: ['三月七'], silent: ['姬子'], travelWith: ['三月七'] },
  { from: 25, to: 32, location: '仙舟·罗浮', named: ['符玄'], silent: ['青雀', '景元'], travelWith: ['符玄'] },
  { from: 33, to: 40, location: '匹诺康尼', named: ['流萤'], silent: ['砂金'], travelWith: [] },
];
const ALL_CHARACTERS = ['希儿', '娜塔莎', '布洛妮娅', '杰帕德', '三月七', '姬子', '符玄', '青雀', '景元', '流萤', '砂金', '丹恒'];

// 回忆事件：正文点名但离场已久 → 不应 present
const RECALL_EVENTS = [
  { turn: 10, name: '希儿', note: '回忆下层区往事' },       // 希儿 t8 离场，最近回合=8 → turn-1=9 不满足
  { turn: 20, name: '丹恒', note: '收到丹恒的短信' },       // 通讯提及，丹恒从未在场
  { turn: 30, name: '三月七', note: '想起三月七拍的照片' },   // 三月七 t24 离场
];

// ============ 参与判定（与生产 npcPresence 同构，方案参数化） ============
function simulateParticipation({ npcs, world, history, userInput, turnCount, settings }, mode) {
  const sceneNames = new Set((world.当前时段?.人物 ?? []).map((n) => n.姓名.trim()).filter(Boolean));
  const currentText = userInput ?? '';
  const reviewTurns = Math.max(2, Math.trunc((settings?.即时转短期阈值 ?? 10) - 1) || 9);
  const recentText = history.slice(-reviewTurns * 2).map((m) => m.parsedResponse?.body || m.content).join('\n');
  const recentCutoff = Math.max(1, turnCount - 3);
  const present = [];
  const mentioned = [];
  const background = [];

  const appearsInText = (npc) =>
    (npc.姓名 && (currentText.includes(npc.姓名) || recentText.includes(npc.姓名)))
    || (npc.别名 && (currentText.includes(npc.别名) || recentText.includes(npc.别名)));

  for (const npc of npcs) {
    const inScene = sceneNames.has(npc.姓名) || Boolean(npc.别名 && sceneNames.has(npc.别名));
    const textAppears = appearsInText(npc);
    // 方案 A：正文点名 && 最近 1 回合内系统互动 → 在场
    const bodyEvidence = mode === 'now' ? false : (textAppears && Number(npc.最近回合 || 0) >= turnCount - 1);
    const isPresent = npc.同行 || inScene || bodyEvidence;
    if (isPresent) { if (!present.some((x) => x === npc.姓名)) present.push(npc.姓名); continue; }
    if (textAppears) { if (!mentioned.some((x) => x === npc.姓名)) mentioned.push(npc.姓名); continue; }
    if (Number(npc.最近回合 || 0) >= recentCutoff) { if (!background.some((x) => x === npc.姓名)) background.push(npc.姓名); }
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
  阶位: 'companion',
  归档: false,
}));
const settings = { 即时转短期阈值: 10 };

// ============ 统计 ============
const stats = {
  now: { presentCover: 0, presentTotal: 0, misjudge: [] },
  A: { presentCover: 0, presentTotal: 0, misjudge: [] },
  AB: { presentCover: 0, presentTotal: 0, misjudge: [] },
  recall: { nowAll: 0, abAll: 0, allTotal: 0, silentInCamera: 0, missList: [] },
};
const history = [];
const turnSnapshots = [];

for (let turn = 1; turn <= 40; turn++) {
  const stage = STAGES.find((s) => turn >= s.from && turn <= s.to);
  const namedOnStage = stage ? stage.named : [];
  const silentOnStage = stage ? stage.silent : [];
  const onStage = [...namedOnStage, ...silentOnStage];

  // 系统维护：在场角色（含 silent）最近回合 = 本回合
  for (const name of onStage) {
    const npc = npcs.find((n) => n.姓名 === name);
    if (npc) npc.最近回合 = turn;
  }
  // 模型行为：只对 travelWith 写同行
  for (const npc of npcs) npc.同行 = stage ? stage.travelWith.includes(npc.姓名) : false;

  // 正文：named 点名，silent 用「她/他」指代
  let body = `${stage?.location ?? '旅途中'}。`;
  for (const name of namedOnStage) body += `${name}的身影出现在前方，向你走来。`;
  for (const _ of silentOnStage) body += '那个同行者安静地跟在旁边。';
  const recall = RECALL_EVENTS.find((e) => e.turn === turn);
  if (recall) body += `${recall.note}：${recall.name}的话还回荡在耳边。`;

  const userInput = '我们继续前进。';
  history.push({ id: `u${turn}`, role: 'user', content: userInput, parsedResponse: undefined, gameTime: `第${turn}日` });
  history.push({ id: `a${turn}`, role: 'assistant', content: '正文内容', parsedResponse: { body }, gameTime: `第${turn}日` });

  const input = { npcs, world, history, userInput, turnCount: turn, settings };
  const pNow = simulateParticipation(input, 'now');
  const pA = simulateParticipation(input, 'A');
  const pAB = simulateParticipation(input, 'AB');
  const parties = { now: pNow, A: pA, AB: pAB };
  turnSnapshots.push({ turn, onStage, namedOnStage, silentOnStage, recall: recall?.name, parties });

  for (const mode of ['now', 'A', 'AB']) {
    const p = parties[mode];
    const st = stats[mode];
    const presentCovered = onStage.filter((n) => p.present.includes(n));
    st.presentCover += presentCovered.length;
    st.presentTotal += onStage.length;
    // 误判：明确不在场（离场 >1 回合或回忆点名）却被标 present
    for (const name of p.present) {
      const npc = npcs.find((n) => n.姓名 === name);
      if (!npc) continue;
      const isOn = onStage.includes(name);
      if (!isOn) {
        const recallEvent = RECALL_EVENTS.find((e) => e.turn === turn && e.name === name);
        const clearlyAway = recallEvent || npc.最近回合 < turn - 1;
        if (clearlyAway) st.misjudge.push(`t${turn}:${name}`);
      }
    }
  }

  // 每 5 回合跑真实关键词召回（关键词 only 模式）
  if (turn % 5 === 0) {
    const query = buildZhikuKeywordRecallQuery({ userInput, history, immediateStoryReview: buildImmediateStoryReview(history, 9) });
    const nowRecall = retrieveZhikuContext(system, query, 5, { presentNpcNamesForFallback: pNow.present, mentionedNpcNames: pNow.mentioned, originalProtagonist: '星' });
    // 方案B 最小改动形态：merged 直塞 presentNpcNamesForFallback（监控注入污染）
    const mergedNames = [...pAB.present, ...pAB.background];
    const abRecall = retrieveZhikuContext(system, query, 5, { presentNpcNamesForFallback: mergedNames, mentionedNpcNames: pAB.mentioned, originalProtagonist: '星' });
    const entryHit = (recall, name) => recall.entries.some((e) => 获取智库显式触发词(e).includes(name));
    for (const name of onStage) {
      stats.recall.allTotal++;
      if (entryHit(nowRecall, name)) stats.recall.nowAll++;
      if (entryHit(abRecall, name)) stats.recall.abAll++;
      if (!entryHit(abRecall, name)) stats.recall.missList.push(`t${turn}:${name}`);
    }
    // 注入分组污染：silent 角色（仅 background）档案是否被标进「正在镜头里」
    for (const name of silentOnStage) {
      if (entryHit(abRecall, name) && abRecall.injection.includes(`【人物：${name}】`)) {
        const cameraGroupEnd = abRecall.injection.indexOf('尚未到场的人物档案');
        const inCamera = cameraGroupEnd === -1
          ? abRecall.injection.includes(`【人物：${name}】`)
          : abRecall.injection.slice(0, cameraGroupEnd).includes(`【人物：${name}】`);
        if (inCamera) stats.recall.silentInCamera++;
      }
    }
  }
}

// ============ 输出 ============
console.log('===== 参与判定 present 覆盖（在场角色进 present 的比例） =====');
for (const mode of ['now', 'A', 'AB']) {
  const st = stats[mode];
  console.log(`${mode === 'now' ? '现状' : `方案${mode}`}: ${st.presentCover}/${st.presentTotal} (${(st.presentCover / st.presentTotal * 100).toFixed(1)}%), 误判 ${st.misjudge.length} 次${st.misjudge.length ? ' [' + st.misjudge.slice(0, 6).join(' ') + ']' : ''}`);
}
console.log('\n===== 关键词召回（每5回合实测，关键词 only 模式） =====');
console.log(`现状: ${stats.recall.nowAll}/${stats.recall.allTotal} 在场角色档案`);
console.log(`A+B: ${stats.recall.abAll}/${stats.recall.allTotal} 在场角色档案`);
console.log(`A+B 仍漏: ${stats.recall.missList.join(' ') || '无'}`);
console.log(`A+B 中 silent 角色档案被标「正在镜头里」: ${stats.recall.silentInCamera} 次（merged 直塞的污染监控，>0 说明需独立名单）`);
console.log('\n===== 关键回合明细 =====');
for (const snap of turnSnapshots.filter((s) => [8, 10, 16, 20, 24, 30, 32, 40].includes(s.turn))) {
  const pNow = snap.parties.now;
  const pA = snap.parties.A;
  const pAB = snap.parties.AB;
  console.log(`t${snap.turn} 在场=[${snap.onStage.join('/')}]${snap.recall ? ` 回忆=${snap.recall}` : ''}`);
  console.log(`  现状: present=[${pNow.present}] mentioned=[${pNow.mentioned}] bg=[${pNow.background}]`);
  console.log(`  方案A: present=[${pA.present}] mentioned=[${pA.mentioned}]`);
  console.log(`  方案AB: present=[${pAB.present}] bg=[${pAB.background}]`);
}

fs.rmSync(bundlePath, { force: true });
console.log('\n测试完成');
