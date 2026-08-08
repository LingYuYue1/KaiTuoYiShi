#!/usr/bin/env node

/**
 * generate-suppressions.mjs
 *
 * 运行 ESLint 收集所有 error 和 warning 级别的违规，
 * 按 (filePath, ruleId) 统计计数，输出 eslint-suppressions.json。
 *
 * 用法：
 *   node scripts/generate-suppressions.mjs [--dry-run]
 *
 * --dry-run  只打印 JSON 到 stdout，不写入文件。
 * 默认        写入仓库根目录的 eslint-suppressions.json。
 */

import { ESLint } from 'eslint';
import { writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT_FILE = resolve(ROOT, 'eslint-suppressions.json');
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const eslint = new ESLint({
    cwd: ROOT,
    overrideConfigFile: 'eslint.config.js',
    applySuppressions: false,        // 关键：忽略现有 suppressions，收集全部问题
    cache: false,                    // 强制不使用缓存，确保结果最新
  });

  console.log('🚀 正在扫描所有文件...');
  const results = await eslint.lintFiles(['**/*.{ts,tsx,js,jsx}']);

  /** @type {Record<string, Record<string, { count: number }>>} */
  const suppressions = {};

  for (const result of results) {
    // 同时统计 error (severity 2) 和 warning (severity 1)
    const issues = result.messages.filter((m) => m.severity >= 1);
    if (issues.length === 0) continue;

    const relPath = relative(ROOT, result.filePath);
    /** @type {Record<string, number>} */
    const ruleCounts = {};

    for (const msg of issues) {
      const ruleId = msg.ruleId ?? 'unknown';
      ruleCounts[ruleId] = (ruleCounts[ruleId] ?? 0) + 1;
    }

    suppressions[relPath] = {};
    // 按规则名排序，保证输出稳定
    for (const [ruleId, count] of Object.entries(ruleCounts).sort(([a], [b]) => a.localeCompare(b))) {
      suppressions[relPath][ruleId] = { count };
    }
  }

  // 按文件路径排序（输出稳定、可 diff）
  const ordered = {};
  for (const key of Object.keys(suppressions).sort()) {
    ordered[key] = suppressions[key];
  }

  const json = JSON.stringify(ordered, null, 2) + '\n';

  if (DRY_RUN) {
    process.stdout.write(json);
    console.log(`\n📋 Dry-run 完成，共 ${Object.keys(ordered).length} 个文件`);
  } else {
    writeFileSync(OUTPUT_FILE, json, 'utf-8');
    const fileCount = Object.keys(ordered).length;
    const totalRules = Object.values(ordered).reduce(
      (sum, rules) => sum + Object.keys(rules).length,
      0,
    );
    console.log(
      `✅ 写入 ${OUTPUT_FILE}\n   ${fileCount} 个文件, ${totalRules} 条规则压制`
    );
  }
}

main().catch((err) => {
  console.error('❌ 生成失败:', err);
  process.exit(1);
});
