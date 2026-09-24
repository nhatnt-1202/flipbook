"use client";

import "page-flip/src/Style/stPageFlip.css";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  LayoutGrid,
  Loader2,
  Maximize,
  Minimize,
  Share2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PageFlip } from "page-flip";
import { pageUrl, pdfUrl, type Book } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { useSession } from "@/lib/auth";
import {
  isFlipSoundMuted,
  playFlipSound,
  setFlipSoundMuted,
  subscribeFlipSoundMuted,
  unlockFlipSound,
} from "@/lib/flipSound";

// Mỗi trang phải rộng ít nhất chừng này mới hiển thị 2 trang đôi; nhỏ hơn thì chuyển sang 1 trang (mobile).
const MIN_PAGE_WIDTH = 300;
// Số trang tải trước quanh trang hiện tại
const PRELOAD_BEHIND = 2;
const PRELOAD_AHEAD = 6;
// Thời gian lật một trang (ms); hiệu ứng trượt bìa vào giữa dùng cùng thời gian để chạy đồng bộ
const FLIP_MS = 800;

export default function Flipbook({ book }: { book: Book }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<PageFlip | null>(null);
  const [page, setPage] = useState(0);
  const [portrait, setPortrait] = useState(false);
  const [ready, setReady] = useState({ flip: false, cover: false });
  const [fullscreen, setFullscreen] = useState(false);
  const [thumbsOpen, setThumbsOpen] = useState(false);
  const [flipState, setFlipState] = useState("read");
  const muted = useSyncExternalStore(subscribeFlipSoundMuted, isFlipSoundMuted, () => false);
  const notify = useToast();
  const session = useSession();
  const total = book.page_count;

  // Tính kích thước sách vừa khít khung hiển thị. page-flip tự suy chiều cao từ chiều rộng container.
  const fit = useCallback(() => {
    const stage = stageRef.current;
    const sizer = sizerRef.current;
    if (!stage || !sizer) return;
    const ratio = book.page_width / book.page_height;
    // clientWidth/Height tính cả padding, trừ ra để sách không tràn vào vùng nút điều hướng
    const cs = getComputedStyle(stage);
    const w = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    let width = Math.min(w, h * ratio * 2);
    if (width < MIN_PAGE_WIDTH * 2) width = Math.min(w, h * ratio);
    sizer.style.width = `${Math.floor(width)}px`;
  }, [book.page_width, book.page_height]);

  useEffect(() => {
    let cancelled = false;
    const sizer = sizerRef.current!;
    // page-flip xóa luôn element gốc khi destroy(), nên tạo element mới mỗi lần mount
    const el = document.createElement("div");
    sizer.appendChild(el);

    const imgs: HTMLImageElement[] = [];
    const pages = Array.from({ length: book.page_count }, (_, i) => {
      const div = document.createElement("div");
      div.className = "bg-white";
      if (i === 0 || i === book.page_count - 1) div.dataset.density = "hard";
      const img = document.createElement("img");
      img.dataset.src = pageUrl(book, i + 1);
      img.alt = `Trang ${i + 1}`;
      img.draggable = false;
      img.className = "block h-full w-full object-contain select-none";
      div.appendChild(img);
      imgs.push(img);
      return div;
    });
    imgs[0].onload = imgs[0].onerror = () => !cancelled && setReady((r) => ({ ...r, cover: true }));

    const preload = (index: number) => {
      for (let i = Math.max(0, index - PRELOAD_BEHIND); i <= Math.min(imgs.length - 1, index + PRELOAD_AHEAD); i++) {
        if (!imgs[i].src) imgs[i].src = imgs[i].dataset.src!;
      }
    };

    fit();
    preload(0);
    unlockFlipSound(); // tải trước tiếng lật trang

    import("page-flip").then(({ PageFlip }) => {
      if (cancelled) return;
      const flip = new PageFlip(el, {
        width: book.page_width,
        height: book.page_height,
        size: "stretch",
        minWidth: MIN_PAGE_WIDTH,
        maxWidth: 4000,
        minHeight: 100,
        maxHeight: 6000,
        showCover: true,
        usePortrait: true,
        mobileScrollSupport: false,
        maxShadowOpacity: 0.35,
        flippingTime: FLIP_MS,
      });
      flip.on("flip", (e) => {
        setPage(e.data);
        preload(e.data);
      });
      flip.on("changeState", (e) => {
        setFlipState(e.data);
        if (e.data === "flipping" && !isFlipSoundMuted()) playFlipSound();
      });
      flip.on("init", () => {
        setPortrait(flip.getOrientation() === "portrait");
        setReady((r) => ({ ...r, flip: true }));
      });
      flip.on("changeOrientation", () => setPortrait(flip.getOrientation() === "portrait"));
      flip.loadFromHTML(pages);
      flipRef.current = flip;
    });

    // Chạm/click vào nửa phải sách → trang sau, nửa trái → trang trước.
    // Thư viện tự xử lý click chuột, nhưng bỏ qua cú chạm nhanh (<250ms) trên mobile, nên bổ sung bằng pointer events.
    let down: { x: number; y: number; t: number; state: string } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, t: Date.now(), state: flipRef.current?.getState() ?? "read" };
    };
    const onPointerUp = (e: PointerEvent) => {
      const start = down;
      down = null;
      if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8 || Date.now() - start.t > 500) return;
      const rect = el.getBoundingClientRect();
      const corner = e.clientY - rect.top > rect.height / 2 ? "bottom" : "top";
      const next = e.clientX > rect.left + rect.width / 2;
      // Đợi thư viện xử lý mouseup/touchend trước: nếu nó đã tự lật thì không lật thêm lần nữa
      setTimeout(() => {
        const flip = flipRef.current;
        if (!flip) return;
        const state = flip.getState();
        if (state === "user_fold" || (state === "flipping" && start.state !== "flipping")) return;
        if (next) flip.flipNext(corner);
        else flip.flipPrev(corner);
      }, 0);
    };
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointerup", onPointerUp);

    // Lăn chuột / vuốt 2 ngón trên touchpad → lật trang (xuống/phải = trang sau).
    // Touchpad bắn hàng loạt sự kiện (kèm quán tính), nên sau mỗi lần lật sẽ khóa cho tới khi
    // người dùng dừng lăn một chút, hoặc đã lật xong và có một nấc lăn mạnh mới (chuột thường).
    const root = rootRef.current!;
    let wheelAcc = 0;
    let lastWheel = 0;
    let lockedAt = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || (e.target as Element).closest("aside")) return; // giữ zoom trình duyệt và cuộn danh sách trang
      e.preventDefault();
      const flip = flipRef.current;
      if (!flip) return;
      const now = Date.now();
      const quiet = now - lastWheel > 150;
      lastWheel = now;
      const scale = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
      const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * scale;
      if (lockedAt) {
        if (!quiet && !(now - lockedAt > FLIP_MS && Math.abs(delta) >= 50)) return;
        lockedAt = 0;
        wheelAcc = 0;
      }
      if (flip.getState() !== "read") return;
      wheelAcc += delta;
      if (Math.abs(wheelAcc) < 30) return;
      if (wheelAcc > 0) flip.flipNext();
      else flip.flipPrev();
      wheelAcc = 0;
      lockedAt = now;
    };
    root.addEventListener("wheel", onWheel, { passive: false });

    const onResize = () => fit();
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight") flipRef.current?.flipNext();
      if (e.key === "ArrowLeft") flipRef.current?.flipPrev();
      if (e.key === "Escape") setThumbsOpen(false);
    };
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    // Trình duyệt chỉ cho phát âm thanh sau click/phím (lăn chuột không tính), nên mở khóa ở thao tác đầu tiên
    window.addEventListener("pointerdown", unlockFlipSound);
    window.addEventListener("keydown", unlockFlipSound);
    document.addEventListener("fullscreenchange", onFullscreen);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", unlockFlipSound);
      window.removeEventListener("keydown", unlockFlipSound);
      document.removeEventListener("fullscreenchange", onFullscreen);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("wheel", onWheel);
      flipRef.current?.destroy();
      flipRef.current = null;
      el.remove();
    };
  }, [book, fit]);

  async function share() {
    const url = window.location.href;
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title: book.title, url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url);
    notify("Đã copy link chia sẻ");
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else rootRef.current?.requestFullscreen();
  }

  const goTo = (i: number) => flipRef.current?.turnToPage(Math.max(0, Math.min(total - 1, i)));

  const isLoading = !(ready.flip && ready.cover);
  // Chế độ 2 trang + bìa đơn: trang 0 đứng một mình, sau đó là cặp (1,2), (3,4)...
  const spread = !portrait && page > 0 && page < total - 1;
  const label = spread ? `${page + 1}–${Math.min(page + 2, total)}` : `${page + 1}`;
  const atStart = page === 0;
  const atEnd = page >= total - (spread ? 2 : 1);
  const progress = total > 1 ? (page / (total - 1)) * 100 : 100;

  // Chế độ 2 trang: bìa trước chỉ chiếm nửa phải, bìa sau (khi tổng số trang chẵn) chỉ chiếm nửa trái.
  // Dịch sách 1/4 chiều rộng để trang đơn nằm giữa; khi bắt đầu lật ra khỏi bìa thì trượt về vị trí 2 trang.
  const onCover = !portrait && page === 0;
  const onBackCover = !portrait && total > 1 && total % 2 === 0 && page === total - 1;
  const leaving = flipState === "flipping";
  const shift = leaving ? 0 : onCover ? -25 : onBackCover ? 25 : 0;

  return (
    <div
      ref={rootRef}
      className="relative flex h-dvh flex-col overflow-hidden bg-[radial-gradient(ellipse_at_center,#3f3f46_0%,#18181b_75%)] text-zinc-100"
    >
      {/* Thanh trên */}
      <header className="relative z-20 flex h-14 shrink-0 items-center gap-2 px-2 sm:px-4">
        {/* Chỉ root mới có đường về thư viện; người được share link chỉ xem cuốn này */}
        {session && (
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Thư viện</span>
          </Link>
        )}
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-sm font-medium sm:text-[15px]" title={book.title}>
            {book.title}
          </h1>
          <p className="text-xs text-zinc-400">{total} trang</p>
        </div>
        <div className="flex items-center">
          <ToolButton label="Danh sách trang" active={thumbsOpen} onClick={() => setThumbsOpen((v) => !v)}>
            <LayoutGrid className="size-[18px]" />
          </ToolButton>
          <ToolButton label={muted ? "Bật âm thanh lật trang" : "Tắt âm thanh lật trang"} onClick={() => setFlipSoundMuted(!muted)}>
            {muted ? <VolumeX className="size-[18px]" /> : <Volume2 className="size-[18px]" />}
          </ToolButton>
          <ToolButton label="Chia sẻ" onClick={share}>
            <Share2 className="size-[18px]" />
          </ToolButton>
          {book.has_pdf && (
            <a
              href={pdfUrl(book)}
              target="_blank"
              rel="noreferrer"
              title="Tải PDF gốc"
              aria-label="Tải PDF gốc"
              className={toolClass}
            >
              <Download className="size-[18px]" />
            </a>
          )}
          <ToolButton label={fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"} onClick={toggleFullscreen} className="hidden sm:flex">
            {fullscreen ? <Minimize className="size-[18px]" /> : <Maximize className="size-[18px]" />}
          </ToolButton>
        </div>
      </header>

      {/* Khu vực sách */}
      <div className="relative flex min-h-0 flex-1">
        <div ref={stageRef} className="relative flex min-w-0 flex-1 items-center justify-center px-3 py-2 sm:px-20 sm:py-4">
          <div
            ref={sizerRef}
            className={`cursor-pointer select-none ${isLoading ? "opacity-0" : "opacity-100"}`}
            style={{
              transform: `translateX(${shift}%)`,
              transition: `transform ${FLIP_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity 500ms`,
            }}
          />
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-zinc-400">
              <Loader2 className="size-7 animate-spin text-zinc-300" />
              Đang mở sách…
            </div>
          )}
        </div>

        <NavButton side="left" disabled={atStart} onClick={() => flipRef.current?.flipPrev()} />
        <NavButton side="right" disabled={atEnd} onClick={() => flipRef.current?.flipNext()} />

        {/* Bảng thumbnail */}
        {thumbsOpen && (
          <>
            <div className="absolute inset-0 z-20 bg-black/40 [animation:fade-in_.15s] sm:hidden" onClick={() => setThumbsOpen(false)} />
            <aside className="absolute inset-y-0 right-0 z-30 flex w-72 max-w-[85vw] flex-col border-l border-white/10 bg-zinc-900/95 backdrop-blur-xl [animation:fade-in_.15s]">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium">Tất cả trang</span>
                <button
                  onClick={() => setThumbsOpen(false)}
                  className="rounded-md p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
                  aria-label="Đóng"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="grid flex-1 grid-cols-2 content-start gap-3 overflow-y-auto px-4 pb-4">
                {Array.from({ length: total }, (_, i) => {
                  const current = i === page || (spread && i === page + 1);
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        goTo(i);
                        if (window.innerWidth < 640) setThumbsOpen(false);
                      }}
                      className="group text-center"
                    >
                      <div
                        className={`overflow-hidden rounded bg-zinc-800 ring-2 transition ${
                          current ? "ring-brand-400" : "ring-transparent group-hover:ring-white/30"
                        }`}
                        style={{ aspectRatio: `${book.page_width} / ${book.page_height}` }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={pageUrl(book, i + 1)} alt="" loading="lazy" className="h-full w-full object-cover" />
                      </div>
                      <span className={`mt-1 block text-xs ${current ? "font-medium text-brand-400" : "text-zinc-400"}`}>
                        {i + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
          </>
        )}
      </div>

      {/* Thanh dưới */}
      {/* Máy có chuột: chỉ hiện khi rê chuột vào vùng dưới cùng. Màn hình cảm ứng không có hover nên luôn hiện. */}
      <footer className="group relative z-10 flex h-16 shrink-0 items-center justify-center px-4">
        <div className="flex w-full max-w-lg items-center gap-3 rounded-full bg-white/[0.07] px-4 py-2 ring-1 ring-white/10 backdrop-blur transition-opacity duration-300 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
          <button
            onClick={() => flipRef.current?.flipPrev()}
            disabled={atStart}
            className="rounded-full p-1 text-zinc-300 hover:text-white disabled:opacity-30 sm:hidden"
            aria-label="Trang trước"
          >
            <ChevronLeft className="size-5" />
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(0, total - 1)}
            value={page}
            onChange={(e) => goTo(Number(e.target.value))}
            aria-label="Chuyển trang"
            className="page-slider flex-1"
            style={{ "--progress": `${progress}%` } as React.CSSProperties}
          />
          <span className="min-w-16 text-right text-sm text-zinc-300 tabular-nums">
            <span className="font-medium text-white">{label}</span> / {total}
          </span>
          <button
            onClick={() => flipRef.current?.flipNext()}
            disabled={atEnd}
            className="rounded-full p-1 text-zinc-300 hover:text-white disabled:opacity-30 sm:hidden"
            aria-label="Trang sau"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </footer>
    </div>
  );
}

const toolClass =
  "flex size-9 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/10 hover:text-white";

function ToolButton({
  label,
  active,
  className = "",
  children,
  onClick,
}: {
  label: string;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`${toolClass} ${active ? "bg-white/15 text-white" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

function NavButton({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Trang trước" : "Trang sau"}
      className={`absolute top-1/2 z-10 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white ring-1 ring-white/10 backdrop-blur transition hover:scale-105 hover:bg-white/20 disabled:pointer-events-none disabled:opacity-0 sm:flex ${
        side === "left" ? "left-4" : "right-4"
      }`}
    >
      <Icon className="size-6" />
    </button>
  );
}
