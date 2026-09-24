"use client";

// Chiều rộng ảnh mỗi trang (px). 1400 đủ nét khi zoom fullscreen, mỗi trang ~150–300 KB.
const TARGET_WIDTH = 1400;

export type RenderedPage = { n: number; blob: Blob; width: number; height: number };

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
      page.cleanup();
      canvas.width = canvas.height = 0; // giải phóng bộ nhớ canvas sớm (quan trọng trên mobile)

      await onPage({ n, blob: blob!, width: Math.round(viewport.width), height: Math.round(viewport.height) }, total);
    }
  } finally {
    await task.destroy();
  }

  return { total, ext };
}
