"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { Loader2 } from "lucide-react";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Convites/recuperação do Supabase (template padrão) caem aqui com a sessão
  // no HASH da URL (#access_token=...&refresh_token=...&type=invite|recovery).
  // Capturamos, gravamos nos cookies e mandamos pra tela de definir senha.
  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (!hash || !hash.includes("access_token")) return;
    const supabase = createClient();
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    (async () => {
      try {
        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
        }
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          window.history.replaceState(null, "", window.location.pathname);
          router.replace("/auth/set-password");
        }
      } catch {
        /* link inválido/expirado — segue no login normal */
      }
    })();
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setError(
          error.message === "Invalid login credentials"
            ? "Wrong email or password. Please try again."
            : error.message
        );
        setLoading(false);
        return;
      }
      // Sessão gravada nos cookies; o middleware reconhece a partir daqui.
      const dest = next.startsWith("/") ? next : "/";
      router.replace(dest);
      router.refresh();
    } catch {
      setError("Could not sign in right now. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-4">
      <Field label="Email">
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          placeholder="you@bythecrealty.com"
        />
      </Field>

      <Field label="Password">
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          placeholder="••••••••"
        />
      </Field>

      <div className="-mt-1 text-right">
        <Link
          href="/auth/forgot-password"
          className="text-sm font-medium text-primary hover:text-secondary"
        >
          Forgot password?
        </Link>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className={buttonClass("primary") + " w-full disabled:opacity-60"}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </button>
    </form>
  );
}
