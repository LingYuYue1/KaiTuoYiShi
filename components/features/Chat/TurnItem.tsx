import { useState } from 'react';
import type { 聊天消息 } from '@/models/chat';
import type { NPC记录 } from '@/models/npc';
import type { 角色数据结构 } from '@/models/character';
import { BodyBlock, StreamingPreview } from './MessageRenderers';
import { getPath } from '@/data/journeyPresets';

interface TurnItemProps {
  message: 聊天消息;
  isStreaming?: boolean;
  onEditBody?: (id: string, newBody: string) => void;
  npcRecords?: NPC记录[];
  traveler?: 角色数据结构;
  showInnerVoice?: boolean;
  previousUserInput?: string;
  // 历史评判消息若 awakenPathId 为空,由 ChatList 向前查找补一个 ID 进来。
  fallbackPathId?: string;
}

type ToolKey = 'edit' | 'thinking' | 'variables' | 'storyPlan' | 'summary' | 'raw' | 'context';

export function TurnItem({ message, isStreaming, onEditBody, npcRecords, traveler, showInnerVoice = true, fallbackPathId, previousUserInput }: TurnItemProps) {
  const isUser = message.role === 'user';
  const parsed = message.parsedResponse;

  if (isUser) {
    return <UserTurnBubble content={message.content} traveler={traveler} />;
  }

  return (
    <div className="mb-4 animate-slide-up">
      {parsed ? (
        <AiTurnCard
          message={message}
          parsed={parsed}
          isStreaming={isStreaming}
          onEditBody={onEditBody}
          npcRecords={npcRecords}
          traveler={traveler}
          showInnerVoice={showInnerVoice}
          fallbackPathId={fallbackPathId}
          previousUserInput={previousUserInput}
        />
      ) : message.isStreaming ? (
        <StreamingPreview
          content={message.content}
          npcRecords={npcRecords}
          traveler={traveler}
          showInnerVoice={showInnerVoice}
          userInput={previousUserInput}
        />
      ) : null}
    </div>
  );
}

function UserTurnBubble({ content, traveler }: { content: string; traveler?: 角色数据结构 }) {
  const name = traveler?.姓名?.trim() || traveler?.别名?.trim() || '旅人';
  const avatarUrl = traveler?.图像档案?.正文头像?.trim() || traveler?.头像?.trim();
  const bubbleBg = 'rgba(var(--tj-chat-bubble), var(--tj-chat-bubble-alpha, 0.78))';

  return (
    <div className="mb-4 flex justify-end animate-slide-up">
      <div className="group flex max-w-[88%] items-start justify-end gap-3">
        <div className="relative mt-1 min-w-0">
          <div
            className="absolute top-3 -right-1.5 h-3 w-3 rotate-45"
            style={{
              background: bubbleBg,
              boxShadow: '1px -1px 0 0 rgba(var(--tj-accent-primary), 0.46)',
            }}
          />
          <div
            className="relative px-4 py-2.5 text-sm leading-7"
            style={{
              background: bubbleBg,
              color: 'rgba(var(--tj-chat-text), 0.98)',
              clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.46), 0 4px 18px rgba(var(--tj-shadow), 0.35), 0 0 22px rgba(var(--tj-accent-primary), 0.08)',
              fontWeight: 600,
            }}
          >
            {content}
          </div>
        </div>
        <UserAvatarTile name={name} url={avatarUrl} />
      </div>
    </div>
  );
}

