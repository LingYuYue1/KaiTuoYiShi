import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const bundlePath = path.join(os.tmpdir(), `zhiku-stage3-ai-index-${process.pid}-${Date.now()}.mjs`);

try {
  await build({
    stdin: {
      contents: [
        "export * from './models/settings';",
        "export * from './models/zhiku';",
        "export * from './services/zhikuAiRetrievalIndex';",
        "export * from './services/zhikuRetrieval';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'zhiku-stage3-ai-index-entry.ts',
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
  let sequence = 0;
  const makeInjectionContent = (category, title) => category === 'story' ? undefined : category === 'character'
    ? {
        类型: 'character',
        核心身份与阵营: `${title}测试身份与阵营`,
        独立人格与行为: `${title}测试人格与行为`,
        说话方式: `${title}测试说话方式`,
        台词语料: `${title}测试台词语料`,
        外貌锚点: `${title}测试外貌锚点`,
        当前形态与能力边界: `${title}测试形态与能力边界`,
        精简角色故事: `${title}测试精简故事`,
        演绎红线: `不得误写${title}`,
      }
    : {
        类型: 'lore',
        核心定义: `${title}测试核心定义`,
        关键事实: `${title}测试关键事实`,
        叙事用途: `${title}测试叙事用途`,
        演绎边界: `不得误用${title}`,
      };
  const makeEntry = (title, patch = {}) => {
    const category = patch.分类 ?? 'character';
    const entry = api.创建智库条目({
      标题: title,
      分类: category,
      摘要: `${title}轻量摘要`,
      原文: `${title}完整原文不得发送给召回模型。`,
      关键词: [`角色:${title}`],
      触发关键词: [title],
      解锁状态: '默认可用',
      使用范围: ['主剧情'],
      可否主剧情注入: true,
      可用于联动: true,
      注入内容: makeInjectionContent(category, title),
      ...patch,
    });
    entry.id = patch.id ?? `TEST-${String(++sequence).padStart(3, '0')}`;
    entry.updatedAt = sequence;
    return entry;
  };

  const ordinaryDanHeng = makeEntry('丹恒常态', {
    id: 'JS-001',
    触发关键词: ['丹恒'],
    辅助关键词: ['饮月', '龙尊'],
    辅助关键词逻辑: 'NOT_ANY',
    关联角色ID: 'danheng',
    关联形态ID: 'ordinary',
    互斥组ID: 'character-danheng-form',
  });
  const imbibitorLunae = makeEntry('丹恒·饮月', {
    id: 'JS-002',
    摘要: '',
    触发关键词: ['丹恒', '饮月'],
    辅助关键词: ['饮月', '龙尊'],
    辅助关键词逻辑: 'AND_ANY',
    关联角色ID: 'danheng',
    关联形态ID: 'imbibitor-lunae',
    互斥组ID: 'character-danheng-form',
    性格锚点: '克制而承担责任',
    说话方式: '简短、冷静，不夸张宣告',
    禁止误写: '不得把饮月写成丹枫人格复活',
  });
  const herta = makeEntry('黑塔', {
    id: 'JS-003',
    关联角色ID: 'herta',
    关联形态ID: 'remote-puppet',
    互斥组ID: 'character-danheng-form',
  });
  const station = makeEntry('黑塔空间站', {
    id: 'DD-001',
    分类: 'location',
    关键词: ['地点:黑塔空间站'],
    触发关键词: ['黑塔空间站'],
  });
  const preservation = makeEntry('存护命途', {
    id: 'MT-001',
    分类: 'term',
    关键词: ['命途:存护'],
    触发关键词: ['存护命途'],
  });
  const unrelatedRecent = makeEntry('完全无关的新资料', {
    id: 'ZY-999',
    分类: 'term',
    关键词: ['术语:无关'],
    触发关键词: ['无关'],
  });
  unrelatedRecent.updatedAt = 999999999;
  const lockedForm = makeEntry('丹恒未解锁形态', {
    id: 'JS-004',
    关联角色ID: 'danheng',
    关联形态ID: 'locked-form',
    互斥组ID: 'character-danheng-form',
    解锁状态: '未解锁',
  });
  const storyArchive = makeEntry('只读剧情档案', {
    id: 'JQ-001',
    分类: 'story',
    可否主剧情注入: false,
  });
  const system = {
    条目: [ordinaryDanHeng, imbibitorLunae, herta, station, preservation, unrelatedRecent, lockedForm, storyArchive],
  };
  const getBlockReason = (entry) => {
    if (entry.分类 === 'story') return '剧情档案只读';
    if (entry.可否主剧情注入 === false) return '禁止主剧情注入';
    if (/未解锁|锁定|只读/.test(entry.运行时解锁状态 || entry.解锁状态 || '')) return '未解锁';
    return null;
  };

  const index = api.buildZhikuAiCandidateIndex({
    system,
    keywordScanText: '玩家当前输入：继续\n最近3条正文承接：丹恒仍站在队伍前方。',
    keywordEntries: [ordinaryDanHeng],
    context: {
      currentLocation: '黑塔空间站',
      presentCharacters: ['丹恒'],
      expectedCharacters: ['黑塔'],
      immediateStoryReview: '黑塔即将通过远程通讯接入，丹恒已经显露龙尊力量。',
      recentStoryContext: '',
      storyPlan: '下一段由饮月形态的丹恒使用存护命途处理危机，并接听黑塔通讯。',
      openingArchiveText: '',
    },
    getBlockReason,
  });

  const candidateIds = index.request.candidates.map((candidate) => candidate.entryId);
  assert(candidateIds.includes('JS-001') && candidateIds.includes('JS-002'), 'controlled index must include the selected character and all unlocked forms of its subject');
  assert(candidateIds.includes('JS-003'), 'expected character was not added to the controlled index');
  assert(candidateIds.includes('DD-001') && candidateIds.includes('MT-001'), 'location or story-state setting candidate was not discovered');
  assert(!candidateIds.includes('JS-004') && !candidateIds.includes('JQ-001'), 'locked entries and read-only story archives must be filtered before candidate construction');
  assert(!candidateIds.includes('ZY-999'), 'recently updated but irrelevant data must not be used as candidate filler');

  const locationOnlyIndex = api.buildZhikuAiCandidateIndex({
    system,
    keywordScanText: '玩家当前输入：继续',
    keywordEntries: [station],
    context: {
      currentLocation: '黑塔空间站',
      presentCharacters: [],
      expectedCharacters: [],
      immediateStoryReview: '列车停靠在黑塔空间站。',
      recentStoryContext: '',
      storyPlan: '',
      openingArchiveText: '',
    },
    getBlockReason,
  });
  assert(!locationOnlyIndex.request.candidates.some((candidate) => candidate.entryId === 'JS-003'), 'Herta character must not enter the AI index from the location name alone');

  const imbibitorCandidate = index.request.candidates.find((candidate) => candidate.entryId === 'JS-002');
  assert(imbibitorCandidate?.summary.includes('克制而承担责任'), 'empty character summaries must compile from structured character anchors');
  assert(!JSON.stringify(index.request).includes('完整原文不得发送'), 'controlled request leaked full Zhiku source text');
  assert(index.request.keywordEntryIds.join(',') === 'JS-001', 'keyword evidence IDs were not preserved');

  const repairedOutput = api.parseZhikuAiOutput('```json\n{"selections":[{"entryId":"JS-002","operation":"FORM_OVERRIDE","usage":"CHARACTER_FORM","necessity":"REQUIRED","replaceEntryId":"JS-001","evidence":["ACTIVE_FORM","NEXT_TURN_PARTICIPANT"],"reason":"当前剧情已进入饮月形态",}],"noSelectionReason":"",}\n```');
  const validCompilation = api.compileZhikuAiSelection(index.request, repairedOutput, 8);
  assert(validCompilation.accepted.length === 1, 'valid FORM_OVERRIDE was not accepted');
  assert(validCompilation.finalSelections.map((item) => item.entryId).includes('JS-002'), 'valid form override did not select the active form');
  assert(!validCompilation.finalSelections.map((item) => item.entryId).includes('JS-001'), 'valid form override retained the replaced default form');
  assert(validCompilation.keywordEvidence.includes('JS-001'), 'form override must retain the original keyword evidence in diagnostics');

  const formalPreset = JSON.parse(fs.readFileSync(path.join(root, 'public', 'zhiku-presets', 'character-rebuild-core.json'), 'utf8'));
  const formalIds = { 常态: 'JS-004', 饮月: 'JS-076', 腾荒: 'JS-077' };
  const formalDanHengForms = formalPreset.entries
    .filter((entry) => entry.关联角色ID === '丹恒')
    .map((entry) => ({ ...entry, id: formalIds[entry.关联形态ID] }));
  const formalOrdinary = formalDanHengForms.find((entry) => entry.id === 'JS-004');
  const formalIndex = api.buildZhikuAiCandidateIndex({
    system: { 条目: formalDanHengForms },
    keywordScanText: '玩家当前输入：丹恒仍在队伍前方。',
    keywordEntries: [formalOrdinary],
    context: {
      currentLocation: '鳞渊境',
      presentCharacters: ['丹恒'],
      expectedCharacters: [],
      immediateStoryReview: '丹恒已经显露持明本相。',
      recentStoryContext: '',
      storyPlan: '下一段继续使用丹恒·饮月形态应对危机。',
      openingArchiveText: '',
    },
    getBlockReason,
  });
  assert(
    formalIndex.request.candidates.map((candidate) => candidate.entryId).sort().join(',') === 'JS-004,JS-076,JS-077',
    'formal Dan Heng subject must expose all three forms to the controlled AI index',
  );
  const formalCompilation = api.compileZhikuAiSelection(formalIndex.request, {
    selections: [{
      entryId: 'JS-076',
      operation: 'FORM_OVERRIDE',
      usage: 'CHARACTER_FORM',
      necessity: 'REQUIRED',
      replaceEntryId: 'JS-004',
      evidence: ['ACTIVE_FORM'],
      reason: '当前剧情明确维持饮月形态',
    }],
    noSelectionReason: '',
  }, 8);
  assert(
    formalCompilation.accepted.length === 1
      && formalCompilation.finalSelections.some((selection) => selection.entryId === 'JS-076')
      && !formalCompilation.finalSelections.some((selection) => selection.entryId === 'JS-004'),
    'formal Dan Heng FORM_OVERRIDE must replace the ordinary form with Imbibitor Lunae',
  );

  const invalidCompilation = api.compileZhikuAiSelection(index.request, {
    selections: [
      { entryId: 'OUTSIDE-001', operation: 'ADD', usage: 'SETTING_REQUIRED', necessity: 'REQUIRED', replaceEntryId: null, evidence: ['EVENT'], reason: '候选外资料' },
      { entryId: 'JS-003', operation: 'FORM_OVERRIDE', usage: 'CHARACTER_FORM', necessity: 'REQUIRED', replaceEntryId: 'JS-001', evidence: ['ACTIVE_FORM'], reason: '跨人物替换' },
      { entryId: 'DD-001', operation: 'ADD', usage: 'CHARACTER_CORE', necessity: 'REQUIRED', replaceEntryId: null, evidence: ['LOCATION'], reason: '错误用途' },
    ],
    noSelectionReason: '',
  }, 8);
  assert(invalidCompilation.rejected.some((item) => item.code === 'UNKNOWN_ENTRY'), 'candidate-outside ID was not rejected');
  assert(invalidCompilation.rejected.some((item) => item.code === 'SUBJECT_MISMATCH'), 'cross-subject form override was not rejected');
  assert(invalidCompilation.rejected.some((item) => item.code === 'USAGE_CATEGORY_MISMATCH'), 'category/usage mismatch was not rejected');

  const defaults = api.创建默认智库系统设置();
  const mainConfig = {
    id: 'test-main',
    name: 'test-main',
    provider: 'openai_compatible',
    baseUrl: 'https://example.invalid/v1',
    apiKey: 'test-key',
    model: 'test-model',
    maxTokens: 960,
    temperature: 0,
    retryCount: 0,
    createdAt: 0,
    updatedAt: 0,
  };
  let apiCalls = 0;
  globalThis.fetch = async () => {
    apiCalls += 1;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        selections: [{
          entryId: 'JS-002',
          operation: 'FORM_OVERRIDE',
          usage: 'CHARACTER_FORM',
          necessity: 'REQUIRED',
          replaceEntryId: 'JS-001',
          evidence: ['ACTIVE_FORM', 'NEXT_TURN_PARTICIPANT'],
          reason: '当前剧情已进入饮月形态',
        }],
        noSelectionReason: '',
      }) } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  await api.retrieveZhikuContextWithModel(
    system,
    '丹恒仍站在队伍前方。',
    5,
    { ...defaults, enableAiSupplement: false },
    mainConfig,
    undefined,
    0,
    {
      presentNpcNamesForFallback: ['丹恒'],
      anticipatedNpcNames: [],
      aiSupplementHints: { presentNpcNames: ['丹恒'], storyPlan: '丹恒维持饮月形态。' },
    },
  );
  assert(apiCalls === 0, 'AI supplement disabled must make zero API calls');

  const productionResult = await api.retrieveZhikuContextWithModel(
    system,
    '丹恒仍站在队伍前方。',
    5,
    { ...defaults, enableAiSupplement: true },
    mainConfig,
    undefined,
    0,
    {
      presentNpcNamesForFallback: ['丹恒'],
      anticipatedNpcNames: [],
      aiSupplementHints: { presentNpcNames: ['丹恒'], storyPlan: '丹恒维持饮月形态。' },
    },
  );
  assert(apiCalls === 1, `AI supplement enabled must execute exactly once per turn, received ${apiCalls}`);
  assert(productionResult.entries.some((entry) => entry.id === 'JS-002') && !productionResult.entries.some((entry) => entry.id === 'JS-001'), 'production form override did not replace the default form');
  assert(productionResult.diagnostics?.AI形态修正.some((item) => item.includes('丹恒常态') && item.includes('丹恒·饮月')), 'production diagnostics did not record the form override');

  const bundledEntries = fs.readdirSync(path.join(root, 'public', 'zhiku-presets'))
    .filter((filename) => filename.endsWith('.json'))
    .flatMap((filename) => {
      const parsed = JSON.parse(fs.readFileSync(path.join(root, 'public', 'zhiku-presets', filename), 'utf8'));
      return Array.isArray(parsed.entries) ? parsed.entries : [];
    });
  const realSystem = api.归一化智库系统({ 条目: bundledEntries });
  const realKeywordRecall = api.retrieveZhikuContext(realSystem, '玩家当前输入：继续\n最近3条正文承接：列车已经停靠黑塔空间站。', 5, {
    presentNpcNamesForFallback: [],
  });
  const realCandidateIndex = api.buildZhikuAiRequestForTurn(
    realSystem,
    '玩家当前输入：继续\n最近3条正文承接：列车已经停靠黑塔空间站。',
    realKeywordRecall.entries,
    {
      anticipatedNpcNames: ['黑塔'],
      aiSupplementHints: {
        currentLocation: '黑塔空间站',
        presentNpcNames: [],
        immediateStoryReview: '空间站方面即将由黑塔接入远程通讯。',
        storyPlan: '下一段需要黑塔参与通讯，并继续处理空间站当前事件。',
      },
    },
  );
  assert(realSystem.条目.length > 100, 'real bundled Zhiku sample is unexpectedly small');
  assert(realCandidateIndex.request.candidates.length > 0 && realCandidateIndex.request.candidates.length <= api.ZHIKU_AI_CONTROLLED_CANDIDATE_LIMIT, 'real candidate index did not stay within the controlled limit');
  assert(realCandidateIndex.request.candidates.length < realSystem.条目.length, 'real candidate index accidentally sent the complete Zhiku');
  assert(!JSON.stringify(realCandidateIndex.request).includes('原文'), 'real candidate request contains a source-text field');
  assert(realCandidateIndex.request.candidates.some((candidate) => candidate.title.includes('黑塔')), 'real expected Herta candidate was not discovered');
  const realRequestChars = JSON.stringify(realCandidateIndex.request).length;
  assert(realRequestChars < 8000, `real controlled request is unexpectedly large: ${realRequestChars} chars`);

  const retrievalSource = fs.readFileSync(path.join(root, 'services/zhikuRetrieval.ts'), 'utf8');
  const promptSource = fs.readFileSync(path.join(root, 'prompts/cot/zhikuCot.ts'), 'utf8');
  const snapshotSource = fs.readFileSync(path.join(root, 'hooks/useGame/contextSnapshot.ts'), 'utf8');
  assert(!retrievalSource.includes('buildRecallSupplementCandidates') && !retrievalSource.includes('parseZhikuIndexes'), 'legacy recent-entry candidate filler or numbered-line parser is still in production');
  assert(promptSource.includes('智库运行时召回编译器') && promptSource.includes('"selections"') && promptSource.includes('FORM_OVERRIDE'), 'production prompt does not contain the fixed identity and JSON contract');
  assert(snapshotSource.includes('buildZhikuAiRequestForTurn') && snapshotSource.includes('AI候选索引'), 'context snapshot does not preview the real controlled candidate request');

  console.log(JSON.stringify({
    candidateIds,
    acceptedOverride: validCompilation.accepted.map((item) => item.entryId),
    rejectedCodes: invalidCompilation.rejected.map((item) => item.code),
    productionEntries: productionResult.entries.map((entry) => entry.id),
    realZhikuEntries: realSystem.条目.length,
    realCandidateCount: realCandidateIndex.request.candidates.length,
    realRequestChars,
    apiCalls,
  }));
  console.log('ZHIKU_STAGE3_AI_RETRIEVAL_INDEX_REGRESSION_OK');
} finally {
  fs.rmSync(bundlePath, { force: true });
}
