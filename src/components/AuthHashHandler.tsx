"use client";

// =============================================================================
// AuthHashHandler — pega o token de convite/recuperação que chega no HASH da URL
// (#access_token=...&refresh_token=...&type=invite|recovery) e finaliza o fluxo.
// =============================================================================
// Por quê: o convite do Supabase usa o fluxo IMPLÍCITO (/verify -> 303 com a
// sessão no fragmento `#`). O fragmento NUNCA chega ao servidor, então o
// middleware não enxerga. Se o link cai numa rota do painel (ex.: raiz `/`)
// enquanto já existe uma sessão no navegador (ex.: a dona logada testando o
// convite), o servidor renderiza a sessão ANTIGA pelo cookie e o token do
// convidado é silenciosamente descartado — e o link (uso único) já queimou.
//
// Este componente roda client-side em todo o painel: se vê um token no hash,
// grava a sessão do CONVIDADO (sobrescrevendo qualquer sessão anterior) e manda
// pra tela de criar senha. É idempotente e só age quando há `access_token`.
//
// Casos cobertos:
// - Sem sessão (convidado no próprio device): o middleware joga pra /login com o
//   hash preservado e o LoginForm já trata. Aqui é a rede de segurança pro caso
//   logado (colisão de sessão) e pra qualquer rota do painel que receba o hash.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AuthHashHandler() {
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (!hash || !hash.includes("access_token")) return;
    handled.current = true;

    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return;

    const supabase = createClient();
    (async () => {
      try {
        // setSession sobrescreve os cookies com a sessão do convidado — mesmo que
        // a dona estivesse logada, o token do convite assume a partir daqui.
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        // Limpa o hash da barra de endereço de qualquer jeito (token usado).
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        if (error) {
          router.replace("/login?reason=link-expired");
          return;
        }
        router.replace("/auth/set-password");
        router.refresh();
      } catch {
        router.replace("/login?reason=link-expired");
      }
    })();
  }, [router]);

  return null;
}
