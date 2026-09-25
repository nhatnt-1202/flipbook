import type { Book } from "@/lib/supabase";
import type { Settings } from "@/lib/settings";

// Điều khiển renderer từ khung viewer (nút, phím, lăn chuột, thumbnail, link nhảy trang)
export type ViewHandle = {
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void; // tới ngay, không hiệu ứng (thanh trượt, thumbnail)
  flip: (index: number) => void; // lật có hiệu ứng (link tới trang)
  busy: () => boolean; // đang lật / đang kéo trang
};

/**
 * Renderer hiển thị các trang theo một kiểu lật. Khung viewer (Flipbook) lo thanh công cụ, nền, popup...
 *   renderLayer(i): phần tử tương tác của trang index i (từ 0), renderer đặt lên đúng trang
 *   onPage / onPortrait: báo trang hiện tại và chế độ 1 trang cho khung (nhãn số trang, nút tới/lui)
 */
export type ViewProps = {
  book: Book;
  settings: Settings;
  pageUrls: string[];
  renderLayer: (index: number) => React.ReactNode;
  onPage: (index: number) => void;
  onPortrait: (portrait: boolean) => void;
  onReady: () => void;
  onFlip: () => void; // bắt đầu chuyển trang (phát tiếng lật)
  handleRef: React.RefObject<ViewHandle | null>;
};