function UserAvatarTile({ name, url }: { name: string; url?: string }) {
  const initial = name.charAt(0) || '旅';
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <div
        className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full transition-transform duration-300 group-hover:scale-105 sm:h-12 sm:w-12"
        style={{
          background: url
            ? 'rgba(var(--tj-surface-strong), 0.72)'
            : 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.22), rgba(var(--tj-chat-bubble), 0.92))',
          boxShadow:
            '0 0 0 1px rgba(var(--tj-accent-primary), 0.58), 0 0 14px rgba(var(--tj-accent-primary), 0.24), 0 8px 16px rgba(var(--tj-shadow), 0.16), inset 0 0 0 1px rgba(var(--tj-text-primary), 0.18)',
        }}
      >
        {url ? (
          <img src={url} alt={`${name} 头像`} className="h-full w-full object-cover" />
        ) : (
          <span
            className="font-serif text-lg font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]"
            style={{ color: 'rgb(var(--tj-accent-primary))' }}
          >
            {initial}
          </span>
        )}
      </div>
      <div
        className="max-w-[78px] px-2 py-0.5 text-center"
        style={{
          background: 'rgba(var(--tj-chat-bubble), 0.88)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.52), 0 0 10px rgba(var(--tj-accent-primary), 0.12)',
          clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
        }}
      >
        <span className="block truncate font-serif text-[11px] font-semibold tracking-[0.1em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.98)' }}>
          {name}
        </span>
      </div>
    </div>
  );
}

interface AiTurnCardProps {
  message: 聊天消息;
  parsed: NonNullable<聊天消息['parsedResponse']>;
  isStreaming?: boolean;
  onEditBody?: (id: string, newBody: string) => void;
  npcRecords?: NPC记录[];
  traveler?: 角色数据结构;
  showInnerVoice?: boolean;
  fallbackPathId?: string;
  previousUserInput?: string;
}

