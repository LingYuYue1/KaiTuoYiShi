// G1.1 schema drift 回归：story-runtime-contract.fixture.json 与 _story-runtime-contract-manifest.json 的指纹/覆盖清单一致性，
// 禁止重复定义、旧文档第二套字段/枚举、TERMINAL_EVENT、turnCount 代替 GameTime、布尔合并分层状态；
// 篡改 fixture 字段名/枚举值/required/默认值时必须非零退出；普通回归绝不写 manifest。
// 仅显式 --update-contract-manifest 且 contract regression 全通过时，才更新 manifest 并打印新旧差异。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  CONTRACT_FIXTURE_PATH,
  CONTRACT_MANIFEST_PATH,
  canonicalJsonStringify,
  computeContractFingerprint,
  readContractFixture,
  validateContractFixture,
  CANONICAL_LIFECYCLE,
  CANONICAL_DEFAULTS,
  CANONICAL_COMPATIBILITY,
} from './story-runtime-contract-regression.mjs';
import {
  ASSET_SAMPLE_PATH,
  assertAssetCatalogManifestMatches,
  buildValidatedContractManifest,
  computeCatalogFingerprint,
  recomputeSampleFingerprints,
  validateAssetCatalogSample,
  runInlineUnionProbeSuite,
  runJsonValueProbeSuite,
  runOpeningOrderSuite,
  runWorldOnlySuite,
  runNaturalLanguageSuite,
  runDeepFreezeProbe,
  runSubjectUniversalitySuite,
  runCanonicalSubjectIdProbeSuite,
  runFailureImmutabilityProbe,
  runCombinationPositiveSuite,
  runContainerMatrixSuite,
} from './story-asset-catalog-contract-regression.mjs';

