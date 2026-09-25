"use client";

// Chiều rộng ảnh mỗi trang (px). 1400 đủ nét khi zoom fullscreen, mỗi trang ~150–300 KB.
const TARGET_WIDTH = 1400;

// Link có sẵn trong PDF, tọa độ tỉ lệ 0–1 so với trang. Có url (link ngoài) hoặc page (nhảy tới trang, từ 1).
export type PdfLink = { x: number; y: number; w: number; h: number; url?: string; page?: number };

export type RenderedPage = {
  n: number;
  blob: Blob;
  width: number;
  height: number;
  text: string;
  links: PdfLink[];
};

type PdfDoc = Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfjs>>["getDocument"]>["promise"]>;
type PdfPage = Awaited<ReturnType<PdfDoc["getPage"]>>;
type Viewport = ReturnType<PdfPage["getViewport"]>;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjs;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Render từng trang PDF thành ảnh, trả về lần lượt qua `onPage`.
 * Dùng WebP; trình duyệt nào không encode được WebP (Safari cũ) thì dùng JPEG.
 */
export async function renderPdf(
  file: File,
  onPage: (page: RenderedPage, total: number) => Promise<void>,
): Promise<{ total: number; ext: "webp" | "jpg" }> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await task.promise;
  const total = doc.numPages;
  let ext: "webp" | "jpg" = "webp";

  try {
    for (let n = 1; n <= total; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: TARGET_WIDTH / base.width });

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvas, canvasContext: ctx, viewport }).promise;

      let blob = ext === "webp" ? await canvasToBlob(canvas, "image/webp", 0.82) : null;
      if (!blob || blob.type !== "image/webp") {
        ext = "jpg";
        blob = await canvasToBlob(canvas, "image/jpeg", 0.85);
      }
      const text = await pageText(page);
      const links = await pageLinks(doc, page, viewport);
      page.cleanup();
      canvas.width = canvas.height = 0; // giải phóng bộ nhớ canvas sớm (quan trọng trên mobile)

      await onPage(
        { n, blob: blob!, width: Math.round(viewport.width), height: Math.round(viewport.height), text, links },
        total,
      );
    }
  } finally {
    await task.destroy();
  }

  return { total, ext };
}

async function pageText(page: PdfPage) {
  try {
    const content = await page.getTextContent();
    let out = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      out += item.str + (item.hasEOL ? "\n" : "");
    }
    return out.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    return "";
  }
}

async function pageLinks(doc: PdfDoc, page: PdfPage, viewport: Viewport): Promise<PdfLink[]> {
  const links: PdfLink[] = [];
  let annots: { subtype?: string; rect?: number[]; url?: string; unsafeUrl?: string; dest?: unknown }[];
  try {
    annots = await page.getAnnotations();
  } catch {
    return links;
  }
  for (const a of annots) {
    if (a.subtype !== "Link" || !a.rect) continue;
    const [x1, y1] = viewport.convertToViewportPoint(a.rect[0], a.rect[1]);
    const [x2, y2] = viewport.convertToViewportPoint(a.rect[2], a.rect[3]);
    const box = {
      x: clamp01(Math.min(x1, x2) / viewport.width),
      y: clamp01(Math.min(y1, y2) / viewport.height),
      w: Math.abs(x2 - x1) / viewport.width,
      h: Math.abs(y2 - y1) / viewport.height,
    };
    if (box.w < 0.005 || box.h < 0.005) continue;
    const url = a.url ?? a.unsafeUrl;
    if (url) {
      links.push({ ...box, url });
      continue;
    }
    const target = await destPage(doc, a.dest);
    if (target) links.push({ ...box, page: target });
  }
  return links;
}

// Đích của link nội bộ → số trang (từ 1). dest là tên (string) hoặc mảng [ref trang, ...].
async function destPage(doc: PdfDoc, dest: unknown): Promise<number | null> {
  try {
    const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || !explicit[0]) return null;
    const ref = explicit[0];
    const index = typeof ref === "number" ? ref : await doc.getPageIndex(ref);
    return index + 1;
  } catch {
    return null;
  }
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Tạo trang sách từ nhiều ảnh (JPG/PNG/WebP...), theo thứ tự truyền vào.
 * Ảnh rộng hơn TARGET_WIDTH được thu nhỏ; ảnh khác tỉ lệ trang đầu sẽ hiển thị vừa khung (object-contain).
 */
export async function renderImages(
  files: File[],
  onPage: (page: RenderedPage, total: number) => Promise<void>,
): Promise<{ total: number; ext: "webp" | "jpg" }> {
  let ext: "webp" | "jpg" = "webp";
  const total = files.length;
  for (let i = 0; i < total; i++) {
    const bitmap = await createImageBitmap(files[i]).catch(() => {
      throw new Error(`Không đọc được ảnh "${files[i].name}"`);
    });
    const scale = Math.min(1, TARGET_WIDTH / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    let blob = ext === "webp" ? await canvasToBlob(canvas, "image/webp", 0.85) : null;
    if (!blob || blob.type !== "image/webp") {
      ext = "jpg";
      blob = await canvasToBlob(canvas, "image/jpeg", 0.88);
    }
    const size = { width: canvas.width, height: canvas.height };
    canvas.width = canvas.height = 0;
    await onPage({ n: i + 1, blob: blob!, ...size, text: "", links: [] }, total);
  }
  return { total, ext };
}