function AiTurnCard({ message, parsed, isStreaming, onEditBody, npcRecords, traveler, showInnerVoice = true, fallbackPathId, previousUserInput }: AiTurnCardProps) {
  const [openTool, setOpenTool] = useState<ToolKey | null>(null);
  const [draft, setDraft] = useState(parsed.body);

  const toggle = (key: ToolKey) => {
    setOpenTool((cur) => (cur === key ? null : key));
    if (key === 'edit') setDraft(parsed.body);
  };

  const hasVariables = Object.keys(parsed.commands).length > 0 || parsed.worldEvents.length > 0;

  // 命途狭间消息识别:出题回合 awakenQuestions 非空,评判回合 awakenJudgement 非空。
  // 满足其一即套狭间皮肤(暗紫红 + 赤金 + 暗光晕)以视觉上和主剧情消息区分。
  const awakeningKind: '出题' | '评判' | null =
    parsed.awakenQuestions?.trim() ? '出题'
    : parsed.awakenJudgement?.trim() ? '评判'
    : null;

  // 评判结果分类:当前版本只承认升阶；兼容旧历史消息时保留兜底渲染。
  const judgementOutcome: '升阶' | null =
    awakeningKind === '评判'
      ? (() => {
          const j = parsed.awakenJudgement.trim();
          if (j.includes('升阶') || /promote/i.test(j)) return '升阶';
          return null;
        })()
      : null;

  // 命途名:落 aiMsg 时由 sendWorkflow 把 effectiveWorld.进行中狭间 写到 parsed.awakenPathId,
  // 评判落地后世界状态会清掉 进行中狭间,但消息里保留这个 ID,玩家回看历史也能看到正确命途名。
  // 早期消息可能没存 awakenPathId,ChatList 会向前查找补 fallbackPathId 兜底。
  const effectivePathId = parsed.awakenPathId || fallbackPathId || '';
  const pathName = effectivePathId ? getPath(effectivePathId)?.name ?? '' : '';

  const card = (
    <div>
      {/* 顶部工具栏 */}
      <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5">
        <ToolButton
          label="修改正文"
          glyph="✎"
          active={openTool === 'edit'}
          onClick={() => toggle('edit')}
        />
        <ToolButton
          label="思维链"
          glyph="◇"
          active={openTool === 'thinking'}
          onClick={() => toggle('thinking')}
        />
        <ToolButton
          label="变量记录"
          glyph="◈"
          active={openTool === 'variables'}
          disabled={!hasVariables}
          onClick={() => toggle('variables')}
        />
        <TurnBadge value={message.gameTime ?? '?'} />
        <ToolButton
          label="剧情规划"
          glyph="◇"
          active={openTool === 'storyPlan'}
          disabled={!parsed.storyPlan?.trim()}
          onClick={() => toggle('storyPlan')}
        />
        <ToolButton
          label="小总结"
          glyph="✦"
          active={openTool === 'summary'}
          disabled={!parsed.memory}
          onClick={() => toggle('summary')}
        />
        <ToolButton
          label="原始消息"
          glyph="▣"
          active={openTool === 'raw'}
          onClick={() => toggle('raw')}
        />
        <ToolButton
          label="请求上下文"
          glyph="⬡"
          active={openTool === 'context'}
          onClick={() => toggle('context')}
        />
      </div>

      {/* 展开面板 */}
      {openTool && (
        <div
          className="mb-2 animate-fade-in"
          style={{
            background: 'rgba(var(--tj-accent-primary), 0.04)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.28)',
            clipPath:
              'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
          }}
        >
          {openTool === 'edit' && (
            <EditBodyPanel
              draft={draft}
              setDraft={setDraft}
              onSave={() => {
                if (onEditBody) onEditBody(message.id, draft);
                setOpenTool(null);
              }}
              onCancel={() => {
                setDraft(parsed.body);
                setOpenTool(null);
              }}
            />
          )}
          {openTool === 'thinking' && (
            <PanelText content={parsed.thinking?.trim() || '本回合未输出思维链。'} label="思绪痕迹" />
          )}
          {openTool === 'variables' && (
            <VariablesPanel commands={parsed.commands} worldEvents={parsed.worldEvents} />
          )}
          {openTool === 'storyPlan' && (
            <PanelText content={parsed.storyPlan?.trim() || '本回合没有剧情规划保留项。'} label="剧情规划" />
          )}
          {openTool === 'summary' && <PanelText content={parsed.memory} label="记忆收录" />}
          {openTool === 'raw' && (
            <PanelText content={parsed.rawText?.trim() || message.content || '本回合没有保存原始消息。'} label="原始消息" />
          )}
          {openTool === 'context' && (
            <PanelText content={formatDebugContext(message)} label="请求上下文" />
          )}
        </div>
      )}

      {/* 正文（无边框，铺满列宽）。狭间回合走「命途意志谕示」风格,主剧情走默认 BodyBlock。 */}
      <div className="px-1 py-2">
        {awakeningKind ? (
          <AwakeningOracleBlock
            content={parsed.body}
            pathName={pathName}
            kind={awakeningKind}
            npcRecords={npcRecords}
            traveler={traveler}
            showInnerVoice={showInnerVoice}
          />
        ) : (
      <BodyBlock content={parsed.body} npcRecords={npcRecords} traveler={traveler} showInnerVoice={showInnerVoice} userInput={previousUserInput} />
        )}

        {isStreaming && (
          <span
            className="inline-block w-1.5 h-4 ml-1 animate-pulse-soft"
            style={{ background: 'rgb(var(--tj-accent-primary))', boxShadow: '0 0 6px rgba(var(--tj-accent-primary), 0.6)' }}
          />
        )}
      </div>

      {/* 狭间消息:出题回合展示三道凝练题面 / 评判回合展示升阶徽章 + 行进感言 */}
      {awakeningKind === '出题' && parsed.awakenQuestions?.trim() && (
        <AwakeningQuestionsBlock raw={parsed.awakenQuestions} />
      )}
      {awakeningKind === '评判' && parsed.awakenJudgement?.trim() && (
        <>
          <AwakeningJudgementBadge judgement={parsed.awakenJudgement} />
          {judgementOutcome && (
            <AwakeningAftermathLine pathName={pathName} />
          )}
        </>
      )}

      {/* 底部信息：左=生成耗时，右=字数 */}
      <div
        className="mt-1 flex items-center justify-between px-1 text-xs tracking-wider"
        style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}
      >
        <span>
          {message.responseDurationSec != null ? (
            <>
              <span style={{ color: 'rgba(var(--tj-accent-primary), 0.5)' }}>◆</span>
              <span className="ml-1.5">{message.responseDurationSec}s</span>
            </>
          ) : (
            ''
          )}
        </span>
        <span>
          <span className="mr-1.5">{[...parsed.body].length} 字</span>
          <span style={{ color: 'rgba(var(--tj-accent-primary), 0.5)' }}>◆</span>
        </span>
      </div>
    </div>
  );

  // 主剧情消息直接返回 card;狭间消息再套一层皮肤
  if (!awakeningKind) return card;

  return (
    <div
      className="p-3"
      style={{
        // 暗紫红 + 微金,呼应虚境质感;主剧情是赤金,这里偏冷一点便于一眼区分
        background:
          'linear-gradient(135deg, rgba(48, 22, 50, 0.55) 0%, rgba(28, 16, 30, 0.55) 60%, rgba(40, 24, 18, 0.55) 100%)',
        boxShadow:
          'inset 0 0 0 1px rgba(200, 130, 180, 0.35), 0 0 26px rgba(120, 60, 120, 0.18)',
        clipPath:
          'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)',
      }}
    >
      <div
        className="mb-2 flex items-center justify-between text-[11px] font-serif tracking-[0.4em]"
        style={{ color: 'rgba(230, 180, 220, 0.85)' }}
      >
        <span>◇ 命 途 狭 间 · {awakeningKind}</span>
        <span style={{ color: 'rgba(190, 140, 180, 0.6)' }}>虚 境 之 问</span>
      </div>
      {card}
    </div>
  );
}

