"use client";

import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Eye,
  FileStack,
  Globe,
  ImageIcon,
  Link2,
  Loader2,
  MessageSquareText,
  Redo2,
  ShoppingBag,
  SlidersHorizontal,
  Undo2,
  Video,
  Volume2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { BUCKET, fileUrl, pageFiles, readTexts, supabase, writeTexts, type Book } from "@/lib/supabase";
import { createElement, newId, parseElements, type BookElement, type ElementType } from "@/lib/elements";
import { parseSettings, type Settings } from "@/lib/settings";
import { useSession } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import Login from "@/components/Login";
import Flipbook from "@/components/Flipbook";
import { MAX_PDF_BYTES } from "@/components/Uploader";
import Canvas from "./Canvas";
import Inspector, { type InspectorApi, type Patch } from "./Inspector";
import DesignPanel from "./DesignPanel";
import PageManager from "./PageManager";
import { useHistory } from "./useHistory";
import type { Doc } from "./doc";

const AUTOSAVE_MS = 1200;
const MAX_ASSET_BYTES = 50 * 1024 * 1024;

export default function EditorPage({ id }: { id: string }) {
  const session = useSession();
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("books")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setBook(data as Book | null);
      });
  }, [session, id]);

  if (session === null) return <Login />;
  if (error || book === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-medium">{error ? "Không tải được sách" : "Không tìm thấy sách"}</p>
        {error && <p className="text-sm text-stone-500">{error}</p>}
        <Link href="/" className="text-sm font-medium text-brand-600 hover:underline">
          Về thư viện
        </Link>
      </div>
    );
  }
  if (!session || !book) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-950">
        <Loader2 className="size-6 animate-spin text-zinc-500" />
      </div>
    );
  }
  return <Editor book={book} />;
}

type SaveState = "saved" | "dirty" | "saving" | "error";

// Bộ nhớ tạm cho Ctrl+C / Ctrl+V, dùng chung giữa các trang
let clipboard: BookElement[] = [];

const ADD_BUTTONS: { type: ElementType; icon: React.ReactNode; label: string }[] = [
  { type: "link", icon: <Link2 />, label: "Link" },
  { type: "video", icon: <Video />, label: "Video" },
  { type: "image", icon: <ImageIcon />, label: "Ảnh" },
  { type: "text", icon: <MessageSquareText />, label: "Chữ" },
  { type: "audio", icon: <Volume2 />, label: "Âm thanh" },
  { type: "iframe", icon: <Globe />, label: "Nhúng" },
  { type: "product", icon: <ShoppingBag />, label: "Sản phẩm" },
];

