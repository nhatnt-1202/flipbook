"use client";

import { Loader2, Lock } from "lucide-react";
import { useState } from "react";
import Logo from "@/components/Logo";
import { supabase } from "@/lib/supabase";

const inputClass =
  "w-full rounded-lg border-0 bg-white px-3 py-2.5 text-sm shadow-sm ring-1 ring-stone-200 placeholder:text-stone-400 focus:ring-2 focus:ring-brand-500 focus:outline-none dark:bg-stone-950 dark:ring-white/10";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(/invalid login credentials/i.test(error.message) ? "Sai email hoặc mật khẩu." : error.message);
      setBusy(false);
      return;
    }
    // Chỉ tài khoản root mới được vào; tài khoản khác (nếu có) đăng xuất ngay
    const { data: isRoot } = await supabase.rpc("is_root");
    if (!isRoot) {
      await supabase.auth.signOut();
      setError("Tài khoản này không có quyền quản trị.");
    }
    setBusy(false);
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="size-12" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Đăng nhập Flipbook</h1>
          <p className="mt-1 text-sm text-stone-500">Chỉ quản trị viên mới quản lý được thư viện.</p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200/80 dark:bg-stone-900 dark:ring-white/10"
        >
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Email</span>
            <input
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Mật khẩu</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </label>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-70"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
            Đăng nhập
          </button>
        </form>
      </div>
    </main>
  );
}
