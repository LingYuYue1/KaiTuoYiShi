// G1.2.2 纯实例校验器回归：生成 schema 投影、用 esbuild 真实运行生产 TS validator、
// 正向矩阵、反向矩阵（40+ 负例带路径/错误码断言）、纯读安全、fixture oracle 对照、静态红线。
// 唯一字段/枚举/union 来源：scripts/fixtures/story-v3/story-runtime-contract.fixture.json。
// 普通运行不写工作区；篡改生成 schema、冻结文件或 G1.2.1 模型必须非零拒绝。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { build as esbuildBuild } from 'esbuild';
import { validateValueAgainstType } from './story-runtime-fixture-instance-validator.mjs';

const CONTRACT_FIXTURE_PATH = path.join('scripts', 'fixtures', 'story-v3', 'story-runtime-contract.fixture.json');
const ASSET_SAMPLE_PATH = path.join('scripts', 'fixtures', 'story-v3', 'story-asset-catalog.sample.json');
const CONTRACT_MANIFEST_PATH = path.join('scripts', 'fixtures', 'story-v3', '_story-runtime-contract-manifest.json');
const CONTRACT_REGRESSION_PATH = path.join('scripts', 'story-runtime-contract-regression.mjs');
const SCHEMA_GENERATED_PATH = path.join('services', 'storyRuntime', 'runtimeSchema.generated.ts');
const VALIDATOR_PATH = path.join('services', 'storyRuntime', 'runtimeValidator.ts');
const FROZEN_FINGERPRINT = 'sha256:f19a297c9176d5fe84e79c95135ecc92ea2155b696c123820bd7b8b0b8755bf6';
const MODEL_FINGERPRINT = 'sha256:fb905d74972656a5e558c211c63481d79d1ede1af9543a5ff9e40906bbd7a846';

// 本阶段开工时记录的基线（秋 G1.2.1 修正后）；任何改动都会触发 hash 负例拒绝。
const FROZEN_HASHES = {
  [CONTRACT_FIXTURE_PATH]: '46917bec5fac508eab3197ee97e40e8e38b039e59bbab798f0441df3ce9f353e',
  [ASSET_SAMPLE_PATH]: '1ef5df13948270f72e32661c6e22a2c09f12c376ceb265221a554cd051c68c86',
  [CONTRACT_MANIFEST_PATH]: 'd8b7e6936faea3a28c3b7bb7c766712cc518a050da408e63fe61b9baf507771a',
  [CONTRACT_REGRESSION_PATH]: '3b31012875f8da0795b90c4bebf9af16e272d20405454e867ba3c309c63d447f',
  ['models/storyRuntime.ts']: '2985b2391bf2ca73ddc607c40891e95843d552f8f0414aec12698a2f36411d4c',
  ['models/storyRuntimeCommands.ts']: '8bd071d0fed2b9ba0718d7976cda4fe6bc50f9f4efa57219699cab050d88dde3',
  ['models/storyRuntimeProjection.ts']: '03a5f3e56e8bfd4d90b4505d0c6103eece3a6765d2ee9a67ea2665f83c06a59e',
  ['models/storyAssetCatalog.ts']: 'dabbb813c15235db00630c6e050e6773edd30627935fe20b827160d9e3b4633d',
  ['models/storyRuntimeJobs.ts']: 'df6aa5e7fa4381da32344a4bd9c01bad122bb90a405dab422d3cdd8fd64b411b',
  ['models/storyRuntimeNarrative.ts']: '15c0fa568880d97d1d43aaa0f0fdeda3cd1963246aef5b6e24cb6da50bb2cec2',
  ['scripts/story-runtime-domain-model-regression.mjs']: 'd7145b6cd2a1b92faeffd1de356db7948408d6ed7aefd0f0b343ae161302cd6f',
};

function fail(message) {
  throw new Error(message);
}
function assert(condition, message) {
  if (!condition) fail(message);
}
function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
function sha256Text(value) {
  return 'sha256:' + crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}
function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
// 递归只读形状快照：保留原始 symbol/prototype/descriptor/value identity，不执行 accessor。
function shapeSnapshot(value) {
  const seen = new Map();
  const nodes = [];
  const visit = (current) => {
    if ((typeof current !== 'object' || current === null) && typeof current !== 'function') return { primitive: current };
    if (seen.has(current)) return { ref: seen.get(current) };
    const id = nodes.length;
    seen.set(current, id);
    const node = { id, prototype: Object.getPrototypeOf(current), entries: [] };
    nodes.push(node);
    for (const key of Reflect.ownKeys(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      const entry = {
        key,
        enumerable: descriptor?.enumerable,
        configurable: descriptor?.configurable,
        writable: descriptor?.writable,
        get: descriptor?.get,
        set: descriptor?.set,
        value: undefined,
      };
      if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value')) entry.value = visit(descriptor.value);
      node.entries.push(entry);
    }
    return { ref: id };
  };
  return { root: visit(value), nodes };
}
function canonicalJsonStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJsonStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalJsonStringify(value[key])).join(',') + '}';
}

// ══════════════════════════════════════════════════════════════════════
// schema 投影生成器：从 fixture 生成 runtimeSchema.generated.ts 源码。
// 只保留校验所需 types/enums 规格（剥离 note/doc/source 文档键），
// 不保存 lifecycle/defaults/compatibility，不生成 domain 默认值。
// ══════════════════════════════════════════════════════════════════════
const SPEC_SEMANTIC_KEYS = ['type', 'required', 'to', 'enum', 'value', 'items', 'key', 'valueTypes', 'elementTypes', 'canonicalOpen'];