function formatDebugContext(message: 聊天消息): string {
  const debug = message.debugContext;
  if (!debug) return '这条历史消息没有保存请求上下文。请从新增按钮后的新回合开始查看。';
  const recall = debug.recallPreview?.trim()
    ? ['【回忆与剧情编织预览】', debug.recallPreview.trim()].join('\n')
    : '【回忆与剧情编织预览】\n（无或未命中）';
  const system = ['【System Prompt】', debug.systemPrompt || '（空）'].join('\n');
  const messages = [
    '【Messages】',
    ...debug.messages.map((msg, index) => [
      `## ${index + 1}. ${msg.role}`,
      msg.content || '（空）',
    ].join('\n')),
  ].join('\n\n---\n\n');
  return [recall, system, messages].join('\n\n====================\n\n');
}

// 出题回合:把 AI 输出的 <狭间问答> 块拆出来,以紧凑的三题列表呈现,方便玩家对照思考。
function AwakeningQuestionsBlock({ raw }: { raw: string }) {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const items: { label: string; text: string }[] = [];
  let pathName = '';
  for (const line of lines) {
    const mPath = line.match(/^命途\s*[:：]\s*(.+)$/);
    if (mPath) {
      pathName = mPath[1].trim();
      continue;
    }
    const mQ = line.match(/^题\s*([123一二三])\s*[:：]\s*(.+)$/);
    if (mQ) {
      items.push({ label: `第 ${mQ[1]} 问`, text: mQ[2].trim() });
    }
  }
  if (items.length === 0) return null;

  return (
    <div
      className="mt-2 p-3"
      style={{
        background: 'rgba(20, 12, 22, 0.55)',
        boxShadow: 'inset 0 0 0 1px rgba(220, 170, 210, 0.28)',
        clipPath:
          'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
      }}
    >
      <div
        className="mb-2 text-[11px] tracking-[0.32em]"
        style={{ color: 'rgba(230, 180, 220, 0.85)' }}
      >
        ◆ 三 问 · {pathName || '命途意志'}
      </div>
      <div className="space-y-2">
        {items.map((q, i) => (
          <div key={i} className="flex gap-2 text-sm leading-relaxed">
            <span
              className="shrink-0 font-serif tracking-wider"
              style={{ color: 'rgba(230, 180, 220, 0.85)' }}
            >
              {q.label}
            </span>
            <span style={{ color: 'rgba(225, 215, 200, 0.95)' }}>{q.text}</span>
          </div>
        ))}
      </div>
      <div
        className="mt-2 text-[11px] leading-relaxed"
        style={{ color: 'rgba(190, 160, 180, 0.7)' }}
      >
        在下方输入框中回答这三问,命途意志将据此评判你是否能跨入下一阶。
      </div>
    </div>
  );
}

