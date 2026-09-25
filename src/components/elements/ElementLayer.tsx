"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { iframeSrc, videoEmbedUrl, type BookElement } from "@/lib/elements";
import ElementContent, { ProductCard, type ElementAction } from "./ElementContent";

// Vị trí phần tử theo % trang
export function boxStyle(el: Pick<BookElement, "x" | "y" | "w" | "h">): React.CSSProperties {
  return { left: `${el.x * 100}%`, top: `${el.y * 100}%`, width: `${el.w * 100}%`, height: `${el.h * 100}%` };
}

// Các phần tử của một trang trong viewer. Đặt trong lớp phủ có container-type: size (xem Flipbook).
export default function ElementLayer({
  elements,
  active,
  onAction,
}: {
  elements: BookElement[];
  active: boolean;
  onAction: (a: ElementAction) => void;
}) {
  return (
    <>
      {elements.map((el) => (
        // data-el: lớp phủ chặn sự kiện chuột ở đây để page-flip không lật trang khi bấm vào phần tử
        // fx-*: hiệu ứng hotspot, định nghĩa trong globals.css
        <div
          key={el.id}
          data-el
          className={`pointer-events-auto absolute ${el.effect && el.effect !== "none" ? `fx-${el.effect}` : ""}`}
          style={boxStyle(el)}
        >
          <ElementContent el={el} interactive active={active} onAction={onAction} />
        </div>
      ))}
    </>
  );
}

// Khung xem lớn cho video (chế độ popup) và ghi chú (chế độ popup)
export function ElementPopup({ action, onClose }: { action: ElementAction | null; onClose: () => void }) {
  useEffect(() => {
    if (!action) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [action, onClose]);

  if (!action || action.kind === "page") return null;
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm [animation:fade-in_.15s]"
      onClick={onClose}
      role="dialog"
      aria-modal
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Đóng"
        className="absolute top-3 right-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="size-5" />
      </button>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-4xl">
        {action.kind === "video" ? (
          <VideoPlayer src={action.el.src} />
        ) : action.kind === "product" ? (
          <ProductCard el={action.el} />
        ) : action.kind === "iframe" ? (
          <iframe
            src={iframeSrc(action.el.src) ?? undefined}
            className="h-[80dvh] w-full rounded-xl bg-white shadow-2xl"
            allow="autoplay; fullscreen; clipboard-write; encrypted-media; geolocation; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            title="Nội dung nhúng"
          />
        ) : (
          <div className="mx-auto max-h-[80dvh] max-w-lg overflow-y-auto rounded-2xl bg-white p-6 text-[15px] leading-relaxed whitespace-pre-wrap text-zinc-800 shadow-2xl">
            {action.el.text}
          </div>
        )}
      </div>
    </div>
  );
}

function VideoPlayer({ src }: { src: string }) {
  const embed = videoEmbedUrl(src, true, false);
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-2xl">
      {embed ? (
        <iframe src={embed} className="h-full w-full" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen title="Video" />
      ) : (
        <video src={src} className="h-full w-full" controls autoPlay playsInline />
      )}
    </div>
  );
}
