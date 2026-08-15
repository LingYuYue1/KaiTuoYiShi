import { useState } from 'react';
import type { 叙事插图 } from '@/models/chat';
import type { 相册系统 } from '@/models/imageGeneration';
import { 解析相册资源引用 } from '@/utils/albumActions';
import { mediumClip, smallClip, tinyClip } from './turnStyles';

/** 故事快照可折叠卡片 */
export function NarrativeImageCard({
  image,
  messageId,
  album,
  onRegenerateNarrativeImage,
}: {
  image: 叙事插图;
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
              clipPath: tinyClip,
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
              clipPath: tinyClip,
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

export function NarrativeImageManualCard({
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
        clipPath: mediumClip,
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
              clipPath: smallClip,
            }}
          >
            <div className="font-serif text-xs tracking-[0.18em]">生成故事快照</div>
          </button>
        </div>
      )}
    </div>
  );
}
