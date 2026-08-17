import { memo, useState, useMemo } from 'react';
import type { NPC记录 } from '@/models/npc';
import { 读取NPC头像 } from '@/models/npc';
import type { 角色数据结构 } from '@/models/character';
import type { 相册系统 } from '@/models/imageGeneration';
import type { VisualTextSettings } from '@/models/settings';
import { getBuiltinAvatarSetForNames } from '@/data/builtinAvatars';
import { parseNarrativeBody } from '@/utils/narrativeBodyParser';
import { 解析相册资源引用 } from '@/utils/albumActions';
import { ResilientImage } from '@/components/ui/ResilientImage';

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
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
        background: 'rgba(var(--tj-accent-primary), 0.04)',
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-serif tracking-wider transition-colors hover:bg-white/[0.02]"
        style={{ color: 'rgba(var(--tj-accent-primary), 0.7)' }}
      >
        <span className="text-[10px]">{open ? '▼' : '▶'}</span>
        <span>◆ 思绪痕迹</span>
      </button>
      {open && (
        <div
          className="px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap animate-fade-in"
          style={{
            borderTop: '1px solid rgba(var(--tj-accent-primary), 0.15)',
            color: 'rgba(var(--tj-text-secondary), 0.85)',
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
  album?: 相册系统;
  showInnerVoice?: boolean;
  userInput?: string;
  visualTextSettings?: VisualTextSettings;
  deferOffscreen?: boolean;
  partial?: boolean;
}

const DEFERRED_NARRATION_STYLE = {
  contentVisibility: 'auto',
  containIntrinsicSize: 'auto 96px',
} as const;

const DEFERRED_DIALOGUE_STYLE = {
  contentVisibility: 'auto',
  containIntrinsicSize: 'auto 128px',
} as const;

const DEFERRED_INNER_VOICE_STYLE = {
  contentVisibility: 'auto',
  containIntrinsicSize: 'auto 144px',
} as const;

const DEFAULT_VISUAL_TEXT_SETTINGS: VisualTextSettings = {
  narrationFontSize: 15,
  dialogueFontSize: 15,
  playerFontSize: 14,
};

function clampFontSize(value: unknown, fallback: number): number {
  return Math.max(13, Math.min(30, Math.trunc(Number(value) || fallback)));
}

function normalizeVisualTextSettings(input?: Partial<VisualTextSettings>): VisualTextSettings {
  return {
    narrationFontSize: clampFontSize(input?.narrationFontSize, DEFAULT_VISUAL_TEXT_SETTINGS.narrationFontSize),
    dialogueFontSize: clampFontSize(input?.dialogueFontSize, DEFAULT_VISUAL_TEXT_SETTINGS.dialogueFontSize),
    playerFontSize: clampFontSize(input?.playerFontSize, DEFAULT_VISUAL_TEXT_SETTINGS.playerFontSize),
  };
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
  // 处理 CSS 变量格式：rgb(var(--tj-xxx)) → rgba(var(--tj-xxx), alpha)
  if (rgb.includes('var(')) {
    return rgb.replace('rgb(', 'rgba(').replace(/\)$/, `, ${alpha})`);
  }
  return rgb.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
}

// 名字/别名 → NPC 档案（BodyBlock 内建一次 Map，避免每行 linear find）
function buildNpcLookupMap(records?: NPC记录[]): Map<string, NPC记录> {
  const map = new Map<string, NPC记录>();
  if (!records) return map;
  for (const n of records) {
    if (n.姓名 && !map.has(n.姓名)) map.set(n.姓名, n);
    if (n.别名 && !map.has(n.别名)) map.set(n.别名, n);
    const builtinSet = getBuiltinAvatarSetForNames(n.姓名, n.别名);
    if (builtinSet && !map.has(builtinSet.canonicalName)) map.set(builtinSet.canonicalName, n);
  }
  return map;
}

function lookupNpc(name: string, map: Map<string, NPC记录>): NPC记录 | undefined {
  if (!name) return undefined;
  const direct = map.get(name);
  if (direct) return direct;
  const builtinSet = getBuiltinAvatarSetForNames(name);
  return builtinSet ? map.get(builtinSet.canonicalName) : undefined;
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
export const AvatarTile = memo(function AvatarTile({ name, url, color, size = 'sm' }: AvatarTileProps) {
  const dim = size === 'md' ? 'w-12 h-12 sm:w-14 sm:h-14' : 'w-11 h-11 sm:w-12 sm:h-12';
  const labelColor = withAlpha(color, 0.98);
  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0">
      <div
        className={`${dim} rounded-full flex items-center justify-center overflow-hidden relative`}
        style={{
          background: url ? 'rgba(var(--tj-surface-strong), 0.72)' : `linear-gradient(135deg, ${withAlpha(color, 0.22)}, rgba(var(--tj-chat-bubble), 0.92))`,
          boxShadow: `0 0 0 1px ${withAlpha(color, 0.58)}`,
        }}
      >
        {url ? (
          <ResilientImage src={url} alt={`${name} 头像`} className="w-full h-full object-cover" />
        ) : (
          <span
            className="font-serif font-bold text-lg"
            style={{ color: withAlpha(color, 0.95) }}
          >
            {name.charAt(0) || '?'}
          </span>
        )}
      </div>
      <div
        className="px-2 py-0.5 max-w-[78px] text-center rounded-sm"
        style={{
          background: 'rgba(var(--tj-chat-bubble), 0.88)',
          boxShadow: `inset 0 0 0 1px ${withAlpha(color, 0.52)}`,
        }}
      >
        <span
          className="block truncate font-serif text-[11px] font-semibold tracking-[0.1em]"
          style={{ color: labelColor }}
        >
          {name}
        </span>
      </div>
    </div>
  );
});

interface DialogueBubbleProps {
  name: string;
  text: string;
  color: string;
  avatarUrl?: string;
  deferOffscreen?: boolean;
}

export const DialogueBubble = memo(function DialogueBubble({ name, text, color, avatarUrl, fontSize = 15, isProtagonist = false, deferOffscreen = false }: DialogueBubbleProps & { fontSize?: number; isProtagonist?: boolean }) {
  // 主角对话：淡底金边；NPC 对话：深底+角色色描边
  const bubbleBg = isProtagonist
    ? 'rgba(var(--tj-accent-primary), 0.08)'
    : 'rgba(var(--tj-chat-bubble), var(--tj-chat-bubble-alpha, 0.78))';
  const bubbleStroke = isProtagonist
    ? 'rgba(var(--tj-accent-primary), 0.55)'
    : withAlpha(color, 0.4);
  const textColor = isProtagonist
    ? 'rgba(var(--tj-text-primary), 0.96)'
    : 'rgba(var(--tj-chat-text), 0.96)';
  return (
    <div className="group my-3 flex items-start justify-start gap-3" style={deferOffscreen ? DEFERRED_DIALOGUE_STYLE : undefined}>
      <AvatarTile name={name} url={avatarUrl} color={color} size="sm" />
      <div className="relative flex-1 min-w-0 mt-1">
        <div
          className="relative rounded px-4 py-3"
          style={{
            background: bubbleBg,
            color: textColor,
            boxShadow: `inset 0 0 0 1px ${bubbleStroke}`,
          }}
        >
          <p className="whitespace-pre-wrap break-words" style={{ fontSize: `${fontSize}px`, lineHeight: 1.8 }}>
            {text}
          </p>
        </div>
      </div>
    </div>
  );
});

interface InnerVoiceBubbleProps {
  text: string;
  traveler?: 角色数据结构;
  album?: 相册系统;
  deferOffscreen?: boolean;
}

// 主角心声：圆头像 + 顶部「·心绪·」标签 + 虚线边气泡 + 暖橘斜体
function InnerVoiceBubble({ text, traveler, album, fontSize = 15, deferOffscreen = false }: InnerVoiceBubbleProps & { fontSize?: number }) {
  const PEACH = 'rgb(var(--tj-accent-secondary))';
  const name = traveler?.姓名?.trim() || '我';
  const avatarUrl = 解析相册资源引用(album, traveler?.图像档案?.正文头像?.trim() || traveler?.头像?.trim()) || undefined;
  return (
    <div className="group my-3 flex items-start gap-3" style={deferOffscreen ? DEFERRED_INNER_VOICE_STYLE : undefined}>
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
          <p className="whitespace-pre-wrap break-words tracking-wide" style={{ fontSize: `${fontSize}px`, lineHeight: 1.75 }}>
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}

// 旁白：全宽容器 + 两侧金色竖条 + 顶部小符号点缀（无头像、无气泡）
export const NarrationLine = memo(function NarrationLine({ text, fontSize = 15, deferOffscreen = false }: { text: string; fontSize?: number; deferOffscreen?: boolean }) {
  return (
    <div
      className="my-2.5 px-5 py-2.5 relative"
      style={{
        ...(deferOffscreen ? DEFERRED_NARRATION_STYLE : {}),
        background: 'rgba(var(--tj-accent-primary), 0.018)',
        borderLeft: '2px solid rgba(var(--tj-accent-primary), 0.34)',
        borderRight: '1px solid rgba(var(--tj-border), 0.24)',
      }}
    >
      <p
        className="whitespace-pre-wrap break-words"
        style={{ color: 'rgba(var(--tj-chat-text), 0.94)', fontSize: `${fontSize}px`, lineHeight: 1.8 }}
      >
        {text}
      </p>
    </div>
  );
});

export function BodyBlock({ content, npcRecords, traveler, album, showInnerVoice = true, userInput, visualTextSettings, deferOffscreen = false, partial = false }: BodyBlockProps) {
  const lines = useMemo(() => (content ? parseNarrativeBody(content, { traveler, userInput, partial }) : []), [content, traveler, userInput, partial]);
  const fontSettings = useMemo(() => normalizeVisualTextSettings(visualTextSettings), [visualTextSettings]);
  const npcMap = useMemo(() => buildNpcLookupMap(npcRecords), [npcRecords]);
  if (!content) return null;

  return (
    <div>
      {lines.map((line, i) => {
        if (line.kind === 'blank') {
          return <div key={i} className="h-1.5" />;
        }
        if (line.kind === 'dialogue') {
          const speaker = line.speaker ?? '未知角色';
          const npc = lookupNpc(speaker, npcMap);
          const protagonist = isProtagonist(speaker, traveler);
          const color = protagonist ? 'rgb(var(--tj-accent-primary))' : nameToColor(speaker);
          const avatarUrl = protagonist
            ? 解析相册资源引用(album, traveler?.图像档案?.正文头像?.trim() || traveler?.头像?.trim()) || undefined
            : 解析相册资源引用(album, 读取NPC头像(npc, '正文')) || undefined;
          return (
            <DialogueBubble
              key={i}
              name={speaker}
              text={line.text}
              color={color}
              avatarUrl={avatarUrl}
              isProtagonist={protagonist}
              fontSize={protagonist ? fontSettings.playerFontSize : fontSettings.dialogueFontSize}
              deferOffscreen={deferOffscreen}
            />
          );
        }
        if (line.kind === 'inner') {
          if (!showInnerVoice) return null;
          return <InnerVoiceBubble key={i} text={line.text} traveler={traveler} album={album} fontSize={fontSettings.dialogueFontSize} deferOffscreen={deferOffscreen} />;
        }
        if (line.kind === 'narration') {
          return <NarrationLine key={i} text={line.text} fontSize={fontSettings.narrationFontSize} deferOffscreen={deferOffscreen} />;
        }
        return <NarrationLine key={i} text={line.text} fontSize={fontSettings.narrationFontSize} deferOffscreen={deferOffscreen} />;
      })}
    </div>
  );
}

interface MemoryBlockProps {
  content: string;
}

// 流式阶段：剥出 <正文> 起始位置之后的内容，把 <thinking> 段藏在「开拓进行中.....」指示器下。
// 一旦解析到 <正文>，就把 partial body 喂给 BodyBlock；正文之后的标签（短期记忆/动态世界/变量草稿/剧情规划/命令）
// 出现就视为正文结束，从那里截断。
const STREAM_BODY_START_RE = /<\s*(?:正文|body|content|text|内容)\s*>/i;
const STREAM_AFTER_BODY_RE =
  /<\s*(?:\/\s*(?:正文|body|content|text|内容)|短期记忆|memory|summary|recap|记忆|回忆|动态世界|world|worldevent|世界|事件|行动选项|actions|options|choice|choices|选项|变量草稿|variableDraft|变量候选|变量线索|变量摘要|剧情规划|storyPlan|storyPlanning|剧情计划|剧情安排|后续规划|命令|command|commands|cmd)\s*>/i;

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
          'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.08), rgba(var(--tj-accent-primary), 0.02))',
        boxShadow:
          'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.4), 0 0 22px rgba(var(--tj-accent-primary), 0.08)',
        clipPath:
          'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
      }}
    >
      <span
        className="text-base animate-pulse-soft"
        style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}
      >
        ◇
      </span>
      <span
        className="font-serif text-sm tracking-[0.28em]"
        style={{ color: 'rgba(var(--tj-accent-primary), 0.92)' }}
      >
        开拓进行中
      </span>
      <span className="inline-flex items-end gap-[3px]">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="inline-block animate-pulse-soft font-mono leading-none"
            style={{
              color: 'rgba(var(--tj-accent-primary), 0.85)',
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
  album?: 相册系统;
  showInnerVoice?: boolean;
  userInput?: string;
}

export function StreamingPreview({ content, npcRecords, traveler, album, showInnerVoice = true, userInput, visualTextSettings }: StreamingPreviewProps & { visualTextSettings?: VisualTextSettings }) {
  const { bodyStarted, bodyText } = useMemo(() => extractStreamingBody(content), [content]);
  const fontSettings = useMemo(() => normalizeVisualTextSettings(visualTextSettings), [visualTextSettings]);

  return (
    <div className="space-y-2">
      <PathfindingIndicator />
      {bodyStarted && bodyText && (
        <div className="px-1 py-1">
          <BodyBlock content={bodyText} npcRecords={npcRecords} traveler={traveler} album={album} showInnerVoice={showInnerVoice} userInput={userInput} visualTextSettings={fontSettings} partial />
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
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-secondary), 0.5)',
        background: 'rgba(var(--tj-accent-secondary), 0.05)',
        borderStyle: 'none',
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-serif tracking-wider transition-colors hover:bg-white/[0.02]"
        style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}
      >
        <span className="text-[10px]">{open ? '▼' : '▶'}</span>
        <span>✦ 记忆收录</span>
      </button>
      {open && (
        <div
          className="px-2.5 py-1.5 animate-fade-in"
          style={{
            borderTop: '1px solid rgba(var(--tj-accent-secondary), 0.35)',
            color: 'rgba(var(--tj-text-primary),0.9)',
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}
