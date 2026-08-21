import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const outfile = path.join(root, '.tmp', 'companion-npc-triage-regression.mjs');
fs.mkdirSync(path.dirname(outfile), { recursive: true });

await build({
  stdin: {
    contents: `
      export { 归一化NPC记录列表, NPC记录有内容, 是NPC泛称姓名, 筛选活跃NPC, buildNpcMemoryLedgerView } from './models/npc.ts';
      export { matchCanonical } from './data/canonicalCharacters.ts';
      export { factsToVariableCommands } from './utils/variableFacts.ts';
      export { enrichNpcArchives } from './utils/npcArchiveEnrichment.ts';
      export { buildPhoneMessages, visiblePhoneSeed } from './services/ai/phoneService.ts';
    `,
    resolveDir: root,
    sourcefile: 'companion-npc-triage-regression-entry.ts',
    loader: 'ts',
  },
  alias: { '@': root },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile,
  logLevel: 'silent',
});

try {
  const runtime = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  const baseState = (npcs) => ({ NPC: npcs, 世界: { 当前时间: '08:00', 当前日期: '1-1', 开拓天数: 1 }, 手机: undefined });
  const npc = (patch = {}) => ({
    id: 'npc-1', 姓名: '张三', 阶位: 'extra', 好感度: 0, 关系: 'stranger', 同行: false,
    初见回合: 1, 最近回合: 1, 备注: [], ...patch,
  });

  assert.equal(runtime.是NPC泛称姓名('女科员'), true);
  assert.equal(runtime.是NPC泛称姓名('张三'), false);

  // ── 智库人物档案名称必须参与 canonical 识别，敌对档案不自动晋升 ──
  for (const [input, expected] of [
    ['布洛妮娅', '布洛妮娅'],
    ['卡芙卡', '卡芙卡'],
    ['彦卿', '彦卿'],
    ['大黑塔', '黑塔'],
    ['忘归人', '停云'],
    ['杨叔', '瓦尔特'],
  ]) {
    assert.equal(runtime.matchCanonical(input)?.name, expected, `智库角色名「${input}」必须识别为 ${expected}`);
  }
  assert.equal(runtime.matchCanonical('归寂'), null, '敌对生物档案不得作为普通 canonical 伙伴身份');

  const singleMemory = runtime.factsToVariableCommands([
    { type: 'npc', name: '张三', memory: '张三替玩家指路。' },
  ], baseState([]), 1);
  assert.equal(singleMemory.commands.find((item) => item.key === 'NPC')?.value?.阶位, 'extra');

  const recentOnly = runtime.factsToVariableCommands([
    { type: 'npc', name: '李四', recentInteraction: '李四与玩家短暂交谈。' },
  ], baseState([]), 1);
  assert.equal(recentOnly.commands.find((item) => item.key === 'NPC')?.value?.阶位, 'extra');

  const affinityOnly = runtime.factsToVariableCommands([
    { type: 'npc', name: '王五', affinityDelta: 20 },
  ], baseState([]), 1);
  assert.equal(affinityOnly.commands.find((item) => item.key === 'NPC')?.value?.阶位, 'extra');

  for (const [label, fact] of [
    ['explicit tier', { type: 'npc', name: '赵六', tier: 'companion' }],
    ['following', { type: 'npc', name: '孙七', following: true }],
    ['non-stranger relation', { type: 'npc', name: '周八', relation: 'friend' }],
  ]) {
    const result = runtime.factsToVariableCommands([fact], baseState([]), 1);
    assert.equal(result.commands.find((item) => item.key === 'NPC')?.value?.阶位, 'companion', `${label} 应直接成为伙伴`);
  }

  const generic = runtime.factsToVariableCommands([
    { type: 'npc', name: '女科员', job: '科员', memory: '她递来一份文件。' },
  ], baseState([]), 1);
  assert.equal(generic.commands.length, 0);
  assert.match(generic.warnings.join('\n'), /泛称/);

  const threshold = runtime.factsToVariableCommands([
    { type: 'npc', id: 'npc-1', name: '张三', affinityDelta: 20, recentInteraction: '第二次见面' },
  ], baseState([npc({ 累计互动次数: 1 })]), 2);
  assert.ok(threshold.commands.some((item) => item.key.endsWith('.阶位') && item.value === 'companion'));

  const belowAffinity = runtime.factsToVariableCommands([
    { type: 'npc', id: 'npc-1', name: '张三', affinitySet: 19, recentInteraction: '又一次见面' },
  ], baseState([npc({ 累计互动次数: 1 })]), 2);
  assert.equal(belowAffinity.commands.some((item) => item.key.endsWith('.阶位') && item.value === 'companion'), false);

  const oneInteraction = runtime.factsToVariableCommands([
    { type: 'npc', id: 'npc-1', name: '张三', affinitySet: 20, recentInteraction: '只发生过一次有效互动。' },
  ], baseState([npc({ 累计互动次数: 0 })]), 2);
  assert.equal(oneInteraction.commands.some((item) => item.key.endsWith('.阶位') && item.value === 'companion'), false);

  const manual = runtime.factsToVariableCommands([
    { type: 'npc', id: 'npc-1', name: '张三', affinitySet: 120, recentInteraction: '继续同行' },
  ], baseState([npc({ 阶位: 'extra', 手动阶位覆盖: 'extra', 累计互动次数: 8 })]), 10);
  assert.ok(manual.commands.some((item) => item.key.endsWith('.阶位') && item.value === 'extra'));

  const oldRecords = runtime.归一化NPC记录列表([
    npc({ 姓名: '店员', 阶位: 'companion', 最近回合: 1 }),
    npc({ id: 'npc-2', 姓名: '路人甲', 最近回合: 1, 同行记忆: ['曾经一起避雨'] }),
    npc({ id: 'npc-3', 姓名: '路人乙', 最近回合: 1 }),
  ], 40);
  assert.equal(oldRecords.find((item) => item.姓名 === '店员')?.阶位, 'extra');
  assert.equal(oldRecords.find((item) => item.姓名 === '路人甲')?.归档, false);
  assert.equal(oldRecords.find((item) => item.姓名 === '路人乙')?.归档, true);

  const agreementRecord = runtime.归一化NPC记录列表([
    npc({
      id: 'npc-4',
      姓名: '路人丙',
      最近回合: 1,
      约定: [{ id: 'agreement-1', 标题: '回传线索', 内容: '找到线索后通知对方。', 当前状态: '等待中', 回合: 1 }],
    }),
  ], 40)[0];
  assert.equal(agreementRecord.归档, false, '等待中的约定不得触发归档');

  const mergedGeneric = runtime.归一化NPC记录列表([
    npc({ id: 'generic-1', 姓名: '年轻女科员', 职务: '科员', 同行记忆: ['第一次交接文件。'] }),
    npc({ id: 'generic-2', 姓名: '干净女科员', 职务: '科员', 同行记忆: ['第二次在站台碰面。'] }),
  ]);
  assert.equal(mergedGeneric.length, 1, '同一核心职业泛称应合并为一条记录');
  assert.equal(mergedGeneric[0].同行记忆?.length, 2);
  assert.deepEqual(mergedGeneric[0].合并来源ID, ['generic-2'], '泛称合并必须保留被合并来源 ID');

  const mergedSameName = runtime.归一化NPC记录列表([
    npc({ id: 'same-1', 姓名: '张三', 同行记忆: ['第一次见面。'] }),
    npc({ id: 'same-2', 姓名: '张三', 同行记忆: ['第二次见面。'] }),
  ]);
  assert.equal(mergedSameName.length, 1, '完全同名记录应合并');
  assert.equal(mergedSameName[0].同行记忆?.length, 2);
  assert.deepEqual(mergedSameName[0].合并来源ID, ['same-2'], '同名合并必须保留被合并来源 ID');
  const manualNormalized = runtime.归一化NPC记录列表([
    npc({ id: 'manual-1', 阶位: 'companion', 手动阶位覆盖: 'extra', 阶位来源: 'manual' }),
  ]);
  assert.equal(manualNormalized[0].阶位, 'extra', '手动阶位覆盖必须优先于读档自动纠正');
  assert.equal(runtime.筛选活跃NPC([...oldRecords]).some((item) => item.归档), false, '归档记录不得进入活跃选择');

  const normalizedTwice = runtime.归一化NPC记录列表(runtime.归一化NPC记录列表(oldRecords, 40), 40);
  assert.deepEqual(normalizedTwice, oldRecords, '读档整理必须幂等');

  const customCompanion = runtime.enrichNpcArchives([
    npc({ id: 'npc-custom', 姓名: '陈老伯', 阶位: 'companion', 性别: '女', 原著角色: false }),
  ], { nsfwEnabled: true, maleNsfwArchiveEnabled: false }).records[0];
  assert.equal(customCompanion.NSFW档案?.enabled, true, '非原著但已成为伙伴的 NPC 仍应获得 NSFW 基线空壳');

  const archived = runtime.factsToVariableCommands([
    { type: 'npc', id: 'npc-3', name: '路人乙', recentInteraction: '再次遇见并交谈' },
  ], baseState([oldRecords.find((item) => item.id === 'npc-3')]), 41);
  assert.ok(archived.commands.some((item) => item.key.endsWith('.归档') && item.value === false));

  // ── 返修补齐：深层关系信号晋升 ──
  for (const [label, fact] of [
    ['longTermImpression', { type: 'npc', name: '钱九', longTermImpression: '是多次并肩的可靠旅伴。' }],
    ['relationshipStage', { type: 'npc', name: '孙十', relationshipStage: '挚友' }],
  ]) {
    const result = runtime.factsToVariableCommands([fact], baseState([]), 1);
    assert.equal(result.commands.find((item) => item.key === 'NPC')?.value?.阶位, 'companion', `${label} 应作为深层关系信号晋升伙伴`);
  }
  // 自定义关系描述写入账本；系统标准阶段仍由好感度派生。
  const stageWritten = runtime.factsToVariableCommands([
    { type: 'npc', id: 'npc-1', name: '张三', relationshipStage: '并肩调查中的可靠搭档' },
  ], baseState([npc({ 阶位: 'extra' })]), 2);
  assert.ok(stageWritten.commands.some((item) => item.key.endsWith('.当前关系阶段') && item.value === '并肩调查中的可靠搭档'));
  const stageRoundTrip = runtime.归一化NPC记录列表([
    npc({ id: 'stage-roundtrip', 姓名: '张三', 好感度: 20, 当前关系阶段: '并肩调查中的可靠搭档' }),
  ])[0];
  assert.equal(stageRoundTrip.当前关系阶段, '并肩调查中的可靠搭档', '剧情自定义关系描述归一化后必须保留');
  assert.equal(runtime.buildNpcMemoryLedgerView(stageRoundTrip).当前关系阶段, '并肩调查中的可靠搭档', '账本视图必须展示剧情自定义关系描述');
  const managedStageRoundTrip = runtime.归一化NPC记录列表([
    npc({ id: 'managed-stage-roundtrip', 姓名: '李四', 好感度: 20, 当前关系阶段: '知己' }),
  ])[0];
  assert.equal(managedStageRoundTrip.当前关系阶段, '熟识', '系统标准关系阶段必须按当前好感度重新派生');

  // ── 返修补齐：手动覆盖来源强制 manual ──
  const manualSource = runtime.归一化NPC记录列表([
    npc({ id: 'manual-src', 阶位: 'extra', 手动阶位覆盖: 'extra', 阶位来源: 'canonical' }),
  ]);
  assert.equal(manualSource[0].阶位来源, 'manual', '存在手动阶位覆盖时来源必须强制为 manual');

  // ── 返修补齐：canonical 旧记录缺 原著角色 标记时恢复为原著伙伴 ──
  const canonicalRestored = runtime.归一化NPC记录列表([
    npc({ id: 'canon-1', 姓名: '三月七', 阶位: 'extra', 原著角色: false }),
  ]);
  assert.equal(canonicalRestored[0].原著角色, true, 'canonical 匹配必须补齐原著角色标记');
  assert.equal(canonicalRestored[0].阶位, 'companion', 'canonical 旧记录不得被降为路人');

  // ── 手机先出现、主剧情尚未建档：完整原著角色清单仍必须进入伙伴 ──
  for (const [name, id] of [['布洛妮娅', 'canon_bronya'], ['杨叔', 'canon_welt']]) {
    const phoneOnlyCanonical = runtime.factsToVariableCommands([
      { type: 'npc', id, name, memory: `手机中与${name}建立了通讯。` },
    ], baseState([]), 2);
    const created = phoneOnlyCanonical.commands.find((item) => item.key === 'NPC')?.value;
    assert.equal(created?.阶位, 'companion', `手机先出现的原著角色 ${name} 不得落入路人`);
    assert.equal(created?.NPC来源, 'canonical', `手机先出现的原著角色 ${name} 必须标记 canonical`);
  }

  // ── 返修补齐：自定义 NPC 身份保护 ──
  // 自定义 companion 不因无 canonical 匹配而降级
  const customCompanionKeep = runtime.归一化NPC记录列表([
    npc({ id: 'custom-keep', 姓名: '陈阿明', 阶位: 'companion', 原著角色: false }),
  ], 60);
  assert.equal(customCompanionKeep[0].阶位, 'companion', '自定义伙伴不得因非原著身份被降级');
  // 自定义 extra 只在满足"超期 + 无内容"时归档
  const customExtraFresh = runtime.归一化NPC记录列表([
    npc({ id: 'custom-fresh', 姓名: '林小满', 阶位: 'extra', 最近回合: 58 }),
  ], 60);
  assert.equal(customExtraFresh[0].归档, false, '最近见过且无内容的自定义路人不归档');
  // 自定义 NPC 与 canonical 相似但身份不同，不得自动合并
  const customSimilar = runtime.归一化NPC记录列表([
    npc({ id: 'custom-sim-1', 姓名: '三月', 原著角色: false }),
    npc({ id: 'canon-sim-2', 姓名: '三月七', 原著角色: true }),
  ]);
  assert.equal(customSimilar.length, 2, '自定义 NPC 不得与 canonical 角色按相似姓名自动合并');
  assert.equal(customSimilar[0].阶位, 'extra', 'canonical alias 不得把自定义 NPC 晋升为伙伴');
  assert.equal(customSimilar[0].原著角色, false, 'canonical alias 不得把自定义 NPC 标成原著角色');
  assert.equal(customSimilar[0].NPC来源, 'custom', '自定义 NPC 必须保留 custom 来源');
  assert.equal(customSimilar[1].NPC来源, 'canonical', '规范名原著角色必须保留 canonical 来源');
  const enrichedCustomSimilar = runtime.enrichNpcArchives([customSimilar[0]], { nsfwEnabled: true, maleNsfwArchiveEnabled: false }).records[0];
  assert.equal(enrichedCustomSimilar.原著角色, false, '档案补全不得把自定义 canonical alias 改成原著角色');

  // 自定义 NPC 即使使用原著角色的规范名，也不能因后续互动被自动晋升。
  const customCanonicalUpdate = runtime.factsToVariableCommands([
    { type: 'npc', id: 'custom-bronya', name: '布洛妮娅', memory: '玩家自创角色与她有相同姓名。' },
  ], baseState([
    npc({ id: 'custom-bronya', 姓名: '布洛妮娅', 阶位: 'extra', 原著角色: false, NPC来源: 'custom' }),
  ]), 2);
  assert.equal(
    customCanonicalUpdate.commands.some((item) => item.key.endsWith('.阶位') && item.value === 'companion'),
    false,
    '自定义同名 NPC 后续互动不得被 canonical matcher 自动晋升',
  );

  // ── 返修补齐：完整泛称词表 ──
  for (const genericName of ['少女', '年轻人', '男孩', '女人', '女科员', '店员', '神秘人', '姑娘']) {
    assert.equal(runtime.是NPC泛称姓名(genericName), true, `「${genericName}」应判定为泛称不入档`);
  }
  assert.equal(runtime.是NPC泛称姓名('杰尼斯·威廉'), false, '正常外国名不是泛称');
  assert.equal(runtime.是NPC泛称姓名('李连杰'), false, '正常中文三字名不是泛称');

  // ── 返修补齐：同批次重复事实不重复计数 ──
  const dupFacts = runtime.factsToVariableCommands([
    { type: 'npc', id: 'npc-1', name: '张三', recentInteraction: '第一次交谈。' },
    { type: 'npc', id: 'npc-1', name: '张三', recentInteraction: '又交谈了一句。' },
  ], baseState([npc({ 累计互动次数: 0 })]), 2);
  const interactionAdds = dupFacts.commands.filter((item) => item.key.endsWith('.累计互动次数') && item.action === 'add');
  assert.equal(interactionAdds.length, 1, '同一事实批次内同一 NPC 只累计一次互动');

  // ── 返修补齐：手机/NSFW 运行时边界源码级断言 ──
  const sendSource = fs.readFileSync(path.join(root, 'hooks/useGame/sendWorkflow.ts'), 'utf8');
  const nsfwBlock = sendSource.slice(sendSource.indexOf('nsfwBaselineCandidates'));
  assert.match(nsfwBlock, /筛选活跃NPC/, 'NSFW 基线候选必须使用活跃过滤（归档 NPC 不入候选）');
  const phoneModalSource = fs.readFileSync(path.join(root, 'components/features/Phone/PhoneModal.tsx'), 'utf8');
  assert.match(phoneModalSource, /npc\?\.归档\) return false/, 'PhoneModal 持久化联系人必须排除归档 NPC');
  assert.match(phoneModalSource, /!npc\.归档/, 'PhoneModal 可添加联系人必须排除归档 NPC');
  const phoneServiceSource = fs.readFileSync(path.join(root, 'services/ai/phoneService.ts'), 'utf8');
  assert.match(phoneServiceSource, /boundNpc\?\.归档/, 'phoneService 群聊参与者不得回退归档 NPC 旧联系人名字');

  // ── 返修补齐：手机归档边界真实行为 ──
  const archivedPhoneNpc = npc({ id: 'archived-phone', 姓名: '帕姆', 阶位: 'companion', 归档: true });
  const archivedSeed = runtime.factsToVariableCommands([
    { type: 'phone_seed', targetType: 'private', targetName: '帕姆', title: '归档种子', context: '旧联系人' },
  ], baseState([archivedPhoneNpc]), 2);
  assert.equal(archivedSeed.commands.filter((item) => item.key === '手机.messageSeeds').length, 0, '归档 NPC 名称不得合成手机来信种子');
  assert.match(archivedSeed.warnings.join('\n'), /已归档/, '归档手机种子必须给出明确 warning');

  const groupPhoneContext = {
    traveler: { 姓名: '开拓者' },
    world: { 当前时间: '08:00' },
    npcRecords: [archivedPhoneNpc],
    news: [],
    turnCount: 2,
    chat: { id: 'group-1', type: 'group', title: '旧群聊', participantIds: ['npc_archived-phone'], messages: [] },
    contacts: [{ id: 'npc_archived-phone', npcId: 'archived-phone', name: '帕姆' }],
    seed: { id: 'seed-group', targetType: 'group', targetId: 'group-1', relatedNpcIds: ['archived-phone'], title: '普通种子', source: 'test', triggerType: 'custom', priority: 'normal', context: '普通事件' },
  };
  assert.equal(runtime.visiblePhoneSeed(groupPhoneContext), undefined, '归档群聊种子不得进入手机请求');
  assert.doesNotMatch(runtime.buildPhoneMessages(groupPhoneContext).map((item) => item.content).join('\n'), /npc_archived-phone|帕姆/, '归档群聊参与者不得以旧 ID 或姓名进入请求');

  const privatePhoneContext = {
    ...groupPhoneContext,
    chat: { id: 'private-1', type: 'private', title: '旧私聊', participantIds: ['contact-1'], messages: [] },
    contacts: [{ id: 'contact-1', npcId: 'npc_archived-phone', name: '帕姆' }],
    contact: { id: 'contact-1', npcId: 'npc_archived-phone', name: '帕姆' },
    seed: { id: 'seed-private', targetType: 'private', targetId: 'npc_archived-phone', relatedNpcIds: [], title: '普通种子', source: 'test', triggerType: 'custom', priority: 'normal', context: '普通事件' },
  };
  assert.equal(runtime.visiblePhoneSeed(privatePhoneContext), undefined, '旧 npc_ 前缀联系人不得绕过归档种子过滤');

  console.log('companion NPC triage regression ok');
} finally {
  fs.rmSync(outfile, { force: true });
}
