import { memo, useState } from 'react';
import type { 聊天消息 } from '@/models/chat';
import type { NPC记录 } from '@/models/npc';
import type { 角色数据结构 } from '@/models/character';
import type { VisualTextSettings } from '@/models/settings';
import type { 相册系统 } from '@/models/imageGeneration';
import { BodyBlock, StreamingPreview } from './MessageRenderers';
import { getPath } from '@/data/journeyPresets';
import { formatTokenCount } from '@/utils/tokenEstimate';
import { 解析相册资源引用 } from '@/utils/albumActions';
import { ResilientImage } from '@/components/ui/ResilientImage';

interface TurnItemProps {
  message: 聊天消息;
  isStreaming?: boolean;
  deferOffscreen?: boolean;
  onEditBody?: (id: string, newBody: string) => void;
  onReparseVariables?: (messageId: string) => void | Promise<void>;
  variableRepairing?: boolean;
  onRegenerateNarrativeImage?: (messageId: string) => void | Promise<void>;
  narrativeImageManualEnabled?: boolean;
  npcRecords?: NPC记录[];
  traveler?: 角色数据结构;
  album?: 相册系统;
  showInnerVoice?: boolean;
  previousUserInput?: string;
  visualTextSettings?: VisualTextSettings;
  devMode?: boolean;
  // 历史评判消息若 awakenPathId 为空,由 ChatList 向前查找补一个 ID 进来。
  fallbackPathId?: string;
}

type ToolKey = 'edit' | 'thinking' | 'usage' | 'storyPlan' | 'summary' | 'raw' | 'context' | 'diagnostics';

const HISTORY_TURN_VISIBILITY_STYLE = {
  contentVisibility: 'auto',
  containIntrinsicSize: 'auto 640px',
} as const;

function TurnItemImpl({ message, isStreaming, deferOffscreen = false, onEditBody, onReparseVariables, variableRepairing = false, onRegenerateNarrativeImage, narrativeImageManualEnabled = false, npcRecords, traveler, album, showInnerVoice = true, fallbackPathId, previousUserInput, visualTextSettings, devMode = false }: TurnItemProps) {
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
          onReparseVariables={onReparseVariables}
          variableRepairing={variableRepairing}
          onRegenerateNarrativeImage={onRegenerateNarrativeImage}
          narrativeImageManualEnabled={narrativeImageManualEnabled}
          npcRecords={npcRecords}
          traveler={traveler}
          album={album}
          showInnerVoice={showInnerVoice}
          fallbackPathId={fallbackPathId}
          previousUserInput={previousUserInput}
          visualTextSettings={visualTextSettings}
          devMode={devMode}
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

function UserTurnBubble({ content, traveler, album, fontSize = 14 }: { content: string; traveler?: 角色数据结构; album?: 相册系统; fontSize?: number }) {
  const name = traveler?.姓名?.trim() || traveler?.别名?.trim() || '旅人';
  const avatarUrl = 解析相册资源引用(album, traveler?.图像档案?.正文头像?.trim() || traveler?.头像?.trim());
  const bubbleBg = 'rgba(var(--tj-chat-bubble), var(--tj-chat-bubble-alpha, 0.78))';

  return (
    <div className="mb-4 flex justify-end animate-slide-up">
      <div className="group flex max-w-[88%] items-start justify-end gap-3">
        <div className="relative mt-1 min-w-0">
          <div
            className="absolute top-3 -right-1.5 h-3 w-3 rotate-45"
            style={{
              background: bubbleBg,
              boxShadow: '1px -1px 0 0 rgba(var(--tj-btn-primary-start), 0.46)',
            }}
          />
          <div
            className="relative whitespace-pre-wrap break-words px-4 py-2.5"
            style={{
              background: bubbleBg,
              color: 'rgba(var(--tj-chat-text), 0.98)',
              clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.46), 0 4px 18px rgba(var(--tj-shadow), 0.35), 0 0 22px rgba(var(--tj-btn-primary-start), 0.08)',
              fontWeight: 600,
              fontSize: `${fontSize}px`,
              lineHeight: 1.8,
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
            : 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.22), rgba(var(--tj-chat-bubble), 0.92))',
          boxShadow:
            '0 0 0 1px rgba(var(--tj-btn-primary-start), 0.58), 0 0 14px rgba(var(--tj-btn-primary-start), 0.24), 0 8px 16px rgba(var(--tj-shadow), 0.16), inset 0 0 0 1px rgba(var(--tj-text-primary), 0.18)',
        }}
      >
        {url ? (
          <ResilientImage src={url} alt={`${name} 头像`} className="h-full w-full object-cover" />
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
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.52), 0 0 10px rgba(var(--tj-btn-primary-start), 0.12)',
          clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
        }}
      >
        <span className="block truncate font-serif text-[11px] font-semibold tracking-[0.1em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.98)' }}>
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
  deferOffscreen?: boolean;
  onEditBody?: (id: string, newBody: string) => void;
  onReparseVariables?: (messageId: string) => void | Promise<void>;
  variableRepairing?: boolean;
  onRegenerateNarrativeImage?: (messageId: string) => void | Promise<void>;
  narrativeImageManualEnabled?: boolean;
  npcRecords?: NPC记录[];
  traveler?: 角色数据结构;
  album?: 相册系统;
  showInnerVoice?: boolean;
  fallbackPathId?: string;
  previousUserInput?: string;
  visualTextSettings?: VisualTextSettings;
  devMode?: boolean;
}