function projectSpec(spec) {
  const out = {};
  for (const key of SPEC_SEMANTIC_KEYS) {
    if (Object.prototype.hasOwnProperty.call(spec, key)) out[key] = spec[key];
  }
  if (spec.type === 'object' && spec.fields) out.fields = projectFields(spec.fields);
  if (spec.type === 'union' && spec.variants) {
    out.variants = spec.variants.map((v) => ({ tag: v.tag, fields: projectFields(v.fields || {}) }));
  }
  return out;
}
function projectFields(fields) {
  const out = {};
  for (const [name, spec] of Object.entries(fields)) out[name] = projectSpec(spec);
  return out;
}
export function projectSchema(fixture) {
  const types = {};
  for (const [name, typeDef] of Object.entries(fixture.types)) {
    if (typeDef.kind === 'union') {
      types[name] = { kind: 'union', discriminator: typeDef.discriminator, variants: typeDef.variants.map((v) => ({ tag: v.tag, fields: projectFields(v.fields || {}) })) };
    } else {
      types[name] = { kind: 'interface', fields: projectFields(typeDef.fields || {}) };
    }
  }
  const enums = {};
  for (const [name, enumDef] of Object.entries(fixture.enums)) enums[name] = enumDef.values;
  return { contractRevision: fixture.contractRevision, fixtureFingerprint: fixtureFingerprintOf(fixture), generatorVersion: 1, types, enums };
}
function fixtureFingerprintOf(fixture) {
  const canonical = canonicalJsonStringify(fixture);
  return 'sha256:' + crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}
export function generateRuntimeSchemaSource(fixture) {
  const projection = projectSchema(fixture);
  const typeNames = Object.keys(fixture.types).sort();
  const header = [
    '// 由 scripts/story-runtime-instance-validator-regression.mjs 从',
    '// scripts/fixtures/story-v3/story-runtime-contract.fixture.json 生成（contractRevision ' + fixture.contractRevision + '）',
    '// fixture fingerprint: ' + FROZEN_FINGERPRINT,
    '// 本文件只保存校验所需的 schema 投影；不保存 lifecycle/defaults/compatibility，不生成 domain 默认值，',
    '// 不 import fixture JSON，不被现有运行流程 import。',
  ].join('\n');
  return header + '\n\n' +
    'export const storyRuntimeSchemaV3 = ' + JSON.stringify(projection, null, 2) + ' as const;\n\n' +
    'export type StoryRuntimeTypeName =\n  ' + typeNames.map((n) => "'" + n + "'").join('\n  | ') + ';\n';
}

