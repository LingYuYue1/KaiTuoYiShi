// 从源码导出内置提示词模块与世界书条目，供内容评审。
// 运行（一次性打包并解析 @/ 别名，不入库）：
// npx esbuild scripts/dump-injected-prompts.ts --bundle --format=esm --platform=node --alias:@=. --outfile=scripts/_dump-injected-prompts.mjs && node scripts/_dump-injected-prompts.mjs && rm -f scripts/_dump-injected-prompts.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createBuiltinPromptModules } from '../data/builtinPromptModules';
import { createBuiltinWorldbooks } from '../data/worldbookPresets';

const OUT = 'docs/generated/injected-prompts-full-content.md';

const modules = createBuiltinPromptModules();
const worldbooks = createBuiltinWorldbooks();

const lines: string[] = [];
const push = (s: string) => lines.push(s);

push('# 注入提示词全量内容（自动生成，勿手改）');
push('');
push('> 由 `scripts/dump-injected-prompts.ts` 从源码导出。');
push(`> 生成对象：内置提示词模块 ${modules.length} 个 + 内置世界书 ${worldbooks.length} 本。`);
push('');

const scopeOrder = ['main', 'opening', 'pathAwakening', 'battle', 'all', 'calibration'];
const scopeKey = (m: { scope?: string[] }) => {
  const s = m.scope && m.scope.length ? m.scope : ['all'];
  for (const k of scopeOrder) if (s.includes(k)) return k;
  return s[0];
};
const byScope = new Map<string, typeof modules>();
for (const m of modules) {
  const k = scopeKey(m);
  const group = byScope.get(k);
  if (group) group.push(m);
  else byScope.set(k, [m]);
}

push('## 第一部分：内置提示词模块');
push('');
for (const k of scopeOrder) {
  const group = byScope.get(k);
  if (!group) continue;
  group.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  push(`### scope: ${k}（${group.length} 个）`);
  push('');
  for (const m of group) {
    const meta = [
      `id: \`${m.id}\``,
      `order: ${m.order}`,
      `scope: [${(m.scope ?? []).join(', ')}]`,
      `默认: ${m.enabled ? '开' : '**关**'}`,
      `role: ${m.role ?? 'system'}`,
      m.injectionPosition !== undefined ? `position: ${m.injectionPosition}` : '',
      m.injectionDepth !== undefined ? `depth: ${m.injectionDepth}` : '',
      `约 ${Buffer.byteLength(m.content, 'utf8')} 字节`,
    ].filter(Boolean).join(' ｜ ');
    push(`#### ${m.title}`);
    push('');
    push(`> ${meta}`);
    if (m.description) push(`> 说明：${m.description}`);
    push('');
    push('````text');
    push(m.content);
    push('````');
    push('');
  }
}

push('## 第二部分：内置世界书条目');
push('');
for (const book of worldbooks) {
  const gate = book.storyModeGate ? `，storyModeGate: ${JSON.stringify(book.storyModeGate)}` : '';
  push(`### 《${book.title}》（id: \`${book.id}\`，${book.entries.length} 条${gate}）`);
  push('');
  for (const e of book.entries) {
    const meta = [
      `id: \`${e.id}\``,
      `type: ${e.type}`,
      `注入: ${e.injectMode}`,
      e.keywords.length ? `关键词: ${e.keywords.slice(0, 12).join(' / ')}${e.keywords.length > 12 ? ' …' : ''}` : '',
      `scope: [${e.scope.join(', ')}]`,
      `priority: ${e.priority}`,
      e.injectAtDepth ? `depth注入: ${e.depth}` : '',
      `默认: ${e.enabled ? '开' : '**关**'}`,
      `约 ${Buffer.byteLength(e.content, 'utf8')} 字节`,
    ].filter(Boolean).join(' ｜ ');
    push(`#### ${e.title}`);
    push('');
    push(`> ${meta}`);
    push('');
    push('````text');
    push(e.content);
    push('````');
    push('');
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, lines.join('\n'), 'utf8');
const total = lines.join('\n');
console.log(`已生成 ${OUT}（${(Buffer.byteLength(total, 'utf8') / 1024).toFixed(0)} KB）`);
console.log(`模块 ${modules.length} 个，世界书 ${worldbooks.length} 本 / ${worldbooks.reduce((n, b) => n + b.entries.length, 0)} 条`);
