"use client";

import { nanoid } from "nanoid";
import { BUCKET, supabase } from "@/lib/supabase";
import { renderImages, renderPdf, type PdfLink, type RenderedPage } from "@/lib/pdf";
import { newId, type LinkElement } from "@/lib/elements";

const UPLOAD_CONCURRENCY = 4;

export const isPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
export const isImage = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|avif)$/i.test(f.name);

export type ImportedPages = {
  files: string[]; // tên file ảnh đã upload, theo thứ tự trang
  size: { w: number; h: number }; // kích thước trang đầu
  texts: Record<string, string>; // chữ từng trang theo tên file (bỏ trang không có chữ)
  links: LinkElement[]; // link có sẵn trong PDF, page tính từ 1 trong các trang vừa import
  pdf: File | null; // file PDF nguồn
};

// Link có sẵn trong PDF → phần tử link trong editor, không tô nền để giữ nguyên thiết kế trang
function linkElement(page: number, l: PdfLink): LinkElement {
  return {
    id: newId(),
    page,
    x: l.x,
    y: l.y,
    w: l.w,
    h: l.h,
    type: "link",
    action: l.url ? { kind: "url", url: l.url } : { kind: "page", page: l.page! },
    highlight: false,
    color: "#6366f1",
    source: "pdf",
  };
}

/**
 * Render file (1 PDF, hoặc nhiều ảnh theo thứ tự truyền vào) thành ảnh trang và upload vào books/{bookId}/.
 * Lỗi giữa chừng thì xóa các file đã upload rồi ném lỗi.
 */
export async function importPages(
  bookId: string,
  input: File[],
  onProgress: (label: string, pct: number) => void,
): Promise<ImportedPages> {
  const pdf = isPdf(input[0]) ? input[0] : null;
  const images = pdf ? [] : input.filter(isImage);
  if (!pdf && !images.length) throw new Error("Chỉ hỗ trợ PDF hoặc ảnh (JPG, PNG, WebP).");

  const files: string[] = [];
  const texts: Record<string, string> = {};
  const links: LinkElement[] = [];
  const uploaded: string[] = [];
  const pending = new Set<Promise<void>>();
  let size = { w: 0, h: 0 };

  const upload = (path: string, body: Blob) => {
    const p = supabase.storage
      .from(BUCKET)
      .upload(path, body, { contentType: body.type, cacheControl: "31536000" })
      .then(({ error }) => {
        if (error) throw new Error(`Upload ${path} thất bại: ${error.message}`);
        uploaded.push(path);
      });
    pending.add(p);
    p.finally(() => pending.delete(p)).catch(() => {});
  };

  const onPage = async (page: RenderedPage, total: number) => {
    if (page.n === 1) size = { w: page.width, h: page.height };
    const name = `${nanoid(8)}.${page.blob.type === "image/webp" ? "webp" : "jpg"}`;
    files[page.n - 1] = name;
    if (page.text) texts[name] = page.text;
    links.push(...page.links.map((l) => linkElement(page.n, l)));
    upload(`${bookId}/${name}`, page.blob);
    onProgress(`Đang xử lý trang ${page.n} / ${total}`, 2 + (page.n / total) * 93);
    // Giới hạn số upload chạy song song để không giữ quá nhiều ảnh trong RAM
    while (pending.size >= UPLOAD_CONCURRENCY) await Promise.race(pending);
  };

  try {
    onProgress(pdf ? "Đang đọc PDF…" : "Đang đọc ảnh…", 2);
    if (pdf) await renderPdf(pdf, onPage);
    else await renderImages(images, onPage);
    onProgress("Đang hoàn tất…", 97);
    await Promise.all(pending);
  } catch (e) {
    await Promise.allSettled(pending);
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
    throw e;
  }
  return { files, size, texts, links, pdf };
}
