"use client";

// Volta pra exatamente a tela anterior de Clients (aba + busca preservadas via URL).
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink/55 transition hover:text-primary"
    >
      <ArrowLeft className="h-4 w-4" /> Back to clients
    </button>
  );
}