function AiTurnCard({ message, parsed, isStreaming, deferOffscreen = false, onEditBody, onReparseVariables, variableRepairing = false, onRegenerateNarrativeImage, narrativeImageManualEnabled = false, npcRecords, traveler, album, showInnerVoice = true, fallbackPathId, previousUserInput, visualTextSettings, devMode = false }: AiTurnCardProps) {
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
          label={variableRepairing ? '解析变量中' : '重新解析变量'}
          glyph="↻"
          disabled={isStreaming || variableRepairing || !onReparseVariables}
          onClick={() => { void onReparseVariables?.(message.id); }}
        />
        <ToolButton
          label="真实请求"
          glyph="⬡"
          active={openTool === 'context'}
          onClick={() => toggle('context')}
        />
        {devMode && (
          <ToolButton
            label="请求诊断"
            glyph="◇"
            active={openTool === 'diagnostics'}
            onClick={() => toggle('diagnostics')}
          />
        )}
      </div>

      {/* 展开面板 */}
      {openTool && (
        <div
          className="mb-2 animate-fade-in"
          style={{
            background: 'rgba(var(--tj-btn-primary-start), 0.04)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.28)',
            clipPath:
              'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
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
            <PanelText content={parsed.thinking?.trim() || '本回合未输出思维链。'} label="思绪痕迹" />
          )}
          {openTool === 'usage' && (
            <UsagePanel message={message} onClose={() => setOpenTool(null)} />
          )}
          {openTool === 'storyPlan' && (
            <PanelText content={parsed.storyPlan?.trim() || '本回合没有剧情规划保留项。'} label="剧情规划" />
          )}
          {openTool === 'summary' && <PanelText content={parsed.memory} label="记忆收录" />}
          {openTool === 'raw' && (
            <PanelText content={parsed.rawText?.trim() || message.content || '本回合没有保存原始消息。'} label="原始消息" />
          )}
          {openTool === 'context' && (
            <PanelText content={formatActualRequestContext(message)} label="真实请求（发送给主剧情）" />
          )}
          {devMode && openTool === 'diagnostics' && (
            <PanelText content={formatDebugDiagnostics(message)} label="本地诊断（不会发送给主剧情）" />
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
              <span style={{ color: 'rgba(var(--tj-btn-primary-start), 0.5)' }}>◆</span>
              <span className="ml-1.5">{message.responseDurationSec}s</span>
            </>
          ) : (
            ''
          )}
        </span>
        <span>
          <span className="mr-1.5">{[...parsed.body].length} 字</span>
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
        clipPath:
          'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)',
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

function formatActualRequestContext(message: 聊天消息): string {
  const debug = message.debugContext;
  if (!debug) return '这条历史消息没有保存真实请求。请从新增按钮后的新回合开始查看。';
  const system = ['【System Prompt｜发送给主剧情】', debug.systemPrompt || '（空）'].join('\n');
  const messages = [
    '【Messages｜发送给主剧情】',
    ...debug.messages.map((msg, index) => [
      `## ${index + 1}. ${msg.role}`,
      msg.content || '（空）',
    ].join('\n')),
  ].join('\n\n---\n\n');
  return [system, messages].join('\n\n====================\n\n');
}

function formatDebugDiagnostics(message: 聊天消息): string {
  const debug = message.debugContext;
  if (!debug) return '这条历史消息没有保存本地诊断。请从新增按钮后的新回合开始查看。';
  const yitingRaw = [
    '【忆庭模型原始返回】',
    debug.yitingRecallUsedModel
      ? (debug.yitingRecallRawText?.trim() || '（忆庭模型已调用，但没有保存到原始返回文本。）')
      : '（本回合未调用忆庭模型，使用本地摘要检索，或未到忆庭召回触发回合。）',
  ].join('\n');
  const zhikuRaw = [
    '【智库模型原始返回】',
    debug.zhikuRecallUsedModel
      ? (debug.zhikuRecallRawText?.trim() || '（智库模型已调用，但没有保存到原始返回文本。）')
      : '（本回合未调用智库模型，使用本地规则召回；本地规则不会执行 Step0~Step8 模型思维链。）',
  ].join('\n');
  const recall = debug.recallPreview?.trim()
    ? ['【回忆、剧情编织与智库预览】', debug.recallPreview.trim()].join('\n')
    : '【回忆、剧情编织与智库预览】\n（无或未命中）';
  const deepSeekDiagnostics = [
    '【DeepSeek 主剧情诊断】',
    `主剧情请求模式：${debug.mainRequestMode ?? '未知'}`,
    `模式：${debug.deepSeekMainMode ?? 'off'}`,
    debug.deepSeekMainOriginalModel && debug.deepSeekMainAdaptedModel
      ? `主剧情模型适配：${debug.deepSeekMainOriginalModel} → ${debug.deepSeekMainAdaptedModel}`
      : '主剧情模型适配：未触发',
    `跳过 CoT 伪装历史：${debug.deepSeekCotFakeHistorySkipped ? '是' : '否'}`,
    `Prefix 锁格式：${debug.deepSeekPrefixMode ? '是' : '否'}`,
    debug.deepSeekProtocolIssues?.length
      ? `协议校验失败项：${debug.deepSeekProtocolIssues.join('；')}`
      : '协议校验失败项：无',
    typeof debug.rerollSimilarity === 'number'
      ? `重roll相似度：${Math.round(debug.rerollSimilarity * 100)}%`
      : '重roll相似度：未触发',
    `重roll自动换写：${debug.rerollSimilarityRetried ? '是' : '否'}`,
  ].join('\n');
  const cachePrefixDiagnostics = debug.cachePrefixDiagnostics
    ? [
        '【缓存前缀诊断】',
        `公共前缀：${formatTokenCount(debug.cachePrefixDiagnostics.commonPrefixTokens)} / ${formatTokenCount(debug.cachePrefixDiagnostics.currentPromptTokens)} tokens（${(debug.cachePrefixDiagnostics.commonPrefixRate * 100).toFixed(1)}%）`,
        `首次变化（本回合）：${debug.cachePrefixDiagnostics.firstDiffCurrentSection}`,
        debug.cachePrefixDiagnostics.firstDiffPreviousSection
          ? `首次变化（上一回合）：${debug.cachePrefixDiagnostics.firstDiffPreviousSection}`
          : '',
        `变化后估算：${formatTokenCount(debug.cachePrefixDiagnostics.changedTailTokens)} tokens`,
        debug.cachePrefixDiagnostics.largestChangedSections.length
          ? `变化后大块：${debug.cachePrefixDiagnostics.largestChangedSections.map((item) => `${item.label}≈${formatTokenCount(item.tokens)}`).join('；')}`
          : '',
        `本回合变化片段：${debug.cachePrefixDiagnostics.firstDiffCurrentExcerpt}`,
        debug.cachePrefixDiagnostics.firstDiffPreviousExcerpt
          ? `上一回合变化片段：${debug.cachePrefixDiagnostics.firstDiffPreviousExcerpt}`
          : '',
      ].filter(Boolean).join('\n')
    : '';
  const npcLedger = debug.npcLedgerInjection
    ? [
        '【NPC账本注入诊断】',
        `已注入：${debug.npcLedgerInjection.selectedNames.length ? debug.npcLedgerInjection.selectedNames.join('、') : '无'}`,
        debug.npcLedgerInjection.injected.length
          ? debug.npcLedgerInjection.injected.map((item) => [
              `- ${item.name}`,
              `  原因：${item.reason.join('；') || '相关'}`,
              `  字段：${item.fields.join('；') || '无账本字段，仅旧档案兜底'}`,
              `  标记：最近互动=${item.hasRecentInteraction ? '是' : '否'}；必须记得=${item.hasMustRemember ? '是' : '否'}；未完成事项=${item.hasUnresolvedItems ? '是' : '否'}`,
            ].join('\n')).join('\n')
          : '',
        debug.npcLedgerInjection.skippedNames.length
          ? `未注入示例：\n${debug.npcLedgerInjection.skippedNames.slice(0, 8).map((item) => `- ${item.name}：${item.reason}`).join('\n')}`
          : '',
      ].filter(Boolean).join('\n')
    : '【NPC账本注入诊断】\n（本回合没有保存 NPC 账本诊断；请从本功能更新后的新回合开始查看。）';
  const npcLedgerUpdate = debug.npcLedgerUpdate
    ? [
        '【NPC账本更新诊断】',
        `更新 NPC：${debug.npcLedgerUpdate.updatedNames.length ? debug.npcLedgerUpdate.updatedNames.join('、') : '无'}`,
        debug.npcLedgerUpdate.memoryAppended.length
          ? `追加同行记忆：\n${debug.npcLedgerUpdate.memoryAppended.slice(0, 8).map((item) => `- ${item}`).join('\n')}`
          : '追加同行记忆：无',
        debug.npcLedgerUpdate.ledgerFieldsUpdated.length
          ? `账本字段：\n${debug.npcLedgerUpdate.ledgerFieldsUpdated.slice(0, 12).map((item) => `- ${item}`).join('\n')}`
          : '账本字段：无',
        debug.npcLedgerUpdate.summaryTriggered.length
          ? `触发总结记忆压缩：${debug.npcLedgerUpdate.summaryTriggered.join('、')}`
          : '',
        debug.npcLedgerUpdate.warnings.length
          ? `警告：\n${debug.npcLedgerUpdate.warnings.slice(0, 8).map((item) => `- ${item}`).join('\n')}`
          : '',
      ].filter(Boolean).join('\n')
    : '【NPC账本更新诊断】\n（本回合尚未保存 NPC 账本更新诊断；变量模型未运行、未命中 NPC，或这是旧回合。）';
  return [deepSeekDiagnostics, cachePrefixDiagnostics, yitingRaw, zhikuRaw, npcLedger, npcLedgerUpdate, recall]
    .filter(Boolean)
    .join('\n\n====================\n\n');
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
        background: 'rgba(var(--tj-panel-bg-end),0.55)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-end),0.28)',
        clipPath:
          'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
      }}
    >
      <div
        className="mb-2 text-[11px] tracking-[0.32em]"
        style={{ color: 'rgba(var(--tj-btn-primary-start),0.85)' }}
      >
        ◆ 三 问 · {pathName || '命途意志'}
      </div>
      <div className="space-y-2">
        {items.map((q, i) => (
          <div key={i} className="flex gap-2 text-sm leading-relaxed">
            <span
              className="shrink-0 font-serif tracking-wider"
              style={{ color: 'rgba(var(--tj-btn-primary-start),0.85)' }}
            >
              {q.label}
            </span>
            <span style={{ color: 'rgba(var(--tj-text-primary),0.95)' }}>{q.text}</span>
          </div>
        ))}
      </div>
      <div
        className="mt-2 text-[11px] leading-relaxed"
        style={{ color: 'rgba(var(--tj-btn-primary-end),0.7)' }}
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
  let color = 'rgba(var(--tj-text-primary),0.95)';
  let glow = 'rgba(var(--tj-btn-primary-end),0.4)';
  let bg = 'rgba(var(--tj-panel-bg-start),0.55)';
  let stroke = 'rgba(var(--tj-btn-primary-end),0.45)';

  if (isPromote) {
    label = '升 阶';
    color = 'rgba(var(--tj-ui-success),0.95)';
    glow = 'rgba(var(--tj-ui-success),0.55)';
    bg = 'rgba(var(--tj-ui-success),0.15)';
    stroke = 'rgba(var(--tj-ui-success),0.55)';
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
  album,
  showInnerVoice = true,
  deferOffscreen = false,
  visualTextSettings,
}: {
  content: string;
  pathName: string;
  kind: '出题' | '评判';
  npcRecords?: NPC记录[];
  traveler?: 角色数据结构;
  album?: 相册系统;
  showInnerVoice?: boolean;
  deferOffscreen?: boolean;
  visualTextSettings?: VisualTextSettings;
}) {
  if (!content?.trim()) return null;
  const subtitle = kind === '评判' ? '评 语' : '低 语';
  return (
    <div
      className="mx-1 px-4 py-3"
      style={{
        background:
          'linear-gradient(180deg, rgba(var(--tj-panel-bg-end),0.45) 0%, rgba(var(--tj-panel-bg-start),0.45) 100%)',
        boxShadow:
          'inset 0 0 0 1px rgba(var(--tj-btn-primary-end),0.22), inset 0 0 32px rgba(var(--tj-accent-primary-deep),0.08)',
        clipPath:
          'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
      }}
    >
      <div
        className="mb-2 flex items-center justify-between text-[11px] tracking-[0.32em]"
        style={{ color: 'rgba(var(--tj-btn-primary-start),0.8)' }}
      >
        <span>◆ 命途意志 · {subtitle}</span>
        {pathName && (
          <span style={{ color: 'rgba(var(--tj-btn-primary-end),0.6)' }}>{pathName}</span>
        )}
      </div>
      <BodyBlock content={content} npcRecords={npcRecords} traveler={traveler} album={album} showInnerVoice={showInnerVoice} visualTextSettings={visualTextSettings} deferOffscreen={deferOffscreen} />
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
        style={{ color: 'rgba(var(--tj-text-primary),0.95)', textShadow: '0 0 18px rgba(var(--tj-btn-primary-start), 0.45)' }}
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
        background: active ? 'rgba(var(--tj-btn-primary-start), 0.14)' : 'rgba(var(--tj-btn-primary-start), 0.04)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.55)'
          : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.22)',
        clipPath:
          'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
      }}
      title={label}
    >
      <span className="text-xs" style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-btn-primary-start), 0.65)' }}>
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
          'linear-gradient(180deg, rgba(var(--tj-btn-primary-start), 0.18), rgba(var(--tj-btn-primary-end), 0.08))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.55)',
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
        style={{ color: 'rgba(var(--tj-btn-primary-start), 0.7)' }}
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

