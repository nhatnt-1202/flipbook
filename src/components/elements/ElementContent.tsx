"use client";

import {
  ExternalLink,
  Globe,
  Hand,
  ImageIcon,
  Info,
  Link2,
  MessageSquareText,
  Pause,
  Play,
  ShoppingBag,
  ShoppingCart,
  Video,
  Volume2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  iframeSrc,
  linkHref,
  videoEmbedUrl,
  type AudioElement,
  type BookElement,
  type IframeElement,
  type LinkElement,
  type ProductElement,
  type TextElement,
  type VideoElement,
} from "@/lib/elements";

// Hành động cần viewer xử lý bên ngoài trang (nhảy trang, mở popup)
export type ElementAction =
  | { kind: "page"; page: number }
  | { kind: "video"; el: VideoElement }
  | { kind: "text"; el: TextElement }
  | { kind: "iframe"; el: IframeElement }
  | { kind: "product"; el: ProductElement };

const LINK_ICON: Record<NonNullable<LinkElement["icon"]>, React.ElementType | null> = {
  none: null,
  link: Link2,
  hand: Hand,
  play: Play,
  cart: ShoppingCart,
  info: Info,
};

/**
 * Nội dung một phần tử, dùng chung cho viewer và editor.
 *   interactive: viewer — bấm được, phát video; editor thì false (chỉ hiển thị, kéo thả do lớp ngoài lo)
 *   active: trang đang được xem — chỉ nhúng iframe video khi trang hiện ra, tránh tải/phát ở trang ẩn
 * Kích thước chữ/icon theo đơn vị cqh/cqmin của container (lớp phủ trang), nên co giãn cùng sách.
 */
