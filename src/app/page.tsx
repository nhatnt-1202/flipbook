"use client";

import { AlertCircle, Library, Loader2, LogOut, Search, SearchX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Uploader from "@/components/Uploader";
import BookList, { BookListSkeleton } from "@/components/BookList";
import Login from "@/components/Login";
import Logo from "@/components/Logo";
import { useSession } from "@/lib/auth";
import { supabase, type Book } from "@/lib/supabase";

type Sort = "newest" | "oldest" | "title";

// Trang chủ chỉ dành cho root; người được share link chỉ vào được /book/{id}
export default function Home() {
  const session = useSession();
  if (session === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-stone-400" />
      </div>
    );
  }
  if (!session) return <Login />;
  return <LibraryPage email={session.user.email ?? ""} />;
}

function LibraryPage({ email }: { email: string }) {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");

  useEffect(() => {
    supabase
      .from("books")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setBooks(data as Book[]);
      });
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (books ?? []).filter((b) => b.title.toLowerCase().includes(q));
    if (sort === "title") return list.sort((a, b) => a.title.localeCompare(b.title, "vi"));
    if (sort === "oldest") return list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [books, query, sort]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-background/80 backdrop-blur-lg dark:border-white/5">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2.5 px-4 sm:px-6">
          <Logo className="size-8" />
          <span className="text-[15px] font-semibold tracking-tight">Flipbook</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden truncate text-sm text-stone-500 sm:block">{email}</span>
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-white/5 dark:hover:text-white"
            >
              <LogOut className="size-4" />
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 sm:px-6">
        <section className="mx-auto max-w-2xl pt-12 pb-10 text-center sm:pt-16">
          <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Tạo{" "}
            <span className="bg-gradient-to-r from-brand-600 to-violet-600 bg-clip-text text-transparent dark:from-brand-400 dark:to-violet-400">
              sách lật trang
            </span>{" "}
            từ PDF
          </h1>
          <p className="mt-3 text-stone-500 text-pretty sm:text-lg">
            Tải file PDF lên để tạo sách lật trang. Mỗi cuốn có một link riêng: người nhận chỉ xem được đúng cuốn đó, trên
            điện thoại hay máy tính.
          </p>
        </section>

        <div className="mx-auto max-w-2xl">
          <Uploader onDone={(book) => setBooks((prev) => [book, ...(prev ?? [])])} />
        </div>

        <section className="mt-16">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Library className="size-5 text-stone-400" />
              Thư viện
              {books && (
                <span className="rounded-full bg-stone-200/70 px-2 py-0.5 text-xs font-medium text-stone-600 tabular-nums dark:bg-white/10 dark:text-stone-300">
                  {books.length}
                </span>
              )}
            </h2>
            {books && books.length > 0 && (
              <div className="flex gap-2">
                <label className="relative flex-1 sm:w-64 sm:flex-none">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
                  <input
                    type="search"
                    placeholder="Tìm theo tên sách…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full rounded-lg border-0 bg-white py-2 pr-3 pl-9 text-sm shadow-sm ring-1 ring-stone-200 placeholder:text-stone-400 focus:ring-2 focus:ring-brand-500 focus:outline-none dark:bg-stone-900 dark:ring-white/10"
                  />
                </label>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  aria-label="Sắp xếp"
                  className="rounded-lg border-0 bg-white py-2 pr-8 pl-3 text-sm shadow-sm ring-1 ring-stone-200 focus:ring-2 focus:ring-brand-500 focus:outline-none dark:bg-stone-900 dark:ring-white/10"
                >
                  <option value="newest">Mới nhất</option>
                  <option value="oldest">Cũ nhất</option>
                  <option value="title">Tên A–Z</option>
                </select>
              </div>
            )}
          </div>

          {error ? (
            <EmptyState icon={<AlertCircle className="size-6" />} title="Không tải được thư viện" tone="error">
              {/Could not find the table/i.test(error) ? (
                <>
                  Database chưa có bảng <code className="font-mono">books</code>. Mở Supabase → SQL Editor và chạy file{" "}
                  <code className="font-mono">supabase/schema.sql</code>, rồi tải lại trang.
                </>
              ) : (
                <>
                  {error}. Kiểm tra lại cấu hình Supabase trong <code className="font-mono">.env.local</code>.
                </>
              )}
            </EmptyState>
          ) : books === null ? (
            <BookListSkeleton />
          ) : books.length === 0 ? (
            <EmptyState icon={<Library className="size-6" />} title="Thư viện đang trống">
              Upload file PDF đầu tiên ở phía trên để bắt đầu.
            </EmptyState>
          ) : visible.length === 0 ? (
            <EmptyState icon={<SearchX className="size-6" />} title="Không tìm thấy sách">
              Không có sách nào khớp với “{query}”.
            </EmptyState>
          ) : (
            <BookList
              books={visible}
              onDeleted={(id) => setBooks((prev) => prev!.filter((b) => b.id !== id))}
              onUpdated={(book) => setBooks((prev) => prev!.map((b) => (b.id === book.id ? book : b)))}
            />
          )}
        </section>
      </main>
    </>
  );
}

function EmptyState({
  icon,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone?: "error";
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-stone-300 px-6 py-16 text-center dark:border-stone-700">
      <div
        className={`flex size-12 items-center justify-center rounded-full ${
          tone === "error"
            ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
            : "bg-stone-100 text-stone-400 dark:bg-white/5"
        }`}
      >
        {icon}
      </div>
      <p className="mt-4 font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-stone-500">{children}</p>
    </div>
  );
}