function UsagePanel({ message, onClose }: { message: 聊天消息; onClose: () => void }) {
  const usage = message.tokenUsage;
  const inputTokens = usage?.inputTokens ?? message.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? message.outputTokens ?? 0;
  const totalTokens = usage?.totalTokens ?? inputTokens + outputTokens;
  const cachedTokens = usage?.cachedTokens;
  const uncachedTokens = usage?.uncachedTokens;
  const sourceLabel = usage?.source === 'api' ? 'API返回' : usage?.source === 'mixed' ? '混合' : '本地估算';
  const timeText = formatTurnTime(message.timestamp);
  const turn = message.gameTime ?? '?';
  const cacheKnown = typeof cachedTokens === 'number' || typeof uncachedTokens === 'number' || typeof usage?.cacheHitRate === 'number';
  const usageFormat = usage?.usageFormat ?? '未记录';
  const usagePath = usage?.usagePath ?? '未记录';
  const rawUsageKeys = usage?.rawUsageKeys?.length
    ? usage.rawUsageKeys.join(', ')
    : usage?.rawUsage && typeof usage.rawUsage === 'object'
      ? Object.keys(usage.rawUsage as Record<string, unknown>).sort().join(', ')
      : '未记录';
  const cacheDiagnostic = usage?.cacheDiagnostic
    ?? (usage?.rawUsage != null
      ? 'API 已返回 usage，但没有可识别的缓存统计字段。'
      : '当前回合没有 API usage 原始字段，只能显示本地估算。');
  const cacheOptimizationHint = buildCacheOptimizationHint({
    provider: usage?.provider,
    model: usage?.model,
    inputTokens,
    cachedTokens,
    uncachedTokens,
    cacheHitRate: usage?.cacheHitRate,
    cacheKnown,
  });
  const cachePrefixDiagnostics = message.debugContext?.cachePrefixDiagnostics;

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 font-serif text-[15px]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>◷</span>
          <div>
            <div className="font-serif text-[13px] font-semibold tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.95)' }}>
              第 {turn} 回合
            </div>
            <div className="mt-0.5 text-[11px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>
              响应详情 · {sourceLabel}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center text-xs transition-opacity hover:opacity-85"
          style={{
            color: 'rgba(var(--tj-text-secondary),0.8)',
            background: 'rgba(var(--tj-bg-primary),0.24)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.34)',
            clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
          }}
          title="关闭响应详情"
        >
          ×
        </button>
      </div>

      <div className="mt-3 grid gap-2.5">
        <UsageSection title="时间">
          <div className="space-y-1 text-xs leading-relaxed">
            <div>
              <span style={{ color: 'rgba(var(--tj-text-secondary),0.74)' }}>时间</span>
              <div className="mt-0.5 font-mono text-[12px]" style={{ color: 'rgba(var(--tj-text-primary),0.94)' }}>{timeText}</div>
            </div>
            <div>
              <span style={{ color: 'rgba(var(--tj-text-secondary),0.74)' }}>耗时</span>
              <span className="ml-2 font-mono" style={{ color: 'rgba(var(--tj-btn-primary-start),0.9)' }}>
                {message.responseDurationSec != null ? `${message.responseDurationSec.toFixed(1)} 秒` : '未记录'}
              </span>
            </div>
          </div>
        </UsageSection>

        <UsageSection title="Tokens">
          <div className="grid grid-cols-3 gap-2 text-center">
            <UsageMetric label="输入" value={inputTokens ? formatTokenCount(inputTokens) : '0'} tone="neutral" />
            <UsageMetric label="输出" value={outputTokens ? formatTokenCount(outputTokens) : '0'} tone="primary" />
            <UsageMetric label="总计" value={totalTokens ? formatTokenCount(totalTokens) : '0'} tone="gold" />
          </div>
        </UsageSection>

        <UsageSection title="缓存" highlighted>
          <div className="grid grid-cols-2 gap-2 text-center">
            <UsageMetric label="命中" value={typeof cachedTokens === 'number' ? formatTokenCount(cachedTokens) : '未返回'} tone="green" />
            <UsageMetric label="未命中" value={typeof uncachedTokens === 'number' ? formatTokenCount(uncachedTokens) : '未返回'} tone="red" />
          </div>
          <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>
            {cacheKnown
              ? `缓存字段来自 ${sourceLabel}${usage?.cacheHitRate != null ? `，命中率 ${(usage.cacheHitRate * 100).toFixed(1)}%` : ''}。`
              : usage?.rawUsage != null
                ? `${cacheDiagnostic} Gemini 原生缓存统计通常是 usageMetadata.cachedContentTokenCount；若原始 usage 只有 prompt_tokens / completion_tokens / total_tokens，说明当前接口或中转未透传缓存命中。`
                : '当前接口没有返回缓存字段；输入/输出 token 仍可查看，缓存命中不做本地猜测。'}
          </div>
          {cacheOptimizationHint && (
            <div
              className="mt-2 px-2 py-1.5 text-[11px] leading-relaxed"
              style={{
                color: 'rgba(var(--tj-text-primary),0.86)',
                background: 'rgba(var(--tj-btn-primary-start),0.08)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.22)',
              }}
            >
              <span style={{ color: 'rgba(var(--tj-btn-primary-start),0.92)' }}>缓存优化：</span>{cacheOptimizationHint}
            </div>
          )}
          {cachePrefixDiagnostics && (
            <div
              className="mt-2 px-2 py-1.5 text-[11px] leading-relaxed"
              style={{
                color: 'rgba(var(--tj-text-primary),0.86)',
                background: 'rgba(var(--tj-tech-blue),0.08)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-blue),0.22)',
              }}
            >
              <div style={{ color: 'rgba(var(--tj-tech-blue),0.95)' }}>前缀诊断</div>
              <div className="mt-1 grid gap-1">
                <div>公共前缀：{formatTokenCount(cachePrefixDiagnostics.commonPrefixTokens)} / {formatTokenCount(cachePrefixDiagnostics.currentPromptTokens)} tokens（{(cachePrefixDiagnostics.commonPrefixRate * 100).toFixed(1)}%）</div>
                <div>首次变化：{cachePrefixDiagnostics.firstDiffCurrentSection}</div>
                <div>变化后估算：{formatTokenCount(cachePrefixDiagnostics.changedTailTokens)} tokens</div>
              </div>
              {cachePrefixDiagnostics.largestChangedSections.length > 0 && (
                <div className="mt-1.5" style={{ color: 'rgba(var(--tj-text-secondary),0.78)' }}>
                  {cachePrefixDiagnostics.largestChangedSections.slice(0, 4).map((item) => `${item.label}≈${formatTokenCount(item.tokens)}`).join('；')}
                </div>
              )}
            </div>
          )}
          <div className="mt-2 grid gap-1.5 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>
            <div><span style={{ color: 'rgba(var(--tj-btn-primary-start),0.76)' }}>模型：</span>{usage?.provider ?? '未记录'} / {usage?.model ?? '未记录'}</div>
            <div><span style={{ color: 'rgba(var(--tj-btn-primary-start),0.76)' }}>Usage格式：</span>{usageFormat} · {usagePath}</div>
            <div><span style={{ color: 'rgba(var(--tj-btn-primary-start),0.76)' }}>原始字段：</span>{rawUsageKeys || '未记录'}</div>
          </div>
          {usage?.rawUsage != null && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.78)' }}>
                原始 usage 字段
              </summary>
              <pre
                className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-none px-2 py-1.5 text-[10px] leading-relaxed"
                style={{
                  color: 'rgba(var(--tj-text-secondary),0.82)',
                  background: 'rgba(var(--tj-bg-primary),0.28)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.22)',
                }}
              >
                {formatRawUsage(usage.rawUsage)}
              </pre>
            </details>
          )}
        </UsageSection>
      </div>
    </div>
  );
}

