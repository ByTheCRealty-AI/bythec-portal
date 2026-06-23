"use client";

// Volta SEMPRE pra lista de Properties (nunca pro histórico, que pode ser a tela
// de edição). Restaura aba (tipo) + busca a partir do snapshot que a lista guarda
// em sessionStorage ao clicar numa linha. Fallback: /propriedades.
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function BackButton() {
  const router = useRouter();

  function goBack() {
    let target = "/propriedades";
    try {
      const saved = sessionStorage.getItem("bythec:properties-return");
      if (saved && saved.startsWith("/propriedades")) target = saved;
    } catch {
      /* sessionStorage indisponível — usa o fallback */
    }
    router.push(target);
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink/55 transition hover:text-primary"
    >
      <ArrowLeft className="h-4 w-4" /> Back to properties
    </button>
  );
}