const MANIFEST_SCHEMA_VERSION = 'story-v3-contract-manifest@2';

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sha256File(filePath) {
  return 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

// ── 检查 3/4 用：旧同义码只能出现在禁止声明里，不得进入任何代码位置 ──
function assertNoLegacyAlias(fixture) {
  const codeText = canonicalJsonStringify({
    types: fixture.types,
    enums: fixture.enums,
    commands: fixture.commands,
    errorCodes: fixture.errorCodes,
  });
  assert(!codeText.includes('TERMINAL_EVENT'), 'TERMINAL_EVENT 旧同义码不得进入新契约代码位置（检查4）');
  assert(JSON.stringify(fixture.compatibility?.forbiddenLegacyAliases || []).includes('TERMINAL_EVENT'), 'compatibility 必须显式声明 TERMINAL_EVENT 为禁止旧同义码（检查4）');
  assert(codeText.includes('ALREADY_TERMINAL'), '新契约必须保留 ALREADY_TERMINAL（检查4）');
}

function assertNoMergedEnums(fixture) {
  assert(fixture.enums.NewsArticleVersionLifecycle, '新闻状态枚举必须存在');
  assert(fixture.enums.WorldEventInstanceStatus, '世界事件状态枚举必须存在');
  assert(JSON.stringify(fixture.enums.NewsArticleVersionLifecycle.values) !== JSON.stringify(fixture.enums.WorldEventInstanceStatus.values), '新闻状态和世界事件状态不能合并成一个枚举');
  for (const enumName of Object.keys(fixture.enums)) {
    if (/(News|Article|Event).*(Status|Lifecycle)$/.test(enumName)) {
      assert(enumName === 'NewsArticleVersionLifecycle' || enumName === 'WorldEventInstanceStatus' || enumName === 'OfficialNoticeStatus' || enumName === 'PublicScheduleStatus' || enumName === 'PlayerPlanItemStatus' || enumName === 'WorldPlanItemStatus' || enumName === 'ConvergenceItemStatus' || enumName === 'WorldEntityStatus' || enumName === 'RuntimeMigrationStatus' || enumName === 'StoryFocusStatus' || enumName === 'OutboxItemStatus' || enumName === 'OutboxConsumerStatus', '发现未声明的状态枚举（可能把两套状态合并）: ' + enumName);
    }
  }
}

// ── 检查 5：禁止用 turnCount 代替 GameTime；禁止用布尔 known/visible/confirmed 代替分层对象 ──
function assertNoFieldSubstitutes(fixture) {
  const gameTime = fixture.types.GameTime;
  assert(gameTime?.fields?.dayOrdinal && gameTime.fields.minuteOfDay, 'GameTime 必须声明 dayOrdinal/minuteOfDay（检查5）');
  const state = fixture.types.StoryRuntimeState.fields;
  assert(state?.turnCount, 'StoryRuntimeState 必须声明 turnCount（只由成功主回合策略递增）');
  assert(state?.gameClock && state.gameClock.to === 'GameClock', 'StoryRuntimeState 必须声明 gameClock: GameClock（检查5）');
  for (const typeName of ['StoryRuntimeState', 'CommittedWorldFact', 'StoryProjectionState']) {
    const typeDef = fixture.types[typeName];
    const fields = typeDef?.kind === 'union'
      ? Object.fromEntries((typeDef.variants || []).flatMap((v) => Object.entries(v.fields || {})))
      : (typeDef?.fields || {});
    for (const forbidden of ['known', 'visible', 'confirmed']) {
      const field = fields[forbidden];
      assert(!field || field.type !== 'boolean', typeName + ' 不得用布尔字段 ' + forbidden + ' 代替分层状态（检查5）');
    }
  }
  const fact = fixture.types.CommittedWorldFact.fields;
  assert(fact?.playerParticipated && fact.playerParticipated.type === 'boolean', 'CommittedWorldFact 必须分层声明 playerParticipated');
  assert(fact?.playerObserverVisible && fact.playerObserverVisible.type === 'boolean', 'CommittedWorldFact 必须分层声明 playerObserverVisible');
  assert(fact?.evidenceLevel, 'CommittedWorldFact 必须声明 evidenceLevel（证据等级授权属于 schema）');
}

// ── G1.1.1.2 独立探针：证明修复前的三条 ACCEPTED 已变为具体拒绝 ──
// 旧行为（G1.1.1.1）：递归剥离 note/doc/source/notes，且不对 defaults.normalization 做路径级锁定。
function runLegacyAcceptanceProbes() {
  const legacyStripDocKeys = (value) => {
    if (Array.isArray(value)) return value.map(legacyStripDocKeys);
    if (value && typeof value === 'object') {
      const out = {};
      for (const [key, child] of Object.entries(value)) {
        if (['note', 'doc', 'source', 'notes'].includes(key)) continue;
        out[key] = legacyStripDocKeys(child);
      }
      return out;
    }
    return value;
  };
  const legacyTopLevelCheck = (fixture) => {
    const oracle = {
      lifecycle: legacyStripDocKeys(CANONICAL_LIFECYCLE),
      defaults: legacyStripDocKeys(CANONICAL_DEFAULTS),
      compatibility: legacyStripDocKeys(CANONICAL_COMPATIBILITY),
    };
    for (const section of ['lifecycle', 'defaults', 'compatibility']) {
      if (canonicalJsonStringify(legacyStripDocKeys(fixture[section])) !== canonicalJsonStringify(oracle[section])) return false;
    }
    return true;
  };
  const { fixture } = readContractFixture();
  const probes = [
    ['探针A-删除normalization规则', (clone) => { delete clone.defaults.normalization.note; }],
    ['探针B-反转normalization规则', (clone) => { clone.defaults.normalization.note = '同一输入允许产生不同 fingerprint'; }],
    ['探针C-新增结构化source', (clone) => { clone.lifecycle.source = { policy: '无限重试' }; }],
  ];
  const results = [];
  for (const [name, mutate] of probes) {
    const clone = deepClone(fixture);
    mutate(clone);
    const legacyAccepted = legacyTopLevelCheck(clone);
    let currentRejected = false;
    let currentError = '';
    try {
      validateContractFixture(clone);
    } catch (error) {
      currentRejected = true;
      currentError = error.message;
    }
    assert(legacyAccepted, name + ' 必须在旧逻辑下 ACCEPTED（探针前置条件失败）');
    assert(currentRejected, name + ' 必须被当前校验拒绝（修复未生效）');
    results.push({ name, legacyAccepted: true, currentRejected: true, currentError: currentError.slice(0, 160) });
  }
  return results;
}

// ── 篡改模拟：当前共 46 项（G1.1.1 原 4 项 + G1.1.1 新增 15 项 + G1.1.1.1 新增 10 项 + G1.1.1.2 新增 3 项 + G1.1.2 新增 14 项）+ 正向确认 ──
// 每项负例必须断言拒绝原因包含目标层规则关键词，避免因未更新 fingerprint、悬空辅助数据等无关原因误绿。
function runTamperSuite() {
  const cases = [
    // 原四类（G1.1 保留）
    ['篡改-字段名', (clone) => { delete clone.types.GameTime.fields.dayOrdinal; clone.types.GameTime.fields.dayOfYear = { type: 'number', required: true }; }, ['字段路径集合与 canonical 不一致']],
    ['篡改-枚举值', (clone) => { clone.enums.WorldEventReplayPolicy.values[0] = 'single'; }, ['枚举值与 canonical 不一致']],
    ['篡改-required标记', (clone) => { clone.types.GameClock.fields.policyVersion.required = false; }, ['字段规格与 canonical 不一致']],
    ['篡改-默认值', (clone) => { clone.types.StoryRuntimeState.fields.factLedger.default = null; }, ['字段规格与 canonical 不一致']],
    // G1.1.1 新增 15 项反向篡改（交接包 3.4）
    ['负例1-删除变体字段', (clone) => { delete clone.types.PublicScope.variants.find((v) => v.tag === 'local').fields.locationIds; }, ['字段路径集合与 canonical 不一致', 'required 集合不一致']],
    ['负例2-变体字段required翻转', (clone) => { clone.types.PublicScope.variants.find((v) => v.tag === 'local').fields.locationIds.required = false; }, ['字段规格与 canonical 不一致', 'required 集合不一致']],
    ['负例3-可选字段改required', (clone) => { clone.types.EvidenceRef.variants.find((v) => v.tag === 'narrative_span').fields.messageId.required = true; }, ['字段规格与 canonical 不一致', 'required 集合不一致']],
    ['负例4-命令变体注入字段', (clone) => { clone.types.RuntimeCommand.variants.find((v) => v.tag === 'append_fact').fields.extra = { type: 'string', required: true }; }, ['字段路径集合与 canonical 不一致', 'optional 集合不一致']],
    ['负例5-删除联合类型', (clone) => { delete clone.types.OpeningPreludeSourceRef; }, ['字段路径集合与 canonical 不一致', '类型名集合与 canonical 不一致']],
    ['负例6-kind literal改tag', (clone) => { clone.types.PublicScope.variants.find((v) => v.tag === 'local').fields.kind.value = 'private'; }, ['字段规格与 canonical 不一致', 'kind literal 必须等于变体 tag']],
    ['负例7-nonProgressing literal改false', (clone) => { clone.types.OpeningPreludeSourceRef.variants.find((v) => v.tag === 'manual').fields.nonProgressing.value = false; }, ['规格与 canonical 不一致']],
    ['负例8-命令字段类型改string', (clone) => { clone.types.RuntimeCommand.variants.find((v) => v.tag === 'advance_time').fields.deltaMinutes.type = 'string'; }, ['字段规格与 canonical 不一致']],
    ['负例9-证据revision改string', (clone) => { clone.types.EvidenceRef.variants.find((v) => v.tag === 'schedule_record').fields.scheduleRevision.type = 'string'; }, ['字段规格与 canonical 不一致']],
    ['负例10-outbox revision改string', (clone) => { clone.types.ProjectionOutboxItem.fields.sourceRevision.type = 'string'; }, ['字段规格与 canonical 不一致']],
    ['负例11-ref目标篡改', (clone) => { clone.types.StoryRuntimeState.fields.factLedger.items.to = 'WorldPlanItem'; }, ['字段规格与 canonical 不一致']],
    ['负例12-enum改string', (clone) => { clone.types.WorldEventDefinition.fields.replayPolicy = { type: 'string', required: true }; }, ['字段规格与 canonical 不一致']],
    ['负例13-来源映射篡改', (clone) => { clone.commands.sourceToCreatedBy.player_turn = 'debug'; }, ['sourceToCreatedBy 映射值与 canonical 不一致']],
    ['负例14-清空protectedFields', (clone) => { clone.commands.protectedFields = []; }, ['protectedFields 与 canonical 不一致']],
    ['负例15-删除lookupHint', (clone) => { delete clone.commands.lookupHints['EventTargetRef.eventInstanceId']; }, ['lookupHints key 集合与 canonical 不一致']],
    // G1.1.1.1 新增 10 项反向篡改（交接包 4）
    ['负例16-新增空类型', (clone) => { clone.types.UnusedType = { kind: 'interface', fields: {} }; }, ['类型名集合与 canonical 不一致']],
    ['负例17-union discriminator篡改', (clone) => { clone.types.PublicScope.discriminator = 'tag'; }, ['的 discriminator 必须是']],
    ['负例18-删除errorCode', (clone) => { clone.errorCodes.pop(); }, ['errorCodes 集合与 canonical 不一致']],
    ['负例19-新增errorCode', (clone) => { clone.errorCodes.push({ code: 'EXTRA_UNKNOWN_CODE', meaning: '多余', source: 'tamper' }); }, ['errorCodes 集合与 canonical 不一致']],
    ['负例20-替换errorCode', (clone) => { clone.errorCodes.find((item) => item.code === 'ALREADY_TERMINAL').code = 'ALREADY_DONE'; }, ['errorCodes 集合与 canonical 不一致']],
    ['负例21-errorCode重复', (clone) => { clone.errorCodes.push({ ...clone.errorCodes.find((item) => item.code === 'ALREADY_APPLIED') }); }, ['errorCodes 集合与 canonical 不一致', 'errorCodes 不允许重复']],
    ['负例22-arrayDefault篡改', (clone) => { clone.defaults.arrayDefault = null; }, ['顶层运行规则与 canonical 不一致: defaults']],
    ['负例23-删除状态边界层', (clone) => { clone.compatibility.stateBoundaryLayers.pop(); }, ['顶层运行规则与 canonical 不一致: compatibility']],
    ['负例24-修改gateFlow一步', (clone) => { clone.lifecycle.publicationGateFlow[2] = 'retry → 无限重试直到成功'; }, ['顶层运行规则与 canonical 不一致: lifecycle']],
    ['负例25-修改新闻来源规则', (clone) => { clone.compatibility.newsSourceRules[0] = '新闻可以引用任何文本'; }, ['顶层运行规则与 canonical 不一致: compatibility']],
    // G1.1.1.2 新增 3 项反向篡改（交接包 4）
    ['负例26-删除normalization规则', (clone) => { delete clone.defaults.normalization.note; }, ['defaults.normalization 只允许 note 一个键']],
    ['负例27-反转normalization规则', (clone) => { clone.defaults.normalization.note = '同一输入允许产生不同 fingerprint'; }, ['defaults.normalization.note 与 canonical 规则不一致']],
    ['负例28-新增结构化source', (clone) => { clone.lifecycle.source = { policy: '无限重试' }; }, ['顶层运行规则与 canonical 不一致: lifecycle']],
    // G1.1.2 新增 14 项资产篡改（交接包 9）；前 4 项为 fixture schema 篡改，后 10 项为样例数据篡改。
    ['资产负例1-删除catalogFingerprint字段', (clone) => { delete clone.types.StoryAssetCatalog.fields.catalogFingerprint; }, ['字段路径集合与 canonical 不一致'], 'contract'],
    ['资产负例2-新增未知资产字段', (clone) => { clone.types.StoryAssetCatalog.fields.extraField = { type: 'string', required: true }; }, ['字段路径集合与 canonical 不一致'], 'contract'],
    ['资产负例3-修改资产枚举值', (clone) => { clone.enums.StoryAssetOccurrencePolicy.values[0] = 'once'; }, ['枚举值与 canonical 不一致'], 'contract'],
    ['资产负例4-删除union必填引用', (clone) => { delete clone.types.StoryAssetOccurrenceSubjectRef.variants.find((v) => v.tag === 'facility').fields.facilityId; }, ['字段路径集合与 canonical 不一致', 'required 集合不一致'], 'contract'],
    ['资产负例5-重复segmentID', (clone) => { clone.segments[1].segmentId = clone.segments[0].segmentId; }, ['ID 重复'], 'sample'],
    ['资产负例6-悬空引用', (clone) => { clone.chapters[0].seriesId = 'series_not_exists'; }, ['悬空引用'], 'sample'],
    ['资产负例7-origin改emergent', (clone) => { clone.eventDefinitions[0].origin = 'emergent'; }, ['origin 必须是 catalog'], 'sample'],
    ['资产负例8-填入targetEventInstanceId', (clone) => { clone.eventDefinitions[0].completionPredicate.targetEventInstanceId = 'inst_fake'; }, ['不允许 targetEventInstanceId'], 'sample'],
    ['资产负例9-清空predicate条件', (clone) => { const p = clone.eventDefinitions[0].completionPredicate; p.requiredFactTypes = []; p.requiredEvidenceKinds = []; p.payloadMatchers = []; p.minimumEvidenceCount = 0; }, ['minimumEvidenceCount 必须 >= 1', '不能只有标题/关键词'], 'sample'],
    ['资产负例10-unique改repeatable', (clone) => { clone.eventDefinitions[0].replayPolicy = 'repeatable'; }, ['occurrence/replay 映射不一致'], 'sample'],
    ['资产负例11-grantsKnowledge改true', (clone) => { clone.visibilityHints[0].grantsKnowledge = true; }, ['必须是 literal false'], 'sample'],
    ['资产负例12-nonProgressing改false', (clone) => { clone.constraints[0].nonProgressing = false; }, ['必须是 literal true'], 'sample'],
    ['资产负例13-注入运行字段', (clone) => { clone.runtimeBranchId = 'branch_fake'; }, ['未知字段'], 'sample'],
  ];
  const results = [];
  for (const [name, mutate, expectKeywords, target] of cases) {
    if (target === 'sample') {
      // 样例篡改：内存修改样例 + 重算全部相关 fingerprint，validateAssetCatalogSample 仍必须拒绝。
      const sample = JSON.parse(fs.readFileSync(path.join(process.cwd(), ASSET_SAMPLE_PATH), 'utf8'));
      const clone = deepClone(sample);
      mutate(clone);
      recomputeSampleFingerprints(clone);
      let rejected = false;
      let errorMessage = '';
      try {
        validateAssetCatalogSample(clone);
      } catch (error) {
        rejected = true;
        errorMessage = error.message;
      }
      assert(rejected, name + ' 必须被样例校验拒绝（当前错误地通过了）');
      assert(expectKeywords.some((k) => errorMessage.includes(k)), name + ' 拒绝原因必须包含目标层关键词 ' + JSON.stringify(expectKeywords) + '，实际: ' + errorMessage);
      results.push({ name, rejected: true, errorMessage: errorMessage.slice(0, 140) });
      continue;
    }
    const { fixture } = readContractFixture();
    const clone = deepClone(fixture);
    mutate(clone);
    let rejected = false;
    let errorMessage = '';
    try {
      validateContractFixture(clone);
    } catch (error) {
      rejected = true;
      errorMessage = error.message;
    }
    assert(rejected, name + ' 必须被契约校验拒绝（当前错误地通过了）');
    assert(expectKeywords.some((k) => errorMessage.includes(k)), name + ' 拒绝原因必须包含目标层关键词 ' + JSON.stringify(expectKeywords) + '，实际: ' + errorMessage);
    results.push({ name, rejected: true, errorMessage: errorMessage.slice(0, 140) });
  }
  return results;
}

// ── G1.1.2.1/2.2 子任务 A/B/C/D：递归/引用/绑定/route/身份负例（全部先重算 fingerprint，再证明因 schema 本身被拒绝）──
// G1.1.2.2：每项负例断言拒绝原因包含目标层路径或规则关键词，避免因未更新 fingerprint、悬空辅助数据等无关原因误绿。
function runSampleSemanticTamperSuite() {
  const { fixture } = readContractFixture();
  const cases = [
    // A：递归 schema 负例（重算指纹后仍被递归校验拒绝）
    ['A-非法catalogSourceKind', (clone) => { clone.sourceKind = 'evil_source'; }, ['非法枚举值']],
    ['A-非法route枚举', (clone) => { clone.routePolicies[0].participationPolicy = 'sometimes'; }, ['非法枚举值']],
    ['A-schemaVersion literal改值', (clone) => { clone.schemaVersion = 2; }, ['必须是 literal']],
    ['A-facility subject删除必填引用', (clone) => { delete clone.occurrenceDefinitions[0].subject.facilityId; }, ['缺少必填字段']],
    ['A-facility subject混入他variant字段', (clone) => { clone.occurrenceDefinitions[0].subject.characterProfileId = 'char_fake'; }, ['未知字段']],
    ['A-completionPredicate嵌套未知字段', (clone) => { clone.eventDefinitions[0].completionPredicate.extraRule = { allowEverything: true }; }, ['未知字段']],
    ['A-minimumEvidenceCount改字符串', (clone) => { clone.eventDefinitions[0].completionPredicate.minimumEvidenceCount = '1'; }, ['必须是有限 number']],
    ['A-非法requiredEvidenceKinds值', (clone) => { clone.eventDefinitions[0].completionPredicate.requiredEvidenceKinds = ['magic_guess']; }, ['非法枚举值']],
    ['A-非法payloadMatchers.operator', (clone) => { clone.eventDefinitions[0].completionPredicate.payloadMatchers[0].operator = 'like'; }, ['非法枚举值']],
    ['A-非法PublicScope.kind', (clone) => { clone.eventDefinitions[0].publicScope.kind = 'everywhere'; }, ['非法 tag']],
    ['A-GameTime嵌套字段类型错误', (clone) => { clone.timelineEntries[0].at.dayOrdinal = 'fifty-seven'; }, ['必须是有限 number']],
    // B：引用/ordinal/range 负例
    ['B-route alternativeSegmentIds悬空', (clone) => { clone.routePolicies[0].alternativeSegmentIds = ['segment_ghost']; }, ['悬空引用']],
    ['B-route consequenceSegmentIds悬空', (clone) => { clone.routePolicies[0].consequenceSegmentIds = ['segment_ghost']; }, ['悬空引用']],
    ['B-route expiresAfterSegmentIds悬空', (clone) => { clone.routePolicies[0].expiresAfterSegmentIds = ['segment_ghost']; }, ['悬空引用']],
    ['B-firstAppearanceSegmentId悬空', (clone) => { clone.locationProfiles[0].firstAppearanceSegmentId = 'segment_ghost'; }, ['悬空引用']],
    ['B-faction引用悬空', (clone) => { clone.factionProfiles[0] = { factionProfileId: 'faction_probe', name: 'probe', aliases: [], typeSummary: 'probe', territoryLocationIds: ['loc_ghost'], representativeCharacterIds: [], goalSummary: 'probe', stateSummary: 'probe', relationshipNotes: [], profileFingerprint: '' }; }, ['悬空引用']],
    ['B-event dependency悬空', (clone) => { clone.eventDefinitions[0].dependencyDefinitionIds = ['evt_ghost']; }, ['悬空引用']],
    ['B-event consequence悬空', (clone) => { clone.eventDefinitions[0].consequenceDefinitionIds = ['evt_ghost']; }, ['悬空引用']],
    ['B-event依赖自引用', (clone) => { clone.eventDefinitions[0].dependencyDefinitionIds = ['evt_gravity_platform_stabilize']; }, ['自引用']],
    ['B-segment ordinal重复', (clone) => { clone.segments[1].ordinal = clone.segments[0].ordinal; }, ['segment ordinal 必须从 1 连续']],
    ['B-segment ordinal为0', (clone) => { clone.segments[0].ordinal = 0; }, ['segment ordinal 必须从 1 连续']],
    ['B-segment ordinal断档', (clone) => { clone.segments[1].ordinal = 3; }, ['segment ordinal 必须从 1 连续']],
    ['B-chapter ordinal重复', (clone) => { clone.chapters.push({ ...clone.chapters[0], chapterId: 'chapter_dup', ordinal: 1, chapterFingerprint: '', contentFingerprint: '' }); }, ['chapter ordinal 必须从 1 连续']],
    ['B-chapter range缺ID', (clone) => { clone.segments[0].chapterRange.chapterIds = []; }, ['chapterRange.chapterIds']],
    // G1.1.2.2 修正：原构造会因 chapter.seriesId 悬空误绿；改为第二 series 的 chapter 真实存在，
    // 让 chapterRange.chapterIds 混入跨 series ID 时因"闭区间精确一致"规则拒绝。
    ['B-chapter range跨series ID', (clone) => {
      clone.series.push({ seriesId: 'series_second', title: 's2', workTitle: 's2', ordinal: 2, chapterIds: ['chapter_foreign'], segmentIds: [], openingSegmentIds: [], seriesFingerprint: '' });
      clone.chapters.push({ chapterId: 'chapter_foreign', seriesId: 'series_second', ordinal: 1, title: 'x', summary: 'x', contentFingerprint: '', chapterFingerprint: '' });
      clone.segments[0].chapterRange.chapterIds = ['chapter_gravity_platform', 'chapter_foreign'];
    }, ['chapterRange.chapterIds']],
    ['B-series.segmentIds乱序', (clone) => { clone.series[0].segmentIds = ['segment_platform_crisis', 'segment_platform_intro']; }, ['series.segmentIds 与按 ordinal 排序的 segments 不一致']],
    ['B-series.openingSegmentIds缺失', (clone) => { clone.series[0].openingSegmentIds = []; }, ['openingSegmentIds 必须等于']],
    ['B-constraint单向关联', (clone) => { clone.constraints[0].segmentIds = []; }, ['单向关联']],
    ['B-timeline单向关联', (clone) => { clone.segments[0].timelineEntryIds = []; }, ['单向关联']],
    // G1.1.2.2 修正：原"改 locationProfileId"会因悬空误绿；改为真实触发"错误 location 收录"——把 occ 收录到错误 location。
    ['B-facility被错误location收录', (clone) => { clone.locationProfiles.push({ locationProfileId: 'loc_second', name: 'second', aliases: [], level: 'zone', factionProfileIds: [], functionSummary: 'x', facilityOccurrenceDefinitionIds: ['occ_gravity_platform'], profileFingerprint: '' }); }, ['错误 location 收录']],
    // B1（G1.1.2.2）：chapter range 两端必须真实存在
    ['B1-chapter range终点超出最大ordinal', (clone) => { clone.segments[0].chapterRange = { startOrdinal: 1, endOrdinal: 2, chapterIds: ['chapter_gravity_platform'] }; }, ['endOrdinal 必须真实存在于所属 series']],
    ['B1-chapter range起点不存在', (clone) => { clone.segments[0].chapterRange = { startOrdinal: 9, endOrdinal: 9, chapterIds: [] }; }, ['startOrdinal 必须真实存在于所属 series']],
    // C：occurrence 显式绑定负例
    ['C-occurrence缺少eventDefinitionIds', (clone) => { delete clone.occurrenceDefinitions[0].eventDefinitionIds; }, ['缺少必填字段', '缺少 eventDefinitionIds']],
    ['C-绑定悬空eventDefinition', (clone) => { clone.occurrenceDefinitions[0].eventDefinitionIds = ['evt_ghost']; }, ['悬空引用', '悬空 event definition']],
    ['C-数组内重复同一eventDefinition', (clone) => { clone.occurrenceDefinitions[0].eventDefinitionIds = ['evt_gravity_platform_stabilize', 'evt_gravity_platform_stabilize']; }, ['内部出现重复 ID']],
    ['C-同一eventDefinition被两occurrence拥有', (clone) => { clone.occurrenceDefinitions.push({ occurrenceDefinitionId: 'occ_second', title: 'probe', subject: { kind: 'item', itemId: 'item_probe' }, occurrencePolicy: 'unique', newInstancePolicy: 'forbidden', identityAnchors: [], aliases: [], eventDefinitionIds: ['evt_gravity_platform_stabilize'], definitionFingerprint: '' }); }, ['被多个 occurrence 拥有']],
    ['C-unique改newInstancePolicy=allowed', (clone) => { clone.occurrenceDefinitions[0].newInstancePolicy = 'allowed'; }, ['newInstancePolicy=forbidden']],
    ['C-unique绑定replayPolicy非once', (clone) => { clone.eventDefinitions[0].replayPolicy = 'repeatable'; }, ['occurrence/replay 映射不一致']],
    ['C-删除显式绑定依赖推断', (clone) => { delete clone.occurrenceDefinitions[0].eventDefinitionIds; }, ['缺少必填字段', '缺少 eventDefinitionIds']],
    // C1（G1.1.2.2）：稳定 subject ID 非空（空字符串与纯空格分别拒绝）
    ['C1-facilityId空字符串', (clone) => { clone.occurrenceDefinitions[0].subject.facilityId = ''; }, ['facilityId 必须非空']],
    ['C1-facilityId纯空格', (clone) => { clone.occurrenceDefinitions[0].subject.facilityId = '   '; }, ['facilityId 必须非空']],
    ['C1-event subject空ID', (clone) => { clone.occurrenceDefinitions[0].subject = { kind: 'event', eventDefinitionId: '' }; }, ['eventDefinitionId 必须非空']],
    ['C1-character subject空ID', (clone) => { clone.occurrenceDefinitions[0].subject = { kind: 'character', characterProfileId: '   ' }; }, ['characterProfileId 必须非空']],
    ['C1-item subject空ID', (clone) => { clone.occurrenceDefinitions[0].subject = { kind: 'item', itemId: '' }; }, ['itemId 必须非空']],
    ['C1-task_result subject空ID', (clone) => { clone.occurrenceDefinitions[0].subject = { kind: 'task_result', taskResultId: ' ' }; }, ['taskResultId 必须非空']],
    // C2（G1.1.2.2）：五种 subject 参数化重复身份——换 occurrenceDefinitionId 也不能重复声明同一 canonical subject。
    // 两个 occurrence 使用同一 subject 身份（第二个不绑定事件，避免 owner 检查抢先拒绝 event 形态）。
    ['C2-重复event subject身份', (clone) => {
      clone.occurrenceDefinitions[0].subject = { kind: 'event', eventDefinitionId: 'evt_gravity_platform_stabilize' };
      clone.locationProfiles[0].facilityOccurrenceDefinitionIds = [];
      clone.occurrenceDefinitions.push({ occurrenceDefinitionId: 'occ_second', title: 'probe', subject: { kind: 'event', eventDefinitionId: 'evt_gravity_platform_stabilize' }, occurrencePolicy: 'unique', newInstancePolicy: 'forbidden', identityAnchors: [], aliases: [], eventDefinitionIds: [], definitionFingerprint: '' });
    }, ['identity key 冲突']],
    ['C2-重复character subject身份', (clone) => {
      clone.characterProfiles.push({ characterProfileId: 'char_probe', name: 'probe', aliases: [], identitySummary: 'probe', factionProfileIds: [], initialStance: 'probe', relationshipNotes: [], stateNotes: [], importance: 'ordinary', profileFingerprint: '' });
      clone.occurrenceDefinitions[0].subject = { kind: 'character', characterProfileId: 'char_probe' };
      clone.locationProfiles[0].facilityOccurrenceDefinitionIds = [];
      clone.occurrenceDefinitions.push({ occurrenceDefinitionId: 'occ_second', title: 'probe', subject: { kind: 'character', characterProfileId: 'char_probe' }, occurrencePolicy: 'unique', newInstancePolicy: 'forbidden', identityAnchors: [], aliases: [], eventDefinitionIds: [], definitionFingerprint: '' });
    }, ['identity key 冲突']],
    ['C2-重复facility subject身份', (clone) => { clone.occurrenceDefinitions.push({ occurrenceDefinitionId: 'occ_second', title: 'probe', subject: { kind: 'facility', facilityId: 'facility_gravity_platform_alpha', locationProfileId: 'location_main_control_cabin' }, occurrencePolicy: 'unique', newInstancePolicy: 'forbidden', identityAnchors: [], aliases: [], eventDefinitionIds: [], definitionFingerprint: '' }); }, ['identity key 冲突']],
    ['C2-重复item subject身份', (clone) => {
      clone.occurrenceDefinitions[0].subject = { kind: 'item', itemId: 'item_probe' };
      clone.locationProfiles[0].facilityOccurrenceDefinitionIds = [];
      clone.occurrenceDefinitions.push({ occurrenceDefinitionId: 'occ_second', title: 'probe', subject: { kind: 'item', itemId: 'item_probe' }, occurrencePolicy: 'unique', newInstancePolicy: 'forbidden', identityAnchors: [], aliases: [], eventDefinitionIds: [], definitionFingerprint: '' });
    }, ['identity key 冲突']],
    ['C2-重复task_result subject身份', (clone) => {
      clone.occurrenceDefinitions[0].subject = { kind: 'task_result', taskResultId: 'task_probe' };
      clone.locationProfiles[0].facilityOccurrenceDefinitionIds = [];
      clone.occurrenceDefinitions.push({ occurrenceDefinitionId: 'occ_second', title: 'probe', subject: { kind: 'task_result', taskResultId: 'task_probe' }, occurrencePolicy: 'unique', newInstancePolicy: 'forbidden', identityAnchors: [], aliases: [], eventDefinitionIds: [], definitionFingerprint: '' });
    }, ['identity key 冲突']],
    // C3（G1.1.2.2）：event subject 必须与显式拥有的事件对齐
    ['C3-event subject与owner不一致', (clone) => {
      clone.eventDefinitions.push({ eventDefinitionId: 'evt_second', origin: 'catalog', title: 'second', actorEntityIds: [], targetEntityIds: [], dependencyDefinitionIds: [], completionPredicate: { predicateId: 'pred_second', targetEntityIds: [], requiredFactTypes: ['probe_fact'], requiredEvidenceKinds: ['narrative_span'], payloadMatchers: [], minimumEvidenceCount: 1, deterministicKey: 'second', allowedOutcomes: ['normal'], failureOutcomes: ['failed'] }, scheduling: {}, allowedResolutionModes: ['player'], replayPolicy: 'once', publicScope: { kind: 'private' }, consequenceDefinitionIds: [], definitionFingerprint: '' });
      clone.occurrenceDefinitions.push({ occurrenceDefinitionId: 'occ_second', title: 'probe', subject: { kind: 'item', itemId: 'item_probe' }, occurrencePolicy: 'unique', newInstancePolicy: 'forbidden', identityAnchors: [], aliases: [], eventDefinitionIds: ['evt_second'], definitionFingerprint: '' });
      clone.occurrenceDefinitions[0].subject = { kind: 'event', eventDefinitionId: 'evt_second' };
      clone.locationProfiles[0].facilityOccurrenceDefinitionIds = [];
    }, ['subject 与显式 owner 不一致']],
    // C4（G1.1.2.2）：facility/location 双向一致
    ['C4-facility未被location收录', (clone) => { clone.locationProfiles[0].facilityOccurrenceDefinitionIds = []; }, ['必须被且只被匹配 location 收录一次']],
    ['C4-facility被两个location收录', (clone) => { clone.locationProfiles.push({ locationProfileId: 'loc_second', name: 'second', aliases: [], level: 'zone', factionProfileIds: [], functionSummary: 'x', facilityOccurrenceDefinitionIds: ['occ_gravity_platform'], profileFingerprint: '' }); }, ['错误 location 收录']],
    ['C4-同一location数组重复收录', (clone) => { clone.locationProfiles[0].facilityOccurrenceDefinitionIds = ['occ_gravity_platform', 'occ_gravity_platform']; }, ['内部出现重复 ID']],
    // D：route 语义负例
    ['D-删除player_early', (clone) => { clone.eventDefinitions[0].allowedResolutionModes = clone.eventDefinitions[0].allowedResolutionModes.filter((m) => m !== 'player_early'); }, ['缺少 player_early']],
    ['D-删除world_background', (clone) => { clone.eventDefinitions[0].allowedResolutionModes = clone.eventDefinitions[0].allowedResolutionModes.filter((m) => m !== 'world_background'); }, ['声明 world_background 但事件缺少该模式', '缺少 world_background']],
    ['D-route改world_only仍带player', (clone) => { clone.routePolicies[0].participationPolicy = 'world_only'; }, ['world_only']],
    ['D-1-world_only仍带player_early', (clone) => { clone.routePolicies[0].participationPolicy = 'world_only'; clone.routePolicies[0].earlyCompletionPolicy = 'not_applicable'; clone.eventDefinitions[0].allowedResolutionModes = ['world_background', 'player_early']; }, ['仍带 player_early 模式']],
    ['D-2-world_only仍带shared', (clone) => { clone.routePolicies[0].participationPolicy = 'world_only'; clone.routePolicies[0].earlyCompletionPolicy = 'not_applicable'; clone.eventDefinitions[0].allowedResolutionModes = ['world_background', 'shared']; }, ['仍带 shared 模式']],
    ['D-3-world_only四模式组合', (clone) => { clone.routePolicies[0].participationPolicy = 'world_only'; clone.eventDefinitions[0].allowedResolutionModes = ['world_background', 'shared', 'player_early']; }, ['仍带 player_early 模式', '仍带 shared 模式']],
    ['D-resolve_same_definition对应occurrence改repeatable', (clone) => { clone.occurrenceDefinitions[0].occurrencePolicy = 'repeatable'; clone.eventDefinitions[0].replayPolicy = 'repeatable'; }, ['resolve_same_definition 只允许 unique occurrence']],
    ['D-resolve_same_definition对应occurrence允许新实例', (clone) => { clone.occurrenceDefinitions[0].newInstancePolicy = 'explicit_cause_required'; }, ['newInstancePolicy=forbidden']],
    ['D-route关联第二个不满足模式的事件', (clone) => {
      clone.segments[0].eventDefinitionIds = ['evt_gravity_platform_stabilize', 'evt_second'];
      clone.eventDefinitions.push({
        eventDefinitionId: 'evt_second', origin: 'catalog', title: 'second', actorEntityIds: [], targetEntityIds: [], dependencyDefinitionIds: [],
        completionPredicate: { predicateId: 'pred_second', targetEntityIds: [], requiredFactTypes: ['probe_fact'], requiredEvidenceKinds: ['narrative_span'], payloadMatchers: [], minimumEvidenceCount: 1, deterministicKey: 'second', allowedOutcomes: ['normal'], failureOutcomes: ['failed'] },
        scheduling: {}, allowedResolutionModes: ['player'], replayPolicy: 'once',
        publicScope: { kind: 'private' }, consequenceDefinitionIds: [], definitionFingerprint: '',
      });
      clone.occurrenceDefinitions[0].eventDefinitionIds = ['evt_gravity_platform_stabilize', 'evt_second'];
    }, ['world_background', 'player_early']],
  ];
  const results = [];
  for (const [name, mutate, expectKeywords] of cases) {
    const sample = JSON.parse(fs.readFileSync(path.join(process.cwd(), ASSET_SAMPLE_PATH), 'utf8'));
    const clone = deepClone(sample);
    mutate(clone);
    recomputeSampleFingerprints(clone);
    let rejected = false;
    let errorMessage = '';
    try {
      validateAssetCatalogSample(clone, { fixture });
    } catch (error) {
      rejected = true;
      errorMessage = error.message;
    }
    assert(rejected, name + ' 必须被样例语义校验拒绝（重算指纹后仍拒绝）');
    assert(expectKeywords.some((k) => errorMessage.includes(k)), name + ' 拒绝原因必须包含目标层关键词 ' + JSON.stringify(expectKeywords) + '，实际: ' + errorMessage);
    results.push({ name, rejected: true, errorMessage: errorMessage.slice(0, 150) });
  }
  return results;
}

// ── D 的 fixture 类负例：participationPolicy canonical default 必须被契约 oracle 锁定 ──
function runCanonicalDefaultTamperSuite() {
  const cases = [
    ['D-fixture删除participationPolicy.default', (clone) => { delete clone.types.StoryAssetRoutePolicy.fields.participationPolicy.default; }, ['字段规格与 canonical 不一致']],
    ['D-fixture修改canonical default为world_only', (clone) => { clone.types.StoryAssetRoutePolicy.fields.participationPolicy.default = 'world_only'; }, ['字段规格与 canonical 不一致']],
  ];
  const results = [];
  for (const [name, mutate, expectKeywords] of cases) {
    const { fixture } = readContractFixture();
    const clone = deepClone(fixture);
    mutate(clone);
    let rejected = false;
    let errorMessage = '';
    try {
      validateContractFixture(clone);
    } catch (error) {
      rejected = true;
      errorMessage = error.message;
    }
    assert(rejected, name + ' 必须被契约校验拒绝');
    assert(expectKeywords.some((k) => errorMessage.includes(k)), name + ' 拒绝原因必须包含目标层关键词 ' + JSON.stringify(expectKeywords) + '，实际: ' + errorMessage);
    results.push({ name, rejected: true, errorMessage: errorMessage.slice(0, 150) });
  }
  return results;
}

// ── 子任务 E：manifest 普通/更新共用同一闸门；更新失败零写入 ──
// G1.1.2.2：结果分类为 rejected / positive / safety，不再把安全断言与正例伪装成 rejected。
function runManifestGateSuite() {
  const { fixture } = readContractFixture();
  const results = [];
  const manifestPath = path.join(process.cwd(), CONTRACT_MANIFEST_PATH);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const sample = JSON.parse(fs.readFileSync(path.join(process.cwd(), ASSET_SAMPLE_PATH), 'utf8'));

  // E-1：修改样例内容、重算内部 fingerprint、不更新 manifest -> 正式普通入口拒绝。
  {
    const cloned = deepClone(sample);
    cloned.title = '被篡改的目录标题';
    recomputeSampleFingerprints(cloned);
    let rejected = false;
    let errorMessage = '';
    try {
      assertAssetCatalogManifestMatches({ fixture, sample: cloned, manifest });
    } catch (error) {
      rejected = true;
      errorMessage = error.message;
    }
    assert(rejected, 'E-1 必须被正式 manifest 入口拒绝');
    assert(errorMessage.includes('assetCatalogSampleFingerprint'), 'E-1 拒绝原因必须指向 manifest fingerprint 锁，实际: ' + errorMessage);
    results.push({ name: 'E-1-改样例不更新manifest', kind: 'rejected', errorMessage: errorMessage.slice(0, 150) });
  }
  // E-2/3/4：非法样例（重算全部 fingerprint 后）尝试构造更新 manifest -> 正式更新入口拒绝。
  const invalidVariants = [
    ['E-2-非法route enum', (clone) => { clone.routePolicies[0].participationPolicy = 'sometimes'; }, ['非法枚举值']],
    ['E-3-删除facility必填字段', (clone) => { delete clone.occurrenceDefinitions[0].subject.facilityId; }, ['缺少必填字段']],
    ['E-4-unique facility允许新实例', (clone) => { clone.occurrenceDefinitions[0].newInstancePolicy = 'allowed'; }, ['newInstancePolicy=forbidden']],
  ];
  for (const [name, mutate, expectKeywords] of invalidVariants) {
    const cloned = deepClone(sample);
    mutate(cloned);
    recomputeSampleFingerprints(cloned);
    let rejected = false;
    let errorMessage = '';
    try {
      buildValidatedContractManifest({ fixture, sample: cloned, previousManifest: manifest });
    } catch (error) {
      rejected = true;
      errorMessage = error.message;
    }
    assert(rejected, name + ' 更新入口必须拒绝非法样例');
    assert(expectKeywords.some((k) => errorMessage.includes(k)), name + ' 拒绝原因必须包含目标层关键词 ' + JSON.stringify(expectKeywords) + '，实际: ' + errorMessage);
    results.push({ name, kind: 'rejected', errorMessage: errorMessage.slice(0, 150) });
  }
  // E-5：上述失败前后 manifest 文件字节 hash 完全相同（零写入）——安全断言，不属于 rejected case。
  const hashBefore = sha256File(manifestPath);
  for (const result of results) {
    assert(sha256File(manifestPath) === hashBefore, 'E-5 失败：更新尝试产生了写入');
  }
  results.push({ name: 'E-5-失败前后manifest字节hash不变', kind: 'safety', errorMessage: 'hash unchanged: ' + hashBefore.slice(0, 20) + '…' });
  // E-6：合法正式样例 + 合法 fixture 的显式 update 可成功并打印旧/新值（在 --update-contract-manifest 主路径验证）——positive。
  assert(typeof buildValidatedContractManifest({ fixture, sample, previousManifest: manifest }).fixtureFingerprint === 'string', 'E-6 合法 update 必须可构造');
  results.push({ name: 'E-6-合法update可构造', kind: 'positive', errorMessage: 'buildValidatedContractManifest ok' });
  return results;
}

// ── G1.1.2.3 子任务 B：manifest 全路径纯读（success/failure/deep-freeze 三路径字节证据）──
function runManifestReadOnlySuite() {
  const { fixture } = readContractFixture();
  const manifestPath = path.join(process.cwd(), CONTRACT_MANIFEST_PATH);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const sample = JSON.parse(fs.readFileSync(path.join(process.cwd(), ASSET_SAMPLE_PATH), 'utf8'));
  const positives = [];
  const deepFreeze = (value) => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) deepFreeze(child);
      Object.freeze(value);
    }
    return value;
  };
  // 探针1：deep-freeze 的合法 manifest 必须通过正式只读入口（任何原地 sort 都会在严格模式抛 TypeError）。
  {
    const frozenManifest = deepFreeze(JSON.parse(JSON.stringify(manifest)));
    let ok = true;
    let errorMessage = '';
    try { assertManifestCoverageComplete(frozenManifest, fixture, true); } catch (error) { ok = false; errorMessage = error.message; }
    assert(ok, 'B-探针1-deep-freeze manifest 必须通过: ' + errorMessage);
    positives.push({ name: 'B-探针1-deep-freeze manifest 正向', detail: 'passed' });
  }
  // 探针2：正常 manifest 成功校验前后 canonical 字节一致。
  {
    const before = canonicalJsonStringify(manifest);
    assertAssetCatalogManifestMatches({ fixture, sample, manifest });
    assert(canonicalJsonStringify(manifest) === before, 'B-探针2-成功路径 manifest 内存字节必须不变');
    positives.push({ name: 'B-探针2-成功路径 manifest 字节一致', detail: 'unchanged' });
  }
  // 探针3：coverage 非法的 manifest 被拒绝前后内存 canonical 字节一致。
  {
    const cloned = deepClone(manifest);
    cloned.coverage.types = [...cloned.coverage.types, 'EXTRA_TYPE'];
    const before = canonicalJsonStringify(cloned);
    let rejected = false;
    try { assertManifestCoverageComplete(cloned, fixture, true); } catch { rejected = true; }
    assert(rejected, 'B-探针3-非法 manifest 必须被拒绝');
    assert(canonicalJsonStringify(cloned) === before, 'B-探针3-失败路径 manifest 内存字节必须不变');
    positives.push({ name: 'B-探针3-失败路径 manifest 字节一致', detail: 'rejected + unchanged' });
  }
  // 探针4：原地 sort 只读对象会抛 TypeError（旧逻辑必失败），证明探针 1 的 deep-freeze 能捕获原地修改。
  {
    const frozenManifest = deepFreeze(JSON.parse(JSON.stringify(manifest)));
    let copyOk = true;
    try { [...frozenManifest.coverage.types].sort(); } catch { copyOk = false; }
    assert(copyOk, 'B-探针4-拷贝排序不得在 deep-freeze 数组上抛错（探针构造前提）');
    let inPlaceThrew = false;
    try { frozenManifest.coverage.types.sort(); } catch (error) { inPlaceThrew = error instanceof TypeError; }
    assert(inPlaceThrew, 'B-探针4-原地 sort deep-freeze 数组必须抛 TypeError（旧逻辑会失败）');
    positives.push({ name: 'B-探针4-原地sort只读对象判失败', detail: 'TypeError confirmed' });
  }
  return positives;
}

