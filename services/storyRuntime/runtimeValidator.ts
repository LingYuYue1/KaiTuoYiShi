// G1.2.2 纯实例结构校验器（生产，供未来运行时消费；当前不得被现有运行流程 import）。
// 唯一字段/枚举/union/required/literal/嵌套规格来源：./runtimeSchema.generated.ts（由冻结 fixture 生成）。
// 本文件是通用递归校验器，不包含任何 fixture 字段名、枚举值或第二套 schema；
// 只做实例结构校验（某输入是否符合冻结 V3 类型形状 + 错误路径），不做剧情裁决。
// 纯读取语义：不补默认值、不 trim/normalize、不排序、不改写输入；不执行 getter/setter。
import { storyRuntimeSchemaV3 } from './runtimeSchema.generated';
import type { StoryRuntimeTypeName } from './runtimeSchema.generated';
import type { StoryAssetCatalog } from '../../models/storyAssetCatalog';
import type { RuntimeCommand, TurnAdjudicationReceipt } from '../../models/storyRuntimeCommands';
import type { NarrativeConsistencyDecision } from '../../models/storyRuntimeNarrative';
import type { ProjectionOutboxItem } from '../../models/storyRuntimeProjection';
import type { StoryProjectionState, StoryRuntimeState } from '../../models/storyRuntime';

export type StoryRuntimeValidationIssueCode =
  | 'invalid_type'
  | 'missing_required'
  | 'unknown_field'
  | 'invalid_literal'
  | 'invalid_enum'
  | 'invalid_union'
  | 'invalid_json_value'
  | 'invalid_array_shape'
  | 'invalid_object_shape'
  | 'unknown_type';

export interface StoryRuntimeValidationIssue {
  code: StoryRuntimeValidationIssueCode;
  path: string;
  message: string;
}

export type StoryRuntimeValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: StoryRuntimeValidationIssue[] };

// ── schema 形状：只描述 spec/type/enum 的通用结构，不含具体字段名与枚举值 ──
interface SpecShape {
  type: string;
  required?: boolean;
  to?: string;
  enum?: string;
  value?: unknown;
  items?: SpecShape;
  key?: SpecShape;
  valueTypes?: readonly string[];
  elementTypes?: readonly string[];
  fields?: Record<string, SpecShape>;
  variants?: ReadonlyArray<{ tag: string; fields: Record<string, SpecShape> }>;
  discriminator?: string;
  canonicalOpen?: boolean;
}
interface TypeShape {
  kind: 'interface' | 'union';
  fields?: Record<string, SpecShape>;
  variants?: ReadonlyArray<{ tag: string; fields: Record<string, SpecShape> }>;
  discriminator?: string;
}
interface SchemaShape {
  contractRevision: number;
  fixtureFingerprint: string;
  generatorVersion: number;
  types: Record<string, TypeShape>;
  enums: Record<string, readonly string[]>;
}
const schema = storyRuntimeSchemaV3 as unknown as SchemaShape;

// ── 内部通用对象访问别名：不等于 open_map 的生成类型（open_map 生成 Record<string, JsonValue>）──
type ObjectRecord = { [key: string]: unknown };

// ── 纯读容器形态（G1.1.2.4 共享规则的生产化；descriptor 检查不读取 accessor）──
function fail(issues: StoryRuntimeValidationIssue[], code: StoryRuntimeValidationIssueCode, path: string, message: string): boolean {
  issues.push({ code, path, message });
  return false;
}

