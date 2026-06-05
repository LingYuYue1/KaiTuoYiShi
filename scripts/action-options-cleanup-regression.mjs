import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const parser = fs.readFileSync('services/ai/responseParser.ts', 'utf8');
const inputArea = fs.readFileSync('components/features/Chat/InputArea.tsx', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

assert(parser.includes('export function cleanActionOptionText'), '行动选项清洗函数必须从解析器导出。');
assert(parser.includes('export function parseActionOptionsBlock'), '行动选项必须提供块解析器，不能只做单行清洗。');
assert(parser.includes('replace(/^(?:选项|选择|行动|方案)'), '行动选项必须清理“选项 1：”等模板前缀。');
assert(parser.includes("result.actionOptions = parseActionOptionsBlock(result.actionOptions.join('\\n'))"), 'parseResponse 必须使用块解析器拆分行动选项。');
assert(parser.includes('inlineEnumeratedMatches.length >= 2'), '行动选项块解析器必须支持一行内多个编号选项。');
assert(parser.includes('quotedSegments.length >= 2'), '行动选项块解析器必须支持引号包裹的多个选项。');
assert(parser.includes("normalized.length > 120"), '行动选项块解析器必须过滤过长内容，避免整段正文误入按钮。');
assert(inputArea.includes("import { parseActionOptionsBlock } from '@/services/ai/responseParser'"), '输入区必须复用行动选项块解析器。');
assert(inputArea.includes("return parseActionOptionsBlock(source.join('\\n'))"), '输入区必须用块解析器清理旧存档中已落库的行动选项。');
assert(!inputArea.includes('.map(cleanActionOptionText).filter(Boolean)'), '输入区不得用单行清洗后直接过滤，否则旧数据可能导致选项整组消失。');
assert(inputArea.includes('appendActionOptionToInput'), '点击行动选项应追加到当前输入，避免覆盖玩家已输入内容。');
assert(pkg.includes('"test:action-options"'), 'package.json 必须提供行动选项清洗回归脚本。');

console.log('action options cleanup regression ok');
