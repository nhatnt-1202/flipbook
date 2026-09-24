"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// undefined = đang kiểm tra, null = chưa đăng nhập.
// Chỉ để ẩn/hiện giao diện; quyền thật sự do RLS trên Supabase quyết định (chỉ user trong root_account được ghi/xóa).
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  return session;
}
