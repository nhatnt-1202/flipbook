"use client";

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  EllipsisVertical,
  LayoutGrid,
  Loader2,
  Maximize,
  Minimize,
  Music,
  PencilRuler,
  Share2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { pageFiles, pageUrl, pdfUrl, type Book } from "@/lib/supabase";
import { useToast } from "@/components/Toast";
import { useSession } from "@/lib/auth";
import {
  isFlipSoundMuted,
  playFlipSound,
  prepareFlipSound,
  setFlipSoundMuted,
  subscribeFlipSoundMuted,
} from "@/lib/flipSound";
import { parseElements, type BookElement } from "@/lib/elements";
import { FONT_FAMILY, PAGE_FLIP_STYLES, backgroundCss, parseSettings } from "@/lib/settings";
import ElementLayer, { ElementPopup } from "@/components/elements/ElementLayer";
import type { ElementAction } from "@/components/elements/ElementContent";
import PageFlipView, { FLIP_MS } from "@/components/viewer/PageFlipView";
import SlideView from "@/components/viewer/SlideView";
import LeadGate, { leadDone } from "@/components/viewer/LeadGate";
import type { ViewHandle } from "@/components/viewer/types";

// Màu giao diện viewer theo theme của sách
const THEME = {
  dark: {
    root: "text-zinc-100",
    muted: "text-zinc-400",
    tool: "text-zinc-300 hover:bg-white/10 hover:text-white",
    toolActive: "bg-white/15 text-white",
    panel: "border-white/10 bg-zinc-900/95",
    pill: "bg-white/[0.07] ring-white/10",
    nav: "bg-white/10 text-white ring-white/10 hover:bg-white/20",
    track: "rgb(255 255 255 / 0.18)",
  },
  light: {
    root: "text-zinc-900",
    muted: "text-zinc-500",
    tool: "text-zinc-600 hover:bg-black/5 hover:text-zinc-900",
    toolActive: "bg-black/10 text-zinc-900",
    panel: "border-black/10 bg-white/95",
    pill: "bg-white/70 ring-black/10",
    nav: "bg-white/70 text-zinc-800 ring-black/10 hover:bg-white",
    track: "rgb(0 0 0 / 0.15)",
  },
};

