import { Anchor } from "lucide-react";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; reason?: string };
}) {
  const next = typeof searchParams.next === "string" ? searchParams.next : "/";
  const inactive = searchParams.reason === "inactive";

  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <div className="w-full max-w-sm">
        {/* Marca */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-white shadow-glow">
            <Anchor className="h-6 w-6" strokeWidth={2.5} />
          </div>
          <h1 className="h-display text-2xl text-ink">By the C</h1>
          <p className="mt-1 text-sm font-medium text-ink/75">Realty and Property Management</p>
        </div>

        <div className="glass p-7">
          <h2 className="h-display text-lg text-ink">Sign in</h2>
          <p className="mt-1 text-sm text-ink/55">Use your By the C email and password.</p>

          {inactive && (
            <div className="mt-4 rounded-xl border border-secondary/30 bg-secondary/[0.07] px-4 py-3 text-sm text-ink/75">
              Your account is inactive. Please contact an administrator.
            </div>
          )}

          <LoginForm next={next} />
        </div>

        <p className="mt-6 text-center text-xs text-ink/40">
          Anchoring your future on Cape Cod · MA
        </p>
      </div>
    </main>
  );
}
