import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const chat = read('services/ai/chatCompletionClient.ts');
const apiTools = read('services/ai/apiTools.ts');
const settings = read('models/settings.ts');
const apiSettings = read('components/features/Settings/ApiSettings.tsx');

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(settings.includes("| 'mimo' |"), 'settings provider union should include mimo');
assert(apiSettings.includes("小米 MiMo"), 'API settings should expose MiMo option');
assert(chat.includes("config.provider === 'mimo'"), 'chat client should detect mimo provider');
assert(chat.includes('max_completion_tokens'), 'MiMo request body should use max_completion_tokens');
assert(chat.includes("body.thinking = { type: 'disabled' }"), 'MiMo request body should disable thinking by default');
assert(chat.includes('api-key'), 'MiMo auth should use api-key header');
assert(apiTools.includes("provider: 'mimo'"), 'model fetch should route MiMo separately');
assert(apiTools.includes('小米 MiMo 模型列表'), 'MiMo model fetch should append dedicated error reports');

console.log('mimo-api adaptation regression ok');
