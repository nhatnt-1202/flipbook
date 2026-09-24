import { createClient } from "@supabase/supabase-js";

export const BUCKET = "books";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  // Trình duyệt: giữ phiên đăng nhập root trong localStorage. Server (trang link share): không có phiên, chỉ đọc qua get_book.
  { auth: { persistSession: typeof window !== "undefined" } },
);

export type Book = {
  id: string;
  title: string;
  page_count: number;
  page_width: number;
  page_height: number;
  image_ext: string;
  has_pdf: boolean;
  slug: string | null;
  created_at: string;
};

// Đường dẫn link share: /book/{slug} nếu đã đặt, không thì /book/{id}. Link theo id luôn mở được.
export function bookPath(book: Pick<Book, "id" | "slug">) {
  return `/book/${book.slug || book.id}`;
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MAX = 80;

// "Báo cáo Tài chính 2026!" → "bao-cao-tai-chinh-2026"
export function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
}

export function fileUrl(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export function pageUrl(book: Book, n: number) {
  return fileUrl(`${book.id}/${n}.${book.image_ext}`);
}

export function pdfUrl(book: Book) {
  return fileUrl(`${book.id}/source.pdf`);
}
