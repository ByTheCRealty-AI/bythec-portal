import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <div className="w-full max-w-sm">
        {/* Marca */}
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/logo.png" alt="By the C Realty" className="mb-4 h-16 w-16 object-contain" />
          <h1 className="h-display text-2xl text-ink">By the C Realty</h1>
          <p className="mt-1 text-sm font-medium text-ink/75">and Property Management</p>
        </div>

        <div className="glass p-7">
          <h2 className="h-display text-lg text-ink">Reset your password</h2>
          <p className="mt-1 text-sm text-ink/55">
            Enter your email and we&apos;ll send you a link to set a new password.
          </p>
          <ForgotPasswordForm />
        </div>

        <p className="mt-6 text-center text-xs text-ink/40">
          Anchoring your future on Cape Cod · MA
        </p>
      </div>
    </main>
  );
}
