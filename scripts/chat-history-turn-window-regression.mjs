import assert from 'node:assert/strict';
import fs from 'node:fs';

const chatList = fs.readFileSync('components/features/Chat/ChatList.tsx', 'utf8');

assert(chatList.includes('const INITIAL_RENDER_TURNS = 20'), 'initial history window must contain 20 turns');
assert(chatList.includes('const RENDER_TURN_INCREMENT = 20'), 'each history expansion must add 20 turns');
assert(chatList.includes("messages[index].role !== 'assistant'"), 'history window must count assistant turns instead of raw messages');
assert(chatList.includes('findHistoryWindowStart(visibleMessages, effectiveRenderTurnLimit)'), 'visible history must use the turn-based window');
assert(chatList.includes('setRenderTurnLimit((current) => current + RENDER_TURN_INCREMENT)'), 'load-earlier must expand by one turn page');
assert(chatList.includes('scrollHeight: el.scrollHeight') && chatList.includes('scrollTop: el.scrollTop'), 'load-earlier must capture the current scroll anchor');
assert(chatList.includes('anchor.scrollTop + (el.scrollHeight - anchor.scrollHeight)'), 'prepended history must preserve the visible scroll position');
assert(chatList.includes('继续渲染更早 20 回合'), 'history boundary must explain the next page size');
assert(!chatList.includes('useState(80)'), 'history rendering must no longer default to 80 raw messages');

console.log('chat history turn window regression passed');