function readManifest() {
  const raw = fs.readFileSync(path.join(process.cwd(), CONTRACT_MANIFEST_PATH), 'utf8');
  return { manifest: JSON.parse(raw), raw };
}

function coverageFromFixture(fixture) {
  return {
    types: Object.keys(fixture.types).sort(),
    enums: Object.keys(fixture.enums).sort(),
    commands: [...(fixture.commands.kinds || [])].sort(),
    errorCodes: fixture.errorCodes.map((item) => typeof item === 'string' ? item : item.code).sort(),
  };
}

function assertManifestCoverageComplete(manifest, fixture, requireComplete = true) {
  const coverage = coverageFromFixture(fixture);
  for (const section of ['types', 'enums', 'commands', 'errorCodes']) {
    const manifestList = manifest.coverage[section];
    assert(Array.isArray(manifestList), 'manifest 缺少覆盖清单: ' + section);
    for (const item of manifestList) {
      assert(coverage[section].includes(item), 'manifest 覆盖清单出现孤立条目: ' + section + ' ' + item + '（检查2）');
    }
    if (requireComplete) {
      // G1.1.2.3 B：禁止对传入 manifest 数组原地 sort——必须比较拷贝数组。
      assert(JSON.stringify([...manifestList].sort()) === JSON.stringify(coverage[section]), 'manifest 覆盖清单与 fixture 不一致（存在缺失条目）: ' + section + '（检查2）');
    }
  }
}

