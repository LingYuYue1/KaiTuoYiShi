import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const presetDir = path.join(root, 'public', 'zhiku-presets');
const bundlePath = path.join(os.tmpdir(), `zhiku-stage4-injection-${process.pid}-${Date.now()}.mjs`);
const characterFields = [
  '核心身份与阵营',
  '独立人格与行为',
  '说话方式',
  '台词语料',
  '外貌锚点',
  '当前形态与能力边界',
  '精简角色故事',
  '演绎红线',
];
const loreFields = ['核心定义', '关键事实', '叙事用途', '演绎边界'];

function readSource(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function characterInjection(name) {
  return {
    类型: 'character',
    核心身份与阵营: `${name}的核心身份与阵营`,
    独立人格与行为: `${name}的独立人格与行为`,
    说话方式: `${name}的说话方式`,
    台词语料: `${name}的正式台词语料`,
    外貌锚点: `${name}的外貌锚点`,
    当前形态与能力边界: `${name}的当前形态与能力边界`,
    精简角色故事: `${name}的精简角色故事`,
    演绎红线: `${name}的演绎红线`,
  };
}

try {
  const files = fs.readdirSync(presetDir).filter((name) => name.endsWith('.json')).sort();
  assert(files.length === 23, `expected 23 bundled preset files, got ${files.length}`);
  const entries = files.flatMap((fileName) => {
    const data = JSON.parse(fs.readFileSync(path.join(presetDir, fileName), 'utf8'));
    return (data.entries ?? []).map((entry) => ({ ...entry, __fileName: fileName }));
  });
  assert(entries.length === 162, `expected 162 bundled entries, got ${entries.length}`);
  assert(entries.filter((entry) => entry.分类 === 'character').length === 99, 'expected 99 character entries');
  assert(entries.every((entry) => entry.分类 !== 'story'), 'bundled ordinary presets must not contain story archives');

  for (const entry of entries) {
    const content = entry.注入内容;
    const expectedType = entry.分类 === 'character' ? 'character' : 'lore';
    assert(content?.类型 === expectedType, `${entry.__fileName} / ${entry.标题} injection type mismatch`);
    const fields = expectedType === 'character' ? characterFields : loreFields;
    for (const field of fields) {
      assert(String(content[field] ?? '').trim(), `${entry.__fileName} / ${entry.标题} missing ${field}`);
    }
    if (content.类型 === 'character') {
      assert(!/^\s*[-*]?\s*(?:角色ID|核心触发词|解锁状态|使用范围|默认可用范围|资料类型|辅助关键词|互斥组ID)[:：]/mu.test(`${content.核心身份与阵营}\n${content.当前形态与能力边界}`), `${entry.__fileName} / ${entry.标题} leaked maintenance metadata into static injection`);
    } else {
      assert(content.核心定义 === String(entry.摘要 ?? '').trim(), `${entry.__fileName} / ${entry.标题} lore definition is not aligned with the archive summary`);
      assert(content.叙事用途.includes(`「${entry.标题}」`) && content.演绎边界.includes(`「${entry.标题}」`), `${entry.__fileName} / ${entry.标题} lore usage or boundary is still a generic placeholder`);
    }
  }
  const voiceEntries = entries.filter((entry) => (
    entry.分类 === 'character' && !/(^|\n)##\s+/u.test(entry.注入内容.台词语料)
  ));
  assert(voiceEntries.length === 99, 'all character voice corpora must be stored as injection field content, not nested archive headings');
  const noCorpus = entries.filter((entry) => entry.分类 === 'character' && entry.注入内容.台词语料.includes('未收录可核验'));
  assert(noCorpus.length === 0, 'all current character archives must provide curated voice corpus content');

  await build({
    stdin: {
      contents: [
        "export * from './models/zhiku';",
        "export * from './data/zhikuCustomGovernance';",
        "export * from './services/zhikuRetrieval';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'zhiku-stage4-injection-entry.ts',
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

  const migratedCharacter = api.归一化智库系统({ 条目: [entries.find((entry) => entry.分类 === 'character')] }).条目[0];
  const characterPreview = api.buildZhikuEntryInjectionPreview(migratedCharacter);
  assert(characterPreview === api.renderZhikuEntryStaticInjection(migratedCharacter), 'player injection preview must equal the production static renderer');
  assert(characterPreview.includes(`【人物：${migratedCharacter.标题}】`), 'character renderer title missing');
  for (const field of characterFields) assert(characterPreview.includes(`${field}：`), `character renderer missing ${field}`);
  assert(!characterPreview.includes(migratedCharacter.原文), 'complete character archive leaked into static injection');
  assert(!characterPreview.includes(migratedCharacter.来源), 'source metadata leaked into character injection');

  const migratedLore = api.归一化智库系统({ 条目: [entries.find((entry) => entry.分类 === 'location')] }).条目[0];
  const lorePreview = api.buildZhikuEntryInjectionPreview(migratedLore);
  assert(lorePreview === api.renderZhikuEntryStaticInjection(migratedLore), 'lore preview must equal production static renderer');
  for (const field of loreFields) assert(lorePreview.includes(`${field}：`), `lore renderer missing ${field}`);
  assert(!lorePreview.includes(migratedLore.原文), 'complete lore archive leaked into static injection');
  assert(!lorePreview.includes(migratedLore.来源), 'source metadata leaked into lore injection');

  const missingInjection = api.创建智库条目({
    标题: '缺失注入资料',
    分类: 'location',
    原文: '完整档案原文',
    触发关键词: ['缺失注入资料'],
    关键词: ['不可进入payload的治理标签'],
  });
  assert(api.retrieveZhikuContext({ 条目: [missingInjection] }, '缺失注入资料', 5).entries.length === 0, 'incomplete injection content entered production recall');
  assert(api.诊断智库条目健康度(missingInjection).status === 'invalid', 'missing injection content must be a health error');

  let rejectedMissing = false;
  try {
    api.创建自制智库条目([], {
      标题: '不完整自制资料',
      分类: 'location',
      原文: '完整档案原文',
      关键词: ['不完整自制资料'],
    });
  } catch {
    rejectedMissing = true;
  }
  assert(rejectedMissing, 'custom create must reject missing injection content');

  const completeCustom = api.创建自制智库条目([], {
    标题: '完整自制资料',
    分类: 'character',
    原文: '只供玩家预览的完整档案',
    注入内容: characterInjection('完整自制资料'),
    触发关键词: ['完整自制资料'],
    关键词: ['不应进入生产payload的标签'],
  });
  assert(completeCustom.id === 'ZZ-000', 'complete custom entry did not use ZZ id');
  assert(completeCustom.资料版本 === 3, 'stage4 custom schema version must be 3');
  assert(api.诊断智库条目健康度(completeCustom).status !== 'invalid', 'complete custom entry must pass hard health validation');

  const cast = Array.from({ length: 5 }, (_, index) => {
    const name = `群像角色${index + 1}`;
    const entry = api.创建智库条目({
      标题: name,
      分类: 'character',
      原文: `${name}完整档案原文，仅供预览。`,
      注入内容: characterInjection(name),
      触发关键词: [name],
      关键词: [`治理标签${index + 1}`],
      可用于联动: true,
      重要度: 5,
    });
    entry.id = `TEST-${String(index + 1).padStart(3, '0')}`;
    return entry;
  });
  const ensemble = api.retrieveZhikuContext({ 条目: cast }, cast.map((entry) => entry.标题).join('、'), 8);
  assert(ensemble.entries.length === 5, 'ensemble recall dropped characters after four entries');
  assert(ensemble.diagnostics.单条静态注入体量.length === 5, 'per-entry volume diagnostics did not retain all ensemble characters');
  assert(ensemble.diagnostics.单条静态注入体量.every((item) => item.保留优先级 === '必须人物'), 'ensemble character priority must remain explicit');
  assert(ensemble.diagnostics.静态注入估算Token > 0, 'token estimate must be diagnostic and positive');
  assert(cast.every((entry) => ensemble.injection.includes(entry.标题)), 'fixed total token pruning removed an important ensemble character');
  for (const entry of cast) {
    assert(!ensemble.injection.includes(entry.原文), `${entry.标题} archive leaked into payload`);
    assert(!ensemble.injection.includes(entry.关键词[0]), `${entry.标题} governance keyword leaked into payload`);
  }

  const ensembleWithFallback = api.retrieveZhikuContext(
    { 条目: cast },
    cast.map((entry) => entry.标题).join('、'),
    8,
    { presentNpcNamesForFallback: cast.map((entry) => entry.标题) },
  );
  assert(ensembleWithFallback.entries.length === 5, 'cross-channel deduplication removed an ensemble character');
  assert(ensembleWithFallback.diagnostics.去重记录.length === 5, 'cross-channel duplicate recall must be recorded per entry');

  const loreCandidates = Array.from({ length: 4 }, (_, index) => {
    const name = `相关设定${index + 1}`;
    const entry = api.创建智库条目({
      标题: name,
      分类: 'term',
      原文: `${name}完整档案原文，仅供预览。`,
      注入内容: {
        类型: 'lore',
        核心定义: `${name}核心定义`,
        关键事实: `${name}关键事实`,
        叙事用途: `${name}叙事用途`,
        演绎边界: `${name}演绎边界`,
      },
      触发关键词: [name],
      可用于联动: true,
    });
    entry.id = `LORE-${String(index + 1).padStart(3, '0')}`;
    return entry;
  });
  const limitedLore = api.retrieveZhikuContext({ 条目: loreCandidates }, loreCandidates.map((entry) => entry.标题).join('、'), 2);
  assert(limitedLore.entries.length === 2, 'ordinary related-entry limit must remain active');
  assert(limitedLore.diagnostics.删减记录.length === 2, 'ordinary entries excluded by relevance limit must have explicit diagnostics');

  const bulkyCharacter = api.创建智库条目({
    标题: '超长诊断人物',
    分类: 'character',
    原文: '完整档案原文，仅供预览。',
    注入内容: { ...characterInjection('超长诊断人物'), 台词语料: '长'.repeat(5000) },
    触发关键词: ['超长诊断人物'],
    可用于联动: true,
  });
  bulkyCharacter.id = 'TEST-LARGE';
  const bulkyResult = api.retrieveZhikuContext({ 条目: [bulkyCharacter] }, bulkyCharacter.标题, 5);
  assert(bulkyResult.entries[0]?.id === bulkyCharacter.id, 'volume warning must not prune an important character');
  assert(bulkyResult.diagnostics.体量预警.some((warning) => warning.includes('系统未自动截断')), 'oversized static injection must produce a non-pruning warning');

  const retrievalSource = readSource('services/zhikuRetrieval.ts');
  const sendSource = readSource('hooks/useGame/sendWorkflow.ts');
  const snapshotSource = readSource('hooks/useGame/contextSnapshot.ts');
  const phoneSource = readSource('services/ai/phoneService.ts');
  const compilerSource = readSource('services/zhikuRuntimeCompiler.ts');
  const adapterSource = readSource('components/features/ZhikuV3/productionAdapter.ts');
  assert(!retrievalSource.includes('formatCharacterSourceSection'), 'legacy source-section formatter still exists');
  assert(!retrievalSource.includes('formatCharacterZhikuInjectionEntry'), 'legacy character formatter still exists');
  assert(!/function renderZhikuEntryStaticInjection[\s\S]*?entry\.原文/u.test(retrievalSource), 'production renderer reads archive source');
  assert(!/const characters = [^\n]+\.slice\(0, 4\)/u.test(sendSource), 'tail enforcement still truncates ensemble characters at four');
  assert(compilerSource.includes('content.说话方式') && compilerSource.includes('content.演绎红线'), 'compiled tail enforcement does not use explicit injection fields');
  assert(sendSource.includes('去重记录：') && sendSource.includes('删减记录：') && sendSource.includes('体量预警：'), 'send diagnostics must expose deduplication, trimming, and volume warnings');
  assert(snapshotSource.includes('去重记录：') && snapshotSource.includes('删减记录：') && snapshotSource.includes('体量预警：'), 'context snapshot must expose the same stage4 diagnostics');
  assert(!phoneSource.includes("entry.摘要 || entry.原文.slice"), 'phone persona still falls back to archive source');
  assert(adapterSource.includes('buildZhikuEntryInjectionPreview(entry)'), 'production adapter must use the shared static renderer preview');
  assert(!retrievalSource.includes('MAX_ZHIKU_TOKENS'), 'fixed total zhiku token cap must not be introduced');

  console.log(`ZHIKU_STAGE4_INJECTION_CONTENT_REGRESSION_OK files=${files.length} entries=${entries.length} ensemble=${ensemble.entries.length} tokens=${ensemble.diagnostics.静态注入估算Token}`);
} finally {
  try {
    fs.rmSync(bundlePath, { force: true });
  } catch {
    // Best-effort cleanup only.
  }
}
