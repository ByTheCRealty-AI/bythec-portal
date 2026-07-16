"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { Loader2 } from "lucide-react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      // O link de recuperação leva a pessoa de volta ao portal já com a sessão,
      // e a tela de definir senha (SetPasswordForm) finaliza a troca.
      const redirectTo = `${window.location.origin}/auth/set-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (error) {
        setError(error.message || "Could not send the reset email. Please try again.");
        setLoading(false);
        return;
      }
      // Sempre mostramos sucesso (não revelamos se o e-mail existe).
      setSent(true);
      setLoading(false);
    } catch {
      setError("Could not send the reset email right now. Please try again.");
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="mt-5 space-y-4">
        <div className="rounded-xl border border-secondary/30 bg-secondary/[0.07] px-4 py-3 text-sm text-ink/75">
          If an account exists for <span className="font-medium text-ink">{email.trim()}</span>,
          we sent a link to reset your password. Check your inbox (and spam).
        </div>
        <Link href="/login" className={buttonClass("ghost") + " w-full"}>
          Back to sign in
        </Link>
      </div>
    );
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

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className={buttonClass("primary") + " w-full disabled:opacity-60"}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Sending…
          </>
        ) : (
          "Send reset link"
        )}
      </button>

      <Link href="/login" className="block text-center text-sm text-ink/55 hover:text-ink">
        Back to sign in
      </Link>
    </form>
  );
}
