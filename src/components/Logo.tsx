import { useId } from "react";

// Logo Flipbook: cuốn sách mở với một trang đang lật. Cùng hình với favicon src/app/icon.svg.
export default function Logo({ className = "size-8" }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className={`shrink-0 drop-shadow-sm ${className}`} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id})`} />
      <g fill="#fff" strokeLinejoin="round">
        {/* Trang trái */}
        <path d="M16 11c-2.8-1.7-5.8-2.1-9-1.4v12.8c3.2-.7 6.2-.3 9 1.4z" />
        {/* Trang phải (nằm dưới trang đang lật) */}
        <path d="M16 11c2.8-1.7 5.8-2.1 9-1.4v12.8c-3.2-.7-6.2-.3-9 1.4z" opacity=".45" />
        {/* Trang đang lật: mép ngoài nhấc lên, cong về phía gáy */}
        <path d="M16 11c1.6-3 4.2-4.9 7.6-5.4-1.2 4.4-1.3 9-.4 13.6-2.9.2-5.3 1.6-7.2 4.6z" />
        {/* Gáy sách */}
        <path d="M16 11v12.8" stroke="#4f46e5" strokeOpacity=".35" strokeWidth=".8" fill="none" />
      </g>
    </svg>
  );
}