export default function ElementContent({
  el,
  interactive,
  active,
  onAction,
}: {
  el: BookElement;
  interactive: boolean;
  active: boolean;
  onAction?: (a: ElementAction) => void;
}) {
  switch (el.type) {
    case "link": {
      const href = linkHref(el.action);
      const style = {
        "--c": el.color,
      } as React.CSSProperties;
      const cls = `block h-full w-full rounded-[2px] transition ${
        el.highlight
          ? "bg-[color-mix(in_srgb,var(--c)_18%,transparent)] ring-2 ring-[color-mix(in_srgb,var(--c)_70%,transparent)] hover:bg-[color-mix(in_srgb,var(--c)_30%,transparent)]"
          : interactive
            ? "hover:bg-[color-mix(in_srgb,var(--c)_18%,transparent)]"
            : "bg-[color-mix(in_srgb,var(--c)_12%,transparent)] outline-1 outline-dashed outline-[color-mix(in_srgb,var(--c)_60%,transparent)]"
      }`;
      const LinkIcon = LINK_ICON[el.icon ?? "none"];
      const icon = LinkIcon && (
        <span className="pointer-events-none flex h-full w-full items-center justify-center">
          <span
            className="flex aspect-square h-[min(50%,7cqmin)] items-center justify-center rounded-full text-white shadow-md"
            style={{ background: el.color }}
          >
            <LinkIcon className="size-3/5" />
          </span>
        </span>
      );
      if (!interactive) return <div className={cls} style={style}>{icon}</div>;
      const title = el.action.kind === "page" ? `Tới trang ${el.action.page}` : (href ?? "");
      if (el.action.kind === "page") {
        const page = el.action.page;
        return (
          <button type="button" title={title} aria-label={title} className={`${cls} cursor-pointer`} style={style} onClick={() => onAction?.({ kind: "page", page })}>
            {icon}
          </button>
        );
      }
      if (!href) return null;
      return (
        <a
          href={href}
          target={el.action.kind === "url" ? "_blank" : undefined}
          rel="noreferrer"
          title={title}
          aria-label={title}
          className={cls}
          style={style}
        >
          {icon}
        </a>
      );
    }

    case "video": {
      if (!el.src) return <Placeholder icon={<Video />} label="Video" />;
      const embed = videoEmbedUrl(el.src, el.autoplay);
      if (el.mode === "popup" || !interactive) {
        return (
          <button
            type="button"
            disabled={!interactive}
            onClick={() => onAction?.({ kind: "video", el })}
            aria-label="Phát video"
            className="group relative flex h-full w-full cursor-pointer items-center justify-center overflow-hidden rounded bg-black/70 disabled:cursor-default"
          >
            {embed && youtubeThumb(el.src) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={youtubeThumb(el.src)!} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" draggable={false} />
            )}
            <span className="relative flex size-[min(40%,18cqmin)] items-center justify-center rounded-full bg-white/90 text-zinc-900 shadow-lg transition group-hover:scale-110">
              <Play className="size-1/2 translate-x-[6%] fill-current" />
            </span>
          </button>
        );
      }
      if (!active) return <div className="h-full w-full rounded bg-black" />;
      return embed ? (
        <iframe
          src={embed}
          className="h-full w-full rounded bg-black"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          title="Video"
        />
      ) : (
        <video
          src={el.src}
          className="h-full w-full rounded bg-black object-contain"
          controls
          playsInline
          autoPlay={el.autoplay}
          muted={el.autoplay}
          preload="metadata"
        />
      );
    }

    case "image": {
      if (!el.src) return <Placeholder icon={<ImageIcon />} label="Ảnh" />;
      // eslint-disable-next-line @next/next/no-img-element
      const img = <img src={el.src} alt="" draggable={false} className="h-full w-full select-none" style={{ objectFit: el.fit }} />;
      const href = interactive && el.href.trim() ? linkHref({ kind: "url", url: el.href }) : null;
      return href ? (
        <a href={href} target="_blank" rel="noreferrer" className="block h-full w-full">
          {img}
        </a>
      ) : (
        img
      );
    }

    case "text": {
      if (el.mode === "label") {
        return (
          <div
            className="h-full w-full overflow-hidden px-[0.3em] py-[0.15em] leading-snug break-words whitespace-pre-wrap"
            style={{
              color: el.color,
              background: el.background || undefined,
              fontSize: `${el.size}cqh`,
              textAlign: el.align,
              fontWeight: el.bold ? 700 : 400,
            }}
          >
            {el.text}
          </div>
        );
      }
      const Icon = el.mode === "tooltip" ? Info : MessageSquareText;
      const icon = (
        <span
          className="flex aspect-square h-full max-h-full max-w-full items-center justify-center rounded-full text-white shadow-md ring-2 ring-white/80"
          style={{ background: el.background || "#6366f1" }}
        >
          <Icon className="size-3/5" />
        </span>
      );
      if (!interactive) return <div className="flex h-full w-full items-center justify-center">{icon}</div>;
      if (el.mode === "popup") {
        return (
          <button type="button" aria-label="Xem ghi chú" className="flex h-full w-full cursor-pointer items-center justify-center" onClick={() => onAction?.({ kind: "text", el })}>
            {icon}
          </button>
        );
      }
      return (
        <div tabIndex={0} className="group/tip relative flex h-full w-full cursor-help items-center justify-center outline-none">
          {icon}
          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 w-max max-w-[40cqw] -translate-x-1/2 rounded-md bg-zinc-900/95 px-2.5 py-1.5 text-left text-[clamp(11px,2.2cqh,15px)] leading-snug whitespace-pre-wrap text-white opacity-0 shadow-lg transition group-hover/tip:opacity-100 group-focus/tip:opacity-100">
            {el.text}
          </span>
        </div>
      );
    }

    case "audio":
      return <AudioContent el={el} interactive={interactive} active={active} />;

    case "iframe": {
      const src = iframeSrc(el.src);
      if (!src) return <Placeholder icon={<Globe />} label="Nhúng web" />;
      if (!interactive || el.mode === "popup") {
        return (
          <button
            type="button"
            disabled={!interactive}
            onClick={() => onAction?.({ kind: "iframe", el })}
            className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 rounded bg-zinc-100/90 text-[clamp(10px,2cqh,14px)] text-zinc-600 ring-1 ring-zinc-300 disabled:cursor-default [&_svg]:size-[min(40%,8cqmin)]"
          >
            <Globe />
            <span className="max-w-full truncate px-2">{new URL(src).hostname}</span>
          </button>
        );
      }
      if (!active) return <div className="h-full w-full rounded bg-zinc-100" />;
      return (
        <iframe
          src={src}
          className="h-full w-full rounded bg-white"
          allow="autoplay; fullscreen; clipboard-write; encrypted-media; geolocation; picture-in-picture"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          title="Nội dung nhúng"
        />
      );
    }

    case "product": {
      const icon = (
        <span
          className="flex aspect-square h-full max-h-full max-w-full items-center justify-center rounded-full text-white shadow-md ring-2 ring-white/80"
          style={{ background: el.color }}
        >
          <ShoppingBag className="size-1/2" />
        </span>
      );
      if (!interactive) return <div className="flex h-full w-full items-center justify-center">{icon}</div>;
      return (
        <button
          type="button"
          title={el.name}
          aria-label={`Xem sản phẩm ${el.name}`}
          className="flex h-full w-full cursor-pointer items-center justify-center rounded-full"
          onClick={() => onAction?.({ kind: "product", el })}
        >
          {icon}
        </button>
      );
    }
  }
}

