"use client";

import { useEffect, useRef } from "react";

export function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className="modal-shell" aria-label={title} onCancel={onClose} onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="modal-content">
        <div className="drawer-header"><h2>{title}</h2><button className="ghost-action" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </dialog>
  );
}
