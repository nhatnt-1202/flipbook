"use client";

import { Link2, Loader2, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SLUG_MAX, SLUG_PATTERN, slugify, supabase, type Book } from "@/lib/supabase";

// Đặt slug tùy chỉnh cho link share. Để trống = dùng lại id ngẫu nhiên.
export default function SlugDialog({
  book,
  onSaved,
  onClose,
}: {
  book: Book | null;
  onSaved: (book: Book) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openedFor, setOpenedFor] = useState<Book | null>(null);

  // Mở dialog cho sách khác → nạp lại giá trị hiện tại (điều chỉnh state trong lúc render, không cần effect)
  if (book !== openedFor) {
    setOpenedFor(book);
    setValue(book?.slug ?? "");
    setError(null);
  }

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (book && !d.open) d.showModal();
    if (!book && d.open) d.close();
  }, [book]);

  const slug = value.trim();
  const invalid = slug !== "" && !SLUG_PATTERN.test(slug);
  const origin = typeof window !== "undefined" ? window.location.host : "";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!book || invalid) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from("books")
      .update({ slug: slug || null })
      .eq("id", book.id)
      .select()
      .single();
    setBusy(false);
    if (error) {
      setError(error.code === "23505" ? "Link này đã được dùng cho sách khác." : error.message);
      return;
    }
    onSaved(data as Book);
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && !busy && onClose()}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-white p-0 text-stone-900 shadow-2xl backdrop:bg-stone-950/50 backdrop:backdrop-blur-sm open:[animation:toast-in_.15s_ease-out] dark:bg-stone-900 dark:text-stone-100 dark:ring-1 dark:ring-white/10"
    >
      <form onSubmit={save}>
        <div className="flex gap-4 p-6">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
            <Link2 className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Đổi link chia sẻ</h2>
            <p className="mt-1 truncate text-sm text-stone-500" title={book?.title}>
              {book?.title}
            </p>

            <div
              className={`mt-4 flex items-center rounded-lg bg-white text-sm shadow-sm ring-1 focus-within:ring-2 dark:bg-stone-950 ${
                invalid ? "ring-red-400 focus-within:ring-red-500" : "ring-stone-200 focus-within:ring-brand-500 dark:ring-white/10"
              }`}
            >
              <span className="shrink-0 pl-3 text-stone-400">{origin}/view/</span>
              <input
                autoFocus
                value={value}
                maxLength={SLUG_MAX}
                placeholder={book?.id}
                onChange={(e) => setValue(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                className="min-w-0 flex-1 bg-transparent py-2.5 pr-2 font-mono focus:outline-none"
              />
              <button
                type="button"
                title="Tạo từ tên sách"
                aria-label="Tạo từ tên sách"
                onClick={() => book && setValue(slugify(book.title))}
                className="mr-1 rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-white/5 dark:hover:text-stone-200"
              >
                <Wand2 className="size-4" />
              </button>
            </div>

            <p className={`mt-2 text-xs ${invalid || error ? "text-red-600 dark:text-red-400" : "text-stone-500"}`}>
              {error ??
                (invalid
                  ? "Chỉ dùng chữ thường không dấu, số và dấu gạch ngang (không ở đầu/cuối)."
                  : "Để trống để dùng id ngẫu nhiên. Link theo id cũ vẫn luôn mở được; link theo slug cũ sẽ ngừng hoạt động khi đổi.")}
            </p>
            <p className="mt-1 text-xs text-stone-400">Slug dễ đọc thì cũng dễ đoán — đừng dùng cho tài liệu cần giữ kín.</p>
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
            type="submit"
            disabled={busy || invalid || slug === (book?.slug ?? "")}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Lưu
          </button>
        </div>
      </form>
    </dialog>
  );
}
