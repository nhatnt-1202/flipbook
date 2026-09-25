"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  ChevronDown,
  ChevronUp,
  Copy,
  Globe,
  ImageIcon,
  Link2,
  Lock,
  MessageSquareText,
  ShoppingBag,
  Trash2,
  Unlock,
  Video,
  Volume2,
} from "lucide-react";
import { EFFECTS, ELEMENT_LABEL, iframeSrc, type BookElement, type Effect, type LinkAction, type LinkElement } from "@/lib/elements";
import { ColorField, Field, Panel, Segmented, Toggle, UploadButton, inputClass } from "./controls";

export type Patch = Partial<BookElement>;

// Các thao tác editor cung cấp cho bảng thuộc tính
export type InspectorApi = {
  // record = false: đang gõ, chưa ghi lịch sử — kèm beginEdit (focus) / endEdit (blur) để gộp thành một bước
  update: (id: string, patch: Patch, record?: boolean) => void;
  beginEdit: () => void;
  endEdit: () => void;
  remove: (ids: string[]) => void;
  duplicate: (ids: string[]) => void;
  reorder: (id: string, to: "up" | "down" | "front" | "back") => void;
  upload: (file: File, kind: "image" | "video" | "audio") => Promise<string | null>;
  select: (ids: string[]) => void;
};

const ICON: Record<BookElement["type"], React.ElementType> = {
  link: Link2,
  video: Video,
  image: ImageIcon,
  text: MessageSquareText,
  audio: Volume2,
  iframe: Globe,
  product: ShoppingBag,
};

const LINK_ICONS: { value: NonNullable<LinkElement["icon"]>; label: string }[] = [
  { value: "none", label: "Không" },
  { value: "link", label: "Link" },
  { value: "hand", label: "Bàn tay" },
  { value: "play", label: "Play" },
  { value: "cart", label: "Giỏ hàng" },
  { value: "info", label: "Thông tin" },
];

