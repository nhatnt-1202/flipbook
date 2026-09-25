"use client";

import { Loader2, Mail, X } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { LeadForm } from "@/lib/settings";

const DONE_KEY = (bookId: string) => `flipbook:lead:${bookId}`;

// Người xem đã gửi form của cuốn này chưa (lưu trên trình duyệt, không hỏi lại)
export function leadDone(bookId: string) {
  try {
    return localStorage.getItem(DONE_KEY(bookId)) === "1";
  } catch {
    return false;
  }
}

/**
 * Form thu lead chắn trước sách. Gửi qua RPC submit_lead (server kiểm tra sách có bật form).
 *   preview: đang xem thử trong editor — không ghi DB, không nhớ đã gửi
 */
export default function LeadGate({
  bookId,
  form,
  page,
  preview,
  onDone,
  onSkip,
}: {
  bookId: string;
  form: LeadForm;
  page: number;
  preview: boolean;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("Email chưa đúng định dạng");
      return;
    }
    setBusy(true);
    if (!preview) {
      const { error } = await supabase.rpc("submit_lead", {
        p_book_id: bookId,
        p_email: email.trim(),
        p_name: name,
        p_phone: phone,
        p_page: page,
      });
      if (error) {
        setBusy(false);
        setError("Gửi không thành công, vui lòng thử lại");
        return;
      }
      try {
        localStorage.setItem(DONE_KEY(bookId), "1");
      } catch {}
    }
    setBusy(false);
    onDone();
  }

  const input =
    "w-full rounded-xl border-0 bg-zinc-100 px-3.5 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 placeholder:text-zinc-400 focus:ring-2 focus:ring-[var(--accent)] focus:outline-none";

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md [animation:fade-in_.2s]" role="dialog" aria-modal>
      <form onSubmit={submit} className="relative w-full max-w-sm rounded-2xl bg-white p-6 text-zinc-900 shadow-2xl">
        {form.allowSkip && (
          <button type="button" onClick={onSkip} aria-label="Bỏ qua" className="absolute top-3 right-3 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <X className="size-4" />
          </button>
        )}
        <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_20%,white)] text-zinc-800">
          <Mail className="size-5" />
        </div>
        <h2 className="text-lg font-semibold">{form.title}</h2>
        {form.message && <p className="mt-1 text-sm leading-relaxed text-zinc-500">{form.message}</p>}
        <div className="mt-5 flex flex-col gap-2.5">
          {form.name && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Họ tên" autoComplete="name" className={input} />}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            className={input}
          />
          {form.phone && (
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Số điện thoại" autoComplete="tel" className={input} />
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-60"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          Tiếp tục xem
        </button>
        {form.allowSkip && (
          <button type="button" onClick={onSkip} className="mt-2 w-full text-center text-xs text-zinc-400 hover:text-zinc-600">
            Bỏ qua
          </button>
        )}
        {preview && <p className="mt-3 text-center text-xs text-amber-600">Xem thử: dữ liệu không được lưu</p>}
      </form>
    </div>
  );
}
