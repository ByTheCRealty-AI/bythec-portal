"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { Loader2 } from "lucide-react";

export function SetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto-suficiência: se o link de convite cair DIRETO aqui com a sessão no hash
  // (#access_token=...&refresh_token=...), gravamos a sessão antes do submit, pra
  // o updateUser({password}) abaixo ter sessão válida. Idempotente.
  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (!hash || !hash.includes("access_token")) return;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return;
    const supabase = createClient();
    (async () => {
      try {
        await supabase.auth.setSession({ access_token, refresh_token });
      } catch {
        /* link inválido/expirado — o submit mostrará o erro */
      } finally {
        window.history.replaceState(null, "", window.location.pathname);
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.message || "Could not set the password. The link may have expired.");
        setLoading(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please request a new invite link.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-4">
      <Field label="New password" hint="At least 8 characters.">
        <input
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          placeholder="••••••••"
        />
      </Field>

      <Field label="Confirm password">
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
          placeholder="••••••••"
        />
      </Field>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className={buttonClass("primary") + " w-full disabled:opacity-60"}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Saving…
          </>
        ) : (
          "Save & continue"
        )}
      </button>
    </form>
  );
}