export default function Inspector({
  pageElements,
  selected,
  pageCount,
  api,
}: {
  pageElements: BookElement[];
  selected: BookElement[];
  pageCount: number;
  api: InspectorApi;
}) {
  if (selected.length === 0) return <LayerList elements={pageElements} api={api} />;
  if (selected.length > 1) {
    const ids = selected.map((e) => e.id);
    return (
      <Panel title={`Đã chọn ${selected.length} phần tử`}>
        <p className="text-sm text-zinc-400">Kéo để di chuyển cùng lúc. Shift + bấm để chọn thêm hoặc bỏ chọn.</p>
        <div className="mt-4 flex gap-2">
          <ActionButton onClick={() => api.duplicate(ids)} icon={<Copy />} label="Nhân bản" />
          <ActionButton onClick={() => api.remove(ids)} icon={<Trash2 />} label="Xóa" danger />
        </div>
      </Panel>
    );
  }

  const el = selected[0];
  const set = (patch: Patch, record = true) => api.update(el.id, patch, record);
  // Ô nhập chữ: gộp cả lần gõ thành một bước undo
  const typing = { onFocus: api.beginEdit, onBlur: api.endEdit };

  return (
    <Panel title={ELEMENT_LABEL[el.type]}>
      <div className="flex flex-col gap-4">
        {el.type === "link" && (
          <>
            <Field label="Khi bấm">
              <select
                value={el.action.kind}
                onChange={(e) => set({ action: defaultAction(e.target.value as LinkAction["kind"], el.action) })}
                className={inputClass}
              >
                <option value="url">Mở trang web</option>
                <option value="page">Tới trang trong sách</option>
                <option value="email">Gửi email</option>
                <option value="tel">Gọi điện</option>
              </select>
            </Field>
            {el.action.kind === "url" && (
              <Field label="Địa chỉ web">
                <input
                  value={el.action.url}
                  placeholder="https://…"
                  onChange={(e) => set({ action: { kind: "url", url: e.target.value } }, false)}
                  {...typing}
                  className={inputClass}
                />
              </Field>
            )}
            {el.action.kind === "page" && (
              <Field label={`Số trang (1–${pageCount})`}>
                <input
                  type="number"
                  min={1}
                  max={pageCount}
                  value={el.action.page}
                  onChange={(e) => set({ action: { kind: "page", page: clampInt(e.target.value, 1, pageCount) } }, false)}
                  {...typing}
                  className={inputClass}
                />
              </Field>
            )}
            {el.action.kind === "email" && (
              <Field label="Email">
                <input
                  type="email"
                  value={el.action.email}
                  placeholder="ten@congty.vn"
                  onChange={(e) => set({ action: { kind: "email", email: e.target.value } }, false)}
                  {...typing}
                  className={inputClass}
                />
              </Field>
            )}
            {el.action.kind === "tel" && (
              <Field label="Số điện thoại">
                <input
                  type="tel"
                  value={el.action.tel}
                  placeholder="0901 234 567"
                  onChange={(e) => set({ action: { kind: "tel", tel: e.target.value } }, false)}
                  {...typing}
                  className={inputClass}
                />
              </Field>
            )}
            <Toggle label="Tô nền vùng bấm" hint="Tắt: chỉ hiện khi rê chuột" checked={el.highlight} onChange={(v) => set({ highlight: v })} />
            <Field label="Icon giữa vùng bấm">
              <select value={el.icon ?? "none"} onChange={(e) => set({ icon: e.target.value as LinkElement["icon"] })} className={inputClass}>
                {LINK_ICONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <ColorField label="Màu" value={el.color} onChange={(v, record) => set({ color: v }, record)} typing={typing} />
            {el.source === "pdf" && (
              <p className="text-xs leading-relaxed text-zinc-500">Link tự nhận từ PDF. Khi thay PDF, link này được thay theo PDF mới.</p>
            )}
          </>
        )}

        {el.type === "video" && (
          <>
            <Field label="Link YouTube, Vimeo hoặc file MP4">
              <input
                value={el.src}
                placeholder="https://youtube.com/watch?v=…"
                onChange={(e) => set({ src: e.target.value }, false)}
                {...typing}
                className={inputClass}
              />
            </Field>
            <UploadButton accept="video/mp4,video/webm" label="Tải video lên (MP4, ≤ 50 MB)" onFile={async (f) => {
              const url = await api.upload(f, "video");
              if (url) set({ src: url });
            }} />
            <Field label="Cách phát">
              <Segmented
                value={el.mode}
                options={[
                  { value: "inline", label: "Trên trang" },
                  { value: "popup", label: "Mở cửa sổ" },
                ]}
                onChange={(v) => set({ mode: v })}
              />
            </Field>
            {el.mode === "inline" && (
              <Toggle label="Tự phát khi mở trang" hint="Trình duyệt sẽ tắt tiếng khi tự phát" checked={el.autoplay} onChange={(v) => set({ autoplay: v })} />
            )}
          </>
        )}

        {el.type === "image" && (
          <>
            <UploadButton accept="image/*" label={el.src ? "Đổi ảnh" : "Tải ảnh lên (JPG, PNG, GIF)"} onFile={async (f) => {
              const url = await api.upload(f, "image");
              if (url) set({ src: url });
            }} />
            <Field label="Hoặc dán link ảnh">
              <input value={el.src} placeholder="https://…" onChange={(e) => set({ src: e.target.value }, false)} {...typing} className={inputClass} />
            </Field>
            <Field label="Hiển thị">
              <Segmented
                value={el.fit}
                options={[
                  { value: "contain", label: "Vừa khung" },
                  { value: "cover", label: "Lấp đầy" },
                ]}
                onChange={(v) => set({ fit: v })}
              />
            </Field>
            <Field label="Link khi bấm (tùy chọn)">
              <input value={el.href} placeholder="https://…" onChange={(e) => set({ href: e.target.value }, false)} {...typing} className={inputClass} />
            </Field>
          </>
        )}

        {el.type === "text" && (
          <>
            <Field label="Kiểu">
              <Segmented
                value={el.mode}
                options={[
                  { value: "label", label: "Chữ" },
                  { value: "tooltip", label: "Chú thích" },
                  { value: "popup", label: "Popup" },
                ]}
                onChange={(v) => set({ mode: v })}
              />
            </Field>
            <Field label="Nội dung">
              <textarea
                id="inspector-text"
                value={el.text}
                rows={4}
                onChange={(e) => set({ text: e.target.value }, false)}
                {...typing}
                className={`${inputClass} resize-y`}
              />
            </Field>
            {el.mode === "label" ? (
              <>
                <Field label={`Cỡ chữ: ${el.size.toFixed(1)}`}>
                  <input
                    type="range"
                    min={1}
                    max={15}
                    step={0.1}
                    value={el.size}
                    onPointerDown={api.beginEdit}
                    onPointerUp={api.endEdit}
                    onChange={(e) => set({ size: Number(e.target.value) }, false)}
                    className="w-full accent-brand-500"
                  />
                </Field>
                <div className="flex gap-2">
                  <Segmented
                    value={el.align}
                    options={[
                      { value: "left", label: <AlignLeft className="size-4" />, title: "Trái" },
                      { value: "center", label: <AlignCenter className="size-4" />, title: "Giữa" },
                      { value: "right", label: <AlignRight className="size-4" />, title: "Phải" },
                    ]}
                    onChange={(v) => set({ align: v })}
                  />
                  <button
                    type="button"
                    title="In đậm"
                    aria-pressed={el.bold}
                    onClick={() => set({ bold: !el.bold })}
                    className={`rounded-lg px-3 ring-1 ring-white/10 ${el.bold ? "bg-brand-500 text-white" : "text-zinc-300 hover:bg-white/5"}`}
                  >
                    <Bold className="size-4" />
                  </button>
                </div>
                <ColorField label="Màu chữ" value={el.color} onChange={(v, record) => set({ color: v }, record)} typing={typing} />
                <Toggle label="Có nền" checked={!!el.background} onChange={(v) => set({ background: v ? "#ffffff" : "" })} />
                {el.background && (
                  <ColorField label="Màu nền" value={el.background} onChange={(v, record) => set({ background: v }, record)} typing={typing} />
                )}
              </>
            ) : (
              <ColorField
                label="Màu icon"
                value={el.background || "#6366f1"}
                onChange={(v, record) => set({ background: v }, record)}
                typing={typing}
              />
            )}
          </>
        )}

        {el.type === "audio" && (
          <>
            <UploadButton accept="audio/*" label={el.src ? "Đổi file âm thanh" : "Tải file âm thanh (MP3)"} onFile={async (f) => {
              const url = await api.upload(f, "audio");
              if (url) set({ src: url });
            }} />
            <Field label="Hoặc dán link file">
              <input value={el.src} placeholder="https://…/nhac.mp3" onChange={(e) => set({ src: e.target.value }, false)} {...typing} className={inputClass} />
            </Field>
            <Field label="Cách phát">
              <Segmented
                value={el.mode}
                options={[
                  { value: "button", label: "Bấm để phát" },
                  { value: "auto", label: "Tự phát ở trang này" },
                ]}
                onChange={(v) => set({ mode: v })}
              />
            </Field>
            <Toggle label="Phát lặp lại" checked={el.loop} onChange={(v) => set({ loop: v })} />
            <ColorField label="Màu nút" value={el.color} onChange={(v, record) => set({ color: v }, record)} typing={typing} />
            <p className="text-xs leading-relaxed text-zinc-500">Nhạc nền cho cả sách: xem tab Thiết kế.</p>
          </>
        )}

        {el.type === "iframe" && (
          <>
            <Field label="Link trang web hoặc mã nhúng <iframe>">
              <textarea
                value={el.src}
                rows={3}
                placeholder="https://www.google.com/maps/embed?…"
                onChange={(e) => set({ src: e.target.value }, false)}
                {...typing}
                className={`${inputClass} resize-y font-mono text-xs`}
              />
            </Field>
            {el.src.trim() && !iframeSrc(el.src) && <p className="text-xs text-amber-400">Không nhận ra link. Cần link bắt đầu bằng https://</p>}
            <Field label="Cách hiện">
              <Segmented
                value={el.mode}
                options={[
                  { value: "inline", label: "Trên trang" },
                  { value: "popup", label: "Mở cửa sổ" },
                ]}
                onChange={(v) => set({ mode: v })}
              />
            </Field>
            <p className="text-xs leading-relaxed text-zinc-500">Một số trang web chặn nhúng (vd. Facebook, Google Search). Google Maps, YouTube, Google Forms… nhúng được.</p>
          </>
        )}

        {el.type === "product" && (
          <>
            <Field label="Tên sản phẩm">
              <input value={el.name} onChange={(e) => set({ name: e.target.value }, false)} {...typing} className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Giá">
                <input value={el.price} placeholder="199.000đ" onChange={(e) => set({ price: e.target.value }, false)} {...typing} className={inputClass} />
              </Field>
              <Field label="Giá cũ">
                <input value={el.oldPrice} placeholder="249.000đ" onChange={(e) => set({ oldPrice: e.target.value }, false)} {...typing} className={inputClass} />
              </Field>
            </div>
            <UploadButton accept="image/*" label={el.image ? "Đổi ảnh sản phẩm" : "Tải ảnh sản phẩm"} onFile={async (f) => {
              const url = await api.upload(f, "image");
              if (url) set({ image: url });
            }} />
            <Field label="Mô tả">
              <textarea value={el.description} rows={3} onChange={(e) => set({ description: e.target.value }, false)} {...typing} className={`${inputClass} resize-y`} />
            </Field>
            <Field label="Link mua hàng">
              <input value={el.url} placeholder="https://shop…/san-pham" onChange={(e) => set({ url: e.target.value }, false)} {...typing} className={inputClass} />
            </Field>
            <Field label="Chữ trên nút">
              <input value={el.button} onChange={(e) => set({ button: e.target.value }, false)} {...typing} className={inputClass} />
            </Field>
            <ColorField label="Màu" value={el.color} onChange={(v, record) => set({ color: v }, record)} typing={typing} />
          </>
        )}

        <Field label="Hiệu ứng (trong sách)">
          <select value={el.effect ?? "none"} onChange={(e) => set({ effect: e.target.value as Effect })} className={inputClass}>
            {EFFECTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="border-t border-white/10 pt-4">
          <p className="mb-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">Sắp xếp</p>
          <div className="grid grid-cols-4 gap-1.5">
            <IconAction title="Lên trên cùng" onClick={() => api.reorder(el.id, "front")} icon={<ArrowUpToLine />} />
            <IconAction title="Lên một lớp" onClick={() => api.reorder(el.id, "up")} icon={<ChevronUp />} />
            <IconAction title="Xuống một lớp" onClick={() => api.reorder(el.id, "down")} icon={<ChevronDown />} />
            <IconAction title="Xuống dưới cùng" onClick={() => api.reorder(el.id, "back")} icon={<ArrowDownToLine />} />
          </div>
          <div className="mt-3 flex gap-2">
            <ActionButton
              onClick={() => set({ locked: !el.locked })}
              icon={el.locked ? <Unlock /> : <Lock />}
              label={el.locked ? "Mở khóa" : "Khóa"}
            />
            <ActionButton onClick={() => api.duplicate([el.id])} icon={<Copy />} label="Nhân bản" />
            <ActionButton onClick={() => api.remove([el.id])} icon={<Trash2 />} label="Xóa" danger />
          </div>
        </div>
      </div>
    </Panel>
  );
}

// Không chọn gì: danh sách lớp của trang (trên cùng ở đầu danh sách)
function LayerList({ elements, api }: { elements: BookElement[]; api: InspectorApi }) {
  return (
    <Panel title="Lớp trên trang này">
      {elements.length === 0 ? (
        <p className="text-sm leading-relaxed text-zinc-400">
          Trang này chưa có phần tử nào. Dùng các nút ở thanh trên để thêm link, video, ảnh, chữ, âm thanh, nội dung nhúng hoặc sản phẩm.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {[...elements].reverse().map((el) => {
            const Icon = ICON[el.type];
            return (
              <li key={el.id}>
                <button
                  type="button"
                  onClick={() => api.select([el.id])}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-zinc-300 hover:bg-white/5"
                >
                  <Icon className="size-4 shrink-0 text-zinc-500" />
                  <span className="min-w-0 flex-1 truncate">{layerName(el)}</span>
                  {el.locked && <Lock className="size-3.5 text-zinc-500" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-6 space-y-1.5 border-t border-white/10 pt-4 text-xs leading-relaxed text-zinc-500">
        <p>
          <Kbd>Shift</Kbd> + bấm: chọn nhiều · kéo trên nền: quét chọn
        </p>
        <p>
          <Kbd>Alt</Kbd> khi kéo: tắt hít · <Kbd>Shift</Kbd> kéo góc: giữ tỉ lệ
        </p>
        <p>
          <Kbd>Ctrl</Kbd>+<Kbd>Z</Kbd> / <Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>Z</Kbd>: hoàn tác / làm lại
        </p>
        <p>
          <Kbd>Ctrl</Kbd>+<Kbd>C</Kbd> / <Kbd>V</Kbd> / <Kbd>D</Kbd>: sao chép / dán / nhân bản · <Kbd>Del</Kbd>: xóa
        </p>
        <p>Phím mũi tên: dịch chuyển (giữ Shift: dịch nhiều)</p>
      </div>
    </Panel>
  );
}

function layerName(el: BookElement) {
  switch (el.type) {
    case "link":
      return el.action.kind === "page"
        ? `Link → trang ${el.action.page}`
        : `Link ${el.action.kind === "url" ? el.action.url : el.action.kind === "email" ? el.action.email : el.action.tel}`.trim();
    case "video":
      return el.src ? `Video ${el.src.replace(/^https?:\/\/(www\.)?/, "")}` : "Video (chưa có link)";
    case "image":
      return el.src ? "Ảnh" : "Ảnh (chưa chọn)";
    case "text":
      return el.text.split("\n")[0] || "Chữ";
    case "audio":
      return el.src ? `Âm thanh${el.mode === "auto" ? " (tự phát)" : ""}` : "Âm thanh (chưa có file)";
    case "iframe": {
      const src = iframeSrc(el.src);
      return src ? `Nhúng ${new URL(src).hostname}` : "Nhúng web (chưa có link)";
    }
    case "product":
      return `Sản phẩm: ${el.name}`;
  }
}

function defaultAction(kind: LinkAction["kind"], prev: LinkAction): LinkAction {
  if (kind === prev.kind) return prev;
  switch (kind) {
    case "url":
      return { kind, url: "" };
    case "page":
      return { kind, page: 1 };
    case "email":
      return { kind, email: "" };
    case "tel":
      return { kind, tel: "" };
  }
}

function clampInt(v: string, min: number, max: number) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}

function ActionButton({ onClick, icon, label, danger }: { onClick: () => void; icon: React.ReactNode; label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium ring-1 ring-white/10 transition [&_svg]:size-3.5 ${
        danger ? "text-red-300 hover:bg-red-500/15" : "text-zinc-300 hover:bg-white/5"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function IconAction({ onClick, icon, title }: { onClick: () => void; icon: React.ReactNode; title: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex items-center justify-center rounded-lg py-2 text-zinc-300 ring-1 ring-white/10 hover:bg-white/5 [&_svg]:size-4"
    >
      {icon}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-white/15 bg-white/5 px-1 font-sans text-[10px] text-zinc-300">{children}</kbd>;
}
