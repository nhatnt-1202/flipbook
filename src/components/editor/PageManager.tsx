"use client";

import { Check, ChevronLeft, ChevronRight, FilePlus2, FileStack, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { BUCKET, supabase } from "@/lib/supabase";
import { importPages, isImage, isPdf, type ImportedPages } from "@/lib/importPages";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { deletePages, insertPages, movePage, replaceAll, replacePage, type Doc } from "./doc";

const ACCEPT_ALL = "application/pdf,.pdf,image/*";

type Busy = { label: string; pct: number } | null;
type Picking = { kind: "insert" } | { kind: "replace"; index: number } | { kind: "replaceAll" };

/**
 * Quản lý trang (A7, A4): kéo thả sắp xếp, thêm trang từ PDF / ảnh, xóa, thay từng trang, thay cả PDF.
 * Mọi thay đổi đi qua onChange (có undo). Ảnh trang mới được upload ngay; ảnh cũ không xóa để còn undo được.
 *   onTexts: chữ của các trang mới (ghi vào text.json) · onPdf: PDF nguồn mới sau khi thay cả PDF
 */
export default function PageManager({
  bookId,
  doc,
  pageUrl,
  onChange,
  onTexts,
  onPdf,
  onClose,
}: {
  bookId: string;
  doc: Doc;
  pageUrl: (file: string) => string;
  onChange: (fn: (d: Doc) => Doc) => void;
  onTexts: (texts: Record<string, string>) => Promise<void>;
  onPdf: (pdf: File) => Promise<void>;
  onClose: () => void;
}) {
  const notify = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null); // chèn trước vị trí này
  const total = doc.pages.length;
  // Bản mới nhất, dùng sau các bước await (import có thể mất cả phút)
  const docRef = useRef(doc);
  useLayoutEffect(() => {
    docRef.current = doc;
  });
  const counts = new Map<number, number>();
  for (const el of doc.elements) counts.set(el.page, (counts.get(el.page) ?? 0) + 1);

  function pick(p: Picking) {
    setPicking(p);
    const input = inputRef.current!;
    input.accept = p.kind === "replaceAll" ? "application/pdf,.pdf" : ACCEPT_ALL;
    input.multiple = p.kind === "insert";
    input.click();
  }

  async function run(files: File[], action: (r: ImportedPages) => Promise<void> | void) {
    const doc = files.find(isPdf);
    const images = files.filter(isImage).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const input = doc ? [doc] : images;
    if (!input.length) {
      notify("Chỉ hỗ trợ PDF hoặc ảnh", "error");
      return;
    }
    setBusy({ label: "Đang chuẩn bị…", pct: 1 });
    try {
      const result = await importPages(bookId, input, (label, pct) => setBusy({ label, pct }));
      if (Object.keys(result.texts).length) await onTexts(result.texts);
      await action(result);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function onFiles(files: File[]) {
    const p = picking;
    setPicking(null);
    if (!p || !files.length) return;

    if (p.kind === "insert") {
      // Chèn sau trang đang chọn cuối cùng, không chọn thì thêm vào cuối
      const at = selected.length ? Math.max(...selected) + 1 : total;
      await run(files, (r) => {
        onChange((d) => insertPages(d, at, r.files, r.links));
        setSelected(r.files.map((_, i) => at + i));
        notify(`Đã thêm ${r.files.length} trang`);
      });
    } else if (p.kind === "replace") {
      await run(files, async (r) => {
        const [file, ...extra] = r.files;
        // PDF nhiều trang: chỉ lấy trang đầu
        if (extra.length) await supabase.storage.from(BUCKET).remove(extra.map((f) => `${bookId}/${f}`));
        const page = p.index + 1;
        const links = r.links.filter((l) => l.page === 1).map((l) => ({ ...l, page }));
        onChange((d) => {
          const next = replacePage(d, p.index, file);
          // Link tự nhận của trang cũ không còn đúng chỗ: thay bằng link của trang mới
          const elements = next.elements.filter((el) => !(el.page === page && el.type === "link" && el.source === "pdf"));
          return { ...next, elements: [...elements, ...links] };
        });
        notify(`Đã thay trang ${page}`);
      });
    } else {
      await run(files, async (r) => {
        const { doc: next, dropped } = replaceAll(docRef.current, r.files, r.size, r.links);
        onChange(() => next);
        if (r.pdf) await onPdf(r.pdf);
        setSelected([]);
        notify(
          dropped
            ? `Đã thay PDF (${r.files.length} trang). ${dropped} phần tử ở các trang không còn đã bị bỏ, bấm Hoàn tác nếu cần.`
            : `Đã thay PDF (${r.files.length} trang), giữ nguyên các phần tử`,
        );
      });
    }
  }

  function toggle(i: number, e: React.MouseEvent) {
    if (e.shiftKey && selected.length) {
      const from = selected[selected.length - 1];
      const range = Array.from({ length: Math.abs(i - from) + 1 }, (_, k) => Math.min(i, from) + k);
      setSelected([...new Set([...selected, ...range])]);
    } else {
      setSelected(selected.includes(i) ? selected.filter((x) => x !== i) : [...selected, i]);
    }
  }

  function remove(indices: number[]) {
    if (indices.length >= total) {
      notify("Sách phải còn ít nhất 1 trang", "error");
      return;
    }
    onChange((d) => deletePages(d, indices));
    setSelected([]);
    notify(`Đã xóa ${indices.length} trang (Ctrl+Z để hoàn tác)`);
  }

  function move(from: number, to: number) {
    onChange((d) => movePage(d, from, to));
    setSelected([to]);
  }

  function drop() {
    if (dragFrom !== null && dropAt !== null) {
      const to = dragFrom < dropAt ? dropAt - 1 : dropAt;
      if (to !== dragFrom) {
        onChange((d) => movePage(d, dragFrom, to));
        setSelected([to]);
      }
    }
    setDragFrom(null);
    setDropAt(null);
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-zinc-950/95 text-zinc-100 backdrop-blur [animation:fade-in_.15s]" role="dialog" aria-modal aria-label="Quản lý trang">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-zinc-900 px-3 py-2 sm:h-14 sm:flex-nowrap sm:py-0">
        <FileStack className="size-5 text-zinc-400" />
        <h2 className="text-sm font-semibold">Quản lý trang</h2>
        <span className="text-sm text-zinc-500">
          {total} trang{selected.length ? ` · đã chọn ${selected.length}` : ""}
        </span>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {selected.length > 0 && (
            <button type="button" onClick={() => remove(selected)} className={`${btn} text-red-300 hover:bg-red-500/15`}>
              <Trash2 className="size-4" /> Xóa<span className="max-sm:hidden"> {selected.length} trang</span>
            </button>
          )}
          <button type="button" disabled={!!busy} onClick={() => pick({ kind: "insert" })} className={`${btn} text-zinc-200 hover:bg-white/10`}>
            <FilePlus2 className="size-4" />
            <span className="max-sm:hidden">{selected.length ? `Thêm sau trang ${Math.max(...selected) + 1}` : "Thêm trang"}</span>
            <span className="sm:hidden">Thêm</span>
          </button>
          <button type="button" disabled={!!busy} onClick={() => setConfirmAll(true)} className={`${btn} text-zinc-200 hover:bg-white/10`}>
            <RefreshCw className="size-4" /> <span className="max-sm:hidden">Thay </span>PDF
          </button>
          <button type="button" onClick={onClose} className="ml-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500">
            Xong
          </button>
        </div>
      </header>

      <p className="px-4 pt-3 text-xs text-zinc-500">
        Kéo thả (hoặc nút ‹ ›) để đổi thứ tự · bấm để chọn (Shift: chọn liên tiếp) · phần tử trên trang và link “tới trang” đi theo trang.
      </p>

      <div className="flex-1 overflow-y-auto p-4" onDragOver={(e) => e.preventDefault()} onDrop={drop}>
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-x-4 gap-y-5">
          {doc.pages.map((file, i) => {
            const isSel = selected.includes(i);
            const count = counts.get(i + 1) ?? 0;
            return (
              <li
                key={`${file}-${i}`}
                draggable
                onDragStart={(e) => {
                  setDragFrom(i);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setDropAt(e.clientX > rect.left + rect.width / 2 ? i + 1 : i);
                }}
                onDragEnd={() => {
                  setDragFrom(null);
                  setDropAt(null);
                }}
                className={`group relative ${dragFrom === i ? "opacity-40" : ""}`}
              >
                {dropAt === i && dragFrom !== null && <span className="absolute inset-y-0 -left-2.5 w-1 rounded-full bg-brand-500" />}
                {dropAt === i + 1 && dragFrom !== null && <span className="absolute inset-y-0 -right-2.5 w-1 rounded-full bg-brand-500" />}
                <button
                  type="button"
                  onClick={(e) => toggle(i, e)}
                  className={`relative block w-full cursor-grab overflow-hidden rounded bg-zinc-800 ring-2 transition active:cursor-grabbing ${
                    isSel ? "ring-brand-500" : "ring-transparent hover:ring-white/30"
                  }`}
                  style={{ aspectRatio: `${doc.size.w} / ${doc.size.h}` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pageUrl(file)} alt={`Trang ${i + 1}`} loading="lazy" draggable={false} className="h-full w-full bg-white object-contain" />
                  <span
                    className={`absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded border ${
                      isSel ? "border-brand-500 bg-brand-500 text-white" : "border-white/60 bg-black/30 text-transparent opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <Check className="size-3.5" />
                  </span>
                  {count > 0 && (
                    <span className="absolute top-1.5 right-1.5 min-w-5 rounded-full bg-brand-600 px-1.5 text-[11px] leading-5 font-medium text-white tabular-nums" title={`${count} phần tử`}>
                      {count}
                    </span>
                  )}
                </button>
                <div className="mt-1.5 flex items-center justify-between gap-1">
                  <span className={`text-xs tabular-nums ${isSel ? "font-medium text-brand-400" : "text-zinc-500"}`}>{i + 1}</span>
                  {/* Máy cảm ứng không rê chuột được: luôn hiện. Không kéo thả được: dùng nút dời trái / phải */}
                  <span className="flex gap-0.5 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                    <button type="button" title="Dời lên trước" disabled={i === 0} onClick={() => move(i, i - 1)} className={iconBtn}>
                      <ChevronLeft className="size-3.5" />
                    </button>
                    <button type="button" title="Dời ra sau" disabled={i === total - 1} onClick={() => move(i, i + 1)} className={iconBtn}>
                      <ChevronRight className="size-3.5" />
                    </button>
                    <button type="button" title="Thay trang này" disabled={!!busy} onClick={() => pick({ kind: "replace", index: i })} className={iconBtn}>
                      <RefreshCw className="size-3.5" />
                    </button>
                    <button type="button" title="Xóa trang này" onClick={() => remove([i])} className={`${iconBtn} hover:text-red-300`}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {busy && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
          <div className="w-80 rounded-2xl bg-zinc-900 p-5 shadow-2xl ring-1 ring-white/10">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin text-brand-400" />
              {busy.label}
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${busy.pct}%` }} />
            </div>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void onFiles(files);
        }}
      />

      <ConfirmDialog
        open={confirmAll}
        title="Thay PDF, giữ nguyên phần tử?"
        description="Toàn bộ trang được thay bằng PDF mới. Phần tử bạn đã thêm (link, video, ảnh...) giữ nguyên theo số trang; link tự nhận từ PDF cũ được thay bằng link của PDF mới. Nếu PDF mới ít trang hơn, phần tử ở các trang thừa sẽ bị bỏ."
        confirmLabel="Chọn PDF mới"
        onConfirm={() => {
          setConfirmAll(false);
          pick({ kind: "replaceAll" });
        }}
        onClose={() => setConfirmAll(false)}
      />
    </div>
  );
}

const btn = "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition disabled:opacity-50 [&_svg]:shrink-0";
const iconBtn = "rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-40";