// 评判回合:当前版本只呈现升阶徽章；旧消息若带其他值,也会退回中性样式。
function AwakeningJudgementBadge({ judgement }: { judgement: string }) {
  const j = judgement.trim();
  const isPromote = j.includes('升阶') || /promote/i.test(j);

  let label = j;
  let color = 'rgba(225, 215, 200, 0.95)';
  let glow = 'rgba(180, 140, 200, 0.4)';
  let bg = 'rgba(40, 22, 44, 0.55)';
  let stroke = 'rgba(220, 170, 210, 0.45)';

  if (isPromote) {
    label = '升 阶';
    color = 'rgba(180, 240, 200, 0.95)';
    glow = 'rgba(120, 220, 160, 0.55)';
    bg = 'rgba(20, 40, 30, 0.55)';
    stroke = 'rgba(150, 220, 180, 0.55)';
  }

  return (
    <div className="mt-2 flex items-center justify-center">
      <div
        className="px-6 py-2 font-serif text-base tracking-[0.5em]"
        style={{
          color,
          background: bg,
          boxShadow: `inset 0 0 0 1px ${stroke}, 0 0 20px ${glow}`,
          clipPath:
            'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)',
        }}
      >
        ◇ {label} ◇
      </div>
    </div>
  );
}

// 狭间正文外壳:套一层「命途意志·低语/评语」紫色边框,正文本身交给 BodyBlock,
// 这样【旁白】【角色名】【心声】行格式照常美化,头像也能正常显示。
function AwakeningOracleBlock({
  content,
  pathName,
  kind,
  npcRecords,
  traveler,
  showInnerVoice = true,
}: {
  content: string;
  pathName: string;
  kind: '出题' | '评判';
  npcRecords?: NPC记录[];
  traveler?: 角色数据结构;
  showInnerVoice?: boolean;
}) {
  if (!content?.trim()) return null;
  const subtitle = kind === '评判' ? '评 语' : '低 语';
  return (
    <div
      className="mx-1 px-4 py-3"
      style={{
        background:
          'linear-gradient(180deg, rgba(20, 12, 22, 0.45) 0%, rgba(28, 18, 28, 0.45) 100%)',
        boxShadow:
          'inset 0 0 0 1px rgba(220, 170, 210, 0.22), inset 0 0 32px rgba(120, 60, 120, 0.08)',
        clipPath:
          'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
      }}
    >
      <div
        className="mb-2 flex items-center justify-between text-[11px] tracking-[0.32em]"
        style={{ color: 'rgba(230, 180, 220, 0.8)' }}
      >
        <span>◆ 命途意志 · {subtitle}</span>
        {pathName && (
          <span style={{ color: 'rgba(200, 150, 200, 0.6)' }}>{pathName}</span>
        )}
      </div>
      <BodyBlock content={content} npcRecords={npcRecords} traveler={traveler} showInnerVoice={showInnerVoice} />
    </div>
  );
}

// 评判结果落地后的「行进感言」:当前版本只显示升阶确认。
function AwakeningAftermathLine({
  pathName,
}: {
  pathName: string;
}) {
  const label = pathName || '这条命途';

  return (
    <div className="mt-2 flex items-center justify-center px-3">
      <div
        className="font-serif text-[13px] leading-relaxed tracking-[0.12em] text-center"
        style={{ color: 'rgba(255, 240, 200, 0.95)', textShadow: '0 0 18px rgba(var(--tj-accent-primary), 0.45)' }}
      >
        你感觉到自己在「{label}」的路上,行进得更远了。
      </div>
    </div>
  );
}