function isStrictPlainObject(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertPlainObject(value: unknown, path: string, issues: StoryRuntimeValidationIssue[]): boolean {
  if (!isStrictPlainObject(value)) return fail(issues, 'invalid_object_shape', path, '必须是普通对象（非 null、非数组，prototype 只能为 Object.prototype 或 null）');
  for (const key of Reflect.ownKeys(value as object)) {
    const d = Object.getOwnPropertyDescriptor(value as object, key);
    if (!d) return fail(issues, 'invalid_object_shape', path, '属性描述符缺失: ' + String(key));
    if (typeof d.get === 'function' || typeof d.set === 'function') return fail(issues, 'invalid_object_shape', path, '不允许 getter/setter 属性: ' + String(key));
    if (typeof key === 'symbol') return fail(issues, 'invalid_object_shape', path, '不允许 symbol 键: ' + String(key));
    if (!d.enumerable) return fail(issues, 'invalid_object_shape', path, '不允许不可枚举隐藏字段: ' + String(key));
  }
  return true;
}

function assertArrayShape(value: unknown, path: string, issues: StoryRuntimeValidationIssue[]): boolean {
  if (!Array.isArray(value)) return fail(issues, 'invalid_array_shape', path, '必须是数组');
  if (Object.getPrototypeOf(value) !== Array.prototype) return fail(issues, 'invalid_array_shape', path, '数组 prototype 必须是 Array.prototype');
  if (Object.getOwnPropertySymbols(value).length > 0) return fail(issues, 'invalid_array_shape', path, '数组不允许 symbol 键');
  for (let i = 0; i < value.length; i += 1) {
    const d = Object.getOwnPropertyDescriptor(value, i);
    if (!d) return fail(issues, 'invalid_array_shape', path + '[' + i + ']', '数组存在 sparse hole（缺少索引 own property）');
    if (!d.enumerable) return fail(issues, 'invalid_array_shape', path + '[' + i + ']', '数组索引不可枚举（隐藏字段）');
    if (typeof d.get === 'function' || typeof d.set === 'function') return fail(issues, 'invalid_array_shape', path + '[' + i + ']', '数组索引不允许 getter/setter');
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === 'length') continue;
    if (/^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length) continue;
    return fail(issues, 'invalid_array_shape', path, '数组存在索引之外的自有键: ' + JSON.stringify(key));
  }
  return true;
}

// 递归 JSON 值检查：祖先链"进入 add、离开 delete"——真实循环拒绝，共享非循环子对象通过。
function assertJsonValue(value: unknown, path: string, issues: StoryRuntimeValidationIssue[], ancestors: WeakSet<object> = new WeakSet()): boolean {
  if (value === null) return true;
  const t = typeof value;
  if (t === 'undefined') return fail(issues, 'invalid_json_value', path, 'undefined 不是合法 JSON 值');
  if (t === 'bigint') return fail(issues, 'invalid_json_value', path, 'bigint 不是合法 JSON 值');
  if (t === 'function' || t === 'symbol') return fail(issues, 'invalid_json_value', path, t + ' 不是合法 JSON 值');
  if (t === 'number' && !Number.isFinite(value)) return fail(issues, 'invalid_json_value', path, 'NaN/Infinity 不是合法 JSON 值');
  if (t !== 'object') return true;
  if (ancestors.has(value as object)) return fail(issues, 'invalid_json_value', path, '循环引用不是合法 JSON 值');
  if (Array.isArray(value)) {
    if (!assertArrayShape(value, path, issues)) return false;
    ancestors.add(value);
    for (let i = 0; i < value.length; i += 1) {
      if (!assertJsonValue(value[i], path + '[' + i + ']', issues, ancestors)) return false;
    }
    ancestors.delete(value);
    return true;
  }
  if (!assertPlainObject(value, path, issues)) return false;
  ancestors.add(value as object);
  for (const [key, child] of Object.entries(value as ObjectRecord)) {
    if (!assertJsonValue(child, path + '.' + key, issues, ancestors)) return false;
  }
  ancestors.delete(value as object);
  return true;
}

// ── 通用递归校验：spec -> value ──
function validateFields(fields: Record<string, SpecShape>, value: ObjectRecord, path: string, issues: StoryRuntimeValidationIssue[]): boolean {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === 'symbol') return fail(issues, 'invalid_object_shape', path, '不允许 symbol 键');
    if (!Object.prototype.hasOwnProperty.call(fields, key)) return fail(issues, 'unknown_field', path, '未知字段: ' + String(key));
  }
  for (const [name, spec] of Object.entries(fields)) {
    if (spec.required === true) {
      if (!Object.prototype.hasOwnProperty.call(value, name)) return fail(issues, 'missing_required', path + '.' + name, '缺少必填字段: ' + name);
      if (!validateSpec(spec, value[name], path + '.' + name, issues)) return false;
    } else if (Object.prototype.hasOwnProperty.call(value, name)) {
      if (!validateSpec(spec, value[name], path + '.' + name, issues)) return false;
    }
  }
  return true;
}