function buildCacheOptimizationHint(input: {
  provider?: string;
  model?: string;
  inputTokens: number;
  cachedTokens?: number;
  uncachedTokens?: number;
  cacheHitRate?: number;
  cacheKnown: boolean;
}): string {
  if (!input.cacheKnown) return '';
  const providerModel = `${input.provider ?? ''} ${input.model ?? ''}`;
  const isDeepSeek = /deepseek/i.test(providerModel);
  const hitRate = typeof input.cacheHitRate === 'number'
    ? input.cacheHitRate
    : typeof input.cachedTokens === 'number' && input.inputTokens > 0
      ? input.cachedTokens / input.inputTokens
      : undefined;
  if (isDeepSeek && (input.cachedTokens === 0 || hitRate === 0)) {
    return 'DeepSeek 已返回缓存统计但命中为 0，说明统计链路已通，当前请求前缀仍未复用成功。建议连续生成 2-3 个新回合观察；若仍为 0，优先检查 system prompt 前段是否仍有时间、场景、记忆、智库等动态内容提前抖动。';
  }
  if (isDeepSeek && typeof hitRate === 'number' && hitRate > 0 && hitRate < 0.25) {
    return 'DeepSeek 已命中部分缓存，但比例偏低。可继续把稳定规则、CoT 和固定世界观保持在请求最前段，把当前状态、记忆、智库与历史消息后置。';
  }
  if (isDeepSeek && typeof hitRate === 'number' && hitRate >= 0.25) {
    return 'DeepSeek 缓存已经开始命中，说明前缀重排有效。后续重点是保持开头规则稳定，避免把回合时间、当前场景或检索结果插回请求前部。';
  }
  return '';
}

