import assert from 'node:assert/strict';
import fs from 'node:fs';

const chatList = fs.readFileSync('components/features/Chat/ChatList.tsx', 'utf8');
const turnItem = fs.readFileSync('components/features/Chat/TurnItem.tsx', 'utf8');
const renderers = fs.readFileSync('components/features/Chat/MessageRenderers.tsx', 'utf8');

const scrollHandlerStart = chatList.indexOf('const handleScroll = useCallback');
const scrollHandlerEnd = chatList.indexOf('const scrollToBottom', scrollHandlerStart);
const scrollHandler = chatList.slice(scrollHandlerStart, scrollHandlerEnd);

assert(scrollHandlerStart >= 0 && scrollHandlerEnd > scrollHandlerStart, 'must keep an isolated chat scroll handler');
assert(chatList.includes('const scrollStateRafRef = useRef<number | null>(null)'), 'scroll-state work must use a dedicated animation-frame queue');
assert(scrollHandler.includes('if (scrollStateRafRef.current != null) return'), 'repeated scroll events in one frame must be coalesced');
assert(scrollHandler.includes('requestAnimationFrame(() =>'), 'near-bottom detection must run on an animation frame');
assert(scrollHandler.includes('if (nearBottomRef.current === nextNearBottom) return'), 'React state must update only when the bottom threshold changes');
assert(!scrollHandler.includes('setNearBottom(isNearBottom())'), 'raw scroll events must not update React state directly');
assert(chatList.includes('cancelAnimationFrame(scrollStateRafRef.current)'), 'pending scroll-state frames must be cancelled on unmount');

assert(chatList.includes('deferOffscreen'), 'historical TurnItems must opt into offscreen rendering deferral');
assert(turnItem.includes("contentVisibility: 'auto'"), 'historical turns must skip offscreen layout and paint');
assert(turnItem.includes("containIntrinsicSize: 'auto 640px'"), 'historical turns must retain a stable intrinsic scroll size');
assert(turnItem.includes('deferOffscreen && !isStreaming && !message.isStreaming'), 'streaming turns must not use historical visibility deferral');

const deferredLineStyles = renderers.match(/contentVisibility: 'auto'/g) ?? [];
assert.equal(deferredLineStyles.length, 3, 'narration, dialogue, and inner voice must each define offscreen isolation');
assert(renderers.includes('DEFERRED_NARRATION_STYLE'), 'narration lines must use offscreen isolation');
assert(renderers.includes('DEFERRED_DIALOGUE_STYLE'), 'dialogue bubbles must use offscreen isolation');
assert(renderers.includes('DEFERRED_INNER_VOICE_STYLE'), 'inner-voice bubbles must use offscreen isolation');
assert(renderers.includes('deferOffscreen = false }: BodyBlockProps'), 'BodyBlock must default to no deferral for streaming callers');

const streamingStart = renderers.indexOf('export function StreamingPreview');
const streamingEnd = renderers.indexOf('export function MemoryBlock', streamingStart);
const streamingPreview = renderers.slice(streamingStart, streamingEnd);
assert(streamingStart >= 0 && streamingEnd > streamingStart, 'must keep an isolated streaming preview renderer');
assert(!streamingPreview.includes('deferOffscreen='), 'streaming preview must not enable offscreen isolation');
assert(!chatList.includes("contain: 'paint'"), 'the chat scroll container must not create a paint containment block');

console.log('chat scroll smoothness regression passed');
