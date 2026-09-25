"use client";

import { Lock } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BookElement } from "@/lib/elements";
import ElementContent from "@/components/elements/ElementContent";
import { boxStyle } from "@/components/elements/ElementLayer";

// Khoảng cách (px trên màn hình) để hít vào mép trang / mép phần tử khác
const SNAP_PX = 6;
const MIN_SIZE = 0.01;
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type Handle = (typeof HANDLES)[number];

type Box = { x: number; y: number; w: number; h: number };
type Guides = { x: number[]; y: number[] };
type Marquee = { x: number; y: number; w: number; h: number };

type Drag =
  | { kind: "move"; ids: string[]; startX: number; startY: number; before: BookElement[]; origin: Map<string, Box> }
  | { kind: "resize"; id: string; handle: Handle; startX: number; startY: number; before: BookElement[]; origin: Box }
  | { kind: "marquee"; startX: number; startY: number; additive: string[] };

/**
 * Một trang trong editor: ảnh trang + phần tử. Chọn (Shift để chọn thêm), kéo để di chuyển,
 * kéo 8 nút để đổi kích thước, kéo trên nền để quét chọn. Giữ Alt để tắt hít.
 */
export default function Canvas({
  imageUrl,
  ratio,
  page,
  elements,
  selected,
  setSelected,
  setElements,
  checkpoint,
  onEditText,
}: {
  imageUrl: string;
  ratio: number; // rộng / cao của trang
  page: number;
  elements: BookElement[];
  selected: string[];
  setSelected: (ids: string[]) => void;
  setElements: (next: BookElement[], record?: boolean) => void;
  checkpoint: (before: BookElement[]) => void;
  onEditText: () => void;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] });
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const dragRef = useRef<Drag | null>(null);
  // Giá trị mới nhất cho handler pointermove (gắn một lần lúc bắt đầu kéo)
  const latest = useRef({ elements, selected, size });
  useLayoutEffect(() => {
    latest.current = { elements, selected, size };
  });

  const pageEls = elements.filter((e) => e.page === page);

  // Trang vừa khít khung, chừa lề
  useEffect(() => {
    const area = areaRef.current!;
    const measure = () => {
      const pad = area.clientWidth < 500 ? 16 : 48;
      const aw = Math.max(50, area.clientWidth - pad);
      const ah = Math.max(50, area.clientHeight - pad);
      const w = Math.min(aw, ah * ratio);
      setSize({ w: Math.floor(w), h: Math.floor(w / ratio) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    return () => ro.disconnect();
  }, [ratio]);

  function begin(drag: Drag, e: React.PointerEvent) {
    dragRef.current = drag;
    const move = (ev: PointerEvent) => onMove(ev);
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      onUp(ev);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    e.preventDefault();
  }

  function onMove(ev: PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const { elements, size } = latest.current;
    const dx = (ev.clientX - drag.startX) / size.w;
    const dy = (ev.clientY - drag.startY) / size.h;
    const snap = !ev.altKey;

    if (drag.kind === "marquee") {
      const rect = pageRef.current!.getBoundingClientRect();
      const x0 = (drag.startX - rect.left) / size.w;
      const y0 = (drag.startY - rect.top) / size.h;
      const x1 = (ev.clientX - rect.left) / size.w;
      const y1 = (ev.clientY - rect.top) / size.h;
      const m = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
      setMarquee(m);
      const hit = elements.filter((el) => el.page === page && intersects(el, m)).map((el) => el.id);
      setSelected([...new Set([...drag.additive, ...hit])]);
      return;
    }

    const targets = snapTargets(elements, page, drag.kind === "move" ? drag.ids : [drag.id]);
    const tx = SNAP_PX / size.w;
    const ty = SNAP_PX / size.h;

    if (drag.kind === "move") {
      if (!drag.ids.length) return;
      const boxes = [...drag.origin.values()];
      const minX = Math.min(...boxes.map((b) => b.x));
      const minY = Math.min(...boxes.map((b) => b.y));
      const maxX = Math.max(...boxes.map((b) => b.x + b.w));
      const maxY = Math.max(...boxes.map((b) => b.y + b.h));
      let mx = clamp(dx, -minX, 1 - maxX);
      let my = clamp(dy, -minY, 1 - maxY);
      const g: Guides = { x: [], y: [] };
      if (snap) {
        const sx = bestSnap([minX + mx, (minX + maxX) / 2 + mx, maxX + mx], targets.x, tx);
        if (sx) {
          mx = clamp(mx + sx.delta, -minX, 1 - maxX);
          g.x.push(sx.at);
        }
        const sy = bestSnap([minY + my, (minY + maxY) / 2 + my, maxY + my], targets.y, ty);
        if (sy) {
          my = clamp(my + sy.delta, -minY, 1 - maxY);
          g.y.push(sy.at);
        }
      }
      setGuides(g);
      setElements(
        drag.before.map((el) => {
          const o = drag.origin.get(el.id);
          return o ? { ...el, x: o.x + mx, y: o.y + my } : el;
        }),
        false,
      );
      return;
    }

    // Đổi kích thước: di chuyển các cạnh theo nút đang kéo
    const o = drag.origin;
    let left = o.x;
    let top = o.y;
    let right = o.x + o.w;
    let bottom = o.y + o.h;
    const g: Guides = { x: [], y: [] };
    const h = drag.handle;
    const edge = (v: number, list: number[], t: number, guideList: number[]) => {
      if (!snap) return v;
      const s = bestSnap([v], list, t);
      if (!s) return v;
      guideList.push(s.at);
      return v + s.delta;
    };
    if (h.includes("w")) left = clamp(edge(o.x + dx, targets.x, tx, g.x), 0, right - MIN_SIZE);
    if (h.includes("e")) right = clamp(edge(o.x + o.w + dx, targets.x, tx, g.x), left + MIN_SIZE, 1);
    if (h.includes("n")) top = clamp(edge(o.y + dy, targets.y, ty, g.y), 0, bottom - MIN_SIZE);
    if (h.includes("s")) bottom = clamp(edge(o.y + o.h + dy, targets.y, ty, g.y), top + MIN_SIZE, 1);
    // Shift + kéo góc: giữ tỉ lệ (tính theo pixel vì trang không vuông)
    if (ev.shiftKey && h.length === 2) {
      const aspect = (o.w * size.w) / (o.h * size.h);
      const w = right - left;
      const hh = (w * size.w) / aspect / size.h;
      if (h.includes("n")) top = Math.max(0, bottom - hh);
      else bottom = Math.min(1, top + hh);
      g.x = [];
      g.y = [];
    }
    setGuides(g);
    setElements(
      drag.before.map((el) => (el.id === drag.id ? { ...el, x: left, y: top, w: right - left, h: bottom - top } : el)),
      false,
    );
  }

  function onUp(ev: PointerEvent) {
    const drag = dragRef.current;
    dragRef.current = null;
    setGuides({ x: [], y: [] });
    setMarquee(null);
    if (!drag || drag.kind === "marquee") return;
    const moved = Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) > 1;
    if (moved) checkpoint(drag.before);
    else setElements(drag.before, false);
  }

  function onElementDown(e: React.PointerEvent, el: BookElement) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const { selected, elements } = latest.current;
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      setSelected(selected.includes(el.id) ? selected.filter((id) => id !== el.id) : [...selected, el.id]);
      return;
    }
    const ids = selected.includes(el.id) ? selected : [el.id];
    setSelected(ids);
    const movable = elements.filter((x) => ids.includes(x.id) && !x.locked);
    begin(
      {
        kind: "move",
        ids: movable.map((x) => x.id),
        startX: e.clientX,
        startY: e.clientY,
        before: elements,
        origin: new Map(movable.map((x) => [x.id, { x: x.x, y: x.y, w: x.w, h: x.h }])),
      },
      e,
    );
  }

  function onHandleDown(e: React.PointerEvent, el: BookElement, handle: Handle) {
    if (e.button !== 0) return;
    e.stopPropagation();
    begin(
      { kind: "resize", id: el.id, handle, startX: e.clientX, startY: e.clientY, before: latest.current.elements, origin: { x: el.x, y: el.y, w: el.w, h: el.h } },
      e,
    );
  }

  function onBackgroundDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const additive = e.shiftKey ? latest.current.selected : [];
    if (!e.shiftKey) setSelected([]);
    begin({ kind: "marquee", startX: e.clientX, startY: e.clientY, additive }, e);
  }

  const single = selected.length === 1 ? pageEls.find((el) => el.id === selected[0]) : undefined;

  // touch-none: kéo thả bằng ngón tay không bị trình duyệt hiểu là cuộn / zoom trang
  return (
    <div ref={areaRef} className="relative flex min-h-0 min-w-0 flex-1 touch-none items-center justify-center overflow-hidden" onPointerDown={onBackgroundDown}>
      <div
        ref={pageRef}
        className="relative bg-white shadow-[0_10px_40px_-10px_rgb(0_0_0/0.5)] select-none"
        style={{ width: size.w, height: size.h, containerType: "size" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={`Trang ${page}`} draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />

        {pageEls.map((el) => {
          const isSel = selected.includes(el.id);
          return (
            <div
              key={el.id}
              className={`absolute ${el.locked ? "cursor-default" : "cursor-move"} ${
                isSel ? "outline-2 outline-brand-500" : "hover:outline-1 hover:outline-brand-400/70"
              }`}
              style={boxStyle(el)}
              onPointerDown={(e) => onElementDown(e, el)}
              onDoubleClick={() => el.type === "text" && onEditText()}
            >
              <div className="pointer-events-none h-full w-full">
                <ElementContent el={el} interactive={false} active={false} />
              </div>
              {el.locked && isSel && (
                <span className="absolute -top-2.5 -right-2.5 rounded-full bg-zinc-800 p-1 text-white shadow">
                  <Lock className="size-3" />
                </span>
              )}
            </div>
          );
        })}

        {single && !single.locked && (
          <div className="pointer-events-none absolute" style={boxStyle(single)}>
            {HANDLES.map((h) => (
              <span
                key={h}
                onPointerDown={(e) => onHandleDown(e, single, h)}
                className="pointer-events-auto absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-brand-600 bg-white shadow"
                style={{ ...handlePos(h), cursor: `${h}-resize` }}
              />
            ))}
          </div>
        )}

        {guides.x.map((x, i) => (
          <div key={`x${i}`} className="pointer-events-none absolute inset-y-0 w-px bg-pink-500" style={{ left: `${x * 100}%` }} />
        ))}
        {guides.y.map((y, i) => (
          <div key={`y${i}`} className="pointer-events-none absolute inset-x-0 h-px bg-pink-500" style={{ top: `${y * 100}%` }} />
        ))}
        {marquee && (
          <div className="pointer-events-none absolute border border-brand-500 bg-brand-500/10" style={boxStyle(marquee)} />
        )}
      </div>
    </div>
  );
}

function handlePos(h: Handle): React.CSSProperties {
  return {
    left: h.includes("w") ? "0%" : h.includes("e") ? "100%" : "50%",
    top: h.includes("n") ? "0%" : h.includes("s") ? "100%" : "50%",
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function intersects(a: Box, b: Box) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Mép trang, giữa trang, và mép/giữa các phần tử khác (không đang kéo) trên cùng trang
function snapTargets(elements: BookElement[], page: number, exclude: string[]) {
  const x = [0, 0.5, 1];
  const y = [0, 0.5, 1];
  for (const el of elements) {
    if (el.page !== page || exclude.includes(el.id)) continue;
    x.push(el.x, el.x + el.w / 2, el.x + el.w);
    y.push(el.y, el.y + el.h / 2, el.y + el.h);
  }
  return { x, y };
}

// Điểm gần nhất trong `values` hít được vào `targets`: trả về độ lệch cần cộng thêm và vị trí đường gióng
function bestSnap(values: number[], targets: number[], threshold: number) {
  let best: { delta: number; at: number } | null = null;
  for (const v of values) {
    for (const t of targets) {
      const d = t - v;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, at: t };
    }
  }
  return best;
}
