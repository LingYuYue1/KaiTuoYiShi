import { memo, useState } from 'react';
import type { 聊天消息 } from '@/models/chat';
import type { NPC记录 } from '@/models/npc';
import type { 角色数据结构 } from '@/models/character';
import type { VisualTextSettings } from '@/models/settings';
import type { 相册系统 } from '@/models/imageGeneration';
import { BodyBlock, StreamingPreview } from './MessageRenderers';
import { getPath } from '@/data/journeyPresets';
import { 分类命途狭间回合, 判定评判是否升阶 } from '@/utils/awakening';
import { 格式化请求上下文 } from '@/utils/debugContextFormat';
import { UserTurnBubble } from './userTurnBubble';
import { AwakeningOracleBlock, AwakeningQuestionsBlock, AwakeningJudgementBadge, AwakeningAftermathLine } from './awakeningBlocks';
import { EditBodyPanel, PanelText, ToolButton, TurnBadge } from './turnToolbar';
import { UsagePanel } from './usagePanel';
import { NarrativeImageCard, NarrativeImageManualCard } from './narrativeImageCards';
import { cardClip, panelClip } from './turnStyles';

interface TurnItemProps {
  message: 聊天消息;
  isStreaming?: boolean;
  deferOffscreen?: boolean;
  onEditBody?: (id: string, newBody: string) => void;
  onRegenerateNarrativeImage?: (messageId: string) => void | Promise<void>;
  narrativeImageManualEnabled?: boolean;
  npcRecords?: NPC记录[];
  traveler?: 角色数据结构;
  album?: 相册系统;
  showInnerVoice?: boolean;
  previousUserInput?: string;
  visualTextSettings?: VisualTextSettings;
  // 历史评判消息若 awakenPathId 为空,由 ChatList 向前查找补一个 ID 进来。
  fallbackPathId?: string;
}

type ToolKey = 'edit' | 'thinking' | 'usage' | 'storyPlan' | 'summary' | 'raw' | 'context';

const HISTORY_TURN_VISIBILITY_STYLE = {
  contentVisibility: 'auto',
  containIntrinsicSize: 'auto 640px',
} as const;

function TurnItemImpl({ message, isStreaming, deferOffscreen = false, onEditBody, onRegenerateNarrativeImage, narrativeImageManualEnabled = false, npcRecords, traveler, album, showInnerVoice = true, fallbackPathId, previousUserInput, visualTextSettings }: TurnItemProps) {
  const isUser = message.role === 'user';
  const parsed = message.parsedResponse;
  const shouldDeferOffscreen = deferOffscreen && !isStreaming && !message.isStreaming;
  const visibilityStyle = shouldDeferOffscreen ? HISTORY_TURN_VISIBILITY_STYLE : undefined;

  if (isUser) {
    return (
      <div className="mb-4 animate-slide-up" style={visibilityStyle}>
        <UserTurnBubble content={message.content} traveler={traveler} album={album} fontSize={visualTextSettings?.playerFontSize ?? 14} />
      </div>
    );
  }

  return (
    <div className="mb-4 animate-slide-up" style={visibilityStyle}>
      {parsed ? (
        <AiTurnCard
          message={message}
          parsed={parsed}
          isStreaming={isStreaming}
          deferOffscreen={shouldDeferOffscreen}
          onEditBody={onEditBody}
          onRegenerateNarrativeImage={onRegenerateNarrativeImage}
          narrativeImageManualEnabled={narrativeImageManualEnabled}
          npcRecords={npcRecords}
          traveler={traveler}
          album={album}
          showInnerVoice={showInnerVoice}
          fallbackPathId={fallbackPathId}
          previousUserInput={previousUserInput}
          visualTextSettings={visualTextSettings}
        />
      ) : message.isStreaming ? (
        <StreamingPreview
          content={message.content}
          npcRecords={npcRecords}
          traveler={traveler}
          album={album}
          showInnerVoice={showInnerVoice}
          userInput={previousUserInput}
          visualTextSettings={visualTextSettings}
        />
      ) : null}
    </div>
  );
}

export const TurnItem = memo(TurnItemImpl);

interface AiTurnCardProps {
  message: 聊天消息;
  parsed: NonNullable<聊天消息['parsedResponse']>;
  isStreaming?: boolean;
  deferOffscreen?: boolean;
  onEditBody?: (id: string, newBody: string) => void;
  onRegenerateNarrativeImage?: (messageId: string) => void | Promise<void>;
  narrativeImageManualEnabled?: boolean;
  npcRecords?: NPC记录[];
  traveler?: 角色数据结构;
  album?: 相册系统;
  showInnerVoice?: boolean;
  fallbackPathId?: string;
  previousUserInput?: string;
  visualTextSettings?: VisualTextSettings;
}

