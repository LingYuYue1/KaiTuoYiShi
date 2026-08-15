import type { 角色数据结构 } from '@/models/character';
import type { 相册系统 } from '@/models/imageGeneration';
import { 解析相册资源引用 } from '@/utils/albumActions';
import { cardClip, tinyClip } from './turnStyles';

export function UserTurnBubble({ content, traveler, album, fontSize = 14 }: { content: string; traveler?: 角色数据结构; album?: 相册系统; fontSize?: number }) {
  const name = traveler?.姓名.trim() || traveler?.别名.trim() || '旅人';
  const avatarUrl = 解析相册资源引用(album, traveler?.图像档案?.正文头像?.trim() || traveler?.头像.trim());
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
              clipPath: cardClip,
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
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.52), 0 0 10px rgba(var(--tj-btn-primary-start), 0.12)',
          clipPath: tinyClip,
        }}
      >
        <span className="block truncate font-serif text-[11px] font-semibold tracking-[0.1em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.98)' }}>
          {name}
        </span>
      </div>
    </div>
  );
}
