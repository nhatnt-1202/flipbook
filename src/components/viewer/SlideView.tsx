"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ViewProps } from "./types";

const SLIDE_MS = 450;
// Số trang vẽ mỗi bên trang hiện tại (các trang xa hơn không có trong DOM)
const RANGE = 3;
const SWIPE_PX = 50;

/**
 * Kiểu lật slider / coverflow / cards: mỗi lần một trang, chuyển bằng CSS transform.
 * Vuốt / kéo ngang để chuyển trang; chạm nửa phải / trái để tới / lui.
 */
export default function SlideView({ book, settings, pageUrls, renderLayer, onPage, onPortrait, onReady, onFlip, handleRef }: ViewProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState<number | null>(null); // độ lệch (px) khi đang kéo
  const total = pageUrls.length;
  const style = settings.flip;
  const ratio = book.page_width / book.page_height;

  const state = useRef({ index, total, lastChange: 0, dragging: false });
  const cb = useRef({ onPage, onFlip });
  useLayoutEffect(() => {
    state.current.index = index;
    state.current.total = total;
    cb.current = { onPage, onFlip };
  });

  useEffect(() => {
    const stage = stageRef.current!;
    const measure = () => {
      const cs = getComputedStyle(stage);
      const aw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const ah = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      // Coverflow cần chừa chỗ hai bên cho các trang nghiêng
      const maxW = style === "coverflow" ? aw * 0.6 : aw;
      const w = Math.max(50, Math.min(maxW, ah * ratio));
      setSize({ w: Math.floor(w), h: Math.floor(w / ratio) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [ratio, style]);

  useEffect(() => {
    onPortrait(true);
  }, [onPortrait]);

  // Đổi sách / kiểu lật: về trang đầu
  const urlsKey = pageUrls.join("|");
  useEffect(() => {
    const go = (i: number, animate: boolean) => {
      const s = state.current;
      const next = Math.max(0, Math.min(s.total - 1, i));
      if (next === s.index) return;
      if (animate) {
        s.lastChange = Date.now();
        cb.current.onFlip();
      }
      s.index = next;
      setIndex(next);
      cb.current.onPage(next);
    };
    handleRef.current = {
      next: () => go(state.current.index + 1, true),
      prev: () => go(state.current.index - 1, true),
      goTo: (i) => go(i, false),
      flip: (i) => go(i, true),
      busy: () => state.current.dragging || Date.now() - state.current.lastChange < SLIDE_MS,
    };
    const s = state.current;
    return () => {
      handleRef.current = null;
      s.index = 0;
      setIndex(0);
      cb.current.onPage(0);
    };
  }, [urlsKey, style, handleRef]);

  // Kéo / vuốt / chạm
  const down = useRef<{ x: number; y: number; t: number } | null>(null);
  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 || (e.target as Element).closest("[data-el]")) return;
    down.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    state.current.dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = down.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) setDrag(dx);
  }
  function onPointerUp(e: React.PointerEvent) {
    const d = down.current;
    down.current = null;
    state.current.dragging = false;
    setDrag(null);
    if (!d) return;
    const dx = e.clientX - d.x;
    const h = handleRef.current;
    if (!h) return;
    if (Math.abs(dx) > SWIPE_PX) {
      if (dx < 0) h.next();
      else h.prev();
    } else if (Math.hypot(dx, e.clientY - d.y) < 8 && Date.now() - d.t < 500) {
      const rect = stageRef.current!.getBoundingClientRect();
      if (e.clientX > rect.left + rect.width / 2) h.next();
      else h.prev();
    }
  }

  const frac = drag !== null && size.w ? drag / size.w : 0;
  const pages: number[] = [];
  for (let i = Math.max(0, index - RANGE); i <= Math.min(total - 1, index + RANGE); i++) pages.push(i);

  return (
    <div
      ref={stageRef}
      className="relative flex min-w-0 flex-1 touch-pan-y items-center justify-center overflow-hidden px-3 py-2 select-none sm:px-20 sm:py-4"
      style={{ perspective: style === "coverflow" ? 1600 : undefined }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {size.w > 0 &&
        pages.map((i) => {
          const k = i - index;
          const t = cardTransform(style, k, frac);
          return (
            <div
              key={i}
              className="absolute bg-white shadow-[0_10px_40px_-10px_rgb(0_0_0/0.6)]"
              style={{
                width: size.w,
                height: size.h,
                transform: t.transform,
                opacity: t.opacity,
                zIndex: 100 - Math.abs(k) * 2 + (k < 0 ? 1 : 0),
                transition: drag !== null ? "none" : `transform ${SLIDE_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${SLIDE_MS}ms`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pageUrls[i]}
                alt={`Trang ${i + 1}`}
                draggable={false}
                onLoad={i === 0 ? onReady : undefined}
                onError={i === 0 ? onReady : undefined}
                className="pointer-events-none block h-full w-full object-contain"
                style={{ filter: "brightness(var(--page-brightness, 1))" }}
              />
              <div className={`absolute inset-0 ${k === 0 ? "" : "[&_*]:!pointer-events-none"}`} style={{ containerType: "size" }}>
                {renderLayer(i)}
              </div>
            </div>
          );
        })}
    </div>
  );
}

// Vị trí trang thứ k so với trang hiện tại (k < 0: đã qua, k > 0: sắp tới); frac: đang kéo (tỉ lệ bề rộng trang)
function cardTransform(style: string, k: number, frac: number): { transform: string; opacity: number } {
  if (style === "cards") {
    if (k < 0) return { transform: "translateX(-140%) rotate(-12deg)", opacity: 0 };
    if (k === 0) return { transform: `translateX(${frac * 100}%) rotate(${frac * 12}deg)`, opacity: 1 };
    // Trang lùi ra sau, nhích lên khi đang kéo trang trên cùng đi
    const depth = Math.max(0, k - Math.min(1, Math.abs(frac)));
    return { transform: `translateY(${depth * 3}%) scale(${1 - depth * 0.05})`, opacity: k > 3 ? 0 : 1 };
  }
  const pos = k + frac;
  if (style === "coverflow") {
    const a = Math.abs(pos);
    const sign = Math.sign(pos);
    const near = Math.min(1, a); // 0 ở giữa → 1 khi đã sang hẳn một bên
    const x = sign * (near * 55 + Math.max(0, a - 1) * 22);
    return {
      transform: `translateX(${x}%) translateZ(${-near * 180}px) rotateY(${-sign * near * 50}deg)`,
      opacity: a > 3 ? 0 : 1,
    };
  }
  // slider
  return { transform: `translateX(calc(${pos * 100}% + ${pos * 24}px))`, opacity: 1 - Math.min(1, Math.abs(pos)) * 0.55 };
}
