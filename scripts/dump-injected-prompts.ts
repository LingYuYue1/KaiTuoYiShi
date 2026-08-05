// 生成《注入提示词全量内容》文档：从源码导出真实注入文本，保证与代码一致。
// 运行：npx esbuild scripts/dump-injected-prompts.ts --bundle --format=esm --platform=node --outfile=scripts/_dump-injected-prompts.mjs && node scripts/_dump-injected-prompts.mjs
import { writeFileSync } from 'node:fs';
import { createBuiltinPromptModules } from '../data/builtinPromptModules';
import { createBuiltinWorldbooks } from '../data/worldbookPresets';

const OUT = 'docs/superpowers/specs/2026-07-26-injected-prompts-full-content.md';

const modules = createBuiltinPromptModules();
const worldbooks = createBuiltinWorldbooks();

const lines: string[] = [];
const push = (s: string) => lines.push(s);

push('# 注入提示词全量内容（自动生成，勿手改）');
push('');
push('> 由 `scripts/dump-injected-prompts.ts` 从源码导出，与代码一字不差。');
push(`> 生成对象：内置提示词模块 ${modules.length} 个 + 内置世界书 ${worldbooks.length} 本。`);
push('> 硬编码段模板见配套文档 `2026-07-26-injected-prompts-hardcoded-appendix.md`（人工维护，不随本文件重新生成）。');
push('> 配套：`2026-08-01-main-prompt-injection-order.md`（注入顺序底图）。');
push('');

// ── 提示词模块，按 scope 分组、组内按 order 排序 ──
const scopeOrder = ['main', 'opening', 'pathAwakening', 'battle', 'all', 'calibration'];
const scopeKey = (m: { scope?: string[] }) => {
  const s = m.scope && m.scope.length ? m.scope : ['all'];
  for (const k of scopeOrder) if (s.includes(k)) return k;
  return s[0];
};
const byScope = new Map<string, typeof modules>();
for (const m of modules) {
  const k = scopeKey(m);
  if (!byScope.has(k)) byScope.set(k, []);
  byScope.get(k)!.push(m);
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

// ── 内置世界书 ──
push('## 第二部分：内置世界书条目');
push('');
for (const book of worldbooks) {
  push(`### 《${(book as any).title ?? book.id}》（id: \`${book.id}\`，${book.entries.length} 条${(book as any).storyModeGate ? `，storyModeGate: ${JSON.stringify((book as any).storyModeGate)}` : ''}）`);
  push('');
  for (const e of book.entries) {
    const anyE = e as any;
    const meta = [
      `id: \`${e.id}\``,
      `type: ${anyE.type ?? '-'}`,
      `注入: ${anyE.injectMode ?? '-'}`,
      anyE.keywords?.length ? `关键词: ${anyE.keywords.slice(0, 12).join(' / ')}${anyE.keywords.length > 12 ? ' …' : ''}` : '',
      `scope: [${(anyE.scope ?? []).join(', ')}]`,
      anyE.priority !== undefined ? `priority: ${anyE.priority}` : '',
      anyE.injectAtDepth ? `depth注入: ${anyE.depth}` : '',
      `默认: ${e.enabled ? '开' : '**关**'}`,
      `约 ${Buffer.byteLength(e.content, 'utf8')} 字节`,
    ].filter(Boolean).join(' ｜ ');
    push(`#### ${anyE.title ?? anyE.name ?? e.id}`);
    push('');
    push(`> ${meta}`);
    push('');
    push('````text');
    push(e.content);
    push('````');
    push('');
  }
}

writeFileSync(OUT, lines.join('\n'), 'utf8');
const total = lines.join('\n');
console.log(`已生成 ${OUT}（${(Buffer.byteLength(total, 'utf8') / 1024).toFixed(0)} KB）`);
console.log(`模块 ${modules.length} 个，世界书 ${worldbooks.length} 本 / ${worldbooks.reduce((n, b) => n + b.entries.length, 0)} 条`);
