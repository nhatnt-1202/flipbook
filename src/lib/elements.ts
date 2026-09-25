// Phần tử tương tác chồng lên trang sách (lưu trong cột books.elements).
// Tọa độ x, y, w, h theo tỉ lệ 0–1 so với kích thước trang, nên khớp mọi kích thước màn hình.

export type LinkAction =
  | { kind: "url"; url: string }
  | { kind: "page"; page: number } // số trang, bắt đầu từ 1
  | { kind: "email"; email: string }
  | { kind: "tel"; tel: string };

// Hiệu ứng thu hút chú ý của hotspot (B9)
export type Effect = "none" | "pulse" | "glow" | "blink" | "bounce";

type Base = {
  id: string;
  page: number; // số trang, bắt đầu từ 1
  x: number;
  y: number;
  w: number;
  h: number;
  locked?: boolean;
  effect?: Effect;
};

export type LinkElement = Base & {
  type: "link";
  action: LinkAction;
  // Hiện viền/nền nhạt để người xem biết chỗ bấm được; tắt thì chỉ hiện khi rê chuột
  highlight: boolean;
  color: string;
  // Icon giữa vùng bấm, để người xem nhận ra chỗ bấm được
  icon?: "none" | "link" | "hand" | "play" | "cart" | "info";
  // "pdf": tự nhận từ link có sẵn trong PDF — thay PDF thì các link này được thay theo PDF mới
  source?: "pdf";
};

export type VideoElement = Base & {
  type: "video";
  src: string; // link YouTube / Vimeo hoặc file MP4
  // inline: phát ngay trên trang; popup: hiện nút play, bấm mở khung xem lớn
  mode: "inline" | "popup";
  autoplay: boolean;
};

export type ImageElement = Base & {
  type: "image";
  src: string;
  fit: "contain" | "cover";
  // Bấm vào ảnh mở link (tùy chọn)
  href: string;
};

export type TextElement = Base & {
  type: "text";
  text: string;
  // label: chữ hiển thị trên trang; tooltip: icon, rê chuột/chạm hiện chữ; popup: icon, bấm mở hộp chữ
  mode: "label" | "tooltip" | "popup";
  color: string;
  background: string; // "" = trong suốt
  size: number; // cỡ chữ theo % chiều cao trang, để phóng to/thu nhỏ cùng sách
  align: "left" | "center" | "right";
  bold: boolean;
};

export type AudioElement = Base & {
  type: "audio";
  src: string; // file mp3 đã tải lên hoặc link
  // button: nút phát trên trang · auto: tự phát khi mở tới trang này (vẫn có nút để tạm dừng)
  mode: "button" | "auto";
  loop: boolean;
  color: string;
};

export type IframeElement = Base & {
  type: "iframe";
  src: string; // URL, hoặc mã nhúng <iframe …> (lấy thuộc tính src)
  mode: "inline" | "popup";
};

export type ProductElement = Base & {
  type: "product";
  name: string;
  price: string; // chuỗi tự do để giữ định dạng: "199.000đ", "$25"
  oldPrice: string;
  image: string;
  description: string;
  url: string; // link mua hàng
  button: string; // chữ trên nút mua
  color: string;
};

export type BookElement =
  | LinkElement
  | VideoElement
  | ImageElement
  | TextElement
  | AudioElement
  | IframeElement
  | ProductElement;
export type ElementType = BookElement["type"];

export const ELEMENT_LABEL: Record<ElementType, string> = {
  link: "Link",
  video: "Video",
  image: "Ảnh",
  text: "Chữ",
  audio: "Âm thanh",
  iframe: "Nhúng web",
  product: "Sản phẩm",
};

export const EFFECTS: { value: Effect; label: string }[] = [
  { value: "none", label: "Không" },
  { value: "pulse", label: "Tỏa sóng" },
  { value: "glow", label: "Phát sáng" },
  { value: "blink", label: "Nhấp nháy" },
  { value: "bounce", label: "Nảy" },
];

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