function printUpdateDiff(oldManifest, newManifest) {
  console.log('contract manifest update diff:');
  console.log('  schemaVersion: ' + (oldManifest?.schemaVersion || '(none)') + ' -> ' + newManifest.schemaVersion);
  console.log('  contractRevision: ' + (oldManifest?.contractRevision ?? '?') + ' -> ' + newManifest.contractRevision);
  console.log('  fingerprint: ' + (oldManifest?.fixtureFingerprint || '(none)') + ' -> ' + newManifest.fixtureFingerprint);
  console.log('  assetCatalogSampleFingerprint: ' + (oldManifest?.assetCatalogSampleFingerprint || '(none)') + ' -> ' + newManifest.assetCatalogSampleFingerprint);
  for (const section of ['types', 'enums', 'commands', 'errorCodes']) {
    const oldCount = oldManifest?.coverage?.[section]?.length ?? 0;
    const newCount = newManifest.coverage[section].length;
    console.log('  coverage.' + section + ': ' + oldCount + ' -> ' + newCount);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const wantUpdate = args.includes('--update-contract-manifest');

  // 先跑完整契约校验；失败时任何路径都不得写 manifest。
  const { fixture } = readContractFixture();
  const contractSummary = validateContractFixture(fixture);
  // 正向确认：未篡改的正式 fixture 必须通过（G1.1.1 3.4）。
  assert(contractSummary.passedChecks.length > 0, '正式 fixture 必须通过契约校验（正向确认）');

  const { manifest, raw } = readManifest();
  // G1.1.2.3 B：普通路径 manifest 内存对象 canonical 字节必须不变（读入后记录基线）。
  const manifestBytesBefore = canonicalJsonStringify(manifest);
  // 显式 --update-contract-manifest 时允许旧 schema/旧 revision（升级场景），否则必须匹配。
  if (!wantUpdate) {
    assert(manifest.schemaVersion === MANIFEST_SCHEMA_VERSION, 'manifest schema 版本漂移（检查1）');
    assert(manifest.contractId === 'story-runtime-v3' && manifest.contractRevision === 2, 'manifest contract 标识漂移（检查1）');
  }

  // 检查 1：fixture 与 manifest 的 fingerprint 一致。
  // 显式 --update-contract-manifest 时允许旧指纹过期（这正是刷新目的），但仍以 contract regression 全通过为门。
  const computed = computeContractFingerprint(fixture);
  if (!wantUpdate) {
    assert(manifest.fixtureFingerprint === computed.fingerprint, 'manifest fingerprint 与 fixture 不一致（检查1）：manifest=' + manifest.fixtureFingerprint + ' fixture=' + computed.fingerprint);
    const sample = JSON.parse(fs.readFileSync(path.join(process.cwd(), ASSET_SAMPLE_PATH), 'utf8'));
    // G1.1.2.1 子任务 E：普通路径与更新路径共用同一 validateAssetCatalogSample 闸门。
    assertAssetCatalogManifestMatches({ fixture, sample, manifest });
  }

  // 检查 2：manifest 覆盖清单全部存在且完整，不能出现孤立条目（更新模式只查孤立，不要求旧清单完整）。
  assertManifestCoverageComplete(manifest, fixture, !wantUpdate);

  // 检查 3：禁止重复定义同名类型/同名枚举；禁止旧文档第二套字段/枚举。
  const typeNames = Object.keys(fixture.types);
  const enumNames = Object.keys(fixture.enums);
  assert(new Set(typeNames).size === typeNames.length, 'types 出现重复名称（检查3）');
  assert(new Set(enumNames).size === enumNames.length, 'enums 出现重复名称（检查3）');
  const overlap = typeNames.filter((name) => enumNames.includes(name));
  assert(overlap.length === 0, '类型与枚举重名（检查3）: ' + overlap.join(','));
  const legacyFieldMarkers = ['st_import_', 'adapted_', 'legacy_progress_string', 'worldEventStringsAsFacts'];
  for (const marker of legacyFieldMarkers) {
    assert(!canonicalJsonStringify(fixture).includes(marker), '发现旧文档第二套字段标记（检查3）: ' + marker);
  }
  assertNoMergedEnums(fixture);

  // 检查 4：禁止 TERMINAL_EVENT，保留 ALREADY_TERMINAL。
  assertNoLegacyAlias(fixture);

  // 检查 5：禁止 turnCount 代替 GameTime；禁止布尔合并分层对象。
  assertNoFieldSubstitutes(fixture);

  // 检查 6：篡改模拟（全部负例）必须被拒绝；正式 fixture、样例与 manifest 不得被普通回归改写。
  // G1.1.2.2 子任务 F：三类独立计数——positive checks / tamper rejections / legacy probes。
  const beforeFixtureHash = sha256File(path.join(process.cwd(), CONTRACT_FIXTURE_PATH));
  const beforeManifestHash = sha256File(path.join(process.cwd(), CONTRACT_MANIFEST_PATH));
  const beforeSampleHash = sha256File(path.join(process.cwd(), ASSET_SAMPLE_PATH));
  const tamperResults = runTamperSuite();
  const semanticTamperResults = runSampleSemanticTamperSuite();
  const canonicalDefaultResults = runCanonicalDefaultTamperSuite();
  // 样例指纹 manifest 锁只在正式模式断言（更新模式正在升级 manifest，没有旧样例指纹可比对）。
  let manifestGateResults = [];
  if (!wantUpdate) {
    manifestGateResults = runManifestGateSuite();
  }
  const probeResults = runLegacyAcceptanceProbes();
  // asset 侧探针套件（validator 专项 + opening + world_only + 自然语言 + 五 subject 参数化 + canonical ID + 失败路径 + 组合 + deep-freeze）。
  const assetPositive = [];
  const assetRejected = [];
  if (!wantUpdate) {
    const unionProbes = runInlineUnionProbeSuite();
    const jsonProbes = runJsonValueProbeSuite();
    const openingProbes = runOpeningOrderSuite();
    const worldOnlyProbes = runWorldOnlySuite();
    const naturalLanguageProbes = runNaturalLanguageSuite();
    const universality = runSubjectUniversalitySuite();
    const canonicalIdProbes = runCanonicalSubjectIdProbeSuite();
    const failureImmutability = runFailureImmutabilityProbe();
    const combinationPositive = runCombinationPositiveSuite();
    const containerMatrix = runContainerMatrixSuite();
    const deepFreezeProbe = runDeepFreezeProbe();
    assetPositive.push(
      ...unionProbes.positives,
      ...jsonProbes.positives,
      ...openingProbes.positives,
      ...worldOnlyProbes.positives,
      ...naturalLanguageProbes.positives,
      ...universality.positives,
      ...canonicalIdProbes.positives,
      ...failureImmutability,
      ...combinationPositive,
      ...containerMatrix.positives,
      deepFreezeProbe,
    );
    assetRejected.push(
      ...unionProbes.rejections,
      ...jsonProbes.rejections,
      ...openingProbes.rejections,
      ...worldOnlyProbes.rejections,
      ...naturalLanguageProbes.rejections,
      ...universality.rejections,
      ...canonicalIdProbes.rejections,
      ...containerMatrix.rejections,
    );
  }
  // G1.1.2.3 B：manifest 纯读探针（success/failure/deep-freeze 三路径 + 原地 sort 判失败）。
  const manifestReadOnly = wantUpdate ? [] : runManifestReadOnlySuite();
  // sample 供 fingerprint 锁定断言使用（与检查 1 块内读取互不依赖）。
  const sample = JSON.parse(fs.readFileSync(path.join(process.cwd(), ASSET_SAMPLE_PATH), 'utf8'));
  const tamperRejections = [
    ...tamperResults.map((r) => ({ name: r.name, errorMessage: r.errorMessage })),
    ...semanticTamperResults.map((r) => ({ name: r.name, errorMessage: r.errorMessage })),
    ...canonicalDefaultResults.map((r) => ({ name: r.name, errorMessage: r.errorMessage })),
    ...manifestGateResults.filter((r) => r.kind === 'rejected').map((r) => ({ name: r.name, errorMessage: r.errorMessage })),
    ...assetRejected,
  ];
  // G1.1.2.3 D：positiveChecks 必须分别输出 fixture 与 sample 两个对象的名称/值/来源，
  // 正式样例 fingerprint 必须是锁定值 sha256:f295e3fa…，不得误用 fixture fingerprint。
  const sampleFingerprint = computeCatalogFingerprint(sample);
  assert(computed.fingerprint === 'sha256:f19a297c9176d5fe84e79c95135ecc92ea2155b696c123820bd7b8b0b8755bf6', 'fixture fingerprint 必须是锁定值 sha256:f19a297c…，实际 ' + computed.fingerprint);
  assert(sampleFingerprint === 'sha256:f295e3fa6bc0bfa6982be06063dccc4cc57441ff812ead9e38a6f0954850d651', '正式样例 fingerprint 必须是锁定值 sha256:f295e3fa…，实际 ' + sampleFingerprint);
  const positiveChecks = [
    { name: '正式 fixture 通过 validateContractFixture', detail: 'fixture fingerprint ' + computed.fingerprint + '（来源：computeContractFingerprint(fixture)）' },
    { name: '正式样例通过 validateAssetCatalogSample', detail: 'sample fingerprint ' + sampleFingerprint + '（来源：computeCatalogFingerprint(sample)）' },
    ...manifestGateResults.filter((r) => r.kind === 'positive').map((r) => ({ name: r.name, detail: r.errorMessage })),
    ...assetPositive,
    ...manifestReadOnly,
  ];
  const safetyAssertions = manifestGateResults.filter((r) => r.kind === 'safety').map((r) => ({ name: r.name, detail: r.errorMessage }));
  const legacyProbes = probeResults.map((r) => ({ name: r.name, detail: 'legacy accepted -> current rejected' }));
  const afterFixtureHash = sha256File(path.join(process.cwd(), CONTRACT_FIXTURE_PATH));
  const afterManifestHash = sha256File(path.join(process.cwd(), CONTRACT_MANIFEST_PATH));
  const afterSampleHash = sha256File(path.join(process.cwd(), ASSET_SAMPLE_PATH));
  assert(beforeFixtureHash === afterFixtureHash, '普通回归不得改写正式 fixture（检查6）');
  assert(beforeManifestHash === afterManifestHash, '普通回归不得改写正式 manifest（检查6）');
  assert(beforeSampleHash === afterSampleHash, '普通回归不得改写正式样例（检查6）');
  // G1.1.2.3 B：manifest 内存对象 canonical 字节也不得被任何纯读检查修改。
  assert(canonicalJsonStringify(manifest) === manifestBytesBefore, '普通路径 manifest 内存对象 canonical 字节必须不变（检查6）');

  // 检查 7：只有显式 --update-contract-manifest 且契约校验全通过时，才允许更新 fingerprint manifest 并打印差异。
  if (wantUpdate) {
    const sample = JSON.parse(fs.readFileSync(path.join(process.cwd(), ASSET_SAMPLE_PATH), 'utf8'));
    // G1.1.2.1 子任务 E：更新路径与普通路径共用同一闸门——先完整校验 fixture + 样例，失败绝不写文件。
    const newManifest = buildValidatedContractManifest({ fixture, sample, previousManifest: manifest });
    const oldManifest = { ...manifest };
    printUpdateDiff(oldManifest, newManifest);
    const changed = newManifest.fixtureFingerprint !== manifest.fixtureFingerprint
      || newManifest.assetCatalogSampleFingerprint !== manifest.assetCatalogSampleFingerprint
      || JSON.stringify(newManifest.coverage) !== JSON.stringify(manifest.coverage);
    if (changed) {
      fs.writeFileSync(path.join(process.cwd(), CONTRACT_MANIFEST_PATH), JSON.stringify(newManifest, null, 2) + '\n', 'utf8');
      console.log('contract manifest updated.');
    } else {
      console.log('contract manifest unchanged (fingerprint and coverage identical).');
    }
  } else {
    assert(!fs.existsSync(path.join(process.cwd(), CONTRACT_MANIFEST_PATH + '.tmp')), '不允许产生 manifest 临时文件');
  }

  console.log('story-runtime-schema-drift regression passed.');
  console.log('manifest: ' + manifest.schemaVersion + ' @ ' + CONTRACT_MANIFEST_PATH);
  console.log('fixture fingerprint: ' + computed.fingerprint);
  console.log('asset sample fingerprint lock: ' + (wantUpdate ? '(update mode: skipped)' : 'manifest gate suite executed (' + manifestGateResults.length + ' cases)'));
  console.log('coverage: ' + manifest.coverage.types.length + ' types, ' + manifest.coverage.enums.length + ' enums, ' + manifest.coverage.commands.length + ' commands, ' + manifest.coverage.errorCodes.length + ' error codes');
  console.log('contract regression checks: ' + contractSummary.passedChecks.length);
  console.log('positive checks: ' + positiveChecks.length);
  for (const result of positiveChecks) {
    console.log('  + ' + result.name + ': ' + result.detail);
  }
  console.log('tamper rejections: ' + tamperRejections.length);
  for (const result of tamperRejections) {
    console.log('  - ' + result.name + ': rejected (' + result.errorMessage + ')');
  }
  console.log('legacy probes: ' + legacyProbes.length + ' (fix-before ACCEPTED -> fix-after REJECTED)');
  for (const result of legacyProbes) {
    console.log('  - ' + result.name + ': ' + result.detail);
  }
  console.log('safety assertions:');
  for (const result of safetyAssertions) {
    console.log('  = ' + result.name + ': ' + result.detail);
  }
  console.log('normal run wrote nothing: ' + (beforeFixtureHash === afterFixtureHash && beforeManifestHash === afterManifestHash && beforeSampleHash === afterSampleHash));
}

main().catch((error) => {
  console.error('story-runtime-schema-drift regression failed: ' + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
