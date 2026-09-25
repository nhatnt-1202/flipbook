"use client";

import { Download, Loader2, X } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { FLIP_STYLES, type Settings } from "@/lib/settings";
import { useToast } from "@/components/Toast";
import { ColorField, Field, RangeField, Section, Segmented, Toggle, UploadButton, inputClass } from "./controls";

type Typing = { onFocus: () => void; onBlur: () => void };

/**
 * Tab "Thiết kế": giao diện sách (kiểu lật, nền, logo, âm thanh...) và form thu lead.
 *   set(fn, record): sửa settings; record = false khi đang gõ / kéo (gộp một bước undo nhờ typing)
 */
export default function DesignPanel({
  bookId,
  settings: s,
  pageCount,
  set,
  typing,
  upload,
}: {
  bookId: string;
  settings: Settings;
  pageCount: number;
  set: (fn: (s: Settings) => Settings, record?: boolean) => void;
  typing: Typing;
  upload: (file: File, kind: "image" | "audio") => Promise<string | null>;
}) {
  const patch = (p: Partial<Settings>, record = true) => set((prev) => ({ ...prev, ...p }), record);
  const bg = (p: Partial<Settings["background"]>, record = true) => set((prev) => ({ ...prev, background: { ...prev.background, ...p } }), record);
  const lead = (p: Partial<Settings["lead"]>, record = true) => set((prev) => ({ ...prev, lead: { ...prev.lead, ...p } }), record);
  const music = (p: Partial<Settings["music"]>, record = true) => set((prev) => ({ ...prev, music: { ...prev.music, ...p } }), record);
  const pageFlip = s.flip === "magazine" || s.flip === "hardcover" || s.flip === "album";

  return (
    <div className="flex flex-col gap-6 p-4">
      <Section title="Kiểu lật trang">
        <div className="grid grid-cols-2 gap-2">
          {FLIP_STYLES.map((f) => (
            <button
              key={f.value}
              type="button"
              title={f.hint}
              aria-pressed={s.flip === f.value}
              onClick={() => patch({ flip: f.value })}
              className={`rounded-lg px-2.5 py-2 text-left ring-1 transition ${
                s.flip === f.value ? "bg-brand-500/15 text-white ring-brand-500" : "text-zinc-300 ring-white/10 hover:bg-white/5"
              }`}
            >
              <span className="block text-sm font-medium">{f.label}</span>
              <span className="block text-[11px] leading-snug text-zinc-500">{f.hint}</span>
            </button>
          ))}
        </div>
        {pageFlip && (
          <Field label="Số trang hiển thị">
            <Segmented
              value={s.display}
              options={[
                { value: "auto", label: "Tự động" },
                { value: "single", label: "1 trang" },
                { value: "double", label: "2 trang" },
              ]}
              onChange={(v) => patch({ display: v })}
            />
          </Field>
        )}
        {pageFlip && (
          <RangeField
            label={`Bóng đổ khi lật: ${Math.round(s.shadow * 100)}%`}
            value={s.shadow}
            min={0}
            max={1}
            step={0.05}
            onChange={(v, r) => patch({ shadow: v }, r)}
            typing={typing}
          />
        )}
        <RangeField
          label={`Độ sáng trang: ${Math.round(s.brightness * 100)}%`}
          value={s.brightness}
          min={0.7}
          max={1.3}
          step={0.01}
          onChange={(v, r) => patch({ brightness: v }, r)}
          typing={typing}
        />
      </Section>

      <Section title="Nền">
        <select value={s.background.kind} onChange={(e) => bg({ kind: e.target.value as Settings["background"]["kind"] })} className={inputClass}>
          <option value="default">Mặc định</option>
          <option value="color">Màu</option>
          <option value="gradient">Gradient</option>
          <option value="image">Ảnh</option>
          <option value="blur">Ảnh bìa làm mờ</option>
        </select>
        {(s.background.kind === "color" || s.background.kind === "gradient" || s.background.kind === "image") && (
          <ColorField label={s.background.kind === "gradient" ? "Màu 1" : "Màu nền"} value={s.background.color} onChange={(v, r) => bg({ color: v }, r)} typing={typing} />
        )}
        {s.background.kind === "gradient" && (
          <ColorField label="Màu 2" value={s.background.color2} onChange={(v, r) => bg({ color2: v }, r)} typing={typing} />
        )}
        {s.background.kind === "image" && (
          <ImageField label="Ảnh nền" value={s.background.image} onChange={(v) => bg({ image: v })} upload={upload} />
        )}
      </Section>

      <Section title="Giao diện">
        <Field label="Theme">
          <Segmented
            value={s.theme}
            options={[
              { value: "dark", label: "Tối" },
              { value: "light", label: "Sáng" },
            ]}
            onChange={(v) => patch({ theme: v })}
          />
        </Field>
        <ColorField label="Màu nhấn (thanh trượt, trang đang xem)" value={s.accent} onChange={(v, r) => patch({ accent: v }, r)} typing={typing} />
        <Field label="Font chữ giao diện">
          <Segmented
            value={s.font}
            options={[
              { value: "sans", label: "Sans" },
              { value: "serif", label: "Serif" },
              { value: "mono", label: "Mono" },
            ]}
            onChange={(v) => patch({ font: v })}
          />
        </Field>
      </Section>

      <Section title="Thương hiệu">
        <ImageField label="Logo (góc trên bên trái)" value={s.logo} onChange={(v) => patch({ logo: v })} upload={upload} />
        {s.logo && (
          <Field label="Link khi bấm logo">
            <input value={s.logoHref} placeholder="https://congty.vn" onChange={(e) => patch({ logoHref: e.target.value }, false)} {...typing} className={inputClass} />
          </Field>
        )}
        <ImageField label="Favicon (icon trên tab trình duyệt)" value={s.favicon} onChange={(v) => patch({ favicon: v })} upload={upload} />
        <Toggle label="Hiện “Tạo bằng Flipbook”" checked={s.branding} onChange={(v) => patch({ branding: v })} />
      </Section>

      <Section title="Âm thanh">
        <Field label="Tiếng lật trang">
          <Segmented
            value={s.sound}
            options={[
              { value: "paper", label: "Giấy" },
              { value: "soft", label: "Nhẹ" },
              { value: "off", label: "Tắt" },
            ]}
            onChange={(v) => patch({ sound: v })}
          />
        </Field>
        <Field label="Nhạc nền cả sách">
          {s.music.src ? (
            <div className="flex items-center gap-2">
              <audio src={s.music.src} controls className="h-9 min-w-0 flex-1" />
              <button type="button" onClick={() => music({ src: "" })} title="Bỏ nhạc nền" className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <UploadButton
              accept="audio/*"
              label="Tải file nhạc (MP3)"
              onFile={async (f) => {
                const url = await upload(f, "audio");
                if (url) music({ src: url });
              }}
            />
          )}
        </Field>
        {s.music.src && (
          <RangeField
            label={`Âm lượng nhạc nền: ${Math.round(s.music.volume * 100)}%`}
            value={s.music.volume}
            min={0}
            max={1}
            step={0.05}
            onChange={(v, r) => music({ volume: v }, r)}
            typing={typing}
          />
        )}
      </Section>

      <Section title="Form thu lead">
        <Toggle label="Bật form thu email" hint="Người xem phải để lại email để xem tiếp" checked={s.lead.enabled} onChange={(v) => lead({ enabled: v })} />
        {s.lead.enabled && (
          <>
            <Field label="Hiện khi">
              <select
                value={s.lead.page}
                onChange={(e) => lead({ page: Number(e.target.value) })}
                className={inputClass}
              >
                <option value={0}>Trước khi xem</option>
                {Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    Lật tới trang {n}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tiêu đề">
              <input value={s.lead.title} onChange={(e) => lead({ title: e.target.value }, false)} {...typing} className={inputClass} />
            </Field>
            <Field label="Lời nhắn">
              <textarea value={s.lead.message} rows={2} onChange={(e) => lead({ message: e.target.value }, false)} {...typing} className={`${inputClass} resize-y`} />
            </Field>
            <Toggle label="Hỏi họ tên" checked={s.lead.name} onChange={(v) => lead({ name: v })} />
            <Toggle label="Hỏi số điện thoại" checked={s.lead.phone} onChange={(v) => lead({ phone: v })} />
            <Toggle label="Cho phép bỏ qua" checked={s.lead.allowSkip} onChange={(v) => lead({ allowSkip: v })} />
          </>
        )}
        <LeadExport bookId={bookId} />
      </Section>
    </div>
  );
}

function ImageField({
  label,
  value,
  onChange,
  upload,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  upload: (file: File, kind: "image") => Promise<string | null>;
}) {
  return (
    <Field label={label}>
      {value ? (
        <div className="flex items-center gap-2 rounded-lg bg-white/5 p-2 ring-1 ring-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="size-10 rounded bg-white/10 object-contain" />
          <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">{value.split("/").pop()}</span>
          <button type="button" onClick={() => onChange("")} title="Bỏ ảnh" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <UploadButton
          accept="image/*"
          label="Tải ảnh lên"
          onFile={async (f) => {
            const url = await upload(f, "image");
            if (url) onChange(url);
          }}
        />
      )}
    </Field>
  );
}

// Tải danh sách lead đã thu của cuốn này thành file CSV (mở được bằng Excel)
function LeadExport({ bookId }: { bookId: string }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    const { data, error } = await supabase
      .from("leads")
      .select("created_at, email, name, phone, page")
      .eq("book_id", bookId)
      .order("created_at", { ascending: true });
    setBusy(false);
    if (error) {
      notify(`Không tải được lead: ${error.message}`, "error");
      return;
    }
    if (!data.length) {
      notify("Chưa có lead nào");
      return;
    }
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["Thời gian", "Email", "Họ tên", "Điện thoại", "Trang"],
      ...data.map((r) => [new Date(r.created_at).toLocaleString("vi-VN"), r.email, r.name, r.phone, r.page || "Trước khi xem"]),
    ];
    // BOM để Excel đọc đúng tiếng Việt
    const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${bookId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className="flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 ring-1 ring-white/10 hover:bg-white/5 disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      Tải danh sách lead (CSV)
    </button>
  );
}
