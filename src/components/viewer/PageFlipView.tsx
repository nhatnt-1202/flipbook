"use client";

import "page-flip/src/Style/stPageFlip.css";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PageFlip } from "page-flip";
import type { ViewProps } from "./types";

// Mỗi trang phải rộng ít nhất chừng này mới hiển thị 2 trang đôi; nhỏ hơn thì chuyển sang 1 trang (mobile).
const MIN_PAGE_WIDTH = 300;
// Số trang tải trước quanh trang hiện tại
const PRELOAD_BEHIND = 2;
const PRELOAD_AHEAD = 6;
// Nhảy tới trang xa (link, thumbnail, thanh trượt): chờ ảnh trang đích tải xong tối đa chừng này rồi mới chuyển
const JUMP_WAIT_MS = 1500;
// Thời gian lật một trang (ms); hiệu ứng trượt bìa vào giữa dùng cùng thời gian để chạy đồng bộ
export const FLIP_MS = 800;
// Độ dày tối đa (px) của cạnh sách mỗi bên, kiểu bìa cứng
const MAX_EDGE = 14;

/** Kiểu lật magazine / hardcover / album, dùng thư viện page-flip (lật cong giấy). */
export default function PageFlipView({ book, settings, pageUrls, renderLayer, onPage, onPortrait, onReady, onFlip, handleRef }: ViewProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<PageFlip | null>(null);
  const [page, setPage] = useState(0);
  const [portrait, setPortrait] = useState(false);
  const [ready, setReady] = useState({ flip: false, cover: false });
  const [flipState, setFlipState] = useState("read");
  // Lớp phủ trên từng trang (tạo cùng trang cho page-flip), React vẽ phần tử tương tác vào đó bằng portal
  const [overlays, setOverlays] = useState<HTMLDivElement[]>([]);
  const total = pageUrls.length;
  const { flip: style, display, shadow } = settings;

  // Callback mới nhất cho các handler gắn một lần lúc tạo sách
  const cb = useRef({ onPage, onPortrait, onReady, onFlip });
  useLayoutEffect(() => {
    cb.current = { onPage, onPortrait, onReady, onFlip };
  });

  // Tính kích thước sách vừa khít khung hiển thị. page-flip tự suy chiều cao từ chiều rộng container.
  const fit = useCallback(() => {
    const stage = stageRef.current;
    const sizer = sizerRef.current;
    if (!stage || !sizer) return;
    const ratio = book.page_width / book.page_height;
    // clientWidth/Height tính cả padding, trừ ra để sách không tràn vào vùng nút điều hướng
    const cs = getComputedStyle(stage);
    const edges = style === "hardcover" ? MAX_EDGE * 2 : 0;
    const w = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - edges;
    const h = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    let width: number;
    if (display === "single") width = Math.min(w, h * ratio);
    else if (display === "double") width = Math.min(w, h * ratio * 2);
    else {
      width = Math.min(w, h * ratio * 2);
      if (width < MIN_PAGE_WIDTH * 2) width = Math.min(w, h * ratio);
    }
    sizer.style.width = `${Math.floor(width)}px`;
  }, [book.page_width, book.page_height, display, style]);

  // Chỉ dựng lại sách khi danh sách trang / kiểu lật đổi (không phải mỗi lần component cha render)
  const urlsKey = pageUrls.join("|");

  useEffect(() => {
    let cancelled = false;
    const mount = mountRef.current!;
    const urls = urlsKey.split("|");
    // page-flip xóa luôn element gốc khi destroy(), nên tạo element mới mỗi lần mount
    const el = document.createElement("div");
    mount.appendChild(el);

    const imgs: HTMLImageElement[] = [];
    const layers: HTMLDivElement[] = [];
    // Bấm vào phần tử (link, video...) thì không để page-flip và handler chạm bên dưới coi là lật trang.
    // Phải chặn bằng listener gốc: sự kiện React trong portal chỉ tới được root của React sau khi đã qua page-flip.
    const stopOnElement = (e: Event) => {
      if ((e.target as Element).closest?.("[data-el]")) e.stopPropagation();
    };
    const pages = urls.map((url, i) => {
      const div = document.createElement("div");
      div.className = "bg-white";
      const isCover = i === 0 || i === urls.length - 1;
      if (style === "album" || isCover) div.dataset.density = "hard";
      if (style === "hardcover" && isCover) div.style.boxShadow = "inset 0 0 0 3px rgb(0 0 0 / 0.18)";
      const img = document.createElement("img");
      img.dataset.src = url;
      img.alt = `Trang ${i + 1}`;
      img.draggable = false;
      img.className = "block h-full w-full object-contain select-none";
      img.style.filter = "brightness(var(--page-brightness, 1))";
      div.appendChild(img);
      imgs.push(img);
      const layer = document.createElement("div");
      layer.className = "pointer-events-none absolute inset-0";
      layer.style.containerType = "size";
      for (const type of ["mousedown", "touchstart", "pointerdown"]) layer.addEventListener(type, stopOnElement);
      div.appendChild(layer);
      layers.push(layer);
      return div;
    });
    const load = (img: HTMLImageElement) => {
      if (!img.src) img.src = img.dataset.src!;
    };
    const loaded = (img: HTMLImageElement) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((res) => {
            img.addEventListener("load", () => res(), { once: true });
            img.addEventListener("error", () => res(), { once: true });
          });

    const preload = (index: number) => {
      for (let i = Math.max(0, index - PRELOAD_BEHIND); i <= Math.min(imgs.length - 1, index + PRELOAD_AHEAD); i++) load(imgs[i]);
    };

    // Sau khi hiện bìa, tải dần các trang còn lại (lần lượt, ưu tiên thấp) để nhảy trang xa không bị trắng
    const loadRest = async () => {
      for (const img of imgs) {
        if (cancelled) return;
        if (img.src) continue;
        img.fetchPriority = "low";
        load(img);
        await loaded(img);
      }
    };

    const ready = () => {
      if (cancelled) return;
      setReady((r) => ({ ...r, cover: true }));
      loadRest();
    };
    imgs[0].onload = imgs[0].onerror = ready;

    fit();
    preload(0);

    // Nhảy trang: tải trước các trang sẽ hiện (cả trang đôi bên cạnh), chờ xong hoặc hết JUMP_WAIT_MS rồi mới chuyển.
    // Chỉ lần nhảy gần nhất được thực hiện (kéo thanh trượt liên tục).
    let jump = 0;
    const jumpTo = (i: number, animate: boolean) => {
      const target = Math.max(0, Math.min(imgs.length - 1, i));
      const id = ++jump;
      // Các trang sẽ hiện tải trước với ưu tiên cao, rồi mới tới các trang lân cận
      const shown = imgs.slice(Math.max(0, target - 1), target + 2);
      for (const img of shown) {
        if (!img.src) img.fetchPriority = "high";
        load(img);
      }
      preload(target);
      Promise.race([
        Promise.all(shown.map(loaded)),
        new Promise((res) => setTimeout(res, JUMP_WAIT_MS)),
      ]).then(() => {
        const flip = flipRef.current;
        if (cancelled || id !== jump || !flip) return;
        if (animate) flip.flip(target);
        else flip.turnToPage(target);
      });
    };

    import("page-flip").then(({ PageFlip }) => {
      if (cancelled) return;
      const flip = new PageFlip(el, {
        width: book.page_width,
        height: book.page_height,
        size: "stretch",
        // page-flip chuyển 1 trang khi khung hẹp hơn 2 × minWidth: đặt rất lớn để luôn 1 trang.
        // Luôn 2 trang: đặt nhỏ, vì thư viện gắn min-width = 2 × minWidth làm sách tràn màn hình hẹp.
        minWidth: display === "single" ? 100_000 : display === "double" ? 50 : MIN_PAGE_WIDTH,
        maxWidth: 4000,
        minHeight: 100,
        maxHeight: 6000,
        showCover: true,
        usePortrait: display !== "double",
        mobileScrollSupport: false,
        maxShadowOpacity: shadow,
        flippingTime: FLIP_MS,
      });
      // ...và bỏ min-width mà thư viện gắn theo minWidth ở trên
      if (display === "single") el.style.minWidth = "0";
      flip.on("flip", (e) => {
        setPage(e.data);
        cb.current.onPage(e.data);
        preload(e.data);
      });
      flip.on("changeState", (e) => {
        setFlipState(e.data);
        if (e.data === "flipping") cb.current.onFlip();
      });
      const orientation = () => {
        const p = flip.getOrientation() === "portrait";
        setPortrait(p);
        cb.current.onPortrait(p);
      };
      flip.on("init", () => {
        orientation();
        setReady((r) => ({ ...r, flip: true }));
      });
      flip.on("changeOrientation", orientation);
      flip.loadFromHTML(pages);
      setOverlays(layers);
      patchPortraitBack(flip); // flipController chỉ có sau loadFromHTML
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

    const onResize = () => fit();
    window.addEventListener("resize", onResize);

    handleRef.current = {
      next: () => flipRef.current?.flipNext(),
      prev: () => flipRef.current?.flipPrev(),
      goTo: (i) => jumpTo(i, false),
      flip: (i) => jumpTo(i, true),
      busy: () => (flipRef.current?.getState() ?? "read") !== "read",
    };

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerup", onPointerUp);
      flipRef.current?.destroy();
      flipRef.current = null;
      handleRef.current = null;
      el.remove();
      setOverlays([]);
      setPage(0);
      setReady({ flip: false, cover: false });
      cb.current.onPage(0);
    };
  }, [urlsKey, book.page_width, book.page_height, style, display, shadow, fit, handleRef]);

  const isReady = ready.flip && ready.cover;
  useEffect(() => {
    if (isReady) cb.current.onReady();
  }, [isReady]);

  // Chế độ 2 trang: bìa trước chỉ chiếm nửa phải, bìa sau (khi tổng số trang chẵn) chỉ chiếm nửa trái.
  // Dịch sách 1/4 chiều rộng để trang đơn nằm giữa; khi bắt đầu lật ra khỏi bìa thì trượt về vị trí 2 trang.
  const onCover = !portrait && page === 0;
  const onBackCover = !portrait && total > 1 && total % 2 === 0 && page === total - 1;
  const leaving = flipState === "flipping";
  const shift = leaving ? 0 : onCover ? -25 : onBackCover ? 25 : 0;
  const spread = !portrait && page > 0 && page < total - 1;

  // Bìa cứng: cạnh sách hai bên dày theo số trang đã đọc / còn lại
  const read = spread ? page + 1 : page;
  const left = total > 1 ? Math.round((read / (total - 1)) * MAX_EDGE) : 0;
  const right = total > 1 ? Math.round(((total - 1 - read) / (total - 1)) * MAX_EDGE) : 0;

  return (
    <div ref={stageRef} className="relative flex min-w-0 flex-1 items-center justify-center px-3 py-2 sm:px-20 sm:py-4">
      <div
        ref={sizerRef}
        className={`relative cursor-pointer select-none ${isReady ? "opacity-100" : "opacity-0"}`}
        style={{
          transform: `translateX(${shift}%)`,
          transition: `transform ${FLIP_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity 500ms`,
        }}
      >
        {style === "hardcover" && isReady && (
          <>
            {!portrait && left > 0 && !onCover && <Edge side="left" width={left} />}
            {right > 0 && !onBackCover && <Edge side="right" width={right} />}
          </>
        )}
        <div ref={mountRef} />
      </div>
      {overlays.map((layer, i) => createPortal(renderLayer(i), layer, i))}
    </div>
  );
}

// Các mép giấy xếp chồng bên cạnh sách
function Edge({ side, width }: { side: "left" | "right"; width: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-[3px] transition-[width] duration-500"
      style={{
        [side]: -width,
        width,
        borderRadius: side === "left" ? "3px 0 0 3px" : "0 3px 3px 0",
        background:
          "repeating-linear-gradient(90deg, #f5f5f4 0 1px, #d6d3d1 1px 2px), linear-gradient(#fff, #e7e5e4)",
        boxShadow: "0 4px 10px rgb(0 0 0 / 0.35)",
      }}
    />
  );
}

// Chế độ 1 trang (mobile): thư viện lật lui bằng cách kéo trang trước vào từ "trang trái" ảo — vùng đó nằm ngoài
// màn hình nên chỉ thấy một trang phẳng trượt vào, không có nếp cong giấy.
// Thay bằng lật tới chạy ngược: về ngay trang trước ở trạng thái đã lật hẳn sang trái, rồi đưa mép trang trở lại
// bên phải (phủ lên trang đang xem). Nhờ vậy lật lui trông y như lật tới, chỉ ngược chiều.
// Thư viện có 3 đường lật lui, vá cả 3:
//   • flipPrev: nút ‹, phím ←, lăn chuột, chạm nhanh, vuốt nhanh
//   • flipController.flip: nhấn giữ rồi thả ở nửa trái
//   • flipController.fold: kéo trang bằng ngón tay / chuột
function patchPortraitBack(flip: PageFlip) {
  const fc = flip.getFlipController();
  const libFlipPrev = flip.flipPrev.bind(flip);
  const libFlip = fc.flip.bind(fc);
  const libFold = fc.fold.bind(fc);

  // Điểm chạm (tọa độ trong khung sách) có rơi vào vùng lật lui của thư viện không: 40% bên trái trang
  const isBackPoint = (pos: { x: number }) => {
    const rect = flip.getRender().getRect();
    return pos.x - rect.left - rect.pageWidth <= (rect.pageWidth * 2) / 5;
  };
  const active = () => flip.getOrientation() === "portrait" && flip.getCurrentPageIndex() > 0;

  flip.flipPrev = (corner = "top") => {
    if (!active() || !flipBackPortrait(flip, corner)) libFlipPrev(corner);
  };
  fc.flip = (pos) => {
    const rect = flip.getRender().getRect();
    const corner = pos.y - rect.top >= rect.height / 2 ? "bottom" : "top";
    if (!active() || !isBackPoint(pos) || !flipBackPortrait(flip, corner)) libFlip(pos);
  };
  fc.fold = (pos) => {
    // Lần đầu chạm để kéo: đổi sang "lật tới trang trước"; các lần sau góc trang cứ bám theo ngón tay
    if (!fc.calc && active() && isBackPoint(pos) && flip.getState() === "read") {
      const index = flip.getCurrentPageIndex();
      flip.turnToPage(index - 1);
      if (!startForward(flip, pos.y)) {
        flip.turnToPage(index);
        return libFold(pos);
      }
    }
    libFold(pos);
  };
}

// Bắt đầu một lần lật tới từ mép phải (giống flipNext của thư viện) để trang hiện tại làm trang đang lật
function startForward(flip: PageFlip, y: number) {
  const fc = flip.getFlipController();
  const rect = flip.getRender().getRect();
  return fc.start({ x: rect.left + rect.pageWidth * 2 - 10, y }) && !!fc.calc;
}

function flipBackPortrait(flip: PageFlip, corner: "top" | "bottom") {
  const index = flip.getCurrentPageIndex();
  if (index <= 0 || flip.getState() !== "read") return false;
  const fc = flip.getFlipController();
  const rect = flip.getRender().getRect();

  flip.turnToPage(index - 1);
  if (!startForward(flip, rect.top + (corner === "top" ? 1 : rect.height - 2)) || !fc.calc) {
    flip.turnToPage(index);
    return false;
  }
  fc.setState("flipping");
  // Ngược đường đi của flipNext: từ vị trí đã lật hẳn (-pageWidth) về gần góc phải
  const margin = rect.height / 10;
  const from = { x: -rect.pageWidth, y: corner === "bottom" ? rect.height : 0 };
  const to = { x: rect.pageWidth - margin, y: corner === "bottom" ? rect.height - margin : margin };
  fc.calc.calc(from);
  fc.animateFlippingTo(from, to, false);
  return true;
}
