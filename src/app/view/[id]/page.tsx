import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import Flipbook from "@/components/Flipbook";
import { pageUrl, supabase, type Book } from "@/lib/supabase";

const getBook = cache(async (id: string) => {
  // Người xem link không có quyền đọc bảng books; get_book chỉ trả về đúng cuốn có id này
  const { data } = await supabase.rpc("get_book", { p_id: id }).maybeSingle();
  return data as Book | null;
});

export async function generateMetadata({ params }: PageProps<"/view/[id]">): Promise<Metadata> {
  const book = await getBook((await params).id);
  if (!book) return { title: "Không tìm thấy sách" };
  const cover = pageUrl(book, 1);
  return {
    title: book.title,
    description: `${book.page_count} trang`,
    openGraph: { title: book.title, images: [{ url: cover, width: book.page_width, height: book.page_height }] },
  };
}

export default async function BookPage({ params }: PageProps<"/view/[id]">) {
  const book = await getBook((await params).id);
  if (!book) notFound();
  return <Flipbook book={book} />;
}
