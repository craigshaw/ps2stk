import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
export function Dialog({
  title,
  children,
  onClose,
  returnFocus,
  busy = false,
  className,
}: {
  title: string;
  children: ReactNode;
  onClose(): void;
  busy?: boolean;
  returnFocus?: HTMLElement | null;
  className?: string | undefined;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = returnFocus ?? document.activeElement as HTMLElement | null;
    ref.current!.showModal();
    return () => {
      ref.current?.close();
      if (previous?.isConnected && !previous.matches(":disabled"))
        previous.focus();
      else document.getElementById("open-card")?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={className}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        close.current();
      }}
    >
      <div className="dialog-heading">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          disabled={busy}
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
