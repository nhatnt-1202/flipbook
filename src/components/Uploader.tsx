"use client";

import { Check, Copy, ExternalLink, FileText, Loader2, RotateCcw, UploadCloud, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { nanoid } from "nanoid";
import { BUCKET, bookPath, pageUrl, supabase, type Book } from "@/lib/supabase";
import { renderPdf } from "@/lib/pdf";
import { useToast } from "@/components/Toast";

// Gói free của Supabase giới hạn 50 MB/file; PDF lớn hơn vẫn tạo flipbook, chỉ không lưu bản gốc để tải về.
const MAX_PDF_BYTES = 50 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 4;

type Status =
  | { phase: "idle" }
  | { phase: "working"; file: File; label: string; pct: number }
  | { phase: "done"; book: Book }
  | { phase: "error"; file: File | null; message: string };

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function shareUrl(book: Pick<Book, "id" | "slug">) {
  return `${window.location.origin}${bookPath(book)}`;
}

export default function Uploader({ onDone }: { onDone: (book: Book) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const notify = useToast();
  const busy = status.phase === "working";

  async function upload(path: string, body: Blob, contentType: string) {
    const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType, upsert: true });
    if (error) throw new Error(`Upload ${path} thất bại: ${error.message}`);
  }

  async function handleFile(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setStatus({ phase: "error", file: null, message: "File này không phải PDF. Vui lòng chọn file có đuôi .pdf" });
      return;
    }

    const id = nanoid(10);
    const title = file.name.replace(/\.pdf$/i, "");
    const uploaded: string[] = [];
    const pending = new Set<Promise<void>>();
    let size = { width: 0, height: 0 };

    const track = (path: string, body: Blob, type: string) => {
      const p = upload(path, body, type).then(() => {
        uploaded.push(path);
      });
      pending.add(p);
      p.finally(() => pending.delete(p)).catch(() => {});
    };

    try {
      setStatus({ phase: "working", file, label: "Đang đọc PDF…", pct: 2 });

      const hasPdf = file.size <= MAX_PDF_BYTES;
      if (hasPdf) track(`${id}/source.pdf`, file, "application/pdf");

      const { total, ext } = await renderPdf(file, async (page, total) => {
        if (page.n === 1) size = { width: page.width, height: page.height };
        track(`${id}/${page.n}.${page.blob.type === "image/webp" ? "webp" : "jpg"}`, page.blob, page.blob.type);
        setStatus({ phase: "working", file, label: `Đang xử lý trang ${page.n} / ${total}`, pct: 2 + (page.n / total) * 93 });
        // Giới hạn số upload chạy song song để không giữ quá nhiều ảnh trong RAM
        while (pending.size >= UPLOAD_CONCURRENCY) await Promise.race(pending);
      });

      setStatus({ phase: "working", file, label: "Đang hoàn tất…", pct: 97 });
      await Promise.all(pending);

      const book: Omit<Book, "created_at" | "slug"> = {
        id,
        title,
        page_count: total,
        page_width: size.width,
        page_height: size.height,
        image_ext: ext,
        has_pdf: hasPdf,
      };
      const { data, error } = await supabase.from("books").insert(book).select().single();
      if (error) throw new Error(`Lưu thông tin sách thất bại: ${error.message}`);

      setStatus({ phase: "done", book: data as Book });
      onDone(data as Book);
    } catch (e) {
      await Promise.allSettled(pending);
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
      setStatus({ phase: "error", file, message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf,.pdf"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
      }}
    />
  );

  const card = "rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/80 dark:bg-stone-900 dark:ring-white/10";

  if (status.phase === "working") {
    return (
      <div className={`${card} p-6 sm:p-8`}>
        <div className="flex items-center gap-4">
          <FileIcon />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{status.file.name}</p>
            <p className="text-sm text-stone-500">{formatBytes(status.file.size)}</p>
          </div>
          <Loader2 className="size-5 shrink-0 animate-spin text-brand-600 dark:text-brand-400" />
        </div>
        <div className="mt-6">
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-stone-600 dark:text-stone-300">{status.label}</span>
            <span className="font-medium tabular-nums">{Math.round(status.pct)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500 transition-[width] duration-300"
              style={{ width: `${status.pct}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-stone-400">Vui lòng giữ nguyên tab này cho đến khi xử lý xong.</p>
        </div>
      </div>
    );
  }

  if (status.phase === "done") {
    const b = status.book;
    const url = shareUrl(b);
    return (
      <div className={`${card} relative p-6 sm:p-8`}>
        <button
          onClick={() => setStatus({ phase: "idle" })}
          className="absolute top-4 right-4 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-white/5"
          aria-label="Đóng"
        >
          <X className="size-4" />
        </button>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pageUrl(b, 1)}
            alt=""
            className="w-24 shrink-0 rounded-md shadow-md ring-1 ring-black/5"
            style={{ aspectRatio: `${b.page_width} / ${b.page_height}` }}
          />
          <div className="min-w-0 flex-1">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
              <Check className="size-3.5" /> Đã tạo xong
            </p>
            <h3 className="mt-2 truncate text-lg font-semibold">{b.title}</h3>
            <p className="text-sm text-stone-500">{b.page_count} trang</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <div className="flex min-w-0 flex-1 items-center rounded-lg bg-stone-100 px-3 py-2 font-mono text-sm text-stone-600 dark:bg-white/5 dark:text-stone-300">
                <span className="truncate">{url}</span>
              </div>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(url);
                  notify("Đã copy link chia sẻ");
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"
              >
                <Copy className="size-4" /> Copy link
              </button>
              <Link
                href={bookPath(b)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                <ExternalLink className="size-4" /> Xem sách
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file && !busy) handleFile(file);
        }}
        className={`group relative w-full overflow-hidden rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-all sm:py-16 ${
          dragging
            ? "scale-[1.01] border-brand-500 bg-brand-50 dark:bg-brand-500/10"
            : "border-stone-300 bg-white hover:border-brand-400 hover:bg-brand-50/40 dark:border-stone-700 dark:bg-stone-900 dark:hover:border-brand-500/60 dark:hover:bg-brand-500/5"
        }`}
      >
        <div
          className={`mx-auto flex size-14 items-center justify-center rounded-2xl transition-colors ${
            dragging
              ? "bg-brand-600 text-white"
              : "bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white dark:bg-brand-500/10 dark:text-brand-400"
          }`}
        >
          <UploadCloud className="size-7" />
        </div>
        <p className="mt-5 text-lg font-semibold">{dragging ? "Thả file vào đây" : "Kéo thả file PDF vào đây"}</p>
        <p className="mt-1 text-sm text-stone-500">
          hoặc <span className="font-medium text-brand-600 underline-offset-2 group-hover:underline dark:text-brand-400">chọn file từ máy</span>
        </p>
        <p className="mt-4 text-xs text-stone-400">Chỉ hỗ trợ PDF · Xử lý ngay trên trình duyệt</p>
      </button>
      {input}

      {status.phase === "error" && (
        <div className="mt-4 flex items-start gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20">
          <X className="mt-0.5 size-4 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Không tạo được flipbook</p>
            <p className="mt-0.5 opacity-80">{status.message}</p>
          </div>
          {status.file && (
            <button
              onClick={() => handleFile(status.file!)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium hover:bg-red-100 dark:hover:bg-red-500/20"
            >
              <RotateCcw className="size-3.5" /> Thử lại
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FileIcon() {
  return (
    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
      <FileText className="size-6" />
    </div>
  );
}