function validateSpec(spec: SpecShape, value: unknown, path: string, issues: StoryRuntimeValidationIssue[]): boolean {
  switch (spec.type) {
    case 'string':
      if (typeof value !== 'string') return fail(issues, 'invalid_type', path, '必须是 string，实际 ' + (value === null ? 'null' : typeof value));
      return true;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return fail(issues, 'invalid_type', path, '必须是有限 number，实际 ' + (value === null ? 'null' : typeof value));
      return true;
    case 'boolean':
      if (typeof value !== 'boolean') return fail(issues, 'invalid_type', path, '必须是 boolean，实际 ' + (value === null ? 'null' : typeof value));
      return true;
    case 'literal':
      if (value !== spec.value) return fail(issues, 'invalid_literal', path, '必须是 literal ' + JSON.stringify(spec.value) + '，实际 ' + JSON.stringify(value));
      return true;
    case 'enum': {
      const values = schema.enums[spec.enum as string];
      if (!values) return fail(issues, 'invalid_enum', path, '枚举名悬空: ' + spec.enum);
      if (!values.includes(value as string)) return fail(issues, 'invalid_enum', path, '非法枚举值 ' + JSON.stringify(value) + '（' + spec.enum + '）');
      return true;
    }
    case 'ref': {
      const target = spec.to as string;
      if (!schema.types[target]) return fail(issues, 'unknown_type', path, '引用类型名悬空: ' + target);
      return validateType(target, value, path, issues);
    }
    case 'array': {
      if (!assertArrayShape(value, path, issues)) return false;
      const arr = value as unknown[];
      for (let i = 0; i < arr.length; i += 1) {
        if (!validateSpec(spec.items as SpecShape, arr[i], path + '[' + i + ']', issues)) return false;
      }
      return true;
    }
    case 'object': {
      if (!assertPlainObject(value, path, issues)) return false;
      return validateFields(spec.fields || {}, value as ObjectRecord, path, issues);
    }
    case 'map': {
      if (!assertPlainObject(value, path, issues)) return false;
      const obj = value as ObjectRecord;
      for (const [key, child] of Object.entries(obj)) {
        if (!validateSpec(spec.key as SpecShape, key, path + '.<key>', issues)) return false;
        if (!validateSpec(spec.value as SpecShape, child, path + '.' + key, issues)) return false;
      }
      return true;
    }
    case 'open_map': {
      if (!assertPlainObject(value, path, issues)) return false;
      const obj = value as ObjectRecord;
      const valueTypes = spec.valueTypes && spec.valueTypes.length > 0 ? spec.valueTypes : ['unknown'];
      for (const [key, child] of Object.entries(obj)) {
        if (valueTypes.includes('unknown')) {
          if (!assertJsonValue(child, path + '.' + key, issues)) return false;
        } else {
          let matched = false;
          for (const allowed of valueTypes) {
            if (allowed === 'string' && typeof child === 'string') matched = true;
            if (allowed === 'number' && typeof child === 'number' && Number.isFinite(child)) matched = true;
            if (allowed === 'boolean' && typeof child === 'boolean') matched = true;
            if (allowed === 'null' && child === null) matched = true;
          }
          if (!matched) return fail(issues, 'invalid_json_value', path + '.' + key, '值类型不在开放范围 ' + JSON.stringify([...valueTypes]) + ' 内');
        }
      }
      return true;
    }
    case 'scalar_union': {
      const elementTypes = spec.elementTypes || [];
      let matched = false;
      for (const allowed of elementTypes) {
        if (allowed === 'string' && typeof value === 'string') matched = true;
        if (allowed === 'number' && typeof value === 'number' && Number.isFinite(value)) matched = true;
        if (allowed === 'boolean' && typeof value === 'boolean') matched = true;
        if (allowed === 'string_array' && typeof value === 'object') {
          if (!assertArrayShape(value, path, issues)) return false;
          matched = true;
          const arr = value as unknown[];
          for (let i = 0; i < arr.length; i += 1) {
            if (typeof arr[i] !== 'string') return fail(issues, 'invalid_type', path + '[' + i + ']', 'string_array 元素必须是 string，实际 ' + typeof arr[i]);
          }
        }
      }
      if (!matched) return fail(issues, 'invalid_type', path, '值不在 scalar_union 允许形态 ' + JSON.stringify(elementTypes) + ' 内');
      return true;
    }
    case 'union': {
      if (typeof spec.discriminator !== 'string' || spec.discriminator.length === 0) return fail(issues, 'invalid_union', path, 'union 缺 discriminator');
      if (!assertPlainObject(value, path, issues)) return false;
      const variants = spec.variants || [];
      if (variants.length === 0) return fail(issues, 'invalid_union', path, 'union 没有变体');
      const obj = value as ObjectRecord;
      const tag = obj[spec.discriminator];
      const variant = variants.find((v) => v.tag === tag);
      if (!variant) return fail(issues, 'invalid_union', path, 'union 变体 tag 非法或缺失: ' + JSON.stringify(tag));
      return validateFields(variant.fields || {}, obj, path, issues);
    }
    default:
      return fail(issues, 'unknown_type', path, '未知字段规格类型: ' + JSON.stringify(spec.type) + '（不允许 fallback 跳过）');
  }
}

