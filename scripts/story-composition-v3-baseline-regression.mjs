import fs from 'node:fs';
import path from 'node:path';
import {
  runAllScenarios,
  EXPECTED_SCENARIO_IDS,
  readBaselineManifest,
  assertManifestMatches,
  assertNonEmptyStringArray,
  MANIFEST_SCHEMA_VERSION,
  MANIFEST_PATH,
} from './story-composition-v3-scenario-runner.mjs';
import { buildAuthorityInventory, REQUIRED_AUDIT_FILES } from './story-runtime-authority-inventory.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function collectFakeProviderMetadata(root) {
  const directory = path.join(root, 'scripts', 'fixtures', 'story-v3', 'fake-provider-responses');
  const files = fs.readdirSync(directory).filter((name) => name.endsWith('.json')).sort();
  const records = files.flatMap((name) => {
    const bundle = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
    return bundle.responses.map((response) => ({
      file: name,
      scenarioId: bundle.scenarioId,
      ...response,
    }));
  });
  return { files, records };
}

function aggregateMetrics(reports) {
  const totals = {};
  for (const report of reports) {
    for (const [name, value] of Object.entries(report.metrics)) {
      totals[name] = (totals[name] || 0) + Number(value || 0);
    }
  }
  return totals;
}

async function main() {
  const root = process.cwd();
  const baseline = await runAllScenarios();
  assert(baseline.contractMode === 'legacy_baseline', 'G0 must report legacy baseline separately from V3 target behavior');
  assert(baseline.scenarioCount === 10, 'G0 must contain exactly ten scenarios');
  assert(baseline.pass, 'one or more G0 fixtures no longer reproduce their recorded baseline');
  assert(
    JSON.stringify(baseline.reports.map((item) => item.scenarioId).sort())
      === JSON.stringify([...EXPECTED_SCENARIO_IDS].sort()),
    'G0 scenario identity set drifted',
  );

  // G0.1/G0.2：独立 baseline manifest 必须存在、schema 正确，并与当前夹具/运行结果一致。
  assert(fs.existsSync(path.join(root, MANIFEST_PATH)), 'baseline manifest file is missing');
  const manifest = readBaselineManifest();
  assert(manifest.schemaVersion === MANIFEST_SCHEMA_VERSION, 'baseline manifest schema version drifted');
  assert(manifest.scenarioCount === 10, 'baseline manifest must cover all ten scenarios');
  assertManifestMatches(manifest, baseline);
  // G0.2：manifest 契约——每份返回的裁决、副作用、引用关系与步骤关联；coverage 锁定 v3Target。
  for (const scenario of manifest.scenarios) {
    assert(Array.isArray(scenario.responses) && scenario.responses.length > 0, 'manifest scenario missing response records');
    for (const response of scenario.responses) {
      assert(typeof response.adjudication === 'string' && response.adjudication, 'manifest response missing adjudication');
      assert(Array.isArray(response.allowedFinalSideEffects), 'manifest response missing allowedFinalSideEffects');
      assert(Array.isArray(response.refs) && response.refs.length > 0, 'manifest response missing step refs');
    }
    assert(Array.isArray(scenario.worldBehavior), 'manifest scenario missing world behavior records');
    for (const coverage of scenario.coverage) {
      // G0.2.3 子任务 B：与 fixture runner / manifest 深度比较共用同一个 assertNonEmptyStringArray。
      assertNonEmptyStringArray(coverage.v3Target?.decisions, 'manifest coverage v3Target.decisions');
      assertNonEmptyStringArray(coverage.v3Target?.allowedFinalSideEffects, 'manifest coverage v3Target.allowedFinalSideEffects');
    }
  }
  // 只有携带 world 返回的场景才必须有非空 worldBehavior（world-background-resolution / broadcast-audience-freeze）。
  const worldManifestScenarios = manifest.scenarios.filter((scenario) =>
    ['world-background-resolution', 'broadcast-audience-freeze'].includes(scenario.scenarioId));
  assert(worldManifestScenarios.every((scenario) => scenario.worldBehavior.length > 0), 'manifest world scenarios must record world behavior');
  const manifestCoverage = manifest.scenarios.flatMap((scenario) => scenario.coverage);
  assert(manifestCoverage.length === 4, 'G0.1 must ship exactly four coverage cases (B1/B2a/B2b/C)');

  // G0.2 子任务 A：每份 world 返回都必须进入行为检查（有可审计 transition 记录）。
  const metadata = collectFakeProviderMetadata(root);
  const worldTransitions = baseline.reports.flatMap((report) => report.worldTransitions);
  const worldTransitionResponseIds = new Set(worldTransitions.map((transition) => transition.responseId));
  const worldResponseIds = metadata.records.filter((record) => record.service === 'world').map((record) => record.responseId);
  assert(worldResponseIds.length === 2, 'G0.2 must ship exactly two world responses');
  for (const responseId of worldResponseIds) {
    assert(worldTransitionResponseIds.has(responseId), 'world response not executed: ' + responseId);
  }
  for (const transition of worldTransitions) {
    assert(transition.stepId && transition.responseId && transition.parsedSummary, 'world transition must record stepId/responseId/parsedSummary');
    assert(['no_reducer_ignored', 'consumed_by_reducer', 'no_audience_snapshot_ignored', 'consumed_by_audience_snapshot', 'invalid_claim_not_consumed', 'unparseable_or_other'].includes(transition.behavior), 'world transition must record legacy behavior');
  }
  const dueTransition = worldTransitions.find((transition) => transition.kind === 'world_due');
  const broadcastTransition = worldTransitions.find((transition) => transition.kind === 'broadcast');
  assert(dueTransition?.behavior === 'no_reducer_ignored', 'world_due must record that the legacy system has no reducer');
  assert(dueTransition?.valid === true, 'world_due claim must pass full field validation (eventId/claim/time/reason/factId)');
  assert(broadcastTransition?.behavior === 'no_audience_snapshot_ignored', 'broadcast must record that the legacy system does not consume the envelope');
  const worldbgReport = baseline.reports.find((report) => report.scenarioId === 'world-background-resolution');
  assert(worldbgReport.observedCodes.includes('WORLD_DUE_CLAIM_VALID'), 'world_due claim validation must be observed as VALID');

  // G0.1：coverage 子场景契约（B1/B2/C）。
  const coverageReports = baseline.reports.flatMap((report) => report.coverageReports);
  assert(coverageReports.length === 4, 'runner must produce exactly four coverage reports');
  const coverageIds = new Set(coverageReports.map((report) => report.coverageId));
  for (const expectedId of ['valid-completion-stall', 'multi-unit-partial-advance', 'multi-unit-unevidenced-skip', 'unique-facility-replay']) {
    assert(coverageIds.has(expectedId), 'missing coverage case: ' + expectedId);
  }
  assert(coverageReports.every((report) => report.pass), 'one or more coverage cases no longer reproduce their recorded baseline');
  const coverageMetrics = coverageReports.reduce((totals, report) => {
    for (const [name, value] of Object.entries(report.metrics)) {
      totals[name] = (totals[name] || 0) + Number(value || 0);
    }
    return totals;
  }, {});
  for (const requiredMetric of ['valid_completion_stall_count', 'multi_unit_claim_count', 'unevidenced_unit_skip_count', 'new_event_instance_registered_count']) {
    assert(coverageMetrics[requiredMetric] > 0, 'G0.1/G0.2 did not capture required coverage metric: ' + requiredMetric);
  }
  const b1 = coverageReports.find((report) => report.coverageId === 'valid-completion-stall');
  const b2a = coverageReports.find((report) => report.coverageId === 'multi-unit-partial-advance');
  const b2b = coverageReports.find((report) => report.coverageId === 'multi-unit-unevidenced-skip');
  const c1 = coverageReports.find((report) => report.coverageId === 'unique-facility-replay');
  assert(b1.observedCodes.includes('VALID_COMPLETION_PROGRESS_STALLED'), 'B1 must reproduce valid-completion stall');
  assert(b2a.observedCodes.includes('MULTI_UNIT_CLAIM_PARTIAL_ADVANCE') && !b2a.observedCodes.includes('MULTI_UNIT_UNEVIDENCED_SKIP'), 'B2a must be partial advance without unevidenced skip');
  assert(b2b.observedCodes.includes('MULTI_UNIT_CLAIM_PARTIAL_ADVANCE') && b2b.observedCodes.includes('MULTI_UNIT_UNEVIDENCED_SKIP'), 'B2b must include unevidenced skip');
  assert(c1.observedCodes.includes('TERMINAL_EVENT_NARRATIVE_REPLAY'), 'C must reproduce generic terminal replay for a non-beast unique event');
  assert(c1.observedCodes.includes('TERMINAL_EVENT_ALIAS_APPENDED') && c1.observedCodes.includes('TERMINAL_EVENT_ALIAS_NOT_RECOGNIZED'), 'C must cover alias re-append and disguised alias');
  assert(c1.observedCodes.includes('NEW_EVENT_INSTANCE_REGISTERED'), 'C must produce a machine-verified new-instance registration');
  // G0.2：B1/B2 transition 必须带证据映射（evidenceByUnit / advancedUnitIds / skippedUnitIds / unevidencedUnitIds）。
  // G0.2.1：证据必须通过正文绑定 + 具体剧情单元绑定（validEvidenceByUnit / completionEvidenceValid）。
  const b1Transitions = b1.transitions;
  const b2aTransitions = b2a.transitions;
  const b2bTransitions = b2b.transitions;
  assert(b2bTransitions.length === 1, 'B2b should record exactly one transition');
  assert(b2bTransitions[0].evidenceByUnit && typeof b2bTransitions[0].evidenceByUnit === 'object', 'B2b transition must record evidenceByUnit');
  assert(Array.isArray(b2bTransitions[0].advancedUnitIds), 'B2b transition must record advancedUnitIds');
  assert(Array.isArray(b2bTransitions[0].skippedUnitIds) && b2bTransitions[0].skippedUnitIds.length >= 1, 'B2b should archive at least one unevidenced intermediate unit');
  assert(Array.isArray(b2bTransitions[0].unevidencedUnitIds) && b2bTransitions[0].unevidencedUnitIds.length >= 1, 'B2b must identify unevidenced units from evidence mapping');
  assert(b2aTransitions.length === 1 && b2aTransitions[0].claimedUnitCount === 3, 'B2a must derive claimed unit count from the fixed response evidence');
  assert(b1Transitions.length === 1 && b1Transitions[0].progressed === false, 'B1 must stay on the same unit');
  // G0.2.1 证据绑定断言：
  assert(Array.isArray(b1Transitions[0].completionEvidenceValid) && b1Transitions[0].completionEvidenceValid.length > 0, 'B1 completion evidence must pass body + current-unit binding');
  assert(Array.isArray(b1Transitions[0].completionEvidenceRejected) && b1Transitions[0].completionEvidenceRejected.length === 0, 'B1 must not carry irrelevant completion evidence');
  assert(b2aTransitions[0].validEvidenceByUnit?.unit_beast_confirm?.length >= 1, 'B2a unit1 evidence must be bound and valid');
  assert(b2aTransitions[0].validEvidenceByUnit?.unit_beast_battle?.length >= 1, 'B2a unit2 evidence must be bound and valid');
  assert(b2aTransitions[0].validEvidenceByUnit?.unit_aftermath?.length >= 1, 'B2a unit3 evidence must be bound and valid');
  assert(Array.isArray(b2aTransitions[0].rejectedEvidence) && b2aTransitions[0].rejectedEvidence.length === 0, 'B2a must not carry irrelevant or misclaimed evidence');
  assert(b2bTransitions[0].validEvidenceByUnit?.unit_aftermath?.length >= 1, 'B2b unit3 evidence must be bound and valid');
  assert((b2bTransitions[0].validEvidenceByUnit?.unit_beast_confirm ?? []).length === 0, 'B2b unit1 must stay unevidenced');
  assert((b2bTransitions[0].validEvidenceByUnit?.unit_beast_battle ?? []).length === 0, 'B2b unit2 must stay unevidenced');
  // 合法夹具不得出现证据绑定拒绝。
  const allReports = baseline.reports.flatMap((report) => [report, ...report.coverageReports]);
  assert(allReports.every((report) => !report.observedCodes.includes('EVIDENCE_BINDING_REJECTED')), 'legal fixtures must not trigger evidence binding rejection');

    assert(metadata.files.length === 10, 'every scenario must own one fake-provider response bundle');
  const services = new Set(metadata.records.map((record) => record.service));
  for (const service of ['main', 'variable', 'world', 'news']) {
    assert(services.has(service), 'G0 fixed responses must cover service: ' + service);
  }
  assert(metadata.records.every((record) => record.productionUse === false), 'fixed provider responses must never be production-enabled');
  assert(metadata.records.every((record) => typeof record.rawOutputSha256 === 'string' && record.rawOutputSha256.startsWith('sha256:')), 'every fixed response must record a raw output hash');
  assert(metadata.records.every((record) => typeof record.inputStateFingerprint === 'string' && record.inputStateFingerprint.startsWith('sha256:')), 'every fixed response must record an input state fingerprint');
  assert(metadata.records.some((record) => record.sourceType === 'synthetic_adversarial'), 'synthetic adversarial fixtures must remain explicitly labelled');

  const inventory = buildAuthorityInventory({ root });
  assert(inventory.coverage.length === REQUIRED_AUDIT_FILES.length, 'authority inventory required-file list drifted');
  assert(inventory.coverage.every((item) => item.exists && item.scanned), 'authority inventory missed one or more required files');
  assert(inventory.inventoryHash.startsWith('sha256:'), 'authority inventory hash is missing');
  assert(inventory.entryCount > 0, 'authority inventory unexpectedly found no entries');
  assert(inventory.redLines.length === 5, 'authority inventory must report exactly the five red lines');
  assert(inventory.redLines.every((line) => line.violated && line.evidence.length > 0), 'every red line must carry current-code evidence in the legacy baseline');
  assert(inventory.manualReviewCount >= 0, 'manual review count must be reported');
  const everyEntryClassified = inventory.entries.every((entry) =>
    entry.kind && entry.ownerClassification && entry.risk && entry.plannedClosureStage && entry.category,
  );
  assert(everyEntryClassified, 'authority inventory entries must all carry kind/owner/risk/closure/category classification');
  assert(inventory.entries.every((entry) => entry.context !== 'unresolved'), 'unclassified hits must fail the inventory (no allowlist)');

  const hasEntry = (file, symbol) => inventory.entries.some((entry) => entry.file === file && entry.symbol === symbol);
  assert(hasEntry('hooks/useGame/sendWorkflow.ts', 'appendWorldEvents()'), 'sendWorkflow world-event append path was not inventoried');
  assert(hasEntry('hooks/useGame/sendWorkflow.ts', 'autoAlignCanonStoryProgress()'), 'sendWorkflow legacy story authority was not inventoried');
  assert(hasEntry('hooks/useGame/newsWorkflow.ts', 'set新闻()'), 'news root writer was not inventoried');
  assert(hasEntry('hooks/useGame/saveLoadWorkflow.ts', 'autoAlignCanonStoryProgress()'), 'save/load legacy auto-alignment was not inventoried');
  assert(hasEntry('hooks/useGame/saveLoadWorkflow.ts', 'alignStoryWeavingToOpeningArchive()'), 'save/load opening alignment was not inventoried');
  assert(hasEntry('components/features/Settings/VariableManager.tsx', 'set剧情编织()'), 'settings story setter was not inventoried');

  assert(baseline.capabilities.narrativeVisibleBeforeAlignment, 'G0 no longer detects the current pre-adjudication narrative preview order');
  assert(baseline.capabilities.mainDirectlyAppendsWorldEventStrings, 'G0 no longer detects direct world-event string append');
  assert(baseline.capabilities.newsDirectlyWritesRoot, 'G0 no longer detects direct news root writes');
  assert(!baseline.capabilities.newsHasMachineSourceFactLink, 'legacy news unexpectedly gained a machine source-fact link; update the baseline contract');

  const metrics = aggregateMetrics(baseline.reports);
  for (const requiredMetric of [
    'illegal_narrative_replay_count',
    'duplicate_event_instance_count',
    'no_evidence_progression_count',
    'news_without_source_fact_count',
    'npc_knowledge_without_receipt_count',
    'narrative_pre_gate_visible_count',
    'world_due_event_stall_count',
  ]) {
    assert(metrics[requiredMetric] > 0, 'G0 did not capture required baseline problem metric: ' + requiredMetric);
  }

  const normal = baseline.reports.find((report) => report.scenarioId === 'normal-resolution');
  const repeated = baseline.reports.find((report) => report.scenarioId === 'repeated-encounter');
  assert(normal?.classification === 'legacy_success', 'normal progression must remain distinguishable from known bad behavior');
  assert(repeated?.classification === 'known_bad', 'repeated encounter must be recorded as known bad behavior');

  console.log('story-composition-v3 baseline regression passed.');
  console.log('contractMode: ' + baseline.contractMode);
  console.log('scenarios: ' + baseline.scenarioCount);
  console.log('fake provider responses: ' + metadata.records.length + ' (' + [...services].sort().join(', ') + ')');
  console.log('coverage cases: ' + coverageReports.length + ' (' + [...coverageIds].sort().join(', ') + ')');
  console.log('baseline manifest: ' + manifest.schemaVersion + ' @ ' + MANIFEST_PATH + ' (sourceHead ' + manifest.sourceHead + ')');
  console.log('authority inventory: ' + inventory.entryCount + ' entries, ' + inventory.inventoryHash);
  console.log('captured baseline metrics: ' + JSON.stringify(metrics));
  console.log('captured coverage metrics: ' + JSON.stringify(coverageMetrics));
}

main().catch((error) => {
  console.error('story-composition-v3 baseline regression failed: ' + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
