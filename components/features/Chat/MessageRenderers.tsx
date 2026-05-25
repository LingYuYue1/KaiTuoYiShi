import { useState, useMemo } from 'react';
import type { NPC记录 } from '@/models/npc';
import type { 角色数据结构 } from '@/models/character';

interface ThinkingBlockProps {
  content: string;
  defaultOpen?: boolean;
}

export function ThinkingBlock({ content, defaultOpen = false }: ThinkingBlockProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (!content) return null;

  return (
    <div
      className="mb-3"
      style={{
        boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.18)',
        background: 'rgba(245, 217, 122, 0.04)',
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-serif tracking-wider transition-colors hover:bg-white/[0.02]"
        style={{ color: 'rgba(245, 217, 122, 0.7)' }}
      >
        <span className="text-[10px]">{open ? '▼' : '▶'}</span>
        <span>◆ 思绪痕迹</span>
      </button>
      {open && (
        <div
          className="px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap animate-fade-in"
          style={{
            borderTop: '1px solid rgba(245, 217, 122, 0.15)',
            color: 'rgba(200, 188, 158, 0.85)',
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}

interface BodyBlockProps {
  content: string;
  npcRecords?: NPC记录[];
  traveler?: 角色数据结构;
  showInnerVoice?: boolean;
}

// 三种行格式：【旁白】/【角色名】/【心声】。
// 无前缀的行兜底为旁白渲染（容忍 AI 偶发不按格式输出），用稍暗的色调暗示。
type ParsedBodyLine =
  | { kind: 'narration'; text: string }
  | { kind: 'dialogue'; name: string; text: string }
  | { kind: 'inner'; text: string }
  | { kind: 'unparsed'; text: string }
  | { kind: 'blank' };

const NARR_RE = /^【\s*旁白\s*】\s*(.*)$/;
const DIAG_RE = /^【\s*角色\s*】\s*([^：:]+)[：:]\s*(.*)$/;
const NAMED_DIAG_RE = /^【\s*([^】]+?)\s*】\s*(.*)$/;
const INNER_RE = /^【\s*心声\s*】\s*(.*)$/;

function parseBodyLines(body: string, traveler?: 角色数据结构): ParsedBodyLine[] {
  return body.split(/\r?\n/).flatMap<ParsedBodyLine>((raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return { kind: 'blank' };
    let m = trimmed.match(NARR_RE);
    if (m) {
      const text = m[1].trim();
      const quoted = extractFullQuotedSpeech(text);
      if (quoted && traveler) {
        return { kind: 'dialogue', name: getTravelerDisplayName(traveler), text: quoted };
      }
      return { kind: 'narration', text };
    }
    m = trimmed.match(DIAG_RE);
    if (m) return splitDialogueAndTrailingNarration(m[1].trim(), m[2].trim(), traveler);
    m = trimmed.match(INNER_RE);
    if (m) return { kind: 'inner', text: m[1].trim() };
    m = trimmed.match(NAMED_DIAG_RE);
    if (m && !['旁白', '心声', '角色'].includes(m[1].trim())) {
      return splitDialogueAndTrailingNarration(m[1].trim(), m[2].trim(), traveler);
    }
    const quoted = extractFullQuotedSpeech(trimmed);
    if (quoted && traveler) {
      return { kind: 'dialogue', name: getTravelerDisplayName(traveler), text: quoted };
    }
    return { kind: 'unparsed', text: trimmed };
  });
}

function getTravelerDisplayName(traveler: 角色数据结构): string {
  return traveler.姓名?.trim() || traveler.别名?.trim() || '你';
}

function extractFullQuotedSpeech(text: string): string | null {
  const match = text.match(/^[“"「](.+?)[”"」]([。！？!?])?$/);
  if (!match) return null;
  const inner = match[1].trim();
  if (inner.length < 4) return null;
  if (!/[我你您吗呢吧呀啊？！!?。]/.test(inner)) return null;
  return inner;
}

function splitDialogueAndTrailingNarration(
  name: string,
  text: string,
  traveler?: 角色数据结构,
): ParsedBodyLine[] {
  if (!traveler || !isProtagonist(name, traveler)) {
    return [{ kind: 'dialogue', name, text }];
  }

  const quoteMatch = text.match(/^([“"「].+?[”"」][。！？!?]?)(\s+.+)$/);
  if (!quoteMatch) {
    return [{ kind: 'dialogue', name, text }];
  }

  const quoted = extractFullQuotedSpeech(quoteMatch[1].trim());
  if (!quoted) {
    return [{ kind: 'dialogue', name, text }];
  }

  return [
    { kind: 'dialogue', name, text: quoted },
    { kind: 'narration', text: quoteMatch[2].trim() },
  ];
}

// 角色名 → 颜色映射。同名角色每次都得到相同颜色；避开 UI 金色与心声暖色范围。
const CHAR_COLORS = [
  'rgb(140, 195, 230)', // 湖蓝（三月七风格）
  'rgb(195, 175, 235)', // 冷紫
  'rgb(155, 215, 175)', // 翠绿
  'rgb(230, 165, 195)', // 玫红
  'rgb(235, 180, 145)', // 橙
  'rgb(180, 215, 220)', // 浅青
  'rgb(220, 200, 155)', // 米黄（区别于主金色）
  'rgb(200, 180, 240)', // 薰衣草
];

function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return CHAR_COLORS[hash % CHAR_COLORS.length];
}

// 把 rgb(r, g, b) 转成带 alpha 的 rgba，用于光晕/阴影。
function withAlpha(rgb: string, alpha: number): string {
  return rgb.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
}

// 名字 → NPC 档案查找（伙伴优先；找不到时返回 undefined，由 fallback 处理）
function lookupNpc(name: string, records?: NPC记录[]): NPC记录 | undefined {
  if (!records || !name) return undefined;
  return records.find((n) => n.姓名 === name || n.别名 === name);
}

// 判断这一行的「角色」是不是主角自身（AI 可能写主角名字、也可能写「你」）
function isProtagonist(name: string, traveler?: 角色数据结构): boolean {
  if (!traveler) return false;
  const n = name.trim();
  if (!n) return false;
  if (n === '你' || n === '我') return true;
  if (traveler.姓名 && n === traveler.姓名.trim()) return true;
  if (traveler.别名 && n === traveler.别名.trim()) return true;
  return false;
}

interface AvatarTileProps {
  name: string;
  url?: string;
  color: string; // hash 色或主角金
  size?: 'sm' | 'md'; // sm=对话；md=主角心声
}

// 圆形头像 + 名牌：左上头像、下方一块小标签（fallback 用首字符）
function AvatarTile({ name, url, color, size = 'sm' }: AvatarTileProps) {
  const dim = size === 'md' ? 'w-12 h-12 sm:w-14 sm:h-14' : 'w-11 h-11 sm:w-12 sm:h-12';
  const glow = withAlpha(color, 0.35);
  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0">
      <div
        className={`${dim} rounded-full flex items-center justify-center overflow-hidden relative transition-transform duration-300 group-hover:scale-105`}
        style={{
          background: url ? 'rgba(20, 16, 28, 0.6)' : `linear-gradient(135deg, ${withAlpha(color, 0.35)}, ${withAlpha(color, 0.12)})`,
          boxShadow: `0 0 0 1px ${withAlpha(color, 0.55)}, 0 0 14px ${glow}, inset 0 0 0 1px rgba(255, 255, 255, 0.05)`,
        }}
      >
        {url ? (
          <img src={url} alt={`${name} 头像`} className="w-full h-full object-cover" />
        ) : (
          <span
            className="font-serif font-bold text-lg drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
            style={{ color: withAlpha(color, 0.95) }}
          >
            {name.charAt(0) || '?'}
          </span>
        )}
      </div>
      <div
        className="px-2 py-0.5 max-w-[72px] text-center"
        style={{
          background: 'rgba(10, 8, 14, 0.65)',
          boxShadow: `inset 0 0 0 1px ${withAlpha(color, 0.32)}`,
          clipPath:
            'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
        }}
      >
        <span
          className="block truncate font-serif text-[10px] tracking-[0.12em]"
          style={{ color: withAlpha(color, 0.92) }}
        >
          {name}
        </span>
      </div>
    </div>
  );
}

interface DialogueBubbleProps {
  name: string;
  text: string;
  color: string;
  avatarUrl?: string;
}

function DialogueBubble({ name, text, color, avatarUrl }: DialogueBubbleProps) {
  return (
    <div className="group my-3 flex items-start gap-3">
      <AvatarTile name={name} url={avatarUrl} color={color} size="sm" />
      <div className="relative flex-1 min-w-0 mt-1">
        {/* 气泡左侧小三角 */}
        <div
          className="absolute top-3 -left-1.5 w-3 h-3 rotate-45"
          style={{
            background: 'rgba(20, 16, 28, 0.78)',
            boxShadow: `-1px 1px 0 0 ${withAlpha(color, 0.4)}`,
          }}
        />
        <div
          className="relative px-4 py-3"
          style={{
            background: 'rgba(20, 16, 28, 0.78)',
            color: 'rgb(var(--tj-text-primary))',
            boxShadow: `inset 0 0 0 1px ${withAlpha(color, 0.4)}, 0 4px 18px rgba(0, 0, 0, 0.35), 0 0 22px ${withAlpha(color, 0.08)}`,
            clipPath:
              'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
          }}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words tracking-wide">
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}

interface InnerVoiceBubbleProps {
  text: string;
  traveler?: 角色数据结构;
}

// 主角心声：圆头像 + 顶部「·心绪·」标签 + 虚线边气泡 + 暖橘斜体
function InnerVoiceBubble({ text, traveler }: InnerVoiceBubbleProps) {
  const PEACH = 'rgb(235, 195, 155)';
  const name = traveler?.姓名?.trim() || '我';
  const avatarUrl = traveler?.头像?.trim() || undefined;
  return (
    <div className="group my-3 flex items-start gap-3">
      <AvatarTile name={name} url={avatarUrl} color={PEACH} size="md" />
      <div className="relative flex-1 min-w-0 mt-1">
        {/* 顶部「·心绪·」标签 */}
        <div className="mb-1 flex items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-serif tracking-[0.28em] italic"
            style={{
              color: PEACH,
              background: withAlpha(PEACH, 0.08),
              border: `1px dashed ${withAlpha(PEACH, 0.45)}`,
              borderRadius: '999px',
            }}
          >
            <span aria-hidden style={{ color: withAlpha(PEACH, 0.6) }}>○</span>
            <span>· 心绪 ·</span>
            <span aria-hidden style={{ color: withAlpha(PEACH, 0.6) }}>○</span>
          </span>
        </div>
        <div
          className="px-4 py-3 italic"
          style={{
            background: withAlpha(PEACH, 0.04),
            border: `1px dashed ${withAlpha(PEACH, 0.5)}`,
            color: withAlpha(PEACH, 0.92),
            borderRadius: '14px',
            textShadow: `0 0 12px ${withAlpha(PEACH, 0.18)}`,
          }}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words tracking-wide">
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}

// 旁白：全宽容器 + 两侧金色竖条 + 顶部小符号点缀（无头像、无气泡）
function NarrationLine({ text, dimmed }: { text: string; dimmed?: boolean }) {
  const baseColor = dimmed ? 'rgba(220, 208, 178, 0.72)' : 'rgb(var(--tj-text-primary))';
  return (
    <div
      className="my-2.5 px-5 py-2.5 relative"
      style={{
        background: 'rgba(245, 217, 122, 0.025)',
        borderLeft: '2px solid rgba(245, 217, 122, 0.45)',
        borderRight: '2px solid rgba(245, 217, 122, 0.22)',
      }}
      title={dimmed ? '该行未识别为 【旁白】/【角色名】/【心声】 任一格式' : undefined}
    >
      <p
        className="text-sm leading-relaxed whitespace-pre-wrap break-words tracking-wide"
        style={{ color: baseColor }}
      >
        {text}
      </p>
    </div>
  );
}

export function BodyBlock({ content, npcRecords, traveler, showInnerVoice = true }: BodyBlockProps) {
  const lines = useMemo(() => (content ? parseBodyLines(content, traveler) : []), [content, traveler]);
  if (!content) return null;

  return (
    <div>
      {lines.map((line, i) => {
        if (line.kind === 'blank') {
          return <div key={i} className="h-1.5" />;
        }
        if (line.kind === 'dialogue') {
          const npc = lookupNpc(line.name, npcRecords);
          const protagonist = isProtagonist(line.name, traveler);
          const color = protagonist ? 'rgb(245, 217, 122)' : nameToColor(line.name);
          const avatarUrl = protagonist
            ? traveler?.头像?.trim() || undefined
            : npc?.头像?.trim() || undefined;
          return (
            <DialogueBubble
              key={i}
              name={line.name}
              text={line.text}
              color={color}
              avatarUrl={avatarUrl}
            />
          );
        }
        if (line.kind === 'inner') {
          if (!showInnerVoice) return null;
          return <InnerVoiceBubble key={i} text={line.text} traveler={traveler} />;
        }
        if (line.kind === 'narration') {
          return <NarrationLine key={i} text={line.text} />;
        }
        // unparsed：兜底旁白样式但稍微淡一档，方便玩家肉眼发现 AI 没按格式
        return <NarrationLine key={i} text={line.text} dimmed />;
      })}
    </div>
  );
}

interface MemoryBlockProps {
  content: string;
}

// 流式阶段：剥出 <正文> 起始位置之后的内容，把 <thinking> 段藏在「开拓进行中.....」指示器下。
// 一旦解析到 <正文>，就把 partial body 喂给 BodyBlock；正文之后的标签（短期记忆/动态世界/命令）
// 出现就视为正文结束，从那里截断。
const STREAM_BODY_START_RE = /<\s*(?:正文|body|content|text|内容)\s*>/i;
const STREAM_AFTER_BODY_RE =
  /<\s*(?:\/\s*(?:正文|body|content|text|内容)|短期记忆|memory|summary|recap|记忆|回忆|动态世界|world|worldevent|世界|事件|命令|command|commands|cmd)\s*>/i;

function extractStreamingBody(raw: string): { bodyStarted: boolean; bodyText: string } {
  const start = raw.match(STREAM_BODY_START_RE);
  if (!start || start.index === undefined) {
    return { bodyStarted: false, bodyText: '' };
  }
  const after = raw.slice(start.index + start[0].length);
  const close = after.match(STREAM_AFTER_BODY_RE);
  const body =
    close && close.index !== undefined ? after.slice(0, close.index) : after;
  return { bodyStarted: true, bodyText: body.replace(/^\s+|\s+$/g, '') };
}

function PathfindingIndicator() {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 animate-fade-in"
      style={{
        background:
          'linear-gradient(135deg, rgba(245, 217, 122, 0.08), rgba(245, 217, 122, 0.02))',
        boxShadow:
          'inset 0 0 0 1px rgba(245, 217, 122, 0.4), 0 0 22px rgba(245, 217, 122, 0.08)',
        clipPath:
          'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
      }}
    >
      <span
        className="text-base animate-pulse-soft"
        style={{ color: 'rgba(245, 217, 122, 0.85)' }}
      >
        ◇
      </span>
      <span
        className="font-serif text-sm tracking-[0.28em]"
        style={{ color: 'rgba(245, 217, 122, 0.92)' }}
      >
        开拓进行中
      </span>
      <span className="inline-flex items-end gap-[3px]">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="inline-block animate-pulse-soft font-mono leading-none"
            style={{
              color: 'rgba(245, 217, 122, 0.85)',
              fontSize: '14px',
              animationDelay: `${i * 0.15}s`,
            }}
          >
            ·
          </span>
        ))}
      </span>
    </div>
  );
}

interface StreamingPreviewProps {
  content: string;
  npcRecords?: NPC记录[];
  traveler?: 角色数据结构;
  showInnerVoice?: boolean;
}

export function StreamingPreview({ content, npcRecords, traveler, showInnerVoice = true }: StreamingPreviewProps) {
  const { bodyStarted, bodyText } = useMemo(() => extractStreamingBody(content), [content]);

  return (
    <div className="space-y-2">
      <PathfindingIndicator />
      {bodyStarted && bodyText && (
        <div className="px-1 py-1">
          <BodyBlock content={bodyText} npcRecords={npcRecords} traveler={traveler} showInnerVoice={showInnerVoice} />
        </div>
      )}
    </div>
  );
}

export function MemoryBlock({ content }: MemoryBlockProps) {
  const [open, setOpen] = useState(false);
  if (!content) return null;

  return (
    <div
      className="mt-3 text-xs"
      style={{
        boxShadow: 'inset 0 0 0 1px rgba(196, 163, 90, 0.5)',
        background: 'rgba(196, 163, 90, 0.05)',
        borderStyle: 'none',
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-serif tracking-wider transition-colors hover:bg-white/[0.02]"
        style={{ color: 'rgba(245, 217, 122, 0.85)' }}
      >
        <span className="text-[10px]">{open ? '▼' : '▶'}</span>
        <span>✦ 记忆收录</span>
      </button>
      {open && (
        <div
          className="px-2.5 py-1.5 animate-fade-in"
          style={{
            borderTop: '1px solid rgba(196, 163, 90, 0.35)',
            color: 'rgba(220, 200, 160, 0.9)',
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}
