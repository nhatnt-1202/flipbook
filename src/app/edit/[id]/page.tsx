import type { Metadata } from "next";
import EditorPage from "@/components/editor/Editor";

export const metadata: Metadata = { title: "Chỉnh sửa", robots: { index: false } };

// Editor chỉ dành cho root: dữ liệu đọc bằng phiên đăng nhập trên trình duyệt (RLS), nên render phía client
export default async function EditPage({ params }: PageProps<"/edit/[id]">) {
  const { id } = await params;
  return <EditorPage id={id} />;
}