// Phần tử mặc định khi bấm nút thêm trong editor: đặt giữa trang
export function createElement(type: ElementType, page: number, pageRatio: number): BookElement {
  const base = { id: newId(), page };
  // Giữ hình dạng hợp lý bất kể tỉ lệ trang: w tính theo chiều rộng, h theo chiều cao
  const box = (w: number, aspect: number) => {
    const h = Math.min(0.8, (w * pageRatio) / aspect);
    return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  };
  switch (type) {
    case "link":
      return { ...base, ...box(0.3, 3), type, action: { kind: "url", url: "" }, highlight: true, color: "#6366f1" };
    case "video":
      return { ...base, ...box(0.6, 16 / 9), type, src: "", mode: "inline", autoplay: false };
    case "image":
      return { ...base, ...box(0.4, 1), type, src: "", fit: "contain", href: "" };
    case "text":
      return {
        ...base,
        ...box(0.5, 4),
        type,
        text: "Nhập nội dung",
        mode: "label",
        color: "#111827",
        background: "",
        size: 3,
        align: "left",
        bold: false,
      };
    case "audio":
      return { ...base, ...box(0.1, 1), type, src: "", mode: "button", loop: false, color: "#6366f1" };
    case "iframe":
      return { ...base, ...box(0.6, 4 / 3), type, src: "", mode: "inline" };
    case "product":
      return {
        ...base,
        ...box(0.1, 1),
        type,
        name: "Tên sản phẩm",
        price: "",
        oldPrice: "",
        image: "",
        description: "",
        url: "",
        button: "Mua ngay",
        color: "#e11d48",
        effect: "pulse",
      };
  }
}

// Ô nhập của phần tử iframe nhận cả URL lẫn mã nhúng: lấy URL thật, chỉ cho http(s)
export function iframeSrc(value: string): string | null {
  const v = value.trim();
  const fromTag = v.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i)?.[1];
  const url = (fromTag ?? v).replace(/&amp;/g, "&");
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

// Link YouTube / Vimeo → URL nhúng iframe. null = không nhận ra (dùng thẻ <video> cho file MP4).
// Trình duyệt chỉ cho tự phát khi tắt tiếng, trừ khi người xem vừa bấm (popup) → muted mặc định theo autoplay.
export function videoEmbedUrl(src: string, autoplay: boolean, muted = autoplay): string | null {
  let url: URL;
  try {
    url = new URL(src.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, "");
  const ap = autoplay ? "1" : "0";
  const mu = muted ? "1" : "0";
  let yt: string | null = null;
  if (host === "youtu.be") yt = url.pathname.slice(1);
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    yt = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] ?? null;
  }
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt}?autoplay=${ap}&mute=${mu}&rel=0&playsinline=1`;
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.match(/(\d+)/)?.[1];
    if (id) return `https://player.vimeo.com/video/${id}?autoplay=${ap}&muted=${mu}`;
  }
  return null;
}

export function linkHref(action: LinkAction): string | null {
  switch (action.kind) {
    case "url": {
      const u = action.url.trim();
      if (!u) return null;
      return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
    }
    case "email":
      return action.email.trim() ? `mailto:${action.email.trim()}` : null;
    case "tel":
      return action.tel.trim() ? `tel:${action.tel.replace(/[^\d+]/g, "")}` : null;
    case "page":
      return null;
  }
}

// Dữ liệu trong DB có thể cũ/thiếu trường: bỏ phần tử hỏng thay vì làm vỡ trang xem
export function parseElements(raw: unknown): BookElement[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is BookElement =>
      !!e &&
      typeof e === "object" &&
      typeof e.id === "string" &&
      typeof e.page === "number" &&
      ["x", "y", "w", "h"].every((k) => typeof e[k] === "number") &&
      e.type in ELEMENT_LABEL,
  );
}
