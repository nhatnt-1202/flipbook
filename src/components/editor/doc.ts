import type { BookElement } from "@/lib/elements";
import type { Settings } from "@/lib/settings";

// Toàn bộ nội dung editor sửa được, gom lại để undo/redo và tự lưu cùng lúc
export type Doc = {
  elements: BookElement[];
  pages: string[]; // tên file ảnh từng trang (books.pages)
  size: { w: number; h: number }; // kích thước trang (books.page_width / page_height)
  settings: Settings;
};

/**
 * Đánh số lại trang sau khi thêm / xóa / sắp xếp trang.
 * map(số trang cũ) → số trang mới, hoặc null nếu trang đã bị xóa (phần tử trên đó bị xóa theo).
 * Link "tới trang N" cũng đi theo trang đích; đích bị xóa thì giữ số cũ (giới hạn trong số trang mới).
 */
function remap(doc: Doc, pages: string[], map: (page: number) => number | null): Doc {
  const count = pages.length;
  const elements: BookElement[] = [];
  for (const el of doc.elements) {
    const page = map(el.page);
    if (page === null) continue;
    let next: BookElement = page === el.page ? el : { ...el, page };
    if (next.type === "link" && next.action.kind === "page") {
      const target = map(next.action.page) ?? Math.min(next.action.page, count);
      if (target !== next.action.page) next = { ...next, action: { kind: "page", page: target } };
    }
    elements.push(next);
  }
  return { ...doc, pages, elements };
}

// Chuyển trang ở vị trí from tới vị trí to (index từ 0)
export function movePage(doc: Doc, from: number, to: number): Doc {
  if (from === to) return doc;
  const order = doc.pages.map((_, i) => i);
  const [moved] = order.splice(from, 1);
  order.splice(to, 0, moved);
  const newIndex = new Map(order.map((old, i) => [old, i]));
  return remap(
    doc,
    order.map((i) => doc.pages[i]),
    (p) => newIndex.get(p - 1)! + 1,
  );
}

export function deletePages(doc: Doc, indices: number[]): Doc {
  const del = new Set(indices);
  const newIndex = new Map<number, number>();
  const pages: string[] = [];
  doc.pages.forEach((f, i) => {
    if (del.has(i)) return;
    newIndex.set(i, pages.length);
    pages.push(f);
  });
  return remap(doc, pages, (p) => {
    const i = newIndex.get(p - 1);
    return i === undefined ? null : i + 1;
  });
}

// Chèn trang vào trước vị trí at (0 = đầu sách, pages.length = cuối). extra: phần tử trên trang mới (page tính từ 1 trong các trang chèn)
export function insertPages(doc: Doc, at: number, files: string[], extra: BookElement[] = []): Doc {
  const pages = [...doc.pages.slice(0, at), ...files, ...doc.pages.slice(at)];
  const next = remap(doc, pages, (p) => (p > at ? p + files.length : p));
  return { ...next, elements: [...next.elements, ...extra.map((el) => ({ ...el, page: el.page + at }))] };
}

export function replacePage(doc: Doc, index: number, file: string): Doc {
  return { ...doc, pages: doc.pages.map((f, i) => (i === index ? file : f)) };
}

/**
 * Thay PDF mà giữ phần tử: link tự nhận từ PDF cũ được thay bằng link của PDF mới, phần tử tự thêm giữ nguyên
 * theo số trang. PDF mới ít trang hơn thì phần tử ở các trang không còn bị bỏ (trả về số lượng để báo).
 */
export function replaceAll(
  doc: Doc,
  pages: string[],
  size: Doc["size"],
  pdfLinks: BookElement[],
): { doc: Doc; dropped: number } {
  const kept = doc.elements.filter((el) => !(el.type === "link" && el.source === "pdf"));
  const inRange = kept.filter((el) => el.page <= pages.length);
  return {
    doc: { ...doc, pages, size, elements: [...inRange, ...pdfLinks] },
    dropped: kept.length - inRange.length,
  };
}