function AiTurnCard({ message, parsed, isStreaming, deferOffscreen = false, onEditBody, onRegenerateNarrativeImage, narrativeImageManualEnabled = false, npcRecords, traveler, album, showInnerVoice = true, fallbackPathId, previousUserInput, visualTextSettings }: AiTurnCardProps) {
  const [openTool, setOpenTool] = useState<ToolKey | null>(null);
  const [draft, setDraft] = useState(parsed.body);

  const toggle = (key: ToolKey) => {
    setOpenTool((cur) => (cur === key ? null : key));
    if (key === 'edit') setDraft(parsed.body);
  };

  const handleEditSave = () => {
    if (onEditBody) onEditBody(message.id, draft);
    setOpenTool(null);
  };

  const awakeningKind = 分类命途狭间回合(parsed);
  const judgementOutcome: '升阶' | null =
    awakeningKind === '评判' && 判定评判是否升阶(parsed.awakenJudgement) ? '升阶' : null;

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
          label="响应详情"
          glyph="◉"
          active={openTool === 'usage'}
          onClick={() => toggle('usage')}
        />
        <TurnBadge value={message.gameTime ?? '?'} />
        <ToolButton
          label="剧情规划"
          glyph="◇"
          active={openTool === 'storyPlan'}
          disabled={!parsed.storyPlan.trim()}
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
            background: 'rgba(var(--tj-btn-primary-start), 0.04)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.28)',
            clipPath: cardClip,
          }}
        >
          {openTool === 'edit' && (
            <EditBodyPanel
              draft={draft}
              setDraft={setDraft}
              onSave={handleEditSave}
              onCancel={() => {
                setDraft(parsed.body);
                setOpenTool(null);
              }}
            />
          )}
          {openTool === 'thinking' && (
            <PanelText content={parsed.thinking.trim() || '本回合未输出思维链。'} label="思绪痕迹" />
          )}
          {openTool === 'usage' && (
            <UsagePanel message={message} onClose={() => setOpenTool(null)} />
          )}
          {openTool === 'storyPlan' && (
            <PanelText content={parsed.storyPlan.trim() || '本回合没有剧情规划保留项。'} label="剧情规划" />
          )}
          {openTool === 'summary' && <PanelText content={parsed.memory} label="记忆收录" />}
          {openTool === 'raw' && (
            <PanelText content={parsed.rawText.trim() || message.content || '本回合没有保存原始消息。'} label="原始消息" />
          )}
          {openTool === 'context' && (
            <PanelText content={格式化请求上下文(message)} label="请求上下文" />
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
            album={album}
            showInnerVoice={showInnerVoice}
            deferOffscreen={deferOffscreen}
            visualTextSettings={visualTextSettings}
          />
        ) : (
          <BodyBlock content={parsed.body} npcRecords={npcRecords} traveler={traveler} album={album} showInnerVoice={showInnerVoice} userInput={previousUserInput} visualTextSettings={visualTextSettings} deferOffscreen={deferOffscreen} />
        )}

        {isStreaming && (
          <span
            className="inline-block w-1.5 h-4 ml-1 animate-pulse-soft"
            style={{ background: 'rgb(var(--tj-btn-primary-start))', boxShadow: '0 0 6px rgba(var(--tj-btn-primary-start), 0.6)' }}
          />
        )}
      </div>

      {/* 故事快照卡片 */}
      {((message.narrativeImages && message.narrativeImages.length > 0) || (narrativeImageManualEnabled && !isStreaming)) && (
        <div className="px-1 py-2 space-y-2">
          {(message.narrativeImages ?? []).map((img) => (
            <NarrativeImageCard key={img.id} image={img} messageId={message.id} album={album} onRegenerateNarrativeImage={onRegenerateNarrativeImage} />
          ))}
          {(!message.narrativeImages || message.narrativeImages.length === 0) && (
            narrativeImageManualEnabled ? <NarrativeImageManualCard messageId={message.id} onRegenerateNarrativeImage={onRegenerateNarrativeImage} /> : null
          )}
        </div>
      )}

      {/* 狭间消息:出题回合展示三道凝练题面 / 评判回合展示升阶徽章 + 行进感言 */}
      {awakeningKind === '出题' && parsed.awakenQuestions.trim() && (
        <AwakeningQuestionsBlock raw={parsed.awakenQuestions} />
      )}
      {awakeningKind === '评判' && parsed.awakenJudgement.trim() && (
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
          {message.responseDurationSec !== undefined ? (
            <>
              <span style={{ color: 'rgba(var(--tj-btn-primary-start), 0.5)' }}>◆</span>
              <span className="ml-1.5">{message.responseDurationSec}s</span>
            </>
          ) : (
            ''
          )}
        </span>
        <span>
          <span className="mr-1.5">{Array.from(parsed.body).length} 字</span>
          <span style={{ color: 'rgba(var(--tj-btn-primary-start), 0.5)' }}>◆</span>
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
          'linear-gradient(135deg, rgba(var(--tj-panel-bg-start),0.55) 0%, rgba(var(--tj-panel-bg-end),0.55) 60%, rgba(var(--tj-btn-primary-end),0.55) 100%)',
        boxShadow:
          'inset 0 0 0 1px rgba(var(--tj-btn-primary-end),0.35), 0 0 26px rgba(var(--tj-accent-primary-deep),0.18)',
        clipPath: panelClip,
      }}
    >
      <div
        className="mb-2 flex items-center justify-between text-[11px] font-serif tracking-[0.4em]"
        style={{ color: 'rgba(var(--tj-btn-primary-start),0.85)' }}
      >
        <span>◇ 命 途 狭 间 · {awakeningKind}</span>
        <span style={{ color: 'rgba(var(--tj-btn-primary-end),0.6)' }}>虚 境 之 问</span>
      </div>
      {card}
    </div>
  );
}
