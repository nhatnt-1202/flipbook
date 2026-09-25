"use client";

import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";

// Ô nhập dùng chung cho các bảng bên phải editor (thuộc tính phần tử, thiết kế, quản lý trang)

export const inputClass =
  "w-full rounded-lg border-0 bg-white/5 px-3 py-2 text-sm text-zinc-100 ring-1 ring-white/10 placeholder:text-zinc-500 focus:ring-2 focus:ring-brand-500 focus:outline-none";

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4">
      <h2 className="mb-4 text-sm font-semibold text-zinc-100">{title}</h2>
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative flex cursor-pointer items-start justify-between gap-3">
      <span>
        <span className="block text-sm text-zinc-200">{label}</span>
        {hint && <span className="block text-xs text-zinc-500">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-white/15 transition peer-checked:bg-brand-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
    </label>
  );
}

export function ColorField({
  label,
  value,
  onChange,
  typing,
}: {
  label: string;
  value: string;
  onChange: (v: string, record: boolean) => void;
  typing: { onFocus: () => void; onBlur: () => void };
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value, false)}
          {...typing}
          className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
        />
        <input value={value} onChange={(e) => onChange(e.target.value, false)} {...typing} className={`${inputClass} font-mono`} />
      </div>
    </Field>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: React.ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-1 rounded-lg bg-white/5 p-0.5 ring-1 ring-white/10">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex flex-1 items-center justify-center rounded-md px-2 py-1.5 text-xs font-medium transition ${
            value === o.value ? "bg-brand-500 text-white shadow" : "text-zinc-400 hover:text-zinc-100"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function UploadButton({ accept, label, onFile }: { accept: string; label: string; onFile: (f: File) => Promise<void> }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => ref.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 px-3 py-2.5 text-sm text-zinc-300 transition hover:border-brand-400 hover:text-white disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {busy ? "Đang tải lên…" : label}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          await onFile(f);
          setBusy(false);
        }}
      />
    </>
  );
}

// Thanh trượt: gộp cả lần kéo thành một bước undo (beginEdit khi nhấn, endEdit khi thả)
export function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  typing,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number, record: boolean) => void;
  typing: { onFocus: () => void; onBlur: () => void };
}) {
  return (
    <Field label={label}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={typing.onFocus}
        onPointerUp={typing.onBlur}
        onKeyDown={typing.onFocus}
        onKeyUp={typing.onBlur}
        onChange={(e) => onChange(Number(e.target.value), false)}
        className="w-full accent-brand-500"
      />
    </Field>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-white/10 pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{title}</h3>
      {children}
    </section>
  );
}