function UsageSection({ title, highlighted = false, children }: { title: string; highlighted?: boolean; children: React.ReactNode }) {
  return (
    <section
      className="px-3 py-2.5"
      style={{
        background: highlighted ? 'rgba(var(--tj-btn-primary-start),0.08)' : 'rgba(var(--tj-bg-primary),0.22)',
        boxShadow: highlighted
          ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.34)'
          : 'inset 0 0 0 1px rgba(var(--tj-border),0.28)',
        clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
      }}
    >
      <div className="mb-2 font-serif text-[10px] uppercase tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.78)' }}>
        {title}
      </div>
      {children}
    </section>
  );
}

function UsageMetric({ label, value, tone }: { label: string; value: string; tone: 'neutral' | 'primary' | 'gold' | 'green' | 'red' }) {
  const color =
    tone === 'primary' ? 'rgba(var(--tj-btn-primary-start),0.95)'
      : tone === 'gold' ? 'rgba(var(--tj-btn-primary-start),0.95)'
      : tone === 'green' ? 'rgba(var(--tj-ui-success),0.95)'
      : tone === 'red' ? 'rgba(var(--tj-danger),0.95)'
      : 'rgba(var(--tj-text-primary),0.92)';
  return (
    <div className="min-w-0">
      <div className="font-serif text-[11px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-text-secondary),0.76)' }}>
        {label}
      </div>
      <div className="mt-0.5 break-words font-mono text-[13px] font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function formatTurnTime(timestamp: number): string {
  if (!timestamp) return '未记录';
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatRawUsage(raw: unknown): string {
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return String(raw);
  }
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
        style={{ color: 'rgba(var(--tj-btn-primary-start), 0.7)' }}
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
            background: 'rgba(var(--tj-btn-primary-start), 0.04)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.25)',
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
            background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-btn-primary-end), 0.95))',
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

