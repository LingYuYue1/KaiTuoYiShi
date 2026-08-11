// G1.1.2.1 子任务 A：fixture 驱动的递归实例校验器（测试专用 helper）。
// 职责：证明"实例（样例/数据）符合已冻结 fixture 的每个值"，而不是只检查顶层键名。
// 期望值只能来自传入 fixture（validateValueAgainstSpec/Type）；fixture 本身的冻结由
// story-runtime-contract-regression.mjs 的 canonical oracle 负责——两者职责分离，不能混成一套自证逻辑。
// 禁止 production import；禁止在此复制第二套字段/枚举/变体表。
import { canonicalJsonStringify } from './story-runtime-contract-regression.mjs';

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

// ── G1.1.2.4 共享 plain JSON 容器形态 helper ──
// 唯一对象形态规则：所有 object/array 容器入口（named interface/union、inline object/union、map、
// open_map、schema array、scalar_union.string_array、assertJsonValue 递归）必须复用，不得各自复制弱版本。

// 普通对象形态：非 null、非数组、prototype 只能为 Object.prototype 或 null；
// 使用 Reflect.ownKeys() 完整枚举（含 symbol 与不可枚举成员），拒绝 symbol 键、
// 非 enumerable 数据字段与 getter/setter；检查 descriptor 时不读取 accessor（getter 调用次数保持 0）。
function assertPlainObject(value, path) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), path + ': 必须是普通对象（非 null、非数组）');
  const proto = Object.getPrototypeOf(value);
  assert(proto === Object.prototype || proto === null, path + ': 必须是普通对象（prototype 只能为 Object.prototype 或 null，拒绝 Date/Map/Set/RegExp/typed/custom class 实例）');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert(descriptor !== undefined, path + ': 属性描述符缺失 -> ' + String(key));
    // descriptor 检查不读取值，accessor 永远不会被调用。
    assert(typeof descriptor.get !== 'function' && typeof descriptor.set !== 'function', path + ': 不允许 getter/setter 属性 -> ' + String(key));
    if (typeof key === 'symbol') fail(path + ': 不允许 symbol 键 -> ' + String(key));
    assert(descriptor.enumerable, path + ': 不允许不可枚举隐藏字段 -> ' + String(key));
  }
}

// 普通数组形态：Array.isArray、prototype 严格等于 Array.prototype、0..length-1 每个索引都是 own property
// 且可枚举且为 data descriptor（拒绝 sparse hole / getter / setter）、除 length 与合法索引外无额外字符串键、
// 无 symbol 键。禁止用 every/forEach/map 证明无 hole（这些方法会跳过稀疏索引）。
// descriptor 校验全部完成后调用方才允许读取元素，非法 accessor 不会被调用。
function assertArrayShape(value, path) {
  assert(Array.isArray(value), path + ': 必须是数组，实际 ' + (value === null ? 'null' : typeof value));
  assert(Object.getPrototypeOf(value) === Array.prototype, path + ': 数组 prototype 必须是 Array.prototype');
  assert(Object.getOwnPropertySymbols(value).length === 0, path + ': 数组不允许 symbol 键');
  for (let i = 0; i < value.length; i += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, i);
    assert(descriptor !== undefined, path + '[' + i + ']: 数组存在 sparse hole（缺少索引 own property）');
    assert(descriptor.enumerable, path + '[' + i + ']: 数组索引不可枚举（隐藏字段）');
    assert(typeof descriptor.get !== 'function' && typeof descriptor.set !== 'function', path + '[' + i + ']: 数组索引不允许 getter/setter');
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    if (key === 'length') continue;
    if (/^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length) continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert(descriptor !== undefined && typeof descriptor.get !== 'function' && typeof descriptor.set !== 'function', path + ': 数组不允许 getter/setter 字段 -> ' + key);
    fail(path + ': 数组存在索引之外的自有键 -> ' + JSON.stringify(key));
  }
}

