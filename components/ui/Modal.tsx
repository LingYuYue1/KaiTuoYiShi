import type { ReactNode } from 'react';
import { useEffect } from 'react';

interface ModalProps {
  children: ReactNode;
  onClose: () => void;
  title?: string;
  className?: string;
}

export function Modal({ children, onClose, title, className = 'max-w-2xl' }: ModalProps) {
  useEffect(() => {
    document.body.classList.add('modal-open');
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.classList.remove('modal-open');
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  return (
    <div
      className="kaituo-modal-overlay fixed inset-0 z-50 flex items-stretch justify-center p-0 md:items-center md:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`kaituo-modal-shell flex h-[100dvh] w-full min-w-0 animate-slide-up flex-col overflow-hidden md:h-auto md:max-h-[85vh] ${className}`}>
        {title && (
          <>
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 md:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="text-base" style={{ color: 'rgba(var(--tj-accent-primary), 0.7)' }}>◆</span>
                <h2
                  className="min-w-0 truncate font-serif text-lg font-bold tracking-[0.2em]"
                  style={{
                    background: 'linear-gradient(180deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 60%, rgb(var(--tj-accent-secondary)) 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {title}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="kaituo-close-btn text-lg leading-none"
                aria-label="关闭"
              >
                ✕
              </button>
            </div>
            <div className="kaituo-divider mx-5" />
          </>
        )}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-5">{children}</div>
      </div>
    </div>
  );
}
