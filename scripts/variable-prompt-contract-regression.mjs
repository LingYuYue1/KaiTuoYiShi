import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = process.cwd();
const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'variable-prompt-contract-'));

try {
  const entry = path.join(outDir, 'entry.ts');
  await fs.writeFile(entry, [
    `export { buildVariableModelPrompt } from ${JSON.stringify(path.join(root, 'services/ai/variableModel.ts'))};`,
    `export { createBuiltinPromptModules } from ${JSON.stringify(path.join(root, 'data/builtinPromptModules.ts'))};`,
    `export { VARIABLE_PROMPT_FIELD_CONTRACT, VARIABLE_PROMPT_FACT_CONTRACT } from ${JSON.stringify(path.join(root, 'utils/variablePromptContract.ts'))};`,
  ].join('\n'), 'utf8');
  const outfile = path.join(outDir, 'runtime.mjs');
  await esbuild.build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'silent',
    tsconfig: path.join(root, 'tsconfig.json'),
  });

  const runtime = await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  const state = {
    旅人: {
      背包: [{
        id: 'item_access_card', 类别: 'key', 名称: '临时权限卡', 描述: '实体权限卡', 数量: 2,
        品质: '蓝', 可堆叠: true, 获得回合: 1,
      }],
    },
    世界: {
      当前地点: '黑塔空间站·主控舱段',
      当前区域ID: 'herta_space_station',
      当前天气: 'clear',
      当前日期: '琥珀纪 2157.01.01',
      当前时间: '08:00',
      开拓天数: 1,
    },
    记忆: { 不应进入变量上下文: '完整记忆正文' },
    忆庭: {},
    智库: {},
    手机: {
      contacts: [{ id: 'contact_march7th', npcId: 'npc_march7th', name: '三月七', available: true, status: 'available' }],
      chats: [{ id: 'chat_express', type: 'group', title: '列车组', participantIds: ['npc_march7th', 'npc_danheng'], messages: [], unread: 0, updatedAt: 1 }],
      messageSeeds: [{
        id: 'seed_pending_route', turn: 2, source: 'main_story', triggerType: 'quest', priority: 'normal',
        targetType: 'private', targetId: 'contact_march7th', title: '确认路线', context: '稍后确认路线',
        relatedNpcIds: ['npc_march7th'], status: 'pending',
      }],
    },
    NPC: [{
      id: 'npc_march7th', 姓名: '三月七', 别名: '小三月', 阶位: 'companion', 好感度: 25,
      关系: 'friend', 亲密关系: false, 同行: true, 初见回合: 1, 最近回合: 2, 备注: [],
      当前关系阶段: '稳定伙伴',
      约定: [{ id: 'agreement_route', 标题: '确认撤离路线', 内容: '汇合前确认路线', 当前状态: '等待中', 回合: 2, 来源: '正文' }],
    }],
    新闻: [],
    剧情: [],
  };
  const modules = runtime.createBuiltinPromptModules();
  const variableModules = modules.filter((module) => (
    module.scope.includes('calibration')
    && (module.id.startsWith('builtin_variable_') || module.id === 'builtin_companion_archive_worldbook')
  ));

  const build = (options = {}, promptModules, context = {}) => runtime.buildVariableModelPrompt(
    state,
    options,
    promptModules,
    context,
  );
  const coreOnly = build({}, [], { phoneSeedsEnabled: false });
  const defaultWithoutModules = build(
    { enabled: false },
    [],
    { phoneSeedsEnabled: true, maxPhoneSeedsPerTurn: 2 },
  );
  const defaultPrompt = build(
    { enabled: false },
    variableModules,
    { phoneSeedsEnabled: true, maxPhoneSeedsPerTurn: 2 },
  );
  const nsfwPrompt = build(
    { enabled: true, maleArchiveEnabled: false },
    variableModules,
    { phoneSeedsEnabled: true, maxPhoneSeedsPerTurn: 2 },
  );
  const historyPrompt = build({}, variableModules, {
    mode: 'history_repair',
    sourceEvidenceId: 'history:turn-3',
    targetTurn: 3,
    targetMessageId: 'assistant-3',
    historicalEvidence: { source: 'chat_history', userInput: '调查终端', body: '正文证据', variableDraft: '' },
    protectedCurrentPaths: ['世界.当前时间', 'NPC'],
  });

  const count = (text, needle) => {
    let at = 0;
    let total = 0;
    while ((at = text.indexOf(needle, at)) >= 0) {
      total += 1;
      at += Math.max(1, needle.length);
    }
    return total;
  };

  const sections = ['[1 身份]', '[2 可写结构]', '[3 当前写入上下文]', '[4 联动纪律]', '[5 输出协议]'];
  const sectionOffsets = sections.map((section) => defaultPrompt.indexOf(section));
  assert(sectionOffsets.every((offset) => offset >= 0), '变量 prompt 必须包含固定五段。');
  assert.deepEqual([...sectionOffsets].sort((a, b) => a - b), sectionOffsets, '变量 prompt 五段顺序必须稳定。');
  for (const section of sections) assert.equal(count(defaultPrompt, section), 1, `${section} 只能出现一次。`);

   assert(defaultPrompt.includes('<变量事实>') && defaultPrompt.includes('{"facts":[]}'), '正常输出必须只要求变量事实 JSON。');
   assert(defaultPrompt.includes('facts 数组的每一项必须是一个对象') && defaultPrompt.includes('同层 type 判别字段'), '每条事实必须明确使用同层 type 判别字段。');
   assert(defaultPrompt.includes('{"type":"time"') && defaultPrompt.includes('{"type":"npc"') && defaultPrompt.includes('{"type":"world_event"'), '变量 prompt 必须提供同层 type 的可复制 JSON 示例。');
   assert(defaultPrompt.includes('禁止用 factType') && defaultPrompt.includes('payload'), '变量 prompt 必须禁止歧义的 factType/payload 包裹形状。');
  assert(defaultPrompt.includes('undefined') && defaultPrompt.includes('通用 null'), '核心 prompt 必须包含 JSON 安全边界。');
  assert(!defaultPrompt.includes('<变量更新>'), '正常 prompt 不得再教学或要求旧变量命令。');
  assert(!defaultPrompt.includes('<thinking>') && !defaultPrompt.includes('必须按 6 步'), 'thinking 不得再成为正常输出要求。');
  assert(!defaultPrompt.includes('当前变量路径登记表') && !defaultPrompt.includes('Root 写入策略'), '正常 prompt 不得注入完整路径登记表。');
  assert(!defaultPrompt.includes('owner=') && !defaultPrompt.includes('handler=') && !defaultPrompt.includes('risk=') && !defaultPrompt.includes('gate='), '模型不得看到内部元数据。');
  assert(!defaultPrompt.includes('30 分钟') && !defaultPrompt.includes('至少持续 3-5 回合'), '时间与天气旧限制不得残留。');
  assert(!defaultPrompt.includes('必须审计是否写 1 条') && defaultPrompt.includes('phone_seed 是可选事实'), '手机种子必须保持可选，不得催写。');
  assert(defaultPrompt.includes('不设固定分钟上限'), '时间规则必须允许正文明确的长耗时。');
  assert(defaultPrompt.includes('只依据正文明确写出的天气或天气变化'), '天气必须只按正文明确事实写入。');
  assert(defaultPrompt.includes('不按旧地点白名单拒绝同批新地点天气'), '天气不得被旧地点列表拦截。');

  assert(defaultPrompt.includes('npc_march7th') && defaultPrompt.includes('agreement_route'), '当前对象视图必须包含 NPC 与约定稳定 ID。');
  assert(defaultPrompt.includes('item_access_card') && defaultPrompt.includes('临时权限卡'), '当前对象视图必须包含背包身份和数量。');
  assert(defaultPrompt.includes('contact_march7th') && defaultPrompt.includes('chat_express') && defaultPrompt.includes('seed_pending_route'), '当前对象视图必须包含联系人、会话和待处理种子身份。');
  assert(defaultPrompt.includes('herta_space_station') && defaultPrompt.includes('琥珀纪 2157.01.01'), '当前对象视图必须包含世界关键值。');
  assert(!defaultPrompt.includes('完整记忆正文'), '完整记忆不得灌入变量 prompt。');

  for (const module of variableModules) {
    assert.equal(count(defaultPrompt, module.content), 0, `旧变量模块 ${module.id} 不得再注入正常 prompt。`);
  }
  assert.equal(defaultPrompt, defaultWithoutModules, '旧变量模块开关不得形成第二份运行时规则。');

  assert(coreOnly.includes('本次关闭：phone_seed'), '关闭手机种子时必须从可写目录移除。');
  assert(nsfwPrompt.includes('nsfw_archive -> NPC[id].NSFW档案'), 'NSFW 开启时必须显示正式事实结构。');
  assert(nsfwPrompt.includes('ageConfirm') && nsfwPrompt.includes('unknown'), 'NSFW ageConfirm 口径必须与运行时枚举一致。');
  assert(!nsfwPrompt.includes('- maleBodyArchive:'), '男性档案关闭时不得向模型暴露该可写字段。');
  assert(historyPrompt.includes('mode: history_repair') && historyPrompt.includes('历史证据 ID：history:turn-3'), '历史修复身份必须进入 prompt。');
  assert(historyPrompt.includes('不能反过来证明历史事实') || historyPrompt.includes('不得从当前 state 反推证据'), '历史修复必须声明当前 state 不是证据。');
  assert(!historyPrompt.includes('\ntime ->') && !historyPrompt.includes('\nlocation ->') && !historyPrompt.includes('\nweather ->') && !historyPrompt.includes('\nphone_seed ->'), '历史修复目录不得暴露被禁止的当前状态事实。');

  const expectedFactFields = {
    traveler_profile: ['identity', 'appearance', 'personality', 'background', 'abilityAdd', 'knowledgeAdd', 'evidence'],
    time: ['mode', 'minutes', 'targetTime', 'evidence'],
    location: ['location', 'evidence'],
    weather: ['weather', 'evidence'],
    npc: [
      'id', 'name', 'alias', 'tier', 'job', 'gender', 'affinityDelta', 'affinitySet', 'relation',
      'intimateRelationship', 'following', 'appearance', 'clothing', 'speechStyle', 'personality',
      'intro', 'playerAddress', 'memory', 'recentInteraction', 'longTermImpression', 'relationshipStage',
      'sharedExperiences', 'openItems', 'unresolvedConflicts', 'mustRemember', 'doNotForget', 'evidence',
    ],
    item: ['action', 'category', 'name', 'description', 'quantity', 'quality', 'stackable', 'source', 'sourceDescription', 'narrativeEffects', 'evidence'],
    world_event: ['text', 'evidence'],
    phone_seed: ['targetType', 'targetId', 'targetName', 'title', 'context', 'triggerType', 'priority', 'relatedNpcIds', 'evidence'],
    nsfw_archive: [
      'npcId', 'npcName', 'enabled', 'ageConfirm', 'intimacyStage', 'boundaries', 'preferences',
      'sensitivePoints', 'taboos', 'femaleBodyArchive', 'maleBodyArchive', 'experiences', 'longTermFacts',
      'tags', 'notes', 'evidence',
    ],
    agreement: ['npcId', 'npcName', 'title', 'content', '约定时间', '后果', 'evidence'],
    agreement_status: ['npcId', 'npcName', 'agreementId', 'title', '新状态', 'evidence'],
  };
  const expectedPairs = Object.entries(expectedFactFields)
    .flatMap(([factType, fields]) => fields.map((field) => `${factType}.${field}`))
    .sort();
  const actualPairs = runtime.VARIABLE_PROMPT_FIELD_CONTRACT
    .map((item) => `${item.factType}.${item.field}`)
    .sort();
  assert.deepEqual(actualPairs, expectedPairs, '唯一字段目录必须精确覆盖全部正式事实字段。');
  assert.equal(new Set(actualPairs).size, actualPairs.length, '字段目录不得重复声明同一字段。');
  for (const item of runtime.VARIABLE_PROMPT_FIELD_CONTRACT) {
    assert(item.statePath && item.handler && item.modes.length > 0, `${item.factType}.${item.field} 必须有落点、handler 与可用模式。`);
  }
  const factTypes = runtime.VARIABLE_PROMPT_FACT_CONTRACT.map((item) => item.factType).sort();
  assert.deepEqual(factTypes, Object.keys(expectedFactFields).sort(), '每种正式事实必须有唯一 fact contract。');
  assert.equal(new Set(factTypes).size, factTypes.length, 'fact contract 不得重复。');

  const duplicateRules = [
    '只依据正文明确写出的天气或天气变化',
    'phone_seed 是可选事实',
    '旅人核心档案由玩家编辑',
    '同一对象的多个变化合并为一个 fact',
  ].filter((rule) => count(defaultPrompt, rule) !== 1);
  assert.deepEqual(duplicateRules, [], '核心规则不得在正常 prompt 重复注入。');

  const estimatedTokens = Math.ceil(defaultPrompt.length / 4);
  const p0Baseline = { core: 21545, default: 24903, estimatedTokens: 6226 };
  console.log('variable prompt sections:', sections.map((section, index) => {
    const start = defaultPrompt.indexOf(section);
    const end = index + 1 < sections.length ? defaultPrompt.indexOf(sections[index + 1], start + section.length) : defaultPrompt.length;
    return `${section}=${Math.max(0, end - start)}`;
  }).join(', '));
  console.log(`variable prompt contract regression ok (core=${coreOnly.length}, default=${defaultPrompt.length}, estimatedTokens=${estimatedTokens}, fields=${actualPairs.length})`);
  assert(coreOnly.length < p0Baseline.core, `核心变量 prompt 必须小于 P0 基线：${coreOnly.length} >= ${p0Baseline.core}`);
  assert(defaultPrompt.length < p0Baseline.default, `默认变量 prompt 必须小于 P0 基线：${defaultPrompt.length} >= ${p0Baseline.default}`);
  assert(estimatedTokens < p0Baseline.estimatedTokens, `变量 prompt token 估算必须小于 P0 基线：${estimatedTokens} >= ${p0Baseline.estimatedTokens}`);
  assert(defaultPrompt.length <= 40000, `默认变量 prompt 超过 40000 字符预算：${defaultPrompt.length}`);
} finally {
  await fs.rm(outDir, { recursive: true, force: true });
}
