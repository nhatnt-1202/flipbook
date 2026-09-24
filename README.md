# Flipbook

Upload PDF → sách lật trang → chia sẻ link.

- **Root** (1 tài khoản duy nhất): đăng nhập ở trang chủ để xem thư viện, upload, xóa.
- **Người có link** `/book/{id}`: chỉ xem được đúng cuốn sách đó, không vào được thư viện hay sách khác.

- **Next.js 16** + Tailwind
- **pdf.js** render từng trang PDF thành ảnh WebP ngay trong trình duyệt lúc upload
- **page-flip** (StPageFlip) cho hiệu ứng lật trang
- **Supabase**: bảng `books` + Storage bucket `books`

## Cài đặt

1. Tạo project trên [supabase.com](https://supabase.com).
2. Chạy [supabase/schema.sql](supabase/schema.sql) để tạo bảng, bucket và policy, bằng một trong hai cách:
   - Dán vào **SQL Editor** trên Dashboard rồi Run; hoặc
   - Điền `SUPABASE_DB_URL` trong `.env.local` (Dashboard → **Connect** → Connection string, thay `[YOUR-PASSWORD]`) rồi chạy `npm run db:setup`.

   Để tạo tài khoản root, điền thêm `ROOT_EMAIL` và `ROOT_PASSWORD` (≥ 8 ký tự) rồi chạy `npm run db:setup`. Chạy lại với mật khẩu mới để đổi mật khẩu. Đổi `ROOT_EMAIL` sang email khác thì tài khoản đó thành root, root cũ mất quyền.
3. Vào **Project Settings → API**, copy `Project URL` và `anon public key` vào `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
4. Chạy:
   ```
   npm install
   npm run dev
   ```
   Mở http://localhost:3000

## Cấu trúc

| File | Vai trò |
|---|---|
| `src/app/page.tsx` | Trang chủ (cần đăng nhập root): upload + danh sách tất cả sách + tìm kiếm |
| `src/components/Login.tsx` | Form đăng nhập root (Supabase Auth) |
| `src/app/book/[id]/page.tsx` | Trang xem flipbook (link share), có OG image là ảnh bìa |
| `src/components/Uploader.tsx` | Render PDF → ảnh, upload lên Storage, lưu vào `books` |
| `src/components/Flipbook.tsx` | Viewer lật trang, toolbar, phím ← → |
| `src/lib/pdf.ts` | Chuyển PDF thành ảnh bằng pdf.js |

Storage: `books/{id}/1.webp … n.webp` và `books/{id}/source.pdf`.

## Lưu ý

- Quyền được chặn ở database (RLS), không chỉ trên giao diện: chỉ user trong bảng `root_account` mới đọc danh sách, upload, xóa được. Người xem chỉ gọi được hàm `get_book(id)`.
- Ảnh trang nằm trong bucket public: ai có đúng đường dẫn thì tải được, nhưng không liệt kê được file (id sách là chuỗi ngẫu nhiên 10 ký tự).
- Nên tắt đăng ký tài khoản mới: Dashboard → **Authentication → Sign In / Providers** → tắt *Allow new users to sign up*. Dù có ai tự đăng ký được thì cũng không có quyền gì.
- Gói Supabase free: file tối đa 50 MB, tổng 1 GB. PDF lớn hơn 50 MB vẫn tạo flipbook, chỉ không có nút tải PDF gốc.
- Deploy lên Vercel: import repo, thêm 2 biến môi trường ở trên.
