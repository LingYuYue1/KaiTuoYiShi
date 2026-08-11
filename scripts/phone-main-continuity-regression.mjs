import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const phoneModal = fs.readFileSync('components/features/Phone/PhoneModal.tsx', 'utf8');
// 全项目修复：手机私聊双写编排提升为独立纯事务模块（services/phoneMemoryDualWrite.ts），
// 共同经历 / 长期印象兜底等行为要求不变，仅实现位置迁移。
const phoneDualWrite = fs.readFileSync('services/phoneMemoryDualWrite.ts', 'utf8');
const systemPromptBuilder = fs.readFileSync('hooks/useGame/systemPromptBuilder.ts', 'utf8');

assert(!phoneModal.includes("关系: npc.关系 === 'stranger' ? 'acquaintance' : npc.关系"), '手机私聊不得绕过好感度规则手动抬升旧关系枚举。');
assert(!phoneModal.includes("当前关系阶段: npc.当前关系阶段 || '已通过手机建立私聊联系'"), '手机私聊不得写入自由文本关系阶段。');
assert(phoneModal.includes('格式化NPC关系(npc.好感度, Boolean(npc.亲密关系))'), '手机联系人必须显示统一派生的关系阶段。');
assert(phoneDualWrite.includes("共同经历: [...new Set([...(npc.共同经历 ?? []), packagedSummary])].slice(-8)"), '阶段1方案E：手机私聊写回 NPC 时必须补共同经历（packagedSummary，含【通讯记录】标记）。');
assert(phoneDualWrite.includes('与玩家保持手机联系，已形成可承接的私下互动。'), '手机私聊写回 NPC 时必须补长期印象兜底。');

assert(systemPromptBuilder.includes('来源为“手机”的同行记忆代表玩家与该 NPC 已有私下通讯热度'), '主剧情 NPC 账本承接必须说明手机来源记忆是关系热度证据。');
assert(systemPromptBuilder.includes('function getRecentPhoneMemoryTexts'), '主剧情 prompt 必须提取手机来源同行记忆。');
assert(systemPromptBuilder.includes('最近手机私聊：'), '主剧情 prompt 关系表必须显式标注最近手机私聊。');
assert(systemPromptBuilder.includes('必须承接私聊热度与未尽话题'), '已知伙伴注入必须要求承接手机私聊热度。');

console.log('phone main continuity regression passed');
