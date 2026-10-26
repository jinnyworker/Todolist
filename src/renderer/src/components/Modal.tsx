import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** 화면 캡처 중에는 모달을 숨긴다 (공유 이미지에 모달이 찍히지 않게). */
  hidden?: boolean;
}

export function Modal({ title, onClose, children, footer, width = 520, hidden = false }: ModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={`modal-backdrop${hidden ? ' modal-backdrop--hidden' : ''}`}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="modal" role="dialog" aria-modal="true" style={{ width }}>
        <header className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <button type="button" className="icon-button" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>
  );
}