/** 故事快照可折叠卡片 */
function NarrativeImageCard({
  image,
  messageId,
  album,
  onRegenerateNarrativeImage,
}: {
  image: import('@/models/chat').叙事插图;
  messageId: string;
  album?: 相册系统;
  onRegenerateNarrativeImage?: (messageId: string) => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const imageSrc = 解析相册资源引用(album, image.dataUrl);

  const typeLabel = image.kind === 'snapshot' || image.type === 'scene' ? '故事快照' : '角色插图';
  const icon = image.kind === 'snapshot' || image.type === 'scene' ? '▧' : '👤';
  const canRegenerate = !!onRegenerateNarrativeImage;
  const handleRegenerate = () => {
    void onRegenerateNarrativeImage?.(messageId);
  };

  if (image.status === 'generating') {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 text-xs"
        style={{
          background: 'rgba(var(--tj-btn-primary-start), 0.06)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.2)',
          color: 'rgba(var(--tj-text-secondary), 0.8)',
        }}
      >
        <span className="animate-pulse-soft">⏳</span>
        <span className="flex-1">正在生成{typeLabel}...</span>
        {canRegenerate && (
          <button type="button" disabled className="px-2 py-1 text-[11px] opacity-45">
            重新生成
          </button>
        )}
      </div>
    );
  }

  if (image.status === 'failed') {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 text-xs"
        style={{
          background: 'rgba(var(--tj-danger),0.06)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger),0.2)',
          color: 'rgba(var(--tj-text-secondary), 0.8)',
        }}
      >
        <span>❌</span>
        <span className="min-w-0 flex-1 break-words">{typeLabel}生成失败{image.error ? `：${image.error}` : ''}</span>
        {canRegenerate && (
          <button
            type="button"
            onClick={handleRegenerate}
            className="shrink-0 px-2 py-1 font-serif text-[11px] tracking-[0.12em] transition-all hover:opacity-85"
            style={{
              color: 'rgba(var(--tj-btn-primary-start),0.95)',
              background: 'rgba(var(--tj-btn-primary-start),0.06)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.28)',
              clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
            }}
          >
            重新生成
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'rgba(var(--tj-btn-primary-start), 0.04)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.2)',
      }}
    >
      {/* 标题栏：点击折叠/展开 */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-all hover:opacity-80"
        style={{ color: 'rgba(var(--tj-text-primary), 0.85)' }}
      >
        <span>{icon}</span>
        <span className="flex-1 font-medium">{typeLabel}：{image.description || '剧情瞬间'}</span>
        {canRegenerate && (
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              handleRegenerate();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                handleRegenerate();
              }
            }}
            className="px-2 py-1 font-serif text-[11px] tracking-[0.12em] transition-all hover:opacity-85"
            style={{
              color: 'rgba(var(--tj-btn-primary-start),0.95)',
              background: 'rgba(var(--tj-btn-primary-start),0.06)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.24)',
              clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
            }}
          >
            重新生成
          </span>
        )}
        <span style={{ color: 'rgba(var(--tj-text-secondary), 0.5)' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* 展开内容：图片 */}
      {expanded && imageSrc && (
        <div className="px-3 pb-3">
          <img
            src={imageSrc}
            alt={image.description || typeLabel}
            className="max-w-full rounded"
            style={{
              maxHeight: '512px',
              objectFit: 'contain',
            }}
          />
        </div>
      )}
    </div>
  );
}

