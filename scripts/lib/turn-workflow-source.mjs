import fs from 'node:fs';
import path from 'node:path';

export function readTurnWorkflowSource(root = process.cwd()) {
  const turnRoot = path.join(root, 'src/kernel/application/turn');
  const stageRoot = path.join(turnRoot, 'stages');
  const files = [
    ...fs.readdirSync(turnRoot)
      .filter((name) => name.endsWith('.ts'))
      .map((name) => path.join(turnRoot, name)),
    ...fs.readdirSync(stageRoot)
      .filter((name) => name.endsWith('.ts'))
      .map((name) => path.join(stageRoot, name)),
    path.join(root, 'src/kernel/workflows/turnProtocol.ts'),
    path.join(root, 'src/kernel/workflows/newsWorkflow.ts'),
    path.join(root, 'src/kernel/application/executeDurableJob.ts'),
    path.join(root, 'src/kernel/application/executeNarrativeImageJob.ts'),
    path.join(root, 'src/kernel/application/executeRuntimeAction.ts'),
  ];
  return files.sort().map((file) => fs.readFileSync(file, 'utf8')).join('\n');
}
