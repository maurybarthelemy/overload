import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export function Sheet({ open, onClose, title, children, action }: { open: boolean; onClose: () => void; title: string; children: ReactNode; action?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={title}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <button className="icon-btn" onClick={onClose} aria-label="Fermer"><Icon name="close" size={18} /></button>
          <h2>{title}</h2>
          <div style={{ minWidth: 40, display: 'flex', justifyContent: 'flex-end' }}>{action}</div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>,
    document.body,
  );
}