function validateType(typeName: string, value: unknown, path: string, issues: StoryRuntimeValidationIssue[]): boolean {
  const typeDef = schema.types[typeName];
  if (!typeDef) return fail(issues, 'unknown_type', path, '未知类型: ' + typeName);
  if (typeDef.kind === 'union') {
    if (typeof typeDef.discriminator !== 'string' || typeDef.discriminator.length === 0) return fail(issues, 'invalid_union', path, 'union 缺 discriminator: ' + typeName);
    if (!assertPlainObject(value, path, issues)) return false;
    const variants = typeDef.variants || [];
    const obj = value as ObjectRecord;
    const tag = obj[typeDef.discriminator];
    const variant = variants.find((v) => v.tag === tag);
    if (!variant) return fail(issues, 'invalid_union', path, 'union 非法 tag: ' + JSON.stringify(tag) + '（' + typeName + '）');
    return validateFields(variant.fields || {}, obj, path, issues);
  }
  // interface 容器自身也必须先做完整形态检查（prototype/symbol/隐藏字段/accessor），
  // 避免不可枚举字段被 validateFields 的未知字段检查抢先拦截成 unknown_field。
  if (!assertPlainObject(value, path, issues)) return false;
  return validateFields(typeDef.fields || {}, value as ObjectRecord, path, issues);
}

// ── 通用入口 ──
export function validateStoryRuntimeType(typeName: StoryRuntimeTypeName, input: unknown): StoryRuntimeValidationResult<unknown> {
  const issues: StoryRuntimeValidationIssue[] = [];
  const ok = validateType(typeName, input, '', issues);
  return ok ? { ok: true, value: input } : { ok: false, issues };
}

// ── 根类型包装器：只能调用通用入口，不得重新列出字段/枚举/union variant ──
// 受控收窄只发生在完整 schema 校验成功后；通用入口本身仍返回 unknown，防止调用方伪造 typeName 泛型。
function narrowValidatedResult<T>(result: StoryRuntimeValidationResult<unknown>): StoryRuntimeValidationResult<T> {
  return result.ok ? { ok: true, value: result.value as T } : result;
}

export function validateStoryRuntimeState(input: unknown): StoryRuntimeValidationResult<StoryRuntimeState> {
  return narrowValidatedResult<StoryRuntimeState>(validateStoryRuntimeType('StoryRuntimeState', input));
}
export function validateStoryProjectionState(input: unknown): StoryRuntimeValidationResult<StoryProjectionState> {
  return narrowValidatedResult<StoryProjectionState>(validateStoryRuntimeType('StoryProjectionState', input));
}
export function validateRuntimeCommand(input: unknown): StoryRuntimeValidationResult<RuntimeCommand> {
  return narrowValidatedResult<RuntimeCommand>(validateStoryRuntimeType('RuntimeCommand', input));
}
export function validateStoryAssetCatalog(input: unknown): StoryRuntimeValidationResult<StoryAssetCatalog> {
  return narrowValidatedResult<StoryAssetCatalog>(validateStoryRuntimeType('StoryAssetCatalog', input));
}
export function validateTurnAdjudicationReceipt(input: unknown): StoryRuntimeValidationResult<TurnAdjudicationReceipt> {
  return narrowValidatedResult<TurnAdjudicationReceipt>(validateStoryRuntimeType('TurnAdjudicationReceipt', input));
}
export function validateNarrativeConsistencyDecision(input: unknown): StoryRuntimeValidationResult<NarrativeConsistencyDecision> {
  return narrowValidatedResult<NarrativeConsistencyDecision>(validateStoryRuntimeType('NarrativeConsistencyDecision', input));
}
export function validateProjectionOutboxItem(input: unknown): StoryRuntimeValidationResult<ProjectionOutboxItem> {
  return narrowValidatedResult<ProjectionOutboxItem>(validateStoryRuntimeType('ProjectionOutboxItem', input));
}
