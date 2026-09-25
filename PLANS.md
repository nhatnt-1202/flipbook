# Plan: Flipbook Editor (clone Heyzine)

Mục tiêu: phát triển project Flipbook hiện tại thành công cụ tạo và **chỉnh sửa** flipbook tương tự [heyzine.com](https://heyzine.com/).

## Tiến độ

**Phase 1: đã làm xong** (chưa commit). Còn thiếu so với plan:
- Kiểu lật *notebook* chưa làm (6 kiểu còn lại đã có).
- Sản phẩm (B7) có popup và nút mua, **chưa có giỏ hàng**.
- Không tách bảng `book_elements` / `book_pages`: phần tử lưu trong `books.elements`, thứ tự trang trong `books.pages`
  (jsonb), để editor lưu một lần, undo/redo và `get_book` trả về luôn.
- Thêm / xóa / sắp xếp trang không tạo lại `source.pdf`: nút tải PDF vẫn trả file gốc. Chỉ “Thay PDF” mới thay file này.
- Ảnh của trang đã xóa vẫn nằm trong Storage (để undo được), chỉ bị xóa khi xóa cả cuốn sách.
- DOCX/PPTX (A3, bước 1.7): tạm bỏ, chưa cần.

## Hiện trạng (trước Phase 1)

- **Đã có:** upload PDF → ảnh WebP (pdf.js), lật trang bằng page-flip (âm thanh, cong giấy trên mobile), link share `/view/{slug}`, đổi slug, xóa, tìm sách trong thư viện, tải PDF gốc. Supabase với một tài khoản root.
- **Còn thiếu để làm editor:**
  - Không có chỗ lưu cấu hình cho từng sách (bảng `books` chỉ có metadata).
  - Không có lớp phần tử tương tác chồng lên trang.
  - Chỉ lưu ảnh trang, không có text, nên chưa tìm chữ trong sách hay tự nhận link trong PDF được.

---

## Nhóm tính năng

### A. Nguồn nội dung (Import)

| # | Tính năng | Ghi chú |
|---|---|---|
| A1 | Upload PDF | Đã có |
| A2 | Upload nhiều ảnh (JPG/PNG) thành sách | Sắp thứ tự, dùng lại pipeline WebP |
| A3 | DOCX/PPTX → PDF | Cần server convert (LibreOffice/Gotenberg) |
| A4 | **Thay PDF nhưng giữ nguyên link** | Rất quan trọng: giữ các phần tử tương tác theo số trang |
| A5 | Tách text layer lúc render | Để làm search, SEO, nhận link |
| A6 | Tự nhận link có sẵn trong PDF | Lấy từ `page.getAnnotations()` của pdf.js |
| A7 | Thêm, xóa, sắp lại, thay từng trang | Page manager dạng lưới thumbnail kéo thả |

### B. Editor phần tử tương tác (lõi của Heyzine)

Canvas đặt chồng lên từng trang. Tọa độ lưu **theo tỉ lệ 0–1** so với trang để khớp mọi kích thước màn hình.

| # | Phần tử | Chi tiết |
|---|---|---|
| B1 | **Link / hotspot** | Vùng bấm được: mở URL, nhảy tới trang, gửi email, gọi điện |
| B2 | **Video** | YouTube, Vimeo, MP4 tự upload; phát ngay trên trang hoặc mở popup |
| B3 | **Audio** | File mp3; nhạc nền cho cả sách hoặc cho từng trang |
| B4 | **Ảnh / GIF** | Chèn lên trang, có thể làm slideshow |
| B5 | **Iframe embed** | Map, form, web bất kỳ |
| B6 | **Text / chú thích** | Tooltip hoặc popup khi bấm |
| B7 | **Sản phẩm (shopping)** | Tag sản phẩm có giá và nút mua, có thể thêm giỏ hàng |
| B8 | **Form thu lead** | Bắt nhập email trước khi xem, hoặc hiện sau trang N |
| B9 | Hiệu ứng hotspot | Viền, highlight, nhấp nháy, icon |
| B10 | Công cụ editor | Kéo thả, resize, sửa nhiều phần tử một lúc, copy/paste, undo/redo, snap, lock, danh sách layer, preview |

### C. Giao diện và thiết kế sách

| # | Tính năng |
|---|---|
| C1 | **Kiểu lật:** magazine (cong giấy), book (bìa cứng), album, notebook, slider, coverflow, cards, một trang |
| C2 | Nền: màu, gradient, ảnh, video, làm mờ ảnh bìa |
| C3 | Logo và favicon riêng, bật/tắt watermark |
| C4 | Bìa cứng, độ dày gáy, bóng đổ, độ sáng trang |
| C5 | Tùy chọn âm thanh lật trang (bật/tắt, chọn âm) |
| C6 | Hiện 1 hay 2 trang, tự chuyển 1 trang trên mobile |
| C7 | Theme sáng/tối, font và màu của toolbar |

### D. Viewer (người xem)

| # | Tính năng |
|---|---|
| D1 | Toolbar tùy biến: bật/tắt từng nút, chọn vị trí |
| D2 | **Mục lục (TOC):** tự lấy từ outline PDF hoặc tự nhập |
| D3 | **Tìm chữ trong sách** (cần A5) |
| D4 | Zoom, pan, fullscreen, thumbnail, thanh trượt trang |
| D5 | Tải PDF, in, chia sẻ lên mạng xã hội, QR code |
| D6 | Tự lật (autoplay) có hẹn giờ |
| D7 | Deep link tới trang: `/view/slug#p=5` |
| D8 | Bookmark, ghi chú của người xem (lưu localStorage) |
| D9 | Đa ngôn ngữ cho giao diện viewer |

### E. Chia sẻ, bảo mật, embed

| # | Tính năng |
|---|---|
| E1 | **Embed code** (iframe, responsive) và **popup lightbox** nhúng vào web |
| E2 | Bảo vệ bằng mật khẩu |
| E3 | Link riêng tư hoặc hết hạn; chặn tải và chặn in |
| E4 | Giới hạn domain được embed |
| E5 | Custom domain (CNAME) |
| E6 | SEO: meta title/description, OG image (đã có), render text cho bot |
| E7 | **Bookshelf:** kệ sách công khai gom nhiều flipbook |

### F. Thống kê (Analytics)

| # | Tính năng |
|---|---|
| F1 | Số lượt xem, người xem duy nhất, thời gian đọc |
| F2 | Lượt xem theo từng trang và tỉ lệ đọc hết |
| F3 | Lượt click vào từng phần tử (link, video, sản phẩm) |
| F4 | Thiết bị, quốc gia, nguồn truy cập |
| F5 | Tích hợp Google Analytics / Meta Pixel |
| F6 | Xuất danh sách lead thu từ form (CSV) |

### G. Tài khoản và quản lý

| # | Tính năng |
|---|---|
| G1 | Nhiều user thay cho một root (đăng ký, mỗi người một thư viện) |
| G2 | Thư mục và tag cho sách |
| G3 | Nhân bản sách, lưu cấu hình làm template |
| G4 | Team: mời thành viên, phân quyền editor/viewer |
| G5 | Gói Free/Pro, giới hạn dung lượng và số sách, thanh toán |

---

## Thay đổi kiến trúc cần làm trước

1. **Database** (thêm vào `supabase/schema.sql`):
   - Thêm cột `books.settings jsonb`: theme, kiểu lật, toolbar, âm thanh, mật khẩu, v.v.
   - Bảng `book_elements`: `id, book_id, page, type, x, y, w, h (0–1), props jsonb, z_index`.
   - Bảng `book_pages`: thứ tự trang, text đã tách, cho phép thay từng trang.
   - Các bảng `analytics_events` và `leads`. Ghi dữ liệu qua RPC hoặc route handler, không để client ghi thẳng.
   - `get_book(id)` trả thêm settings và elements, và kiểm tra mật khẩu ở server.
2. **Tách viewer và editor:** `src/components/Flipbook.tsx` (530 dòng) nên tách thành `FlipbookCore` (lật trang), `ElementLayer` (vẽ phần tử) và `Toolbar`. Editor dùng lại core, thêm chế độ edit.
3. **Route mới:** `/edit/[id]` (editor), `/embed/[id]` (viewer tối giản, không header), `/api/track` (analytics).
4. **Kiểu lật:** page-flip chỉ làm được magazine và book. Slider, coverflow, cards phải tự viết thêm renderer (CSS transform) có chung interface.

---

## Lộ trình đề xuất

### Phase 1: Nội dung, Editor, Thiết kế (nhóm A, B, C)

Mục tiêu: tạo và chỉnh sửa được flipbook có phần tử tương tác và giao diện riêng.

| Bước | Nội dung | Tính năng |
|---|---|---|
| 1.1 | Nền tảng: schema `settings`, `book_elements`, `book_pages`; tách `Flipbook.tsx`; route `/edit/[id]` | Thay đổi kiến trúc (mục trên) |
| 1.2 | Import mở rộng: nhiều ảnh, text layer, tự nhận link PDF | A2, A5, A6 |
| 1.3 | Editor MVP: link/hotspot, video, ảnh/GIF, text/chú thích, công cụ kéo thả/resize/undo/preview | B1, B2, B4, B6, B10 |
| 1.4 | Editor mở rộng: audio, iframe, sản phẩm, form thu lead, hiệu ứng hotspot | B3, B5, B7, B8, B9 |
| 1.5 | Quản lý trang: page manager, thay PDF giữ nguyên link | A7, A4 |
| 1.6 | Thiết kế: kiểu lật, nền, logo, bìa cứng, âm thanh, 1/2 trang, theme | C1–C7 |
| 1.7 | DOCX/PPTX → PDF (tùy quyết định, cần server convert) | A3 |

**Kết quả:** editor đầy đủ, tính năng giá trị nhất của Heyzine.

### Phase 2: Viewer, Chia sẻ, Analytics, Tài khoản (nhóm D, E, F, G)

Mục tiêu: trải nghiệm đọc đầy đủ, chia sẻ an toàn, đo được hiệu quả, mở rộng thành SaaS.

| Bước | Nội dung | Tính năng |
|---|---|---|
| 2.1 | Viewer nâng cao: toolbar tùy biến, TOC, search, zoom/thumbnail, tải/in/share/QR, autoplay, deep link, bookmark, đa ngôn ngữ | D1–D9 |
| 2.2 | Embed và SEO: iframe/lightbox, giới hạn domain, meta SEO, text cho bot | E1, E4, E6 |
| 2.3 | Bảo mật: mật khẩu, link riêng tư/hết hạn, chặn tải/in | E2, E3 |
| 2.4 | Analytics và lead: lượt xem, theo trang, click phần tử, thiết bị, GA/Pixel, xuất lead CSV | F1–F6 |
| 2.5 | Bookshelf, custom domain | E7, E5 |
| 2.6 | Tài khoản: nhiều user, thư mục/tag, nhân bản/template, team, gói Free/Pro | G1–G5 |

**Kết quả:** sản phẩm hoàn chỉnh dạng SaaS.

> Lưu ý: nếu chắc chắn làm nhiều user (G1), nên đổi auth ngay ở bước 1.1 thay vì đợi Phase 2, để không phải sửa lại toàn bộ RLS.

---

## Câu hỏi cần quyết định trước khi code

1. **Một root hay nhiều user?** Nếu định làm SaaS (G1) thì nên đổi auth ngay ở bước 1.1. Làm sau sẽ phải sửa toàn bộ RLS.
2. **DOCX/PPTX (A3)** cần server convert, không chạy thuần trên Vercel. Làm luôn hay bỏ?
3. **Bắt đầu từ bước 1.1 → 1.3 (editor MVP)?** Đề xuất bắt đầu từ đây.
