// G0.2 反向篡改回归（负例检查）：确认关键观察码/契约不能通过夹具元数据伪造。
// 全部使用内存变体，不污染受版本控制的正式基线；任一负例未按预期被拒绝即非零退出。
//
// 覆盖交接包要求的七项负例：
//   1. 删除/修改 B1 完成证据，但保留 step 标记
//   2. 删除 B2 某个单元的正文证据，但保留 claimedUnitEvidence（G0.2 已移除布尔字段，等价负例为删除证据块）
//   3. 修改 C 的新实例 ID、时间或原因
//   4. 修改某 response 的 allowedFinalSideEffects
//   5. 添加一个未被任何步骤引用的固定返回
//   6. 修改 world 返回内容但不更新独立 manifest
//   7. 在 baseline 不通过时执行 manifest 更新，确认不会写文件
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  runScenarioWithBundle,
  runAllScenarios,
  readBaselineManifest,
  assertManifestMatches,
  updateManifestWithGuard,
  MANIFEST_PATH,
} from './story-composition-v3-scenario-runner.mjs';

const ROOT = process.cwd();
const FIXTURE_DIR = path.join(ROOT, 'scripts', 'fixtures', 'story-v3');
const RESPONSE_DIR = path.join(FIXTURE_DIR, 'fake-provider-responses');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadScenario(scenarioId) {
  const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, scenarioId + '.json'), 'utf8'));
  const bundle = JSON.parse(fs.readFileSync(path.join(RESPONSE_DIR, scenarioId + '.json'), 'utf8'));
  return { fixture, bundle };
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function main() {
  const failures = [];
  const record = (name, ok, detail) => {
    console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
    if (!ok) failures.push(name);
  };

  // ── 正向对照：先跑原始样本，确认观察码确实存在 ──
  const originalNormal = loadScenario('normal-resolution');
  const originalEarly = loadScenario('player-early-resolution');
  const originalRepeated = loadScenario('repeated-encounter');
  const originalWorldbg = loadScenario('world-background-resolution');
  const originalB1 = await runScenarioWithBundle(originalNormal.fixture, originalNormal.bundle, { skipStoredHashCheck: true });
  const originalB2 = await runScenarioWithBundle(originalEarly.fixture, originalEarly.bundle, { skipStoredHashCheck: true });
  const originalC = await runScenarioWithBundle(originalRepeated.fixture, originalRepeated.bundle, { skipStoredHashCheck: true });
  assert(originalB1.coverageReports[0].observedCodes.includes('VALID_COMPLETION_PROGRESS_STALLED'), 'positive control B1 failed');
  assert(originalB2.coverageReports.find((c) => c.coverageId === 'multi-unit-unevidenced-skip').observedCodes.includes('MULTI_UNIT_UNEVIDENCED_SKIP'), 'positive control B2b failed');
  assert(originalC.coverageReports[0].observedCodes.includes('NEW_EVENT_INSTANCE_REGISTERED'), 'positive control C failed');

  // ── 负例 1：删除 B1 完成证据（保留 step 标记 completionValid） ──
  {
    const { fixture, bundle } = clone(originalNormal);
    const response = bundle.responses.find((item) => item.responseId === 'main_valid_completion_stall');
    response.rawOutput = response.rawOutput.replace(/<测试证据>[\s\S]*?<\/测试证据>\n?/u, '');
    const report = await runScenarioWithBundle(fixture, bundle, { skipStoredHashCheck: true });
    const stallCodePresent = report.coverageReports[0].observedCodes.includes('VALID_COMPLETION_PROGRESS_STALLED');
    record('负例1：删除 B1 完成证据后 VALID_COMPLETION_PROGRESS_STALLED 必须消失', !stallCodePresent, 'observed=' + JSON.stringify(report.coverageReports[0].observedCodes));
  }

  // ── 负例 2：删除 B2b 的证据块（正文证据全部移除） ──
  {
    const { fixture, bundle } = clone(originalEarly);
    const response = bundle.responses.find((item) => item.responseId === 'main_multi_unit_skip');
    response.rawOutput = response.rawOutput.replace(/<测试证据>[\s\S]*?<\/测试证据>\n?/u, '');
    const report = await runScenarioWithBundle(fixture, bundle, { skipStoredHashCheck: true });
    const coverage = report.coverageReports.find((item) => item.coverageId === 'multi-unit-unevidenced-skip');
    const skipCodePresent = coverage.observedCodes.includes('MULTI_UNIT_UNEVIDENCED_SKIP');
    const claimCodePresent = coverage.observedCodes.includes('MULTI_UNIT_CLAIM_PARTIAL_ADVANCE');
    record('负例2：删除 B2 证据块后多单元观察码必须消失', !skipCodePresent && !claimCodePresent, 'observed=' + JSON.stringify(coverage.observedCodes));
  }

  // ── 负例 3：修改 C 的新实例 ID / 时间 ──
  {
    const { fixture, bundle } = clone(originalRepeated);
    const response = bundle.responses.find((item) => item.responseId === 'main_unique_facility_new_instance');
    response.rawOutput = response.rawOutput.replace('"eventInstanceId":"event_backup_device_install"', '"eventInstanceId":"event_gravity_stabilizer"');
    const report = await runScenarioWithBundle(fixture, bundle, { skipStoredHashCheck: true });
    const registered = report.coverageReports[0].observedCodes.includes('NEW_EVENT_INSTANCE_REGISTERED');
    record('负例3a：新实例 ID 与终态实例相同后 NEW_EVENT_INSTANCE_REGISTERED 必须消失', !registered, 'observed=' + JSON.stringify(report.coverageReports[0].observedCodes));
  }
  {
    const { fixture, bundle } = clone(originalRepeated);
    const response = bundle.responses.find((item) => item.responseId === 'main_unique_facility_new_instance');
    response.rawOutput = response.rawOutput.replace('"time":"2157-05-02T09:30:00+08:00"', '"time":"不是合法时间"');
    const report = await runScenarioWithBundle(fixture, bundle, { skipStoredHashCheck: true });
    const registered = report.coverageReports[0].observedCodes.includes('NEW_EVENT_INSTANCE_REGISTERED');
    record('负例3b：新实例时间为非法值后 NEW_EVENT_INSTANCE_REGISTERED 必须消失', !registered, 'observed=' + JSON.stringify(report.coverageReports[0].observedCodes));
  }
  {
    const { fixture, bundle } = clone(originalRepeated);
    const response = bundle.responses.find((item) => item.responseId === 'main_unique_facility_new_instance');
    response.rawOutput = response.rawOutput.replace('"reason":"新备用稳定装置运抵并完成安装"', '"reason":""');
    const report = await runScenarioWithBundle(fixture, bundle, { skipStoredHashCheck: true });
    const registered = report.coverageReports[0].observedCodes.includes('NEW_EVENT_INSTANCE_REGISTERED');
    record('负例3c：新实例原因为空后 NEW_EVENT_INSTANCE_REGISTERED 必须消失', !registered, 'observed=' + JSON.stringify(report.coverageReports[0].observedCodes));
  }

  // 完整基线（负例 4/6/7 共用）。
  const baseline = await runAllScenarios();
  const manifest = readBaselineManifest();

  // ── 负例 10：B1 无关证据（证据文本不在正文、不命中当前单元） ──
  {
    const { fixture, bundle } = clone(originalNormal);
    const response = bundle.responses.find((item) => item.responseId === 'main_valid_completion_stall');
    response.rawOutput = response.rawOutput.replace(
      '{"completionEvidence":["主控舱段警报解除"]}',
      '{"completionEvidence":["支援舱段的异动已经确认"]}'
    );
    const report = await runScenarioWithBundle(fixture, bundle, { skipStoredHashCheck: true });
    const coverage = report.coverageReports[0];
    const stallGone = !coverage.observedCodes.includes('VALID_COMPLETION_PROGRESS_STALLED');
    const rejectedObserved = coverage.observedCodes.includes('EVIDENCE_BINDING_REJECTED');
    record('负例10：B1 无关证据必须被拒绝（观察码消失 + EVIDENCE_BINDING_REJECTED 出现）', stallGone && rejectedObserved, 'observed=' + JSON.stringify(coverage.observedCodes));
  }

  // ── 负例 11：B2 跨单元冒领（unit_aftermath 冒领 unit_beast_battle 的证据内容） ──
  {
    const { fixture, bundle } = clone(originalEarly);
    const response = bundle.responses.find((item) => item.responseId === 'main_multi_unit_skip');
    response.rawOutput = response.rawOutput.replace(
      '{"unitId":"unit_aftermath","evidence":["残骸回收完成","起因调查收束"]}',
      '{"unitId":"unit_aftermath","evidence":["末日兽被击退","支援舱段危机平息"]}'
    );
    const report = await runScenarioWithBundle(fixture, bundle, { skipStoredHashCheck: true });
    const coverage = report.coverageReports.find((item) => item.coverageId === 'multi-unit-unevidenced-skip');
    const rejectedObserved = coverage.observedCodes.includes('EVIDENCE_BINDING_REJECTED');
    const validUnit3 = (coverage.transitions[0]?.validEvidenceByUnit?.unit_aftermath ?? []).length;
    record('负例11：B2 跨单元冒领必须被拒绝（EVIDENCE_BINDING_REJECTED 出现且冒领单元无有效证据）', rejectedObserved && validUnit3 === 0, 'validEvidenceByUnit.unit_aftermath=' + validUnit3);
  }

  // ── 负例 12：world_due 字段非法（time 不可解析）→ 只允许 INVALID，PARSED/VALID/REDUCER 均不得出现 ──
  {
    const { fixture, bundle } = clone(originalWorldbg);
    const response = bundle.responses.find((item) => item.responseId === 'world_background_due');
    response.rawOutput = response.rawOutput.replace('"time":"2157-04-26T16:00:00+08:00"', '"time":"不是合法时间"');
    const report = await runScenarioWithBundle(fixture, bundle, { skipStoredHashCheck: true });
    const invalidObserved = report.observedCodes.includes('WORLD_DUE_CLAIM_INVALID');
    const successCodesAbsent = ['WORLD_DUE_CLAIM_PARSED', 'WORLD_DUE_CLAIM_VALID', 'WORLD_DUE_EVENT_HAS_NO_CURRENT_REDUCER']
      .every((code) => !report.observedCodes.includes(code));
    const worldTransition = report.worldTransitions.find((item) => item.kind === 'world_due');
    record('负例12：world_due 非法后只允许 INVALID（无 PARSED/VALID/REDUCER）且不消费',
      invalidObserved && successCodesAbsent && worldTransition?.behavior === 'invalid_claim_not_consumed',
      'observed=' + JSON.stringify(report.observedCodes) + ' behavior=' + worldTransition?.behavior);
  }

  // ── A 系列（G0.2.3）：严格 world_due 解析的 14 项强制篡改覆盖 ──
  {
    const dueJson = JSON.parse(originalWorldbg.bundle.responses.find((item) => item.responseId === 'world_background_due').rawOutput);
    const aVariants = [
      ['A1 删除 eventId', (obj) => { delete obj.eventId; }],
      ['A2 删除 claim', (obj) => { delete obj.claim; }],
      ['A3 删除 time', (obj) => { delete obj.time; }],
      ['A4 删除 reason', (obj) => { delete obj.reason; }],
      ['A5 删除 factId', (obj) => { delete obj.factId; }],
      ['A6 eventId 纯空格', (obj) => { obj.eventId = '   '; }],
      ['A7 claim 纯空格', (obj) => { obj.claim = '   '; }],
      ['A8 reason 纯空格', (obj) => { obj.reason = '   '; }],
      ['A9 time 纯年份 "2157"', (obj) => { obj.time = '2157'; }],
      ['A10 time 仅日期 "2157-04-26"', (obj) => { obj.time = '2157-04-26'; }],
      ['A11 time 无时区 "2157-04-26T16:00:00"', (obj) => { obj.time = '2157-04-26T16:00:00'; }],
      ['A12 time 非法文本', (obj) => { obj.time = '不是合法时间'; }],
      ['A13 time 无效日历日期 "2157-02-30T16:00:00+08:00"', (obj) => { obj.time = '2157-02-30T16:00:00+08:00'; }],
      ['A14 factId 错误前缀 "beast_defeated"', (obj) => { obj.factId = 'beast_defeated'; }],
    ];
    for (const [name, mutate] of aVariants) {
      const { fixture, bundle } = clone(originalWorldbg);
      const response = bundle.responses.find((item) => item.responseId === 'world_background_due');
      const mutated = JSON.parse(JSON.stringify(dueJson));
      mutate(mutated);
      response.rawOutput = JSON.stringify(mutated);
      const report = await runScenarioWithBundle(fixture, bundle, { skipStoredHashCheck: true });
      const invalidObserved = report.observedCodes.includes('WORLD_DUE_CLAIM_INVALID');
      const successCodesAbsent = ['WORLD_DUE_CLAIM_PARSED', 'WORLD_DUE_CLAIM_VALID', 'WORLD_DUE_EVENT_HAS_NO_CURRENT_REDUCER']
        .every((code) => !report.observedCodes.includes(code));
      const worldTransition = report.worldTransitions.find((item) => item.kind === 'world_due');
      const behaviorRejected = worldTransition?.behavior !== 'no_reducer_ignored' && worldTransition?.behavior !== 'consumed_by_reducer';
      const scenarioNotPassing = report.pass === false;
      record('负例' + name + '：只允许 INVALID（无成功码/不消费/基线不再通过）',
        invalidObserved && successCodesAbsent && behaviorRejected && scenarioNotPassing,
        'codes=' + JSON.stringify(report.observedCodes) + ' behavior=' + worldTransition?.behavior
          + ' invalidReasons=' + JSON.stringify(worldTransition?.invalidReasons || []));
    }
  }

  // ── B 系列（G0.2.3）：coverage 两组字符串数组契约——每组各 5 态（runner 拒绝）+ 2 项合法内容漂移（manifest 拒绝） ──
  {
    const fiveStates = [
      ['删除字段', (fixture, field) => { delete fixture.coverageCases[0].v3Target[field]; }],
      ['非数组', (fixture, field) => { fixture.coverageCases[0].v3Target[field] = 'not-an-array'; }],
      ['空数组', (fixture, field) => { fixture.coverageCases[0].v3Target[field] = []; }],
      ['空字符串元素', (fixture, field) => { fixture.coverageCases[0].v3Target[field] = ['合法项', '']; }],
      ['纯空格元素', (fixture, field) => { fixture.coverageCases[0].v3Target[field] = ['合法项', '   ']; }],
    ];
    for (const field of ['decisions', 'allowedFinalSideEffects']) {
      for (const [stateName, mutate] of fiveStates) {
        const { fixture, bundle } = clone(originalNormal);
        mutate(fixture, field);
        let rejected = false;
        try {
          await runScenarioWithBundle(fixture, bundle, { skipStoredHashCheck: true });
        } catch (error) {
          rejected = new RegExp(field, 'u').test(error.message);
        }
        record('负例B-' + field + '-' + stateName + '：runner 必须拒绝', rejected);
      }
    }
    // 两项合法内容漂移：结构合法但内容被替换 → manifest 深度比对必须拒绝。
    for (const [field, replacement] of [['decisions', ['完全不同的合法决策']], ['allowedFinalSideEffects', ['完全不同的合法副作用']]]) {
      const { fixture, bundle } = clone(originalNormal);
      fixture.coverageCases[0].v3Target[field] = replacement;
      const driftedReport = await runScenarioWithBundle(fixture, bundle, { skipStoredHashCheck: true });
      const driftedBaseline = {
        ...baseline,
        reports: baseline.reports.map((report) => (
          report.scenarioId === 'normal-resolution' ? driftedReport : report
        )),
      };
      let rejected = false;
      try {
        assertManifestMatches(manifest, driftedBaseline);
      } catch {
        rejected = true;
      }
      record('负例B-' + field + '-合法内容漂移：manifest 深度比对必须拒绝', rejected);
    }
  }

  // ── 负例 17：B2a 同一正文中交换两个单元的证据——正文都存在但单元语义错位，必须被单元绑定拒绝 ──
  {
    const { fixture, bundle } = clone(originalEarly);
    const response = bundle.responses.find((item) => item.responseId === 'main_multi_unit_claim');
    response.rawOutput = response.rawOutput.replace(
      '{"units":[{"unitId":"unit_beast_confirm","evidence":["支援舱段异动已经确认","确认末日兽威胁"]},{"unitId":"unit_beast_battle","evidence":["末日兽被击退","支援舱段危机平息"]},{"unitId":"unit_aftermath","evidence":["善后与调查同步完成收尾"]}]}',
      '{"units":[{"unitId":"unit_beast_confirm","evidence":["末日兽被击退","支援舱段危机平息"]},{"unitId":"unit_beast_battle","evidence":["支援舱段异动已经确认","确认末日兽威胁"]},{"unitId":"unit_aftermath","evidence":["善后与调查同步完成收尾"]}]}'
    );
    const report = await runScenarioWithBundle(fixture, bundle, { skipStoredHashCheck: true });
    const coverage = report.coverageReports.find((item) => item.coverageId === 'multi-unit-partial-advance');
    const rejectedObserved = coverage.observedCodes.includes('EVIDENCE_BINDING_REJECTED');
    const confirmValid = (coverage.transitions[0]?.validEvidenceByUnit?.unit_beast_confirm ?? []).length;
    const battleValid = (coverage.transitions[0]?.validEvidenceByUnit?.unit_beast_battle ?? []).length;
    const aftermathValid = (coverage.transitions[0]?.validEvidenceByUnit?.unit_aftermath ?? []).length;
    record('负例17：B2a 交换两单元证据后单元语义绑定必须拒绝（正文存在但语义错位）',
      rejectedObserved && confirmValid === 0 && battleValid === 0 && aftermathValid === 1,
      'validEvidenceByUnit={unit_beast_confirm:' + confirmValid + ',unit_beast_battle:' + battleValid + ',unit_aftermath:' + aftermathValid + '}');
  }

  // ── 负例 13：篡改 coverage v3Target.allowedFinalSideEffects ──
  // 13a：清空数组 → runner 结构校验必须拒绝；13b：内容篡改 → manifest 内容锁定必须拒绝。
  {
    const { fixture, bundle } = clone(originalNormal);
    fixture.coverageCases[0].v3Target.allowedFinalSideEffects = [];
    let rejected = false;
    try {
      await runScenarioWithBundle(fixture, bundle, { skipStoredHashCheck: true });
    } catch (error) {
      rejected = /allowedFinalSideEffects/u.test(error.message);
    }
    record('负例13a：清空 coverage v3Target.allowedFinalSideEffects 必须被 runner 拒绝', rejected);
  }
  {
    const { fixture, bundle } = clone(originalNormal);
    fixture.coverageCases[0].v3Target.allowedFinalSideEffects = ['tampered_coverage_side_effect'];
    const tamperedReport = await runScenarioWithBundle(fixture, bundle, { skipStoredHashCheck: true });
    const tamperedBaseline = {
      ...baseline,
      reports: baseline.reports.map((report) => (
        report.scenarioId === 'normal-resolution' ? tamperedReport : report
      )),
    };
    let rejected = false;
    try {
      assertManifestMatches(manifest, tamperedBaseline);
    } catch {
      rejected = true;
    }
    record('负例13b：篡改 coverage v3Target.allowedFinalSideEffects 内容必须被 manifest 锁定拒绝', rejected);
  }

  // ── 正向实验 14/15：删除/翻转 B1 completionValid 字段，观察码必须保持不变（证明无关键依赖） ──
  {
    const { fixture, bundle } = clone(originalNormal);
    fixture.coverageCases[0].steps[0].completionValid = true; // 人工加回 true
    const report = await runScenarioWithBundle(fixture, bundle, { skipStoredHashCheck: true });
    const stallStill = report.coverageReports[0].observedCodes.includes('VALID_COMPLETION_PROGRESS_STALLED');
    record('实验14：人工加回 completionValid=true 不影响观察码（仍触发）', stallStill, 'observed=' + JSON.stringify(report.coverageReports[0].observedCodes));
  }
  {
    const { fixture, bundle } = clone(originalNormal);
    fixture.coverageCases[0].steps[0].completionValid = false; // 人工翻转 false
    const report = await runScenarioWithBundle(fixture, bundle, { skipStoredHashCheck: true });
    const stallStill = report.coverageReports[0].observedCodes.includes('VALID_COMPLETION_PROGRESS_STALLED');
    record('实验15：人工翻转 completionValid=false 不影响观察码（仍触发）', stallStill, 'observed=' + JSON.stringify(report.coverageReports[0].observedCodes));
  }

  // ── 负例 4：修改某 response 的 allowedFinalSideEffects 后 manifest 校验必须失败 ──
  {
    const tampered = clone(manifest);
    tampered.scenarios[0].responses[0].allowedFinalSideEffects = ['tampered_side_effect'];
    let rejected = false;
    try {
      assertManifestMatches(tampered, baseline);
    } catch {
      rejected = true;
    }
    record('负例4：篡改 allowedFinalSideEffects 后 manifest 校验必须拒绝', rejected);
  }

  // ── 负例 5：添加未被任何步骤引用的孤立固定返回必须失败 ──
  {
    const { fixture, bundle } = clone(originalNormal);
    bundle.responses.push({
      responseId: 'orphan_response_x',
      service: 'main',
      sourceType: 'synthetic_adversarial',
      basedOn: '负例：孤立返回',
      productionUse: false,
      inputStateFingerprint: bundle.responses[0].inputStateFingerprint,
      requestSummary: { turnId: 'turn_normal_009', playerIntent: '无引用' },
      rawOutput: '<正文>孤立返回正文。</正文>',
      rawOutputSha256: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      expectedAdjudication: 'orphan',
      allowedFinalSideEffects: [],
    });
    let rejected = false;
    try {
      await runScenarioWithBundle(fixture, bundle, { skipStoredHashCheck: true });
    } catch (error) {
      rejected = /orphan fixed response/u.test(error.message);
    }
    record('负例5：新增未被引用的孤立返回必须被拒绝', rejected);
  }

  // ── 负例 6：修改 world 返回内容但不更新 manifest ──
  {
    const { fixture, bundle } = clone(originalWorldbg);
    const response = bundle.responses.find((item) => item.responseId === 'world_background_due');
    response.rawOutput = response.rawOutput.replace('后台排期到期结算', '篡改后的原因');
    const tamperedReport = await runScenarioWithBundle(fixture, bundle, { skipStoredHashCheck: true });
    const tamperedBaseline = {
      ...baseline,
      reports: baseline.reports.map((report) => (
        report.scenarioId === 'world-background-resolution' ? tamperedReport : report
      )),
    };
    let rejected = false;
    try {
      assertManifestMatches(manifest, tamperedBaseline);
    } catch {
      rejected = true;
    }
    record('负例6：修改 world 返回但不更新 manifest 必须被拒绝', rejected);
  }

  // ── 负例 7：baseline 不通过时 --update-manifest 不得写文件 ──
  {
    const manifestPath = path.join(ROOT, MANIFEST_PATH);
    const beforeHash = sha256File(manifestPath);
    let rejected = false;
    try {
      updateManifestWithGuard({ baseline: { ...baseline, pass: false } });
    } catch {
      rejected = true;
    }
    const afterHash = sha256File(manifestPath);
    record('负例7：baseline 未通过时 manifest 更新必须拒绝且不写文件', rejected && beforeHash === afterHash);
  }

  if (failures.length) {
    console.error('tamper regression failed: ' + failures.join(', '));
    process.exit(1);
  }
  console.log('story-composition-v3 tamper regression passed.');
}

main().catch((error) => {
  console.error('tamper regression crashed: ' + (error instanceof Error ? error.stack || error.message : String(error)));
  process.exit(1);
});
