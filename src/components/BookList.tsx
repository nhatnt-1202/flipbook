"use client";

import { BookOpen, ExternalLink, Link2, PencilLine, PencilRuler, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { bookPath, pageUrl, removeBookFiles, supabase, type Book } from "@/lib/supabase";
import { shareUrl } from "@/components/Uploader";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import SlugDialog from "@/components/SlugDialog";

const GRID = "grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5";

export default function BookList({
  books,
  onDeleted,
  onUpdated,
}: {
  books: Book[];
  onDeleted: (id: string) => void;
  onUpdated: (book: Book) => void;
}) {
  const notify = useToast();
  const [target, setTarget] = useState<Book | null>(null);
  const [editing, setEditing] = useState<Book | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function copy(book: Book) {
    await navigator.clipboard.writeText(shareUrl(book));
    notify("Đã copy link chia sẻ");
  }

  async function confirmDelete() {
    if (!target) return;
    setDeleting(true);
    const { error } = await supabase.from("books").delete().eq("id", target.id);
    if (error) {
      notify(`Xóa thất bại: ${error.message}`, "error");
    } else {
      await removeBookFiles(target.id);
      onDeleted(target.id);
      notify("Đã xóa sách");
    }
    setDeleting(false);
    setTarget(null);
  }

  return (
    <>
      <ul className={GRID}>
        {books.map((b) => (
          <li key={b.id} className="group flex flex-col">
            <Link href={bookPath(b)} className="relative block" aria-label={`Mở ${b.title}`}>
              <div
                className="relative overflow-hidden rounded-r-md rounded-l-sm bg-stone-200 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_8px_20px_-6px_rgb(0_0_0/0.18)] ring-1 ring-black/5 transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_2px_4px_rgb(0_0_0/0.06),0_18px_36px_-10px_rgb(0_0_0/0.3)] dark:bg-stone-800 dark:ring-white/10"
                style={{ aspectRatio: `${b.page_width} / ${b.page_height}` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pageUrl(b, 1)} alt="" loading="lazy" className="h-full w-full object-cover" />
                {/* Gáy sách */}
                <div className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/25 via-white/10 to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center bg-stone-950/0 opacity-0 transition group-hover:bg-stone-950/35 group-hover:opacity-100">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-stone-900 shadow-lg">
                    <BookOpen className="size-4" /> Đọc sách
                  </span>
                </div>
              </div>
            </Link>

            <div className="mt-3 flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <Link
                  href={bookPath(b)}
                  className="line-clamp-2 text-sm leading-snug font-medium hover:text-brand-600 dark:hover:text-brand-400"
                  title={b.title}
                >
                  {b.title}
                </Link>
                <p className="mt-1 text-xs text-stone-500">
                  {b.page_count} trang · {new Date(b.created_at).toLocaleDateString("vi-VN")}
                </p>
              </div>
            </div>

            <div className="mt-2 flex gap-0.5 transition sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
              <Link
                href={`/edit/${b.id}`}
                title="Chỉnh sửa"
                aria-label="Chỉnh sửa"
                className="rounded-lg p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-white/5 dark:hover:text-white"
              >
                <PencilRuler className="size-4" />
              </Link>
              <IconButton label="Copy link chia sẻ" onClick={() => copy(b)}>
                <Link2 className="size-4" />
              </IconButton>
              <IconButton label="Đổi link chia sẻ" onClick={() => setEditing(b)}>
                <PencilLine className="size-4" />
              </IconButton>
              <IconButton label="Mở trong tab mới" onClick={() => window.open(bookPath(b), "_blank")}>
                <ExternalLink className="size-4" />
              </IconButton>
              <IconButton label="Xóa" danger onClick={() => setTarget(b)}>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>

      <SlugDialog
        book={editing}
        onClose={() => setEditing(null)}
        onSaved={(book) => {
          onUpdated(book);
          setEditing(null);
          notify(`Link mới: ${bookPath(book)}`);
        }}
      />

      <ConfirmDialog
        open={target !== null}
        title="Xóa sách này?"
        description={
          <>
            <span className="font-medium text-stone-700 dark:text-stone-200">“{target?.title}”</span> sẽ bị xóa vĩnh viễn và
            link chia sẻ sẽ không còn hoạt động.
          </>
        }
        confirmLabel="Xóa sách"
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setTarget(null)}
      />
    </>
  );
}

function IconButton({
  label,
  danger,
  children,
  onClick,
}: {
  label: string;
  danger?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`rounded-lg p-2 text-stone-500 transition hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-white/5 ${
        danger ? "hover:text-red-600 dark:hover:text-red-400" : "hover:text-stone-900 dark:hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

export function BookListSkeleton() {
  return (
    <ul className={GRID} aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className="animate-pulse">
          <div className="aspect-[3/4] rounded-md bg-stone-200 dark:bg-stone-800" />
          <div className="mt-3 h-3.5 w-4/5 rounded bg-stone-200 dark:bg-stone-800" />
          <div className="mt-2 h-3 w-1/2 rounded bg-stone-200 dark:bg-stone-800" />
        </li>
      ))}
    </ul>
  );
}