// 校验任意 JSON 值（unknown 的合法形态）：只接受 JSON 可表达的数据。
// 容器形态复用 assertPlainObject/assertArrayShape；只额外负责标量类型、祖先链循环检测与递归。
// 祖先链循环检测使用"进入 add、离开 delete"语义：真实循环拒绝，同一个普通子对象被兄弟键共享必须通过。
function assertJsonValue(value, path, ancestors = new WeakSet()) {
  if (value === null) return;
  const type = typeof value;
  if (type === 'undefined') fail(path + ': undefined 不是合法 JSON 值');
  if (type === 'bigint') fail(path + ': bigint 不是合法 JSON 值');
  if (type === 'function' || type === 'symbol') fail(path + ': ' + type + ' 不是合法 JSON 值');
  if (type === 'number' && !Number.isFinite(value)) fail(path + ': NaN/Infinity 不是合法 JSON 值');
  if (type !== 'object') return; // string / boolean 直接通过
  if (ancestors.has(value)) fail(path + ': 循环引用不是合法 JSON 值');
  if (Array.isArray(value)) {
    ancestors.add(value);
    assertArrayShape(value, path);
    for (let i = 0; i < value.length; i += 1) assertJsonValue(value[i], path + '[' + i + ']', ancestors);
    ancestors.delete(value);
    return;
  }
  assertPlainObject(value, path);
  ancestors.add(value);
  for (const [key, child] of Object.entries(value)) assertJsonValue(child, path + '.' + key, ancestors);
  ancestors.delete(value);
}

// 按字段规格校验一个值；所有错误带稳定路径。
export function validateValueAgainstSpec({ fixture, spec, value, path }) {
  assert(spec && typeof spec === 'object', path + ': 字段规格缺失');
  switch (spec.type) {
    case 'string':
      assert(typeof value === 'string', path + ': 必须是 string，实际 ' + (value === null ? 'null' : typeof value));
      return;
    case 'number':
      assert(typeof value === 'number' && Number.isFinite(value), path + ': 必须是有限 number，实际 ' + (value === null ? 'null' : typeof value) + (typeof value === 'number' && !Number.isFinite(value) ? '（NaN/Infinity）' : ''));
      return;
    case 'boolean':
      assert(typeof value === 'boolean', path + ': 必须是 boolean，实际 ' + (value === null ? 'null' : typeof value));
      return;
    case 'literal':
      assert(value === spec.value, path + ': 必须是 literal ' + JSON.stringify(spec.value) + '，实际 ' + JSON.stringify(value));
      return;
    case 'enum': {
      const enumDef = fixture.enums?.[spec.enum];
      assert(enumDef && Array.isArray(enumDef.values), path + ': 枚举名悬空 -> ' + spec.enum);
      assert(enumDef.values.includes(value), path + ': 非法枚举值 ' + JSON.stringify(value) + '（' + spec.enum + '）');
      return;
    }
    case 'ref': {
      assert(fixture.types?.[spec.to], path + ': 引用类型名悬空 -> ' + spec.to);
      validateValueAgainstType({ fixture, typeName: spec.to, value, path });
      return;
    }
    case 'array': {
      // G1.1.2.4：schema array 复用共享数组形态；形态通过后才逐索引递归校验 item spec。
      assertArrayShape(value, path);
      for (let i = 0; i < value.length; i += 1) {
        validateValueAgainstSpec({ fixture, spec: spec.items, value: value[i], path: path + '[' + i + ']' });
      }
      return;
    }
    case 'object': {
      assertPlainObject(value, path);
      validateObjectFields({ fixture, fields: spec.fields || {}, value, path });
      return;
    }
    case 'map': {
      assertPlainObject(value, path);
      for (const [key, child] of Object.entries(value)) {
        validateValueAgainstSpec({ fixture, spec: spec.key, value: key, path: path + '.<key>' });
        validateValueAgainstSpec({ fixture, spec: spec.value, value: child, path: path + '.' + key });
      }
      return;
    }
    case 'open_map': {
      assertPlainObject(value, path);
      for (const [key, child] of Object.entries(value)) {
        assertJsonValue(child, path + '.' + key);
        const valueTypes = spec.valueTypes || ['unknown'];
        if (!valueTypes.includes('unknown')) {
          let matched = false;
          for (const allowed of valueTypes) {
            if (allowed === 'string' && typeof child === 'string') matched = true;
            if (allowed === 'number' && typeof child === 'number' && Number.isFinite(child)) matched = true;
            if (allowed === 'boolean' && typeof child === 'boolean') matched = true;
            if (allowed === 'null' && child === null) matched = true;
          }
          assert(matched, path + '.' + key + ': 值类型不在开放范围 ' + JSON.stringify(valueTypes) + ' 内');
        }
      }
      return;
    }
    case 'scalar_union': {
      const elementTypes = spec.elementTypes || [];
      let matched = false;
      for (const allowed of elementTypes) {
        if (allowed === 'string' && typeof value === 'string') matched = true;
        if (allowed === 'number' && typeof value === 'number' && Number.isFinite(value)) matched = true;
        if (allowed === 'boolean' && typeof value === 'boolean') matched = true;
        if (allowed === 'string_array' && typeof value === 'object') {
          // G1.1.2.4：string_array 复用共享数组形态，再逐索引要求 string（不得用 every/forEach/map 证明无 hole）。
          assertArrayShape(value, path);
          matched = true;
          for (let i = 0; i < value.length; i += 1) {
            if (typeof value[i] !== 'string') {
              fail(path + '[' + i + ']: string_array 元素必须是 string，实际 ' + typeof value[i]);
            }
          }
        }
      }
      assert(matched, path + ': 值不在 scalar_union 允许形态 ' + JSON.stringify(elementTypes) + ' 内');
      return;
    }
    case 'union': {
      // 内联 union 规格：必须按 spec.discriminator 读取 tag（不得硬编码 kind），精确匹配一个 variant。
      assert(typeof spec.discriminator === 'string' && spec.discriminator.length > 0, path + ': union 缺 discriminator');
      assertPlainObject(value, path);
      const variants = spec.variants || [];
      assert(Array.isArray(variants) && variants.length > 0, path + ': union 没有变体');
      const seenTags = new Set();
      for (const variant of variants) {
        assert(variant && typeof variant.tag === 'string' && variant.tag.length > 0, path + ': union 变体缺少合法 tag');
        assert(!seenTags.has(variant.tag), path + ': union 变体 tag 重复 -> ' + variant.tag);
        seenTags.add(variant.tag);
      }
      const tag = value[spec.discriminator];
      const variant = variants.find((item) => item.tag === tag);
      assert(variant, path + ': union 变体 tag 非法或缺失 -> ' + JSON.stringify(tag));
      validateObjectFields({ fixture, fields: variant.fields || {}, value, path });
      return;
    }
    default:
      fail(path + ': 未知字段规格类型 -> ' + JSON.stringify(spec.type) + '（不允许 fallback 跳过）');
  }
}

