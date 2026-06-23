import { spawnSync } from 'node:child_process';

const commands = [
  ['npm.cmd', ['run', 'test:desktop-edition'], 'desktop regression'],
  ['npm.cmd', ['run', 'desktop:storage-strategy'], 'desktop storage strategy'],
  ['npm.cmd', ['run', 'desktop:readiness'], 'desktop readiness'],
  ['npm.cmd', ['run', 'desktop:storage-audit'], 'desktop storage audit'],
  ['npx.cmd', ['tsc', '--noEmit'], 'TypeScript check'],
  ['npm.cmd', ['run', 'desktop:verify-release'], 'staged release verification'],
];

if (process.env.DESKTOP_PREFLIGHT_FULL === '1') {
  commands.push(
    ['npm.cmd', ['run', 'build'], 'Web production build'],
    ['cargo', ['check', '--manifest-path', 'src-tauri/Cargo.toml'], 'Tauri cargo check'],
  );
}

console.log('Desktop Edition local preflight');
console.log('This preflight does not upload GitHub Release assets and does not verify the real online latest.json.');
console.log('');

for (const [command, args, label] of commands) {
  console.log(`> ${label}: ${command} ${args.join(' ')}`);
  const spawnCommand = process.platform === 'win32' ? 'cmd.exe' : command;
  const spawnArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', quoteCommand([command, ...args])]
    : args;
  const result = spawnSync(spawnCommand, spawnArgs, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RUSTUP_HOME: process.env.RUSTUP_HOME || `${process.cwd()}\\.tmp\\rustup2`,
    },
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) {
    process.exitCode = 1;
    console.error(`Desktop preflight could not start ${label}: ${result.error.message}`);
    break;
  }
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    console.error(`Desktop preflight failed at: ${label}`);
    break;
  }
  console.log('');
}

if (!process.exitCode) {
  console.log('Desktop local preflight passed. Manual release gates still require GitHub upload, online latest.json verification, real install/update drill, and code signing decision.');
}

function quoteCommand(parts) {
  return parts.map((part) => {
    const text = String(part);
    if (/^[A-Za-z0-9_./:=\\-]+$/.test(text)) return text;
    return `"${text.replaceAll('"', '\\"')}"`;
  }).join(' ');
}
