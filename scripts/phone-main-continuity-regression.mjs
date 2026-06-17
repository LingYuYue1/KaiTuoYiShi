import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const phoneModal = fs.readFileSync('components/features/Phone/PhoneModal.tsx', 'utf8');
const systemPromptBuilder = fs.readFileSync('hooks/useGame/systemPromptBuilder.ts', 'utf8');

assert(phoneModal.includes("关系: npc.关系 === 'stranger' ? 'acquaintance' : npc.关系"), '手机私聊写回 NPC 时必须把陌生关系抬到点头之交。');
assert(phoneModal.includes("当前关系阶段: npc.当前关系阶段 || '已通过手机建立私聊联系'"), '手机私聊写回 NPC 时必须补当前关系阶段。');
assert(phoneModal.includes("共同经历: [...new Set([...(npc.共同经历 ?? []), trimmed])].slice(-8)"), '手机私聊写回 NPC 时必须补共同经历。');
assert(phoneModal.includes('与玩家保持手机联系，已形成可承接的私下互动。'), '手机私聊写回 NPC 时必须补长期印象兜底。');

assert(systemPromptBuilder.includes('来源为“手机”的同行记忆代表玩家与该 NPC 已有私下通讯热度'), '主剧情 NPC 账本承接必须说明手机来源记忆是关系热度证据。');
assert(systemPromptBuilder.includes('function getRecentPhoneMemoryTexts'), '主剧情 prompt 必须提取手机来源同行记忆。');
assert(systemPromptBuilder.includes('最近手机私聊：'), '主剧情 prompt 关系表必须显式标注最近手机私聊。');
assert(systemPromptBuilder.includes('必须承接私聊热度与未尽话题'), '已知伙伴注入必须要求承接手机私聊热度。');

console.log('phone main continuity regression passed');