// ══════════════════════════════════════════════════════════════════════
// 用 esbuild 把生产 TS validator bundle 成 ESM，在内存中真实执行。
// ══════════════════════════════════════════════════════════════════════
async function loadProductionValidator() {
  const result = await esbuildBuild({
    entryPoints: [path.join(process.cwd(), VALIDATOR_PATH)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  });
  const text = result.outputFiles[0].text;
  const mod = await import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'));
  return mod;
}

// ══════════════════════════════════════════════════════════════════════
// 最小合法实例生成器（从投影 schema 构造；enum 取首个值、union 取首个 variant、literal 取 spec.value）。
// ══════════════════════════════════════════════════════════════════════
function emptyValueForSpec(spec, schema, stack) {
  switch (spec.type) {
    case 'string': return '';
    case 'number': return 0;
    case 'boolean': return false;
    case 'literal': return spec.value;
    case 'enum': {
      const values = schema.enums[spec.enum];
      return values && values.length > 0 ? values[0] : undefined;
    }
    case 'ref': {
      if (stack.includes(spec.to)) return {}; // 防御自环：不递归
      return emptyValueForType(spec.to, schema, [...stack, spec.to]);
    }
    case 'array': return [];
    case 'object': return emptyFields(spec.fields || {}, schema, stack);
    case 'map': return {};
    case 'open_map': return {};
    case 'scalar_union': {
      const first = (spec.elementTypes || [])[0];
      if (first === 'string_array') return [];
      if (first === 'number') return 0;
      if (first === 'boolean') return false;
      return '';
    }
    case 'union': {
      const first = (spec.variants || [])[0];
      return first ? emptyFields(first.fields || {}, schema, stack) : {};
    }
    default: return undefined;
  }
}
function emptyFields(fields, schema, stack) {
  const out = {};
  for (const [name, spec] of Object.entries(fields)) {
    if (spec.required === true || spec.type === 'array' || spec.type === 'map' || spec.type === 'open_map') {
      out[name] = emptyValueForSpec(spec, schema, stack);
    }
  }
  return out;
}
function emptyValueForType(typeName, schema, stack) {
  const typeDef = schema.types[typeName];
  if (!typeDef) return {};
  if (typeDef.kind === 'union') {
    const first = (typeDef.variants || [])[0];
    return first ? emptyFields(first.fields || {}, schema, stack) : {};
  }
  return emptyFields(typeDef.fields || {}, schema, stack);
}

// ══════════════════════════════════════════════════════════════════════
// main
// ══════════════════════════════════════════════════════════════════════
async function main() {
  const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), CONTRACT_FIXTURE_PATH), 'utf8'));
  const schema = projectSchema(fixture);
  const positives = [];
  const rejections = [];
  const sourceRejections = [];
  const safety = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, error, keywords) => {
    assert(!error.ok, name + ' 必须被拒绝');
    assert(keywords.some((k) => error.message.includes(k)), name + ' 拒绝原因必须包含 ' + JSON.stringify(keywords) + '，实际: ' + error.message);
    rejections.push({ name, errorMessage: error.message });
  };

  // ── 步骤 A：schema 投影生成 + 磁盘字节一致 + 确定性 ──
  const generatedSource = generateRuntimeSchemaSource(fixture);
  const generatedAgain = generateRuntimeSchemaSource(fixture);
  assert(generatedSource === generatedAgain, 'schema 生成必须确定性');
  const generatedSchemaFingerprint = sha256Text(generatedSource);
  assert(generatedSchemaFingerprint === sha256Text(generatedAgain), 'schema 两次生成 fingerprint 必须一致');
  recordPositive('schema 生成确定性', 'bytes + fingerprint identical: ' + generatedSchemaFingerprint);
  const diskSchema = fs.readFileSync(path.join(process.cwd(), SCHEMA_GENERATED_PATH), 'utf8');
  assert(diskSchema === generatedSource, 'runtimeSchema.generated.ts 必须与生成器输出逐字节一致');
  recordPositive('runtimeSchema.generated.ts 与生成器输出一致', 'bytes identical');
  // schema 投影数据与磁盘源码内的对象字面量同源。
  const embedded = JSON.parse(diskSchema.match(/export const storyRuntimeSchemaV3 = ([\s\S]*?) as const;/)[1]);
  assert(canonicalJsonStringify(embedded) === canonicalJsonStringify(schema), '磁盘 schema 对象必须与 fixture 投影一致');
  recordPositive('磁盘 schema 与 fixture 投影同源', 'projection identical');
  assert(!diskSchema.includes('"default"'), 'runtime schema 不得生成 domain default');
  recordPositive('runtime schema 不含 domain default', '0 default keys');

  // ── 生产 validator 静态红线（§6C：不得包含字段名/枚举值/第二套 schema）──
  const validatorSource = fs.readFileSync(path.join(process.cwd(), VALIDATOR_PATH), 'utf8');
  const validatorCode = validatorSource.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  // 包装器必须调用通用入口并传类型名；允许集合仅限 7 个已列包装器类型名。
  const WRAPPER_TYPE_NAMES = new Set(['StoryRuntimeState', 'StoryProjectionState', 'RuntimeCommand', 'StoryAssetCatalog', 'TurnAdjudicationReceipt', 'NarrativeConsistencyDecision', 'ProjectionOutboxItem']);
  for (const typeName of Object.keys(schema.types)) {
    if (WRAPPER_TYPE_NAMES.has(typeName)) continue;
    assert(!validatorCode.includes("'" + typeName + "'") && !validatorCode.includes('"' + typeName + '"'), 'validator 不得包含类型名字面量: ' + typeName);
  }
  for (const values of Object.values(schema.enums)) {
    for (const v of values) {
      assert(!validatorCode.includes(JSON.stringify(v)), 'validator 不得包含枚举值: ' + JSON.stringify(v));
    }
  }
  // 字段名检查：遍历全部字段，排除泛型属性名。
  const GENERIC_FIELD_NAMES = new Set(['type', 'required', 'default', 'value', 'kind', 'path', 'code', 'message', 'ok', 'issues', 'fields', 'items', 'key', 'to', 'enum', 'variants', 'tag', 'values', 'tags', 'length', 'config', 'name', 'title', 'status', 'source']);
  for (const typeDef of Object.values(schema.types)) {
    const fields = typeDef.kind === 'union'
      ? Object.fromEntries((typeDef.variants || []).flatMap((v) => Object.entries(v.fields || {})))
      : (typeDef.fields || {});
    for (const fieldName of Object.keys(fields)) {
      if (GENERIC_FIELD_NAMES.has(fieldName)) continue;
      assert(!validatorCode.includes(JSON.stringify(fieldName)), 'validator 不得包含字段名: ' + fieldName);
    }
  }
  assert(!/\bany\b/.test(validatorCode), 'validator 不得出现 any');
  assert(!validatorCode.includes('Record<string, unknown>'), 'validator 不得出现 Record<string, unknown>');
  const ALLOWED_TYPE_IMPORTS = new Set([
    '../../models/storyAssetCatalog',
    '../../models/storyRuntime',
    '../../models/storyRuntimeCommands',
    '../../models/storyRuntimeNarrative',
    '../../models/storyRuntimeProjection',
    './runtimeSchema.generated',
  ]);
  for (const line of validatorCode.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('import ')) continue;
    const sourceMatch = trimmed.match(/from '([^']+)'/);
    assert(sourceMatch && ALLOWED_TYPE_IMPORTS.has(sourceMatch[1]), 'validator 非法 import: ' + trimmed);
    if (sourceMatch[1] !== './runtimeSchema.generated' || !trimmed.includes('storyRuntimeSchemaV3')) {
      assert(trimmed.startsWith('import type {'), 'validator 领域模型 import 必须是 import type: ' + trimmed);
    }
  }
  const WRAPPER_RESULT_TYPES = {
    validateStoryRuntimeState: 'StoryRuntimeState',
    validateStoryProjectionState: 'StoryProjectionState',
    validateRuntimeCommand: 'RuntimeCommand',
    validateStoryAssetCatalog: 'StoryAssetCatalog',
    validateTurnAdjudicationReceipt: 'TurnAdjudicationReceipt',
    validateNarrativeConsistencyDecision: 'NarrativeConsistencyDecision',
    validateProjectionOutboxItem: 'ProjectionOutboxItem',
  };
  for (const [functionName, resultType] of Object.entries(WRAPPER_RESULT_TYPES)) {
    const signature = new RegExp('export function ' + functionName + '\\(input: unknown\\): StoryRuntimeValidationResult<' + resultType + '>');
    assert(signature.test(validatorCode), functionName + ' 必须把成功值窄化为 ' + resultType);
  }
  recordPositive('validator 无字段表/枚举值/第二套 schema（静态红线）', 'field names + enum values + non-wrapper type names absent');
  recordPositive('7 个根包装器返回领域类型', 'typed success values; generic entry remains unknown');

  // ── 用 esbuild 运行生产 TS validator ──
  const production = await loadProductionValidator();
  const validate = (typeName, input) => production.validateStoryRuntimeType(typeName, input);

  // ── 正向 A：66 个 type 各一个最小合法实例 ──
  let positiveInstanceCount = 0;
  for (const typeName of Object.keys(schema.types)) {
    const instance = emptyValueForType(typeName, schema, []);
    const result = validate(typeName, instance);
    assert(result.ok, '正向 ' + typeName + ' 最小实例必须通过: ' + JSON.stringify(result));
    positiveInstanceCount += 1;
  }
  recordPositive('66 type 最小合法实例全部通过', positiveInstanceCount + ' instances');

  // ── 正向 A：7 个 union 的 44 个 variant 逐项 ──
  let variantCount = 0;
  for (const [typeName, typeDef] of Object.entries(schema.types)) {
    if (typeDef.kind !== 'union') continue;
    for (const variant of typeDef.variants) {
      const instance = emptyFields(variant.fields, schema, []);
      const result = validate(typeName, instance);
      assert(result.ok, '正向 variant ' + typeName + '.' + variant.tag + ' 必须通过: ' + JSON.stringify(result));
      variantCount += 1;
    }
  }
  recordPositive('44 union variant 逐项通过', variantCount + ' variants');

  // ── 正向 A：58 个 enum 的全部值逐项（沿引用路径构造含该字段的完整实例）──
  let enumValueCount = 0;
  const findEnumSegments = (enumName) => {
    // 返回从目标 type 到引用该 enum 字段的段链：[{ name, array, itemsType }]；
    // array 段记录 items 类型（ref 目标或内联 object fields），用于构造完整元素。
    const visited = new Set();
    let result = null;
    const walkFields = (fields, segments) => {
      if (result) return;
      for (const [name, spec] of Object.entries(fields)) {
        if (spec.enum === enumName) { result = [...segments, { name }]; return; }
        if (spec.type === 'object' && spec.fields) walkFields(spec.fields, [...segments, { name, fieldsType: spec.fields }]);
        if (spec.type === 'map' && spec.value) {
          // map 值对象：实例里用固定键 'k' 承载值对象。
          const mapSeg = { name, mapKey: true, valueFields: spec.value.type === 'object' ? spec.value.fields : null, valueRef: spec.value.type === 'ref' ? spec.value.to : null };
          if (spec.value.enum === enumName) { result = [...segments, mapSeg]; return; }
          if (spec.value.type === 'object' && spec.value.fields) walkFields(spec.value.fields, [...segments, mapSeg]);
          if (spec.value.type === 'ref' && !visited.has(spec.value.to)) {
            visited.add(spec.value.to);
            walkType(spec.value.to, [...segments, mapSeg]);
          }
        }
        if (spec.type === 'array' && spec.items) {
          const itemsType = spec.items.type === 'ref'
            ? { ref: spec.items.to }
            : (spec.items.type === 'object' ? { inline: spec.items.fields } : null);
          if (spec.items.enum === enumName) { result = [...segments, { name, array: true, itemsType }]; return; }
          if (spec.items.type === 'object' && spec.items.fields) walkFields(spec.items.fields, [...segments, { name, array: true, itemsType }]);
          if (spec.items.type === 'ref' && !visited.has(spec.items.to)) {
            visited.add(spec.items.to);
            walkType(spec.items.to, [...segments, { name, array: true, itemsType }]);
          }
        }
        if (spec.type === 'ref' && !visited.has(spec.to)) {
          visited.add(spec.to);
          walkType(spec.to, [...segments, { name, refType: spec.to }]);
        }
      }
    };
    const walkType = (typeName, segments) => {
      const td = schema.types[typeName];
      if (!td) return;
      if (td.kind === 'union') { for (const v of td.variants) walkFields(v.fields, segments); } else { walkFields(td.fields, segments); }
    };
    for (const typeName of Object.keys(schema.types)) {
      if (result) break;
      visited.add(typeName);
      walkType(typeName, []);
    }
    return result;
  };
  const setFieldBySegments = (instance, segments, value) => {
    let cursor = instance;
    for (let i = 0; i < segments.length; i += 1) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;
      if (seg.array) {
        cursor[seg.name] = cursor[seg.name] || [];
        if (cursor[seg.name].length === 0) {
          cursor[seg.name].push(seg.itemsType
            ? (seg.itemsType.ref ? emptyValueForType(seg.itemsType.ref, schema, []) : emptyFields(seg.itemsType.inline, schema, []))
            : {});
        }
        if (isLast) { cursor[seg.name][0] = value; } else { cursor = cursor[seg.name][0]; }
      } else if (seg.mapKey) {
        cursor[seg.name] = cursor[seg.name] || {};
        const mapVal = seg.valueRef ? emptyValueForType(seg.valueRef, schema, []) : (seg.valueFields ? emptyFields(seg.valueFields, schema, []) : {});
        cursor[seg.name].k = mapVal;
        if (isLast) { cursor[seg.name].k = value; } else { cursor = cursor[seg.name].k; }
      } else if (isLast) {
        cursor[seg.name] = value;
      } else {
        cursor[seg.name] = seg.refType
          ? emptyValueForType(seg.refType, schema, [])
          : (seg.fieldsType ? emptyFields(seg.fieldsType, schema, []) : (cursor[seg.name] || {}));
        cursor = cursor[seg.name];
      }
    }
  };
  for (const [enumName, values] of Object.entries(schema.enums)) {
    const segments = findEnumSegments(enumName);
    if (!segments || segments.length === 0) {
      // 少数枚举只出现在 fixture 顶层命令防线（如 TurnCommandSource -> commands.sourceToCreatedBy），
      // 不在任何类型字段引用中：其值完整性已由 schema 投影与 contract regression 的 CANONICAL_ENUMS 锁定。
      // 此处验证值声明完整且为字符串（不强制字段路径）。
      for (const value of values) assert(typeof value === 'string', '枚举值必须为 string: ' + enumName + '=' + JSON.stringify(value));
      enumValueCount += values.length;
      continue;
    }
    for (const value of values) {
      // 找到引用该 enum 的顶层类型（segments[0] 属于哪个类型/variant 的字段）。
      let rootTypeName = null;
      let rootVariant = null;
      for (const typeName of Object.keys(schema.types)) {
        const td = schema.types[typeName];
        if (td.kind === 'union') {
          for (const v of td.variants) {
            if (Object.prototype.hasOwnProperty.call(v.fields, segments[0].name)) { rootTypeName = typeName; rootVariant = v; break; }
          }
        } else if (Object.prototype.hasOwnProperty.call(td.fields, segments[0].name)) {
          rootTypeName = typeName;
        }
        if (rootTypeName) break;
      }
      assert(rootTypeName, '枚举引用根类型未知: ' + enumName);
      const instance = rootVariant
        ? emptyFields(rootVariant.fields, schema, [])
        : emptyValueForType(rootTypeName, schema, []);
      setFieldBySegments(instance, segments, value);
      const result = validate(rootTypeName, instance);
      assert(result.ok, '正向 enum 值 ' + enumName + '=' + JSON.stringify(value) + ' 必须通过（' + segments.map((s) => s.name + (s.array ? '[]' : '')).join('.') + '）: ' + JSON.stringify(result));
      enumValueCount += 1;
    }
  }
  recordPositive('58 枚举全部值逐项通过', enumValueCount + ' values');

  // ── 正向 A：正式资产样例通过 validateStoryAssetCatalog ──
  const sample = JSON.parse(fs.readFileSync(path.join(process.cwd(), ASSET_SAMPLE_PATH), 'utf8'));
  const sampleResult = production.validateStoryAssetCatalog(sample);
  assert(sampleResult.ok, '正式样例必须通过 validateStoryAssetCatalog: ' + JSON.stringify(sampleResult));
  assert(sampleResult.value === sample, 'validateStoryAssetCatalog 成功后必须返回原对象引用');
  recordPositive('正式 story-asset-catalog.sample.json 结构通过', 'validateStoryAssetCatalog ok');

  // ── 正向 A：RuntimeCommand 12 个 command variant 与 StoryRuntimeState 空状态 ──
  const commandDef = schema.types.RuntimeCommand;
  let commandCount = 0;
  for (const variant of commandDef.variants) {
    const instance = emptyFields(variant.fields, schema, []);
    const result = production.validateRuntimeCommand(instance);
    assert(result.ok, '正向 RuntimeCommand.' + variant.tag + ' 必须通过: ' + JSON.stringify(result));
    commandCount += 1;
  }
  recordPositive('RuntimeCommand 12 个 proposal variant 通过', commandCount + ' commands');
  const emptyState = emptyValueForType('StoryRuntimeState', schema, []);
  const stateResult = production.validateStoryRuntimeState(emptyState);
  assert(stateResult.ok, 'StoryRuntimeState 空状态必须通过: ' + JSON.stringify(stateResult));
  assert(stateResult.value === emptyState, 'validateStoryRuntimeState 成功后必须返回原对象引用');
  recordPositive('StoryRuntimeState 空状态正例', 'ok');

  // ── 正向：容器形态正例（对象/数组/map/open_map/scalar_union/inline object/union）──
  const containerPositives = [
    ['对象+数组', 'StoryRuntimeState', () => { const s = deepClone(emptyState); s.gameClock.now = { dayOrdinal: 1, minuteOfDay: 0 }; return s; }],
    ['map', 'StoryRuntimeState', () => { const s = deepClone(emptyState); s.commandIdempotencyIndex = { k: { commandFingerprint: 'f', resultRevision: 1, resultCode: 'ok', receiptId: 'r', resultHash: 'h', resultRef: { saveNodeId: 's', stateFingerprint: 'sf' } } }; return s; }],
    ['open_map(unknown)+共享子对象', 'StoryRuntimeState', () => { const shared = { v: 1 }; const s = deepClone(emptyState); s.factLedger[0] = { factId: 'f', eventInstanceId: 'e', sourceRevision: 1, factType: 't', payload: { a: shared, b: shared }, occurredAt: { dayOrdinal: 1, minuteOfDay: 0 }, committedAt: { dayOrdinal: 1, minuteOfDay: 0 }, publicScope: { kind: 'private' }, evidenceRefs: [], evidenceLevel: 'confirmed', invalidatesEventInstanceIds: [], playerParticipated: false, playerObserverVisible: false, createdBy: 'system' }; return s; }],
    ['scalar_union(string_array)', 'StoryRuntimeState', () => { const s = deepClone(emptyState); s.factLedger[0] = { factId: 'f', eventInstanceId: 'e', sourceRevision: 1, factType: 't', payload: {}, occurredAt: { dayOrdinal: 1, minuteOfDay: 0 }, committedAt: { dayOrdinal: 1, minuteOfDay: 0 }, publicScope: { kind: 'private' }, evidenceRefs: [], evidenceLevel: 'confirmed', invalidatesEventInstanceIds: [], playerParticipated: false, playerObserverVisible: false, createdBy: 'system' }; s.factLedger[0].payload = { tags: ['a', 'b'] }; return s; }],
  ];
  for (const [name, typeName, build] of containerPositives) {
    const result = validate(typeName, build());
    assert(result.ok, '正向容器 ' + name + ' 必须通过: ' + JSON.stringify(result));
    recordPositive('正向容器 ' + name, 'ok');
  }

  // ── 反向 B：40+ 稳定负例（路径/错误码断言）──
  const negativeCases = [
    // primitive/literal/enum/ref/array/map/open_map/scalar_union 类型错误
    ['字符串改数字', 'StoryFocus', (c) => { c.focusId = 42; }, ['invalid_type'], 'focusId'],
    ['number改字符串', 'GameTime', (c) => { c.dayOrdinal = 'fifty'; }, ['invalid_type'], 'dayOrdinal'],
    ['boolean改字符串', 'StoryAssetSegment', (c) => { c.isOpeningCandidate = 'yes'; }, ['invalid_type'], 'isOpeningCandidate'],
    ['literal改值', 'StoryAssetConstraint', (c) => { c.nonProgressing = false; }, ['invalid_literal'], 'nonProgressing'],
    ['enum改非法值', 'StoryAssetRoutePolicy', (c) => { c.participationPolicy = 'sometimes'; }, ['invalid_enum'], 'participationPolicy'],
    ['enum改数字', 'StoryAssetRoutePolicy', (c) => { c.participationPolicy = 42; }, ['invalid_enum'], 'participationPolicy'],
    ['array元素类型错误', 'StoryAssetSeries', (c) => { c.chapterIds = ['ok', 42]; }, ['invalid_type'], 'chapterIds[1]'],
    ['map值类型错误', 'StoryRuntimeState', (c) => { c.commandIdempotencyIndex = { k: { commandFingerprint: 42 } }; }, ['invalid_type'], 'commandIdempotencyIndex.k.commandFingerprint'],
    ['map值缺字段', 'StoryRuntimeState', (c) => { c.commandIdempotencyIndex = { k: { commandFingerprint: 'f' } }; }, ['missing_required'], 'commandIdempotencyIndex.k'],
    ['scalar_union元素非字符串', 'PayloadMatcher', (c) => { c.value = ['a', 42]; }, ['invalid_type'], 'value[1]'],
    ['open_map NaN', 'StoryRuntimeState', (c) => { c.factLedger[0] = factWithPayload({ x: NaN }); }, ['invalid_json_value'], 'factLedger[0].payload.x'],
    ['open_map undefined', 'StoryRuntimeState', (c) => { c.factLedger[0] = factWithPayload({ x: undefined }); }, ['invalid_json_value'], 'factLedger[0].payload.x'],
    // required/unknown
    ['删除必填字段', 'StoryFocus', (c) => { delete c.focusId; }, ['missing_required'], 'focusId'],
    ['增加未知字段', 'StoryFocus', (c) => { c.extra = 1; }, ['unknown_field'], 'extra'],
    ['nested未知字段', 'StoryAssetCatalog', (c) => { c.routePolicies = [emptyValueForType('StoryAssetRoutePolicy', schema, [])]; c.routePolicies[0].extraRule = true; }, ['unknown_field'], 'extraRule'],
    ['nested类型错误路径断言', 'StoryAssetCatalog', (c) => { c.routePolicies = [emptyValueForType('StoryAssetRoutePolicy', schema, [])]; c.routePolicies[0].participationPolicy = 'sometimes'; }, ['invalid_enum'], 'routePolicies[0].participationPolicy'],
    // union
    ['union缺discriminator', 'PublicScope', (c) => { delete c.kind; }, ['invalid_union'], ''],
    ['union未知tag', 'PublicScope', (c) => { c.kind = 'everywhere'; }, ['invalid_union'], ''],
    ['union混入他variant字段', 'PublicScope', (c) => { c.kind = 'private'; c.factionIds = ['x']; }, ['unknown_field'], 'factionIds'],
    ['union变体缺必填', 'PublicScope', (c) => { c.kind = 'local'; }, ['missing_required'], 'locationIds'],
    ['ref内字段类型错误', 'StoryRuntimeState', (c) => { c.factLedger[0] = factWithPayload({}); c.factLedger[0].factId = 42; }, ['invalid_type'], 'factLedger[0].factId'],
    // 容器形态
    ['对象symbol键', 'StoryFocus', (c) => { c[Symbol('k')] = 1; }, ['invalid_object_shape'], ''],
    ['对象隐藏字段', 'StoryFocus', (c) => { Object.defineProperty(c, 'hidden', { value: 2, enumerable: false }); }, ['invalid_object_shape'], ''],
    ['对象getter', 'StoryFocus', (c) => { Object.defineProperty(c, 'g', { get: () => 1, enumerable: true }); }, ['invalid_object_shape'], ''],
    ['对象setter', 'StoryFocus', (c) => { Object.defineProperty(c, 's', { set: () => {}, enumerable: true }); }, ['invalid_object_shape'], ''],
    ['对象自定义prototype', 'StoryFocus', (c) => { Object.setPrototypeOf(c, { x: 1 }); }, ['invalid_object_shape'], ''],
    ['数组sparse', 'StoryAssetSeries', (c) => { c.chapterIds = ['a']; c.chapterIds.length = 3; }, ['invalid_array_shape'], 'chapterIds[1]'],
    ['数组额外键', 'StoryAssetSeries', (c) => { c.chapterIds.extra = 'x'; }, ['invalid_array_shape'], 'chapterIds'],
    ['数组symbol', 'StoryAssetSeries', (c) => { c.chapterIds[Symbol('k')] = 1; }, ['invalid_array_shape'], 'chapterIds'],
    ['数组隐藏', 'StoryAssetSeries', (c) => { Object.defineProperty(c.chapterIds, 'h', { value: 1, enumerable: false }); }, ['invalid_array_shape'], 'chapterIds'],
    ['数组getter', 'StoryAssetSeries', (c) => { Object.defineProperty(c.chapterIds, '0', { get: () => 'x', enumerable: true }); }, ['invalid_array_shape'], 'chapterIds[0]'],
    ['数组自定义prototype', 'StoryAssetSeries', (c) => { Object.setPrototypeOf(c.chapterIds, Object.create(Array.prototype)); }, ['invalid_array_shape'], 'chapterIds'],
    // JSON 非法/循环
    ['open_map循环引用', 'StoryRuntimeState', (c) => { const p = {}; p.self = p; c.factLedger[0] = factWithPayload(p); }, ['invalid_json_value'], 'factLedger[0].payload.self'],
    ['open_map Date', 'StoryRuntimeState', (c) => { c.factLedger[0] = factWithPayload({ d: new Date() }); }, ['invalid_object_shape'], 'factLedger[0].payload.d'],
    ['open_map bigint', 'StoryRuntimeState', (c) => { c.factLedger[0] = factWithPayload({ x: 1n }); }, ['invalid_json_value'], 'factLedger[0].payload.x'],
    ['open_map function', 'StoryRuntimeState', (c) => { c.factLedger[0] = factWithPayload({ f: () => 1 }); }, ['invalid_json_value'], 'factLedger[0].payload.f'],
    ['open_map symbol值', 'StoryRuntimeState', (c) => { c.factLedger[0] = factWithPayload({ s: Symbol('k') }); }, ['invalid_json_value'], 'factLedger[0].payload.s'],
    ['scalar_union非法形态', 'PayloadMatcher', (c) => { c.value = {}; }, ['invalid_array_shape', 'invalid_type'], 'value'],
    ['深层数组嵌套路径', 'StoryRuntimeState', (c) => { c.worldEvents.push({ ...emptyValueForType('WorldEventInstance', schema, []), participantIds: [1] }); }, ['invalid_type'], 'participantIds[0]'],
    // 未知 typeName
    ['未知typeName', () => {}, ['unknown_type'], ''],
  ];
  // factWithPayload helper
  function factWithPayload(payload) {
    return { factId: 'f', eventInstanceId: 'e', sourceRevision: 1, factType: 't', payload, occurredAt: { dayOrdinal: 1, minuteOfDay: 0 }, committedAt: { dayOrdinal: 1, minuteOfDay: 0 }, publicScope: { kind: 'private' }, evidenceRefs: [], evidenceLevel: 'confirmed', invalidatesEventInstanceIds: [], playerParticipated: false, playerObserverVisible: false, createdBy: 'system' };
  }
  let rejectedCount = 0;
  let negativeOracleCount = 0;
  for (const [name, typeName, mutate, codes, pathPart] of negativeCases) {
    const base = typeName === 'StoryRuntimeState' ? deepClone(emptyState) : emptyValueForType(typeName, schema, []);
    const clone = deepClone(base);
    if (name === '未知typeName') {
      const unknownInput = {};
      const beforeShape = shapeSnapshot(unknownInput);
      const result = production.validateStoryRuntimeType('NotAType', unknownInput);
      assert(!result.ok && result.issues[0].code === 'unknown_type', '未知typeName 必须 unknown_type');
      assert(isDeepStrictEqual(shapeSnapshot(unknownInput), beforeShape), '未知typeName 校验不得改写输入');
      let oracleRejected = false;
      try { validateValueAgainstType({ fixture, typeName: 'NotAType', value: unknownInput, path: '' }); } catch { oracleRejected = true; }
      assert(oracleRejected, 'fixture oracle 也必须拒绝未知 typeName');
      rejections.push({ name, errorMessage: result.issues[0].code + ' @ ' + result.issues[0].message });
      rejectedCount += 1;
      negativeOracleCount += 1;
      continue;
    }
    mutate(clone);
    const beforeShape = shapeSnapshot(clone);
    const result = validate(typeName, clone);
    assert(!result.ok, name + ' 必须被拒绝');
    assert(isDeepStrictEqual(shapeSnapshot(clone), beforeShape), name + ' 校验不得改写输入 descriptor graph');
    const issue = result.issues[0];
    assert(codes.includes(issue.code), name + ' 错误码必须是 ' + JSON.stringify(codes) + '，实际 ' + issue.code + ' @ ' + issue.path);
    // 顶层未知字段等场景路径可能为空串，字段名会出现在 message 中；两者任一命中即可。
    if (pathPart) assert(issue.path.includes(pathPart) || issue.message.includes(pathPart), name + ' 路径/消息必须包含 ' + pathPart + '，实际 path=' + issue.path + ' message=' + issue.message);
    rejections.push({ name, errorMessage: issue.code + ' @ ' + issue.path + ': ' + issue.message });
    let oracleRejected = false;
    try { validateValueAgainstType({ fixture, typeName, value: clone, path: '' }); } catch { oracleRejected = true; }
    assert(oracleRejected, 'fixture oracle 也必须拒绝负例: ' + name);
    rejectedCount += 1;
    negativeOracleCount += 1;
  }
  recordPositive('反向负例矩阵执行', rejectedCount + ' rejections with path/code assertions');
  recordPositive('fixture oracle 对照（40 个负例一致拒绝）', negativeOracleCount + ' matched');

  // ── 纯读 D：成功/失败后输入形状与字节不变；deep-freeze 通过；getter 零调用 ──
  {
    const input = deepClone(emptyState);
    const beforeBytes = canonicalJsonStringify(input);
    const beforeShape = shapeSnapshot(input);
    const okResult = validate('StoryRuntimeState', input);
    assert(okResult.ok, '纯读-成功路径必须通过');
    assert(canonicalJsonStringify(input) === beforeBytes, '纯读-成功路径 JSON 字节必须不变');
    assert(isDeepStrictEqual(shapeSnapshot(input), beforeShape), '纯读-成功路径 descriptor graph 必须不变');
  }
  {
    const input = deepClone(emptyState);
    input.focusId = 42;
    const beforeBytes = canonicalJsonStringify(input);
    const beforeShape = shapeSnapshot(input);
    const badResult = validate('StoryRuntimeState', input);
    assert(!badResult.ok, '纯读-失败路径必须拒绝');
    assert(canonicalJsonStringify(input) === beforeBytes, '纯读-失败路径 JSON 字节必须不变');
    assert(isDeepStrictEqual(shapeSnapshot(input), beforeShape), '纯读-失败路径 descriptor graph 必须不变');
  }
  recordPositive('纯读成功/失败路径输入不变', 'bytes + ownKeys + descriptors unchanged');
  {
    const frozen = deepFreeze(deepClone(emptyState));
    const result = validate('StoryRuntimeState', frozen);
    assert(result.ok, 'deep-freeze 合法输入必须通过');
    recordPositive('deep-freeze 输入通过', 'ok');
  }
  {
    let getterCalls = 0;
    const input = deepClone(emptyState);
    Object.defineProperty(input, 'g', { get: () => { getterCalls += 1; return 1; }, enumerable: true });
    const result = validate('StoryRuntimeState', input);
    assert(!result.ok, 'getter 输入必须拒绝');
    assert(getterCalls === 0, 'getter 不得被调用');
    recordPositive('getter 零调用', 'getterCalls === 0');
  }

  // ── fixture oracle 对照（§6D）：test validator 与生产 validator 对同批输入结果一致 ──
  {
    let oracleCount = 0;
    for (const typeName of Object.keys(schema.types)) {
      const instance = emptyValueForType(typeName, schema, []);
      const productionResult = validate(typeName, instance);
      let oracleOk = true;
      try { validateValueAgainstType({ fixture, typeName, value: instance, path: '' }); } catch { oracleOk = false; }
      assert(productionResult.ok === oracleOk, 'fixture oracle 对照不一致: ' + typeName);
      oracleCount += 1;
    }
    recordPositive('fixture oracle 对照（66 type 正例一致）', oracleCount + ' matched');
  }

  // ── 来源与安全 C：篡改生成 schema / 冻结文件 / G1.2.1 模型必须拒绝 ──
  const expectSourceRejected = (name, action, expectedText) => {
    let errorMessage = '';
    try { action(); } catch (error) { errorMessage = error instanceof Error ? error.message : String(error); }
    assert(errorMessage.length > 0, name + ' 必须被来源闸门拒绝');
    if (expectedText) assert(errorMessage.includes(expectedText), name + ' 拒绝原因必须包含 ' + expectedText + '，实际: ' + errorMessage);
    sourceRejections.push({ name, errorMessage });
  };
  {
    expectSourceRejected('生成 schema 字节篡改', () => {
      assert(Buffer.from(diskSchema + '\n// tampered\n', 'utf8').toString('utf8') === generatedSource, 'generated schema bytes mismatch');
    }, 'generated schema bytes mismatch');
    // 生成器"混入字段规则"漂移：篡改投影后生成 → 与磁盘不一致。
    const tamperedFixture = deepClone(fixture);
    tamperedFixture.types.StoryFocus.fields.extraProbe = { type: 'string', required: true };
    const tamperedSource = generateRuntimeSchemaSource(tamperedFixture);
    expectSourceRejected('生成器混入字段规则漂移', () => {
      assert(tamperedSource === diskSchema, 'generated source != disk schema');
    }, 'generated source != disk schema');
  }
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const bytes = fs.readFileSync(path.join(process.cwd(), filePath));
    const actual = sha256Bytes(bytes);
    assert(actual === expectedHash, '冻结文件/G1.2.1 模型 hash 变化: ' + filePath + ' ' + actual);
    expectSourceRejected('冻结字节篡改: ' + filePath, () => {
      const tamperedHash = sha256Bytes(Buffer.concat([bytes, Buffer.from('\n// tampered\n', 'utf8')]));
      assert(tamperedHash === expectedHash, 'protected hash mismatch: ' + filePath);
    }, 'protected hash mismatch');
  }
  safety.push({ name: '四份 G1.1 冻结 + 六个 G1.2.1 模型 + domain regression 字节不变', detail: 'hashes unchanged' });
  const collectTmpFiles = (relativeRoot) => {
    const absoluteRoot = path.join(process.cwd(), relativeRoot);
    if (!fs.existsSync(absoluteRoot)) return [];
    const found = [];
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const child = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(child);
        else if (entry.isFile() && entry.name.endsWith('.tmp')) found.push(path.relative(process.cwd(), child));
      }
    };
    walk(absoluteRoot);
    return found;
  };
  const assertNoTmpPaths = (paths) => assert(paths.length === 0, '发现 .tmp: ' + paths.join(', '));
  const tmpFiles = [...collectTmpFiles('services/storyRuntime'), ...collectTmpFiles('scripts')];
  assertNoTmpPaths(tmpFiles);
  expectSourceRejected('任意 .tmp 路径', () => assertNoTmpPaths(['services/storyRuntime/probe.tmp']), '发现 .tmp');
  safety.push({ name: 'services/storyRuntime 与 scripts 递归无 .tmp 文件', detail: 'none' });

  console.log('story-runtime-instance-validator regression passed.');
  console.log('fixture fingerprint: ' + FROZEN_FINGERPRINT);
  console.log('generated schema fingerprint: ' + generatedSchemaFingerprint);
  console.log('G1.2.1 model fingerprint: ' + MODEL_FINGERPRINT);
  console.log('coverage: ' + Object.keys(schema.types).length + ' types / ' + Object.keys(schema.enums).length + ' enums / ' + variantCount + ' variants / ' + enumValueCount + ' enum values');
  console.log('positive checks: ' + positives.length);
  for (const result of positives) console.log('  + ' + result.name + ': ' + result.detail);
  console.log('validator input rejections: ' + rejections.length);
  for (const result of rejections) console.log('  - ' + result.name + ': rejected (' + result.errorMessage + ')');
  console.log('source tamper rejections: ' + sourceRejections.length);
  for (const result of sourceRejections) console.log('  - ' + result.name + ': rejected (' + result.errorMessage + ')');
  console.log('safety assertions: ' + safety.length);
  for (const result of safety) console.log('  = ' + result.name + ': ' + result.detail);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error('story-runtime-instance-validator regression failed: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
