/**
 * 批量将 Codex skills 转换为 Qoder 插件格式
 * 来源：~/.codex/skills/ 和 ~/.agents/skills/
 * 目标：~/.qoder/plugins/<skill-name>/
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';

const home = homedir();
const codexSkillsDir = join(home, '.codex', 'skills');
const agentsSkillsDir = join(home, '.agents', 'skills');
const targetDir = join(home, '.qoder', 'plugins');

// 收集所有 skill 目录
const skillSources = [];

// 从 .codex/skills 收集（排除 .system）
if (existsSync(codexSkillsDir)) {
  for (const entry of readdirSync(codexSkillsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== '.system') {
      skillSources.push(join(codexSkillsDir, entry.name));
    }
  }
}

// 从 .agents/skills 收集
if (existsSync(agentsSkillsDir)) {
  for (const entry of readdirSync(agentsSkillsDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      skillSources.push(join(agentsSkillsDir, entry.name));
    }
  }
}

console.log(`发现 ${skillSources.length} 个 skill 待转换\n`);

// 解析 YAML frontmatter
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { name: '', description: '' };
  const yaml = match[1];
  const name = (yaml.match(/^name:\s*(.+)$/m) || [])[1]?.trim() || '';
  const desc = (yaml.match(/^description:\s*(.+)$/m) || [])[1]?.trim() || '';
  return { name, description: desc };
}

// 规范化插件名
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

// 生成 displayName
function toDisplayName(name) {
  return name
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// 递归复制目录，排除特定文件
function copySkillFiles(src, dest) {
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    // 跳过 Codex 特有的 agents/openai.yaml 和 agents/openai.yml
    if (entry.name === 'agents') {
      // 检查是否只包含 openai.yaml/yml
      const agentFiles = readdirSync(srcPath);
      const hasNonCodexFiles = agentFiles.some(f => f !== 'openai.yaml' && f !== 'openai.yml');
      if (!hasNonCodexFiles) continue; // 跳过纯 Codex agent 配置
    }
    if (entry.name === 'evals') continue; // 跳过 eval 文件
    if (entry.isDirectory()) {
      copySkillFiles(srcPath, destPath);
    } else {
      cpSync(srcPath, destPath);
    }
  }
}

let success = 0;
let skipped = 0;
const results = [];

for (const skillPath of skillSources) {
  const skillMdPath = join(skillPath, 'SKILL.md');
  if (!existsSync(skillMdPath)) {
    console.log(`  跳过 ${basename(skillPath)}：无 SKILL.md`);
    skipped++;
    continue;
  }

  const content = readFileSync(skillMdPath, 'utf-8');
  const { name: fmName, description } = parseFrontmatter(content);
  const rawName = fmName || basename(skillPath);
  const pluginName = normalizeName(rawName);

  if (!pluginName) {
    console.log(`  跳过 ${basename(skillPath)}：无法生成有效插件名`);
    skipped++;
    continue;
  }

  const pluginRoot = join(targetDir, pluginName);
  const qoderPluginDir = join(pluginRoot, '.qoder-plugin');
  const skillsDir = join(pluginRoot, 'skills', pluginName);

  // 创建目录
  mkdirSync(qoderPluginDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });

  // 复制 skill 文件
  copySkillFiles(skillPath, skillsDir);

  // 生成 plugin.json
  const pluginJson = {
    name: pluginName,
    displayName: toDisplayName(rawName),
    version: '0.1.0',
    description: description || `Codex skill: ${rawName}`,
    author: { name: 'Codex Community' },
    homepage: 'https://github.com/composio-community/awesome-codex-skills',
    keywords: ['qoder-plugin', 'skill', 'codex-sync'],
    category: 'developer-tools',
    tags: ['skill', 'codex'],
    skills: './skills/'
  };

  writeFileSync(
    join(qoderPluginDir, 'plugin.json'),
    JSON.stringify(pluginJson, null, 2) + '\n',
    'utf-8'
  );

  // 生成 README.md
  const readme = `# ${toDisplayName(rawName)}

${description || '从 Codex skill 同步转换。'}

## 来源

- 原始路径：\`${skillPath}\`
- 转换方式：自动从 Codex CLI skills 同步为 Qoder 插件格式
- 跳过文件：agents/openai.yaml（Codex 专用）、evals/

## 使用

在 Qoder 中通过 skill 名称 \`${pluginName}\` 调用。
`;

  writeFileSync(join(pluginRoot, 'README.md'), readme, 'utf-8');

  success++;
  results.push(pluginName);
  console.log(`  ✓ ${pluginName}`);
}

console.log(`\n转换完成：成功 ${success}，跳过 ${skipped}`);
console.log(`插件目录：${targetDir}`);
