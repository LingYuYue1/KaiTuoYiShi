import type { 新闻条目 } from '@/models/news';
import { smallClip } from './phoneStyles';

export function NewsApp({ news }: { news: 新闻条目[] }) {
  const latest = [...news].slice(-8).reverse();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {latest.length === 0 ? (
          <InfoSurface
            title="星际和平周报"
            text="这里会同步右侧新闻系统中的周报条目。当前还没有已生成新闻。"
          />
        ) : (
          <div className="space-y-3">
            {latest.map((item) => (
              <article
                key={item.id}
                className="px-4 py-3"
                style={{
                  background: item.重要 ? 'rgba(var(--tj-accent-primary), 0.08)' : 'rgba(var(--tj-accent-primary), 0.04)',
                  boxShadow: item.重要
                    ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.26)'
                    : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                  clipPath: smallClip,
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <h4 className="truncate font-serif text-sm font-bold tracking-[0.16em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                    {item.标题}
                  </h4>
                  <span className="flex-shrink-0 text-[10px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary),0.78)' }}>
                    {item.状态}
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
                  {item.正文 || '暂无正文。'}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoSurface({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="font-serif text-lg font-bold tracking-[0.24em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
        {title}
      </div>
      <div className="mt-3 max-w-md text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
        {text}
      </div>
    </div>
  );
}