// Nút phát âm thanh trên trang. Chế độ auto: tự phát khi trang hiện ra (trình duyệt cho phép vì người xem
// đã bấm/lật trang trước đó), dừng khi rời trang.
function AudioContent({ el, interactive, active }: { el: AudioElement; interactive: boolean; active: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = ref.current;
    if (!audio || !interactive) return;
    if (active && el.mode === "auto") audio.play().catch(() => {});
    // Gán currentTime khi chưa phát sẽ làm trình duyệt tải file (preload="none"), nên chỉ tua lại khi đã phát
    if (!active && audio.currentTime > 0) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, [active, interactive, el.mode, el.src]);

  const Icon = playing ? Pause : Volume2;
  const icon = (
    <span
      className={`flex aspect-square h-full max-h-full max-w-full items-center justify-center rounded-full text-white shadow-md ring-2 ring-white/80 ${
        playing ? "animate-pulse" : ""
      }`}
      style={{ background: el.color }}
    >
      <Icon className="size-1/2" />
    </span>
  );
  if (!interactive || !el.src) return <div className="flex h-full w-full items-center justify-center opacity-90">{icon}</div>;
  return (
    <button
      type="button"
      aria-label={playing ? "Tạm dừng" : "Phát âm thanh"}
      className="flex h-full w-full cursor-pointer items-center justify-center"
      onClick={() => {
        const audio = ref.current!;
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
      }}
    >
      {icon}
      <audio
        ref={ref}
        src={el.src}
        loop={el.loop}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </button>
  );
}

export function ProductCard({ el }: { el: ProductElement }) {
  const href = el.url.trim() ? linkHref({ kind: "url", url: el.url }) : null;
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl bg-white text-zinc-900 shadow-2xl">
      {el.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={el.image} alt={el.name} className="aspect-square w-full bg-zinc-100 object-cover" />
      )}
      <div className="p-5">
        <h3 className="text-lg leading-snug font-semibold">{el.name}</h3>
        {(el.price || el.oldPrice) && (
          <p className="mt-1.5 flex items-baseline gap-2">
            {el.price && (
              <span className="text-xl font-bold" style={{ color: el.color }}>
                {el.price}
              </span>
            )}
            {el.oldPrice && <span className="text-sm text-zinc-400 line-through">{el.oldPrice}</span>}
          </p>
        )}
        {el.description && <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-zinc-600">{el.description}</p>}
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="mt-5 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow transition hover:brightness-110"
            style={{ background: el.color }}
          >
            {el.button || "Mua ngay"}
            <ExternalLink className="size-4" />
          </a>
        )}
      </div>
    </div>
  );
}

function Placeholder({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded bg-zinc-200/80 text-[clamp(10px,2cqh,14px)] text-zinc-500 [&_svg]:size-[min(40%,8cqmin)]">
      {icon}
      {label}
    </div>
  );
}

function youtubeThumb(src: string) {
  const embed = videoEmbedUrl(src, false);
  const id = embed?.match(/youtube-nocookie\.com\/embed\/([^?]+)/)?.[1];
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

