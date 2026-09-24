"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useState } from "react";

type Toast = { id: number; message: string; tone: "success" | "error" };
type Notify = (message: string, tone?: Toast["tone"]) => void;

const ToastContext = createContext<Notify>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback<Notify>((message, tone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-2.5 rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white shadow-xl shadow-black/20 ring-1 ring-white/10 [animation:toast-in_.2s_ease-out] dark:bg-stone-800"
          >
            {t.tone === "success" ? (
              <CheckCircle2 className="size-4 text-emerald-400" />
            ) : (
              <XCircle className="size-4 text-red-400" />
            )}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