function ToolButton({
  label,
  glyph,
  active,
  disabled,
  onClick,
}: {
  label: string;
  glyph: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-2.5 py-1 font-serif text-[11px] tracking-[0.18em] transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary), 0.85)',
        background: active ? 'rgba(var(--tj-accent-primary), 0.14)' : 'rgba(var(--tj-accent-primary), 0.04)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.55)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22)',
        clipPath:
          'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
      }}
      title={label}
    >
      <span className="text-xs" style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-accent-primary), 0.65)' }}>
        {glyph}
      </span>
      <span>{label}</span>
    </button>
  );
}

function TurnBadge({ value }: { value: string }) {
  return (
    <div
      className="px-3 py-1 font-serif text-[11px] tracking-[0.22em]"
      style={{
        color: 'rgb(var(--tj-accent-primary))',
        background:
          'linear-gradient(180deg, rgba(var(--tj-accent-primary), 0.18), rgba(var(--tj-accent-secondary), 0.08))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.55)',
        clipPath:
          'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
      }}
    >
      第 {value} 回合
    </div>
  );
}

function PanelText({ content, label }: { content: string; label: string }) {
  return (
    <div className="px-4 py-3">
      <div
        className="mb-1.5 font-serif text-[11px] tracking-[0.3em]"
        style={{ color: 'rgba(var(--tj-accent-primary), 0.7)' }}
      >
        ◆ {label}
      </div>
      <div
        className="whitespace-pre-wrap text-xs leading-relaxed"
        style={{ color: 'rgba(var(--tj-text-secondary), 0.92)' }}
      >
        {content}
      </div>
    </div>
  );
}

function VariablesPanel({
  commands,
  worldEvents,
}: {
  commands: Record<string, unknown>;
  worldEvents: string[];
}) {
  const cmdEntries = Object.entries(commands);
  return (
    <div className="px-4 py-3 text-xs">
      <div
        className="mb-1.5 font-serif text-[11px] tracking-[0.3em]"
        style={{ color: 'rgba(var(--tj-accent-primary), 0.7)' }}
      >
        ◆ 本回合变量
      </div>
      {cmdEntries.length === 0 && worldEvents.length === 0 && (
        <div style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>（无变量变动）</div>
      )}
      {cmdEntries.length > 0 && (
        <div className="space-y-1">
          {cmdEntries.map(([k, v]) => (
            <div key={k} className="flex gap-2" style={{ color: 'rgba(var(--tj-text-primary), 0.92)' }}>
              <span style={{ color: 'rgba(var(--tj-accent-primary), 0.75)' }}>{k}</span>
              <span style={{ color: 'rgba(var(--tj-text-secondary), 0.55)' }}>=</span>
              <span>{typeof v === 'string' ? v : JSON.stringify(v)}</span>
            </div>
          ))}
        </div>
      )}
      {worldEvents.length > 0 && (
        <div className="mt-2 space-y-1">
          {worldEvents.map((e, i) => (
            <div key={i} className="flex items-start gap-2" style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}>
              <span className="mt-0.5">✦</span>
              <span>{e}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditBodyPanel({
  draft,
  setDraft,
  onSave,
  onCancel,
}: {
  draft: string;
  setDraft: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="px-4 py-3">
      <div
        className="mb-1.5 font-serif text-[11px] tracking-[0.3em]"
        style={{ color: 'rgba(var(--tj-accent-primary), 0.7)' }}
      >
        ◆ 修改正文
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={8}
        className="kaituo-input w-full resize-y px-3 py-2 text-sm"
        style={{
          clipPath:
            'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
        }}
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 font-serif text-xs tracking-[0.25em] transition-all hover:opacity-90"
          style={{
            color: 'rgba(var(--tj-text-primary), 0.9)',
            background: 'rgba(var(--tj-accent-primary), 0.04)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.25)',
            clipPath:
              'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
          }}
        >
          取消
        </button>
        <button
          type="button"
          onClick={onSave}
          className="px-4 py-1.5 font-serif text-xs tracking-[0.25em] transition-all hover:opacity-90"
          style={{
            color: 'rgb(var(--tj-on-accent))',
            background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(var(--tj-accent-secondary), 0.95))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5)',
            clipPath:
              'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
          }}
        >
          保存
        </button>
      </div>
    </div>
  );
}
