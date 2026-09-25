// Giao diện và cấu hình của một cuốn sách (cột books.settings).
// DB có thể chứa bản cũ/thiếu trường, nên luôn đọc qua parseSettings (gộp với mặc định).

// magazine: lật cong giấy, bìa cứng · hardcover: như magazine, thêm độ dày gáy/cạnh sách
// album: mọi trang đều cứng (sách bìa carton) · slider / coverflow / cards: chuyển trang bằng hiệu ứng trượt
export type FlipStyle = "magazine" | "hardcover" | "album" | "slider" | "coverflow" | "cards";

export const FLIP_STYLES: { value: FlipStyle; label: string; hint: string }[] = [
  { value: "magazine", label: "Tạp chí", hint: "Lật cong giấy như tạp chí" },
  { value: "hardcover", label: "Sách bìa cứng", hint: "Có độ dày gáy và cạnh sách" },
  { value: "album", label: "Album", hint: "Mọi trang đều cứng, lật phẳng" },
  { value: "slider", label: "Trượt ngang", hint: "Trang trượt như slide" },
  { value: "coverflow", label: "Coverflow", hint: "Các trang xoay 3D hai bên" },
  { value: "cards", label: "Chồng thẻ", hint: "Trang xếp chồng, rút ra từng tấm" },
];

// Các kiểu dùng thư viện page-flip (còn lại tự vẽ bằng CSS transform)
export const PAGE_FLIP_STYLES: FlipStyle[] = ["magazine", "hardcover", "album"];

export type Background = {
  // default: nền tối mặc định · blur: ảnh bìa làm mờ
  kind: "default" | "color" | "gradient" | "image" | "blur";
  color: string;
  color2: string; // màu thứ hai của gradient
  image: string;
};

export type FlipSound = "paper" | "soft" | "off";

export type LeadForm = {
  enabled: boolean;
  page: number; // 0 = hiện trước khi xem; N = hiện khi lật tới trang N
  title: string;
  message: string;
  name: boolean; // hỏi thêm họ tên
  phone: boolean; // hỏi thêm số điện thoại
  allowSkip: boolean;
};

export type Settings = {
  flip: FlipStyle;
  // auto: 2 trang trên màn hình rộng, 1 trang trên mobile
  display: "auto" | "single" | "double";
  background: Background;
  theme: "dark" | "light";
  accent: string; // màu điểm nhấn của thanh công cụ (thanh trượt trang, nút đang bật)
  font: "sans" | "serif" | "mono";
  logo: string;
  logoHref: string;
  favicon: string;
  branding: boolean; // dòng "Tạo bằng Flipbook" ở góc
  shadow: number; // độ đậm bóng khi lật, 0–1
  brightness: number; // độ sáng trang, 0.7–1.3
  sound: FlipSound;
  // Nhạc nền cả sách (âm thanh theo từng trang là phần tử audio)
  music: { src: string; volume: number };
  lead: LeadForm;
};

export const DEFAULT_SETTINGS: Settings = {
  flip: "magazine",
  display: "auto",
  background: { kind: "default", color: "#27272a", color2: "#6366f1", image: "" },
  theme: "dark",
  accent: "#a5b4fc",
  font: "sans",
  logo: "",
  logoHref: "",
  favicon: "",
  branding: true,
  shadow: 0.35,
  brightness: 1,
  sound: "paper",
  music: { src: "", volume: 0.5 },
  lead: {
    enabled: false,
    page: 0,
    title: "Nhận tài liệu",
    message: "Để lại email để tiếp tục xem.",
    name: true,
    phone: false,
    allowSkip: false,
  },
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

// Gộp sâu: chỉ nhận giá trị cùng kiểu với mặc định, bỏ trường lạ
function merge<T>(def: T, raw: unknown): T {
  if (!isObj(def) || !isObj(raw)) return def;
  const out: Obj = { ...def };
  for (const [k, v] of Object.entries(def)) {
    const r = raw[k];
    if (r === undefined) continue;
    if (isObj(v)) out[k] = merge(v, r);
    else if (typeof r === typeof v) out[k] = r;
  }
  return out as T;
}

export function parseSettings(raw: unknown): Settings {
  const s = merge(DEFAULT_SETTINGS, raw);
  if (!FLIP_STYLES.some((f) => f.value === s.flip)) s.flip = DEFAULT_SETTINGS.flip;
  return s;
}

export const FONT_FAMILY: Record<Settings["font"], string> = {
  sans: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  serif: "ui-serif, Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace",
};

// CSS nền của viewer; blur dùng ảnh bìa (vẽ riêng một lớp để làm mờ, xem Flipbook)
export function backgroundCss(bg: Background, theme: Settings["theme"]): string {
  switch (bg.kind) {
    case "color":
      return bg.color;
    case "gradient":
      return `linear-gradient(135deg, ${bg.color}, ${bg.color2})`;
    case "image":
      return bg.image ? `center / cover no-repeat url("${bg.image.replace(/"/g, "%22")}"), ${bg.color}` : bg.color;
    case "blur":
      return "#18181b";
    default:
      return theme === "light"
        ? "radial-gradient(ellipse at center, #fafaf9 0%, #d6d3d1 80%)"
        : "radial-gradient(ellipse at center, #3f3f46 0%, #18181b 75%)";
  }
}