// 按类型名校验一个值（interface / union）。
export function validateValueAgainstType({ fixture, typeName, value, path }) {
  const typeDef = fixture.types?.[typeName];
  assert(typeDef, path + ': 引用类型名悬空 -> ' + typeName);
  if (typeDef.kind === 'union') {
    assert(typeof typeDef.discriminator === 'string' && typeDef.discriminator.length > 0, path + ': union 缺 discriminator -> ' + typeName);
    assertPlainObject(value, path);
    const tag = value[typeDef.discriminator];
    const variants = typeDef.variants || [];
    assert(Array.isArray(variants) && variants.length > 0, path + ': union 没有变体 -> ' + typeName);
    const seenTags = new Set();
    for (const variant of variants) {
      assert(variant && typeof variant.tag === 'string' && variant.tag.length > 0, path + ': union 变体缺少合法 tag');
      assert(!seenTags.has(variant.tag), path + ': union 变体 tag 重复 -> ' + variant.tag);
      seenTags.add(variant.tag);
    }
    const variant = variants.find((item) => item.tag === tag);
    assert(variant, path + ': union 非法 tag -> ' + JSON.stringify(tag) + '（' + typeName + '）');
    validateObjectFields({ fixture, fields: variant.fields || {}, value, path });
    return;
  }
  assert(typeDef.kind === 'interface', path + ': 未知类型形态 -> ' + typeName + ' kind=' + JSON.stringify(typeDef.kind));
  assertPlainObject(value, path);
  validateObjectFields({ fixture, fields: typeDef.fields || {}, value, path });
}

// interface / 内联 object / union variant 共用的字段校验：未知字段拒绝、必填按键存在判断、递归校验。
function validateObjectFields({ fixture, fields, value, path }) {
  for (const key of Object.keys(value)) {
    assert(Object.prototype.hasOwnProperty.call(fields, key), path + ': 未知字段 -> ' + key);
  }
  for (const [name, spec] of Object.entries(fields)) {
    if (spec.required === true) {
      assert(Object.prototype.hasOwnProperty.call(value, name), path + ': 缺少必填字段 -> ' + name);
      validateValueAgainstSpec({ fixture, spec, value: value[name], path: path + '.' + name });
    } else if (Object.prototype.hasOwnProperty.call(value, name)) {
      validateValueAgainstSpec({ fixture, spec, value: value[name], path: path + '.' + name });
    }
    // 可选字段缺省时不注入、不序列化默认值。
  }
}

// 供回归打印/断言用的辅助：校验失败时给出稳定路径。
export function tryValidateValue({ fixture, spec, value, path }) {
  try {
    validateValueAgainstSpec({ fixture, spec, value, path });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