function Editor({ book: initial }: { book: Book }) {
  const notify = useToast();
  const [book, setBook] = useState(initial);
  const history = useHistory<Doc>({
    elements: parseElements(initial.elements),
    pages: pageFiles(initial),
    size: { w: initial.page_width, h: initial.page_height },
    settings: parseSettings(initial.settings),
  });
  const doc = history.value;
  const { elements, pages, size, settings } = doc;
  const [title, setTitle] = useState(initial.title);
  const [pageState, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [managing, setManaging] = useState(false);
  const [tab, setTab] = useState<"element" | "design">("element");
  // Mobile: bảng thuộc tính là ngăn kéo từ dưới lên
  const [sheetOpen, setSheetOpen] = useState(false);
  const total = pages.length;
  // Xóa trang (hoặc undo thêm trang) có thể làm trang đang sửa không còn
  const page = Math.min(pageState, total);
  const ratio = size.w / size.h;
  const urlOf = useCallback((file: string) => fileUrl(`${book.id}/${file}`), [book.id]);

  // ---------- Lưu tự động ----------
  // Ngừng sửa AUTOSAVE_MS thì lưu bản mới nhất. Lưu xong mà trong lúc đó lại sửa tiếp thì effect hẹn lưu lần nữa.
  const [savedSnap, setSavedSnap] = useState({ doc, title });
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const dirty = doc !== savedSnap.doc || title !== savedSnap.title;
  const saveState: SaveState = saving ? "saving" : !dirty ? "saved" : saveFailed ? "error" : "dirty";

  const latest = useRef({ doc, title });
  useEffect(() => {
    latest.current = { doc, title };
  });
  const savingRef = useRef(false);
  // Có chữ trong text.json (thêm trang từ PDF có chữ): ghi kèm lần lưu sau
  const hasText = useRef(initial.has_text);

  const save = useCallback(async () => {
    if (savingRef.current) return;
    const snap = latest.current;
    savingRef.current = true;
    setSaving(true);
    const { data, error } = await supabase
      .from("books")
      .update({
        title: snap.title.trim() || "Không tên",
        elements: snap.doc.elements,
        settings: snap.doc.settings,
        pages: snap.doc.pages,
        page_count: snap.doc.pages.length,
        page_width: snap.doc.size.w,
        page_height: snap.doc.size.h,
        has_text: hasText.current,
        updated_at: new Date().toISOString(),
      })
      .eq("id", book.id)
      .select()
      .single();
    savingRef.current = false;
    setSaving(false);
    if (error) {
      setSaveFailed(true);
      notify(`Lưu thất bại: ${error.message}`, "error");
      return;
    }
    setSaveFailed(false);
    setSavedSnap(snap);
    setBook(data as Book);
  }, [book.id, notify]);

  useEffect(() => {
    if (!dirty || saving) return;
    // Lỗi mạng: thử lại thưa hơn để không spam thông báo
    const t = setTimeout(save, saveFailed ? 10_000 : AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [doc, title, dirty, saving, saveFailed, save]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ---------- Sửa nội dung ----------
  const { set: setDoc, checkpoint } = history;
  // Trạng thái trước khi bắt đầu gõ / kéo thanh trượt (xem typing bên dưới)
  const editSnapshot = useRef<Doc | null>(null);
  const setElements = useCallback(
    (next: BookElement[] | ((prev: BookElement[]) => BookElement[]), record = true) =>
      setDoc((d) => {
        const els = typeof next === "function" ? next(d.elements) : next;
        return els === d.elements ? d : { ...d, elements: els };
      }, record),
    [setDoc],
  );
  // Sau khi kéo thả trên canvas: ghi trạng thái trước lúc kéo làm một bước undo
  const checkpointElements = useCallback(
    (before: BookElement[]) => checkpoint((d) => (before === d.elements ? d : { ...d, elements: before })),
    [checkpoint],
  );
  const setSettings = useCallback(
    (fn: (s: Settings) => Settings, record = true) => setDoc((d) => ({ ...d, settings: fn(d.settings) }), record && !editSnapshot.current),
    [setDoc],
  );

  // Gõ trong ô nhập / kéo thanh trượt: gộp cả lần sửa thành một bước undo
  const typing = useMemo(
    () => ({
      onFocus: () => {
        editSnapshot.current = latest.current.doc;
      },
      onBlur: () => {
        if (editSnapshot.current) checkpoint(editSnapshot.current);
        editSnapshot.current = null;
      },
    }),
    [checkpoint],
  );

  // ---------- Thao tác trên phần tử ----------
  const pageEls = useMemo(() => elements.filter((e) => e.page === page), [elements, page]);
  const selectedEls = useMemo(() => elements.filter((e) => selected.includes(e.id)), [elements, selected]);

  // Đổi trang thì bỏ chọn phần tử của trang cũ
  const goPage = useCallback(
    (n: number) => {
      setPage(Math.max(1, Math.min(total, n)));
      setSelected([]);
    },
    [total],
  );

  const add = (type: ElementType) => {
    const el = createElement(type, page, ratio);
    setElements([...elements, el]);
    setSelected([el.id]);
    setTab("element");
    if (matchMedia("(max-width: 767px)").matches) setSheetOpen(true);
  };

  const upload = useCallback(
    async (file: File, kind: "image" | "video" | "audio") => {
      if (file.size > MAX_ASSET_BYTES) {
        notify("File lớn hơn 50 MB", "error");
        return null;
      }
      const fallback = { image: "png", video: "mp4", audio: "mp3" }[kind];
      const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? fallback).toLowerCase();
      const path = `${book.id}/assets/${nanoid(10)}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, cacheControl: "31536000" });
      if (error) {
        notify(`Tải lên thất bại: ${error.message}`, "error");
        return null;
      }
      return fileUrl(path);
    },
    [book.id, notify],
  );

  const api: InspectorApi = {
    update: (id, patch: Patch, record = true) =>
      setElements((prev) => prev.map((e) => (e.id === id ? ({ ...e, ...patch } as BookElement) : e)), record && !editSnapshot.current),
    beginEdit: typing.onFocus,
    endEdit: typing.onBlur,
    remove: (ids) => {
      setElements((prev) => prev.filter((e) => !ids.includes(e.id)));
      setSelected([]);
    },
    duplicate: (ids) => {
      const copies = elements.filter((e) => ids.includes(e.id)).map((e) => offsetCopy(e, e.page));
      setElements([...elements, ...copies]);
      setSelected(copies.map((c) => c.id));
    },
    reorder: (id, to) => setElements((prev) => reorder(prev, id, to)),
    upload,
    select: setSelected,
  };

  // ---------- Trang ----------
  const addTexts = useCallback(
    async (texts: Record<string, string>) => {
      const current = await readTexts({ ...book, has_text: hasText.current });
      await writeTexts(book.id, { ...current, ...texts });
      hasText.current = true;
    },
    [book],
  );

  const replacePdf = useCallback(
    async (pdf: File) => {
      const hasPdf = pdf.size <= MAX_PDF_BYTES;
      if (hasPdf) {
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(`${book.id}/source.pdf`, pdf, { contentType: "application/pdf", upsert: true, cacheControl: "60" });
        if (error) {
          notify(`Lưu PDF gốc thất bại: ${error.message}`, "error");
          return;
        }
      } else if (book.has_pdf) {
        await supabase.storage.from(BUCKET).remove([`${book.id}/source.pdf`]);
      }
      const { data } = await supabase.from("books").update({ has_pdf: hasPdf }).eq("id", book.id).select().single();
      if (data) setBook(data as Book);
    },
    [book.id, book.has_pdf, notify],
  );

  // ---------- Phím tắt ----------
  const keyState = useRef({ elements, selected, page, api, goPage, history, save, setElements });
  useEffect(() => {
    keyState.current = { elements, selected, page, api, goPage, history, save, setElements };
  });
  const blocked = previewing || managing;
  useEffect(() => {
    if (blocked) return;
    const onKey = (e: KeyboardEvent) => {
      const { elements, selected, page, api, goPage, history, save, setElements } = keyState.current;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
        return;
      }
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable], dialog")) return;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        history.redo();
      } else if (mod && key === "a") {
        e.preventDefault();
        setSelected(elements.filter((el) => el.page === page).map((el) => el.id));
      } else if (mod && key === "c" && selected.length) {
        clipboard = elements.filter((el) => selected.includes(el.id));
      } else if (mod && key === "v" && clipboard.length) {
        e.preventDefault();
        const copies = clipboard.map((el) => offsetCopy(el, page));
        setElements([...elements, ...copies]);
        setSelected(copies.map((c) => c.id));
      } else if (mod && key === "d" && selected.length) {
        e.preventDefault();
        api.duplicate(selected);
      } else if ((key === "delete" || key === "backspace") && selected.length) {
        e.preventDefault();
        api.remove(selected);
      } else if (key === "escape") {
        setSelected([]);
      } else if (key.startsWith("arrow") && selected.length) {
        e.preventDefault();
        const step = e.shiftKey ? 0.02 : 0.004;
        const dx = key === "arrowleft" ? -step : key === "arrowright" ? step : 0;
        const dy = key === "arrowup" ? -step : key === "arrowdown" ? step : 0;
        setElements((prev) =>
          prev.map((el) =>
            selected.includes(el.id) && !el.locked
              ? { ...el, x: Math.max(0, Math.min(1 - el.w, el.x + dx)), y: Math.max(0, Math.min(1 - el.h, el.y + dy)) }
              : el,
          ),
        );
      } else if (key === "pagedown" || (key === "arrowright" && !selected.length)) {
        goPage(page + 1);
      } else if (key === "pageup" || (key === "arrowleft" && !selected.length)) {
        goPage(page - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blocked]);

  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of elements) m.set(e.page, (m.get(e.page) ?? 0) + 1);
    return m;
  }, [elements]);

  // Sách với nội dung đang sửa, cho xem thử
  const previewBook: Book = useMemo(
    () => ({ ...book, title, elements, settings, pages, page_count: pages.length, page_width: size.w, page_height: size.h }),
    [book, title, elements, settings, pages, size],
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Thanh trên */}
      {/* Mobile: 2 hàng — tên / lưu / undo / xem thử ở trên, dãy nút thêm phần tử (cuộn ngang) ở dưới */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-white/10 bg-zinc-900 px-2 py-2 sm:px-3 md:h-14 md:flex-nowrap md:py-0">
        <Link href="/" title="Về thư viện" className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white">
          <ArrowLeft className="size-5" />
        </Link>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Tên sách"
          className="w-32 min-w-0 flex-1 truncate rounded-md border-0 bg-transparent px-2 py-1 text-sm font-medium hover:bg-white/5 focus:bg-white/5 focus:ring-1 focus:ring-brand-500 focus:outline-none sm:w-56 md:flex-none"
        />
        <SaveBadge state={saveState} />

        <div className="order-last flex w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-white/5 p-1 ring-1 ring-white/10 md:order-none md:mx-auto md:w-auto">
          {ADD_BUTTONS.map((b) => (
            <AddButton key={b.type} icon={b.icon} label={b.label} onClick={() => add(b.type)} />
          ))}
        </div>

        <div className="flex items-center gap-1">
          <IconBtn label="Hoàn tác (Ctrl+Z)" disabled={!history.canUndo} onClick={history.undo}>
            <Undo2 className="size-[18px]" />
          </IconBtn>
          <IconBtn label="Làm lại (Ctrl+Shift+Z)" disabled={!history.canRedo} onClick={history.redo}>
            <Redo2 className="size-[18px]" />
          </IconBtn>
          <button
            type="button"
            onClick={() => setPreviewing(true)}
            className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500"
          >
            <Eye className="size-4" />
            <span className="hidden sm:inline">Xem thử</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Danh sách trang */}
        <nav className="hidden w-36 shrink-0 flex-col border-r border-white/10 bg-zinc-900/60 md:flex" aria-label="Trang">
          <button
            type="button"
            onClick={() => setManaging(true)}
            className="m-3 mb-0 flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-300 ring-1 ring-white/10 hover:bg-white/5 hover:text-white"
          >
            <FileStack className="size-3.5" /> Quản lý trang
          </button>
          <ol className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
            {pages.map((file, i) => {
              const n = i + 1;
              const count = counts.get(n) ?? 0;
              const current = n === page;
              return (
                <li key={`${file}-${i}`}>
                  <button type="button" onClick={() => goPage(n)} className="group block w-full text-center">
                    <div
                      className={`relative overflow-hidden rounded bg-zinc-800 ring-2 transition ${
                        current ? "ring-brand-500" : "ring-transparent group-hover:ring-white/30"
                      }`}
                      style={{ aspectRatio: `${size.w} / ${size.h}` }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={urlOf(file)} alt="" loading="lazy" className="h-full w-full bg-white object-contain" />
                      {count > 0 && (
                        <span className="absolute top-1 right-1 min-w-5 rounded-full bg-brand-600 px-1.5 text-[11px] leading-5 font-medium text-white tabular-nums">
                          {count}
                        </span>
                      )}
                    </div>
                    <span className={`mt-1 block text-xs ${current ? "font-medium text-brand-400" : "text-zinc-500"}`}>{n}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Trang đang sửa */}
        <main className="relative flex min-w-0 flex-1 flex-col bg-[radial-gradient(ellipse_at_center,#27272a_0%,#09090b_80%)]">
          <Canvas
            imageUrl={urlOf(pages[page - 1])}
            ratio={ratio}
            page={page}
            elements={elements}
            selected={selected}
            setSelected={setSelected}
            setElements={setElements}
            checkpoint={checkpointElements}
            onEditText={() => {
              setTab("element");
              setTimeout(() => document.getElementById("inspector-text")?.focus());
            }}
          />
          <div className="flex h-12 shrink-0 items-center justify-center gap-1 text-sm whitespace-nowrap text-zinc-400 sm:gap-3">
            <IconBtn label="Trang trước (PageUp)" disabled={page <= 1} onClick={() => goPage(page - 1)}>
              <ChevronLeft className="size-5" />
            </IconBtn>
            <span className="tabular-nums">
              Trang <span className="font-medium text-white">{page}</span> / {total}
            </span>
            <IconBtn label="Trang sau (PageDown)" disabled={page >= total} onClick={() => goPage(page + 1)}>
              <ChevronRight className="size-5" />
            </IconBtn>
            <button type="button" onClick={() => setManaging(true)} title="Quản lý trang" className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white md:hidden">
              <FileStack className="size-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="ml-1 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-200 ring-1 ring-white/15 hover:bg-white/10 md:hidden"
            >
              <SlidersHorizontal className="size-3.5" /> {selected.length ? "Thuộc tính" : "Lớp / Thiết kế"}
            </button>
          </div>
        </main>

        {/* Thuộc tính / thiết kế */}
        {/* Mobile: ngăn kéo từ dưới lên, mở khi chọn phần tử hoặc bấm nút ở thanh dưới */}
        {sheetOpen && <div className="fixed inset-0 z-20 bg-black/40 md:hidden" onClick={() => setSheetOpen(false)} />}
        <aside
          className={`flex w-72 shrink-0 flex-col border-l border-white/10 bg-zinc-900 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:h-[55dvh] max-md:w-full max-md:rounded-t-2xl max-md:border-t max-md:border-l-0 max-md:shadow-2xl ${
            sheetOpen ? "" : "max-md:hidden"
          }`}
        >
          <div className="flex shrink-0 items-center gap-1 border-b border-white/10 p-2" role="tablist">
            <TabButton active={tab === "element"} onClick={() => setTab("element")}>
              Phần tử
            </TabButton>
            <TabButton active={tab === "design"} onClick={() => setTab("design")}>
              Thiết kế
            </TabButton>
            <button type="button" onClick={() => setSheetOpen(false)} aria-label="Đóng" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white md:hidden">
              <X className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "element" ? (
              <Inspector pageElements={pageEls} selected={selectedEls} pageCount={total} api={api} />
            ) : (
              <DesignPanel bookId={book.id} settings={settings} pageCount={total} set={setSettings} typing={typing} upload={upload} />
            )}
          </div>
        </aside>
      </div>

      {managing && (
        <PageManager
          bookId={book.id}
          doc={doc}
          pageUrl={urlOf}
          onChange={(fn) => setDoc(fn)}
          onTexts={addTexts}
          onPdf={replacePdf}
          onClose={() => {
            setManaging(false);
            setSelected([]);
          }}
        />
      )}

      {previewing && (
        <div className="fixed inset-0 z-50 [animation:fade-in_.15s]">
          <Flipbook book={previewBook} preview />
          <button
            type="button"
            onClick={() => setPreviewing(false)}
            className="absolute top-3 left-3 z-[60] inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-lg hover:bg-zinc-200"
          >
            <X className="size-4" /> Đóng xem thử
          </button>
        </div>
      )}
    </div>
  );
}

// Bản sao lệch một chút so với gốc để thấy rõ, đặt vào `page`
function offsetCopy(el: BookElement, page: number): BookElement {
  const copy: BookElement = {
    ...el,
    id: newId(),
    page,
    locked: false,
    x: Math.min(1 - el.w, el.x + 0.02),
    y: Math.min(1 - el.h, el.y + 0.02),
  };
  // Bản sao là phần tử tự thêm, không bị thay khi thay PDF
  if (copy.type === "link") delete copy.source;
  return copy;
}

// Đổi thứ tự lớp trong cùng trang (phần tử sau trong mảng nằm trên)
function reorder(list: BookElement[], id: string, to: "up" | "down" | "front" | "back"): BookElement[] {
  const el = list.find((e) => e.id === id);
  if (!el) return list;
  const same = list.filter((e) => e.page === el.page);
  const i = same.indexOf(el);
  const next = same.filter((e) => e !== el);
  const pos = to === "front" ? next.length : to === "back" ? 0 : to === "up" ? Math.min(next.length, i + 1) : Math.max(0, i - 1);
  next.splice(pos, 0, el);
  if (next.every((e, k) => e === same[k])) return list;
  // Ghép lại: giữ phần tử các trang khác nguyên chỗ, thay dần phần tử trang này theo thứ tự mới
  let k = 0;
  return list.map((e) => (e.page === el.page ? next[k++] : e));
}

function SaveBadge({ state }: { state: SaveState }) {
  const map = {
    saved: { icon: <Check className="size-3.5" />, text: "Đã lưu", cls: "text-zinc-500" },
    dirty: { icon: <span className="size-1.5 rounded-full bg-amber-400" />, text: "Chưa lưu", cls: "text-zinc-400" },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Đang lưu…", cls: "text-zinc-400" },
    error: { icon: <CloudOff className="size-3.5" />, text: "Lỗi lưu", cls: "text-red-400" },
  }[state];
  return (
    <span className={`hidden items-center gap-1.5 text-xs whitespace-nowrap lg:inline-flex ${map.cls}`} aria-live="polite">
      {map.icon}
      {map.text}
    </span>
  );
}

function AddButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Thêm ${label.toLowerCase()}`}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-zinc-300 transition hover:bg-white/10 hover:text-white [&_svg]:size-4"
    >
      {icon}
      <span className="hidden 2xl:inline">{label}</span>
    </button>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${active ? "bg-white/10 text-white" : "text-zinc-400 hover:text-zinc-100"}`}
    >
      {children}
    </button>
  );
}

function IconBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}
