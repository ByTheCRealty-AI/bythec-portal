import { Anchor } from "lucide-react";
import { SetPasswordForm } from "./SetPasswordForm";

export const dynamic = "force-dynamic";

export default function SetPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-white shadow-glow">
            <Anchor className="h-6 w-6" strokeWidth={2.5} />
          </div>
          <h1 className="h-display text-2xl text-ink">By the C</h1>
          <p className="mt-1 text-sm text-ink/55">Welcome — set your password</p>
        </div>

        <div className="glass p-7">
          <h2 className="h-display text-lg text-ink">Create a password</h2>
          <p className="mt-1 text-sm text-ink/55">
            Choose a password to finish setting up your access.
          </p>
          <SetPasswordForm />
        </div>
      </div>
    </main>
  );
}
