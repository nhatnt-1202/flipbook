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
  updated_at: string;
  has_text: boolean;
  // Dữ liệu từ editor; đọc qua parseElements / parseSettings vì DB có thể chứa bản cũ
  settings: unknown;
  elements: unknown;
  // Tên file ảnh từng trang theo thứ tự (vd. ["1.webp", "k2j9x.webp"]), để sắp xếp / thêm / thay trang.
  // Rỗng = sách cũ, trang n là {n}.{image_ext}. Luôn đọc qua pageFiles.
  pages: unknown;
};

// Các cột lúc tạo sách; phần còn lại có giá trị mặc định trong DB
export type NewBook = Pick<
  Book,
  "id" | "title" | "page_count" | "page_width" | "page_height" | "image_ext" | "has_pdf" | "has_text"
> & { elements?: unknown; pages?: string[] };

// Đường dẫn link share: /view/{slug} nếu đã đặt, không thì /view/{id}. Link theo id luôn mở được.
export function bookPath(book: Pick<Book, "id" | "slug">) {
  return `/view/${book.slug || book.id}`;
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

type PageSource = Pick<Book, "id" | "page_count" | "image_ext" | "pages">;

export function pageFiles(book: Omit<PageSource, "id">): string[] {
  const list = Array.isArray(book.pages) ? book.pages.filter((f): f is string => typeof f === "string") : [];
  if (list.length) return list;
  return Array.from({ length: book.page_count }, (_, i) => `${i + 1}.${book.image_ext}`);
}

// n bắt đầu từ 1
export function pageUrl(book: PageSource, n: number) {
  const f = Array.isArray(book.pages) ? book.pages[n - 1] : undefined;
  return fileUrl(`${book.id}/${typeof f === "string" ? f : `${n}.${book.image_ext}`}`);
}

export function pdfUrl(book: Book) {
  return fileUrl(`${book.id}/source.pdf`);
}

export function textUrl(book: Pick<Book, "id">) {
  return fileUrl(`${book.id}/text.json`);
}

// Chữ từng trang (text.json): object { tên file trang: chữ }, để sắp xếp / thêm trang không phải ghi lại.
// Bản cũ là mảng theo thứ tự trang → đổi sang tên file mặc định {n}.{ext}.
export async function readTexts(book: Pick<Book, "id" | "image_ext" | "has_text">): Promise<Record<string, string>> {
  if (!book.has_text) return {};
  try {
    const res = await fetch(textUrl(book), { cache: "no-store" });
    if (!res.ok) return {};
    const data: unknown = await res.json();
    if (Array.isArray(data)) {
      return Object.fromEntries(data.map((t, i) => [`${i + 1}.${book.image_ext}`, typeof t === "string" ? t : ""]));
    }
    return data && typeof data === "object" ? (data as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export async function writeTexts(id: string, texts: Record<string, string>) {
  const body = new Blob([JSON.stringify(texts)], { type: "application/json" });
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`${id}/text.json`, body, { upsert: true, contentType: "application/json", cacheControl: "60" });
  if (error) throw new Error(`Lưu chữ của trang thất bại: ${error.message}`);
}

// Xóa mọi file của một cuốn (trang, PDF, text.json, assets/ của editor)
export async function removeBookFiles(id: string) {
  const paths: string[] = [];
  for (const dir of [id, `${id}/assets`]) {
    for (let offset = 0; ; offset += 1000) {
      const { data } = await supabase.storage.from(BUCKET).list(dir, { limit: 1000, offset });
      if (!data?.length) break;
      // Thư mục con (assets) có id = null
      paths.push(...data.filter((f) => f.id).map((f) => `${dir}/${f.name}`));
      if (data.length < 1000) break;
    }
  }
  for (let i = 0; i < paths.length; i += 500) {
    await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 500));
  }
}
