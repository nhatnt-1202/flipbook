-- Chạy file này bằng "npm run db:setup" (hoặc dán vào Supabase Dashboard → SQL Editor).
-- Phân quyền:
--   • Tài khoản root (duy nhất, ghi trong bảng root_account): xem thư viện, upload, xóa.
--   • Người có link /book/{id}: chỉ lấy được đúng cuốn sách đó qua hàm get_book(id),
--     không liệt kê được danh sách sách hay file trong Storage.

create table if not exists public.books (
  id          text primary key,            -- nanoid, cũng là slug trong link share /book/{id}
  title       text not null,
  page_count  int  not null,
  page_width  int  not null,               -- kích thước ảnh trang (px), dùng cho tỉ lệ flipbook
  page_height int  not null,
  image_ext   text not null default 'webp',
  has_pdf     boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Slug tùy chỉnh cho link share /book/{slug} (chữ thường, số, gạch ngang). NULL = dùng id.
-- Link theo id vẫn luôn mở được, nên đổi slug không làm hỏng link cũ dạng /book/{id}.
alter table public.books add column if not exists slug text;
create unique index if not exists books_slug_key on public.books (slug);
alter table public.books drop constraint if exists books_slug_format;
alter table public.books add constraint books_slug_format
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80);

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

-- Storage: bucket public "books" — ai có đường dẫn đều tải được ảnh (id sách là nanoid khó đoán),
-- nhưng chỉ root mới liệt kê / upload / xóa được.
--   books/{id}/source.pdf
--   books/{id}/{n}.webp      (n = 1..page_count)
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
