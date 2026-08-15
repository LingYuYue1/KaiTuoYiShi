// 验证 .tmp-split/album 副本：ts-morph LanguageService 诊断（等价 tsc，但只查副本文件）
// 用法: node scripts/verify-tmp.mjs [--files a,b,c]
import { Project } from 'ts-morph';

const args = process.argv.slice(2);
const filesArg = args.find((a) => a.startsWith('--files='));
const files = filesArg
  ? filesArg.split('=')[1].split(',').map((f) => '.tmp-split/album/' + f)
  : ['.tmp-split/album/workspaces.tsx', '.tmp-split/album/visualTokens.ts'];

const project = new Project({ tsConfigFilePath: 'tsconfig.json' });
const sfs = files.map((f) => project.addSourceFileAtPath(f));
const diagnostics = project.getPreEmitDiagnostics(sfs);
const errors = diagnostics.filter((d) => d.getCategory() === 'Error');
const warnings = diagnostics.filter((d) => d.getCategory() !== 'Error');
for (const d of errors) {
  const pos = d.getSourceFile()?.getLineAndColumnAtPos(d.getStart() ?? 0);
  console.error(`ERROR ${d.getSourceFile()?.getFilePath()} ${pos?.line}:${pos?.column} ${d.getMessageText()}`);
}
for (const d of warnings) {
  console.warn(`WARN ${d.getMessageText()}`);
}
console.log(`诊断: ${errors.length} 错误, ${warnings.length} 警告`);
process.exit(errors.length > 0 ? 1 : 0);
