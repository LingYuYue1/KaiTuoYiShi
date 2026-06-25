import { RELEASE_ANNOUNCEMENTS } from '@/data/releaseAnnouncements';
import { Modal } from '@/components/ui/Modal';

interface Props {
  onClose: () => void;
}

export function ReleaseAnnouncementsModal({ onClose }: Props) {
  return (
    <Modal onClose={onClose} title="更新公告" className="max-w-3xl">
      <div className="space-y-4">
        {RELEASE_ANNOUNCEMENTS.map((item) => (
          <article
            key={item.version}
            className="rounded-sm p-4"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.34)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.72)',
            }}
          >
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className="font-serif text-base font-bold tracking-[0.18em]"
                style={{ color: 'rgb(var(--tj-accent-primary))' }}
              >
                {item.version}
              </span>
              <h3
                className="font-serif text-base font-semibold tracking-[0.08em]"
                style={{ color: 'rgb(var(--tj-text-primary))' }}
              >
                {item.title}
              </h3>
              <time
                className="text-xs"
                style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}
              >
                {item.date}
              </time>
            </div>

            <p
              className="mb-3 text-sm leading-6"
              style={{ color: 'rgba(var(--tj-text-primary), 0.86)' }}
            >
              {item.summary}
            </p>

            <ul className="space-y-2">
              {item.highlights.map((highlight) => (
                <li key={highlight} className="flex gap-2 text-sm leading-6">
                  <span style={{ color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.84), rgba(var(--tj-accent-secondary),0.78))' }}>◆</span>
                  <span style={{ color: 'rgba(var(--tj-text-primary), 0.82)' }}>{highlight}</span>
                </li>
              ))}
            </ul>

            {item.notes?.length ? (
              <div
                className="mt-3 space-y-1 border-l-2 pl-3 text-xs leading-5"
                style={{
                  borderColor: 'rgba(var(--tj-accent-primary), 0.42)',
                  color: 'rgba(var(--tj-text-secondary), 0.78)',
                }}
              >
                {item.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </Modal>
  );
}