function NarrativeImageManualCard({
  messageId,
  onRegenerateNarrativeImage,
}: {
  messageId: string;
  onRegenerateNarrativeImage?: (messageId: string) => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const canGenerate = !!onRegenerateNarrativeImage;
  const handleGenerate = () => {
    void onRegenerateNarrativeImage?.(messageId);
  };

  return (
    <div
      style={{
        background: 'rgba(var(--tj-btn-primary-start), 0.04)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
        clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-all hover:opacity-80"
        style={{ color: 'rgba(var(--tj-text-primary), 0.85)' }}
      >
        <span>▧</span>
        <span className="flex-1 font-medium">故事快照：等待手动生成</span>
        <span style={{ color: 'rgba(var(--tj-text-secondary), 0.5)' }}>{expanded ? '收起' : '展开'}</span>
      </button>
      {expanded && (
        <div className="flex justify-center px-3 pb-3">
          <div className="mb-3 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.74)' }}>
            当前为手动故事快照模式。点击下方按钮后，会读取本回合正文并生成一张故事快照。
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full px-3 py-2 text-left transition-all hover:opacity-90 disabled:opacity-45"
            style={{
              color: 'rgb(var(--tj-on-accent))',
              background: 'linear-gradient(135deg, rgb(var(--tj-accent-primary)) 0%, rgba(var(--tj-accent-mid),0.96) 48%, rgb(var(--tj-accent-secondary)) 100%)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.42)',
              clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
            }}
          >
            <div className="font-serif text-xs tracking-[0.18em]">生成故事快照</div>
          </button>
        </div>
      )}
    </div>
  );
}
