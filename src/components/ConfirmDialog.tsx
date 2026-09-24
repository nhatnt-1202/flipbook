"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && !busy && onClose()}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-0 text-stone-900 shadow-2xl backdrop:bg-stone-950/50 backdrop:backdrop-blur-sm open:[animation:toast-in_.15s_ease-out] dark:bg-stone-900 dark:text-stone-100 dark:ring-1 dark:ring-white/10"
    >
      <div className="flex gap-4 p-6">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <AlertTriangle className="size-5" />
        </div>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <div className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">{description}</div>
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-stone-100 bg-stone-50 px-6 py-4 dark:border-white/5 dark:bg-white/[0.02]">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-200/60 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-white/5"
        >
          Hủy
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-70"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
