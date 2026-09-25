-- Chạy file này bằng "npm run db:setup" (hoặc dán vào Supabase Dashboard → SQL Editor).
-- Phân quyền:
--   • Tài khoản root (duy nhất, ghi trong bảng root_account): xem thư viện, upload, xóa.
--   • Người có link /view/{id}: chỉ lấy được đúng cuốn sách đó qua hàm get_book(id),
--     không liệt kê được danh sách sách hay file trong Storage.

create table if not exists public.books (
  id          text primary key,            -- nanoid, cũng là slug trong link share /view/{id}
  title       text not null,
  page_count  int  not null,
  page_width  int  not null,               -- kích thước ảnh trang (px), dùng cho tỉ lệ flipbook
  page_height int  not null,
  image_ext   text not null default 'webp',
  has_pdf     boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Slug tùy chỉnh cho link share /view/{slug} (chữ thường, số, gạch ngang). NULL = dùng id.
-- Link theo id vẫn luôn mở được, nên đổi slug không làm hỏng link cũ dạng /view/{id}.
alter table public.books add column if not exists slug text;
create unique index if not exists books_slug_key on public.books (slug);
alter table public.books drop constraint if exists books_slug_format;
alter table public.books add constraint books_slug_format
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80);

-- Editor (Phase 1):
--   settings: giao diện sách (kiểu lật, nền, logo, âm thanh...) — xem src/lib/settings.ts
--   elements: phần tử tương tác chồng lên trang (link, video, ảnh, text...) — xem src/lib/elements.ts.
--             Tọa độ x, y, w, h theo tỉ lệ 0–1 so với trang nên khớp mọi kích thước màn hình.
--   Lưu cả mảng trong một cột để editor ghi một lần (undo/redo, lưu nguyên khối) và get_book trả về luôn.
alter table public.books add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.books add column if not exists elements jsonb not null default '[]'::jsonb;
alter table public.books drop constraint if exists books_elements_array;
alter table public.books add constraint books_elements_array check (jsonb_typeof(elements) = 'array');
alter table public.books drop constraint if exists books_settings_object;
alter table public.books add constraint books_settings_object check (jsonb_typeof(settings) = 'object');
-- Có file text.json (chữ của từng trang, tách lúc upload) để tìm kiếm / SEO. Sách cũ = false.
alter table public.books add column if not exists has_text boolean not null default false;
alter table public.books add column if not exists updated_at timestamptz not null default now();
-- Tên file ảnh từng trang theo thứ tự (page manager: sắp xếp / thêm / xóa / thay trang, thay PDF).
-- '[]' = sách cũ, trang n là {n}.{image_ext}.
alter table public.books add column if not exists pages jsonb not null default '[]'::jsonb;
alter table public.books drop constraint if exists books_pages_array;
alter table public.books add constraint books_pages_array check (jsonb_typeof(pages) = 'array');

-- Tài khoản root: đúng 1 dòng, trỏ tới user trong auth.users. Bật RLS, không policy → client không đọc/sửa được.
create table if not exists public.root_account (
  singleton boolean primary key default true check (singleton),
  user_id   uuid not null references auth.users (id) on delete cascade
);
alter table public.root_account enable row level security;

create or replace function public.is_root()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.root_account where user_id = auth.uid());
$$;

-- Xem 1 cuốn theo slug hoặc id (trang link share). Chạy với quyền owner nên không cần policy đọc cho anon.
-- Trùng cả hai thì ưu tiên slug.
create or replace function public.get_book(p_id text)
returns setof public.books
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.books where slug = p_id or id = p_id
  order by (slug = p_id) desc nulls last
  limit 1;
$$;
grant execute on function public.get_book(text) to anon, authenticated;

alter table public.books enable row level security;

drop policy if exists "books anon read"   on public.books;
drop policy if exists "books anon insert" on public.books;
drop policy if exists "books anon delete" on public.books;
drop policy if exists "books root read"   on public.books;
drop policy if exists "books root insert" on public.books;
drop policy if exists "books root delete" on public.books;
drop policy if exists "books root update" on public.books;
create policy "books root read"   on public.books for select using (public.is_root());
create policy "books root insert" on public.books for insert with check (public.is_root());
create policy "books root update" on public.books for update using (public.is_root()) with check (public.is_root());
create policy "books root delete" on public.books for delete using (public.is_root());

-- Lead thu từ form trong viewer (settings.lead). Người xem không ghi thẳng bảng: chỉ qua submit_lead,
-- hàm này kiểm tra sách có bật form và giới hạn kích thước dữ liệu. Chỉ root đọc / xóa.
create table if not exists public.leads (
  id         bigint generated always as identity primary key,
  book_id    text not null references public.books (id) on delete cascade,
  email      text not null,
  name       text not null default '',
  phone      text not null default '',
  page       int  not null default 0,        -- form hiện ở trang nào (0 = trước khi xem)
  created_at timestamptz not null default now()
);
create index if not exists leads_book_id_idx on public.leads (book_id, created_at desc);
alter table public.leads enable row level security;
drop policy if exists "leads root read"   on public.leads;
drop policy if exists "leads root delete" on public.leads;
create policy "leads root read"   on public.leads for select using (public.is_root());
create policy "leads root delete" on public.leads for delete using (public.is_root());

create or replace function public.submit_lead(p_book_id text, p_email text, p_name text, p_phone text, p_page int)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.books
    where id = p_book_id and coalesce((settings -> 'lead' ->> 'enabled')::boolean, false)
  ) then
    raise exception 'lead form disabled';
  end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then
    raise exception 'invalid email';
  end if;
  insert into public.leads (book_id, email, name, phone, page)
  values (p_book_id, lower(trim(p_email)), left(trim(coalesce(p_name, '')), 200), left(trim(coalesce(p_phone, '')), 50), coalesce(p_page, 0));
end;
$$;
grant execute on function public.submit_lead(text, text, text, text, int) to anon, authenticated;

-- Storage: bucket public "books" — ai có đường dẫn đều tải được ảnh (id sách là nanoid khó đoán),
-- nhưng chỉ root mới liệt kê / upload / xóa được.
--   books/{id}/source.pdf
--   books/{id}/{file}.webp   (ảnh trang, thứ tự theo books.pages; sách cũ: {n}.webp)
--   books/{id}/text.json     ({ tên file trang: chữ }; bản cũ là mảng theo thứ tự trang)
--   books/{id}/assets/...    (ảnh, video upload trong editor)
insert into storage.buckets (id, name, public)
values ('books', 'books', true)
on conflict (id) do update set public = true;

drop policy if exists "books bucket read"   on storage.objects;
drop policy if exists "books bucket insert" on storage.objects;
drop policy if exists "books bucket delete" on storage.objects;
drop policy if exists "books bucket root"   on storage.objects;
create policy "books bucket root" on storage.objects for all
  using (bucket_id = 'books' and public.is_root())
  with check (bucket_id = 'books' and public.is_root());