// preview: đang xem thử trong editor — ẩn đường về thư viện / nút chỉnh sửa để không rời editor, form lead không ghi DB
export default function Flipbook({ book, preview = false }: { book: Book; preview?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ViewHandle | null>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const [page, setPage] = useState(0);
  const [portrait, setPortrait] = useState(false);
  const [ready, setReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [thumbsOpen, setThumbsOpen] = useState(false);
  const [popup, setPopup] = useState<ElementAction | null>(null);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [leadPassed, setLeadPassed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const muted = useSyncExternalStore(subscribeFlipSoundMuted, isFlipSoundMuted, () => false);
  const notify = useToast();
  const session = useSession();

  const settings = useMemo(() => parseSettings(book.settings), [book.settings]);
  const t = THEME[settings.theme];
  const pageUrls = useMemo(
    () => pageFiles(book).map((_, i) => pageUrl(book, i + 1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book.id, book.pages, book.page_count, book.image_ext],
  );
  const total = pageUrls.length;
  const byPage = useMemo(() => {
    const map = new Map<number, BookElement[]>();
    for (const el of parseElements(book.elements)) {
      if (!map.has(el.page)) map.set(el.page, []);
      map.get(el.page)!.push(el);
    }
    return map;
  }, [book.elements]);

  // Đã gửi form lead trên trình duyệt này (xem thử thì luôn hỏi)
  const leadStored = useSyncExternalStore(
    noopSubscribe,
    () => !preview && leadDone(book.id),
    () => false,
  );

  // Chế độ 2 trang + bìa đơn: trang 0 đứng một mình, sau đó là cặp (1,2), (3,4)...
  const spread = !portrait && page > 0 && page < total - 1;
  const label = spread ? `${page + 1}–${Math.min(page + 2, total)}` : `${page + 1}`;
  const atStart = page === 0;
  const atEnd = page >= total - (spread ? 2 : 1);
  const progress = total > 1 ? (page / (total - 1)) * 100 : 100;
  const lastVisible = spread ? page + 2 : page + 1; // số trang (từ 1) lớn nhất đang hiện
  const lead = settings.lead;
  const gate = lead.enabled && !leadStored && !leadPassed && (lead.page <= 0 || lastVisible >= lead.page);

  // ---------- Âm thanh ----------
  const sound = settings.sound;
  useEffect(() => {
    if (sound !== "off") prepareFlipSound(); // tải trước tiếng lật trang, mở khóa âm thanh ở thao tác đầu tiên
  }, [sound]);
  const onFlip = useCallback(() => {
    if (sound !== "off" && !isFlipSoundMuted()) playFlipSound(sound);
  }, [sound]);

  // Nhạc nền: thử phát ngay khi mở sách; trình duyệt chặn tự phát thì chờ thao tác đầu tiên của người xem
  const musicSrc = settings.music.src;
  const musicVolume = settings.music.volume;
  useEffect(() => {
    const audio = musicRef.current;
    if (!audio || !musicSrc) return;
    audio.volume = Math.max(0, Math.min(1, musicVolume));
    const events = ["pointerup", "keydown", "touchend"] as const;
    const stop = () => events.forEach((e) => window.removeEventListener(e, start, true));
    const start = () => {
      audio.play().then(stop, () => {});
    };
    events.forEach((e) => window.addEventListener(e, start, true));
    start();
    return stop;
  }, [musicSrc, musicVolume]);

  function toggleMusic() {
    const audio = musicRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }

  // ---------- Phím, lăn chuột, toàn màn hình ----------
  const gateRef = useRef(gate);
  useEffect(() => {
    gateRef.current = gate;
  });
  useEffect(() => {
    const root = rootRef.current!;
    // Lăn chuột / vuốt 2 ngón trên touchpad → lật trang (xuống/phải = trang sau).
    // Touchpad bắn hàng loạt sự kiện (kèm quán tính), nên sau mỗi lần lật sẽ khóa cho tới khi
    // người dùng dừng lăn một chút, hoặc đã lật xong và có một nấc lăn mạnh mới (chuột thường).
    let wheelAcc = 0;
    let lastWheel = 0;
    let lockedAt = 0;
    const onWheel = (e: WheelEvent) => {
      // giữ zoom trình duyệt, cuộn danh sách trang, cuộn trong popup / iframe
      if (e.ctrlKey || (e.target as Element).closest("aside, [role=dialog]")) return;
      e.preventDefault();
      const view = viewRef.current;
      if (!view || gateRef.current) return;
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
      if (view.busy()) return;
      wheelAcc += delta;
      if (Math.abs(wheelAcc) < 30) return;
      if (wheelAcc > 0) view.next();
      else view.prev();
      wheelAcc = 0;
      lockedAt = now;
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element).closest?.("input, textarea, select, [contenteditable]") || gateRef.current) return;
      if (e.key === "ArrowRight") viewRef.current?.next();
      if (e.key === "ArrowLeft") viewRef.current?.prev();
      if (e.key === "Escape") setThumbsOpen(false);
    };
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement);
    root.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      root.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, []);

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

  const goTo = (i: number) => viewRef.current?.goTo(i);

  const onElementAction = useCallback((a: ElementAction) => {
    if (a.kind === "page") viewRef.current?.flip(a.page - 1);
    else setPopup(a);
  }, []);
  const closePopup = useCallback(() => setPopup(null), []);
  const onReady = useCallback(() => setReady(true), []);

  // Trang đang hiện (index từ 0): chỉ các trang này mới nhúng video / phát âm thanh
  const isVisible = (i: number) => i === page || (spread && i === page + 1);
  const renderLayer = (i: number) => {
    const els = byPage.get(i + 1);
    return els ? <ElementLayer elements={els} active={isVisible(i) && !gate} onAction={onElementAction} /> : null;
  };

  const View = PAGE_FLIP_STYLES.includes(settings.flip) ? PageFlipView : SlideView;
  const toolClass = `flex size-9 items-center justify-center rounded-lg transition ${t.tool}`;

  return (
    <div
      ref={rootRef}
      className={`relative flex h-dvh flex-col overflow-hidden ${t.root}`}
      style={
        {
          background: backgroundCss(settings.background, settings.theme),
          fontFamily: FONT_FAMILY[settings.font],
          "--accent": settings.accent,
          "--slider-track": t.track,
          "--page-brightness": settings.brightness,
        } as React.CSSProperties
      }
    >
      {settings.background.kind === "blur" && total > 0 && (
        // Ảnh bìa làm mờ phủ kín nền
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pageUrls[0]} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover brightness-50 blur-3xl" />
      )}

      {/* Thanh trên */}
      <header className="relative z-20 flex h-14 shrink-0 items-center gap-2 px-2 sm:px-4">
        {/* Chỉ root mới có đường về thư viện; người được share link chỉ xem cuốn này */}
        {session && !preview && (
          <Link href="/" className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm transition ${t.tool}`}>
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Thư viện</span>
          </Link>
        )}
        {settings.logo && <Logo src={settings.logo} href={settings.logoHref} />}
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-sm font-medium sm:text-[15px]" title={book.title}>
            {book.title}
          </h1>
          <p className={`truncate text-xs ${t.muted}`}>
            {total} trang
            {settings.branding && (
              <>
                {" · "}
                <a href="/" target="_blank" rel="noreferrer" className="hover:underline">
                  Tạo bằng Flipbook
                </a>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center">
          {session && !preview && (
            <Link href={`/edit/${book.id}`} title="Chỉnh sửa" aria-label="Chỉnh sửa" className={`${toolClass} max-sm:hidden`}>
              <PencilRuler className="size-[18px]" />
            </Link>
          )}
          <ToolButton label="Danh sách trang" active={thumbsOpen} onClick={() => setThumbsOpen((v) => !v)} className={toolClass} activeClass={t.toolActive}>
            <LayoutGrid className="size-[18px]" />
          </ToolButton>
          {musicSrc && (
            <ToolButton label={musicPlaying ? "Tắt nhạc nền" : "Bật nhạc nền"} active={musicPlaying} onClick={toggleMusic} className={`${toolClass} max-sm:hidden`} activeClass={t.toolActive}>
              <Music className="size-[18px]" />
            </ToolButton>
          )}
          {sound !== "off" && (
            <ToolButton label={muted ? "Bật âm thanh lật trang" : "Tắt âm thanh lật trang"} onClick={() => setFlipSoundMuted(!muted)} className={`${toolClass} max-sm:hidden`}>
              {muted ? <VolumeX className="size-[18px]" /> : <Volume2 className="size-[18px]" />}
            </ToolButton>
          )}
          <ToolButton label="Chia sẻ" onClick={share} className={`${toolClass} max-sm:hidden`}>
            <Share2 className="size-[18px]" />
          </ToolButton>
          {book.has_pdf && (
            <a href={pdfUrl(book)} target="_blank" rel="noreferrer" title="Tải PDF gốc" aria-label="Tải PDF gốc" className={`${toolClass} max-sm:hidden`}>
              <Download className="size-[18px]" />
            </a>
          )}
          <ToolButton label={fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"} onClick={toggleFullscreen} className={`${toolClass} max-sm:hidden`}>
            {fullscreen ? <Minimize className="size-[18px]" /> : <Maximize className="size-[18px]" />}
          </ToolButton>

          {/* Màn hình hẹp: gom các nút phụ vào menu để tên sách không bị cắt */}
          <div className="relative sm:hidden">
            <ToolButton label="Thêm" active={moreOpen} onClick={() => setMoreOpen((v) => !v)} className={toolClass} activeClass={t.toolActive}>
              <EllipsisVertical className="size-[18px]" />
            </ToolButton>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
                <div
                  role="menu"
                  onClick={() => setMoreOpen(false)}
                  className={`absolute top-11 right-0 z-40 flex w-56 flex-col rounded-xl border p-1.5 shadow-xl backdrop-blur-xl [animation:fade-in_.12s] ${t.panel}`}
                >
                  {session && !preview && (
                    <Link href={`/edit/${book.id}`} role="menuitem" className={`${menuItem} ${t.tool}`}>
                      <PencilRuler className="size-4" /> Chỉnh sửa
                    </Link>
                  )}
                  {musicSrc && (
                    <button type="button" role="menuitem" onClick={toggleMusic} className={`${menuItem} ${t.tool}`}>
                      <Music className="size-4" /> {musicPlaying ? "Tắt nhạc nền" : "Bật nhạc nền"}
                    </button>
                  )}
                  {sound !== "off" && (
                    <button type="button" role="menuitem" onClick={() => setFlipSoundMuted(!muted)} className={`${menuItem} ${t.tool}`}>
                      {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                      {muted ? "Bật tiếng lật trang" : "Tắt tiếng lật trang"}
                    </button>
                  )}
                  <button type="button" role="menuitem" onClick={share} className={`${menuItem} ${t.tool}`}>
                    <Share2 className="size-4" /> Chia sẻ
                  </button>
                  {book.has_pdf && (
                    <a href={pdfUrl(book)} target="_blank" rel="noreferrer" role="menuitem" className={`${menuItem} ${t.tool}`}>
                      <Download className="size-4" /> Tải PDF gốc
                    </a>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Khu vực sách */}
      <div className="relative flex min-h-0 flex-1">
        <View
          key={settings.flip}
          book={book}
          settings={settings}
          pageUrls={pageUrls}
          renderLayer={renderLayer}
          onPage={setPage}
          onPortrait={setPortrait}
          onReady={onReady}
          onFlip={onFlip}
          handleRef={viewRef}
        />
        {!ready && (
          <div className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm ${t.muted}`}>
            <Loader2 className="size-7 animate-spin" />
            Đang mở sách…
          </div>
        )}

        <NavButton side="left" disabled={atStart} onClick={() => viewRef.current?.prev()} className={t.nav} />
        <NavButton side="right" disabled={atEnd} onClick={() => viewRef.current?.next()} className={t.nav} />

        {/* Bảng thumbnail */}
        {thumbsOpen && (
          <>
            <div className="absolute inset-0 z-20 bg-black/40 [animation:fade-in_.15s] sm:hidden" onClick={() => setThumbsOpen(false)} />
            <aside className={`absolute inset-y-0 right-0 z-30 flex w-72 max-w-[85vw] flex-col border-l backdrop-blur-xl [animation:fade-in_.15s] ${t.panel}`}>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium">Tất cả trang</span>
                <button onClick={() => setThumbsOpen(false)} className={`rounded-md p-1 ${t.tool}`} aria-label="Đóng">
                  <X className="size-4" />
                </button>
              </div>
              <div className="grid flex-1 grid-cols-2 content-start gap-3 overflow-y-auto px-4 pb-4">
                {pageUrls.map((url, i) => {
                  const current = isVisible(i);
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
                        className={`overflow-hidden rounded bg-zinc-800 ring-2 transition ${current ? "" : "ring-transparent group-hover:ring-white/30"}`}
                        style={{
                          aspectRatio: `${book.page_width} / ${book.page_height}`,
                          ...(current ? { "--tw-ring-color": "var(--accent)" } : {}),
                        } as React.CSSProperties}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
                      </div>
                      <span className={`mt-1 block text-xs ${current ? "font-medium" : t.muted}`} style={current ? { color: "var(--accent)" } : undefined}>
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

      <ElementPopup action={popup} onClose={closePopup} />
      {gate && (
        <LeadGate
          bookId={book.id}
          form={lead}
          page={lead.page}
          preview={preview}
          onDone={() => setLeadPassed(true)}
          onSkip={() => setLeadPassed(true)}
        />
      )}
      {musicSrc && (
        <audio
          ref={musicRef}
          src={musicSrc}
          loop
          preload="none"
          onPlay={() => setMusicPlaying(true)}
          onPause={() => setMusicPlaying(false)}
        />
      )}

      {/* Thanh dưới */}
      {/* Máy có chuột: chỉ hiện khi rê chuột vào vùng dưới cùng. Màn hình cảm ứng không có hover nên luôn hiện. */}
      <footer className="group relative z-10 flex h-16 shrink-0 items-center justify-center px-4">
        <div
          className={`flex w-full max-w-lg items-center gap-3 rounded-full px-4 py-2 ring-1 backdrop-blur transition-opacity duration-300 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100 ${t.pill}`}
        >
          <button onClick={() => viewRef.current?.prev()} disabled={atStart} className={`rounded-full p-1 disabled:opacity-30 sm:hidden ${t.tool}`} aria-label="Trang trước">
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
          <span className={`min-w-16 text-right text-sm tabular-nums ${t.muted}`}>
            <span className={`font-medium ${t.root}`}>{label}</span> / {total}
          </span>
          <button onClick={() => viewRef.current?.next()} disabled={atEnd} className={`rounded-full p-1 disabled:opacity-30 sm:hidden ${t.tool}`} aria-label="Trang sau">
            <ChevronRight className="size-5" />
          </button>
        </div>
      </footer>
    </div>
  );
}

const noopSubscribe = () => () => {};
const menuItem = "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm";

function Logo({ src, href }: { src: string; href: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  const img = <img src={src} alt="Logo" className="h-7 max-w-16 object-contain sm:h-8 sm:max-w-36" />;
  const url = href.trim() ? (/^[a-z][a-z0-9+.-]*:/i.test(href.trim()) ? href.trim() : `https://${href.trim()}`) : null;
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="shrink-0 px-1">
      {img}
    </a>
  ) : (
    <span className="shrink-0 px-1">{img}</span>
  );
}

function ToolButton({
  label,
  active,
  className,
  activeClass = "",
  children,
  onClick,
}: {
  label: string;
  active?: boolean;
  className: string;
  activeClass?: string;
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
      className={`${className} ${active ? activeClass : ""}`}
    >
      {children}
    </button>
  );
}

function NavButton({ side, disabled, onClick, className }: { side: "left" | "right"; disabled: boolean; onClick: () => void; className: string }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Trang trước" : "Trang sau"}
      className={`absolute top-1/2 z-10 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full ring-1 backdrop-blur transition hover:scale-105 disabled:pointer-events-none disabled:opacity-0 sm:flex ${className} ${
        side === "left" ? "left-4" : "right-4"
      }`}
    >
      <Icon className="size-6" />
    </button>
  );
}
