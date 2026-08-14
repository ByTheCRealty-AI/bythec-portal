// =============================================================================
// By the C — Stripe server client (server-only)
// =============================================================================
// Usado SÓ no servidor pra: criar o PaymentIntent do fee de $50 e, no envio,
// RE-VALIDAR que o pagamento foi de fato concluído antes de gravar a aplicação.
// STRIPE_SECRET_KEY NUNCA vai pro browser (sem NEXT_PUBLIC_). A publishable key
// (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) é a única que o cliente usa.
//
// Import dinâmico do pacote `stripe` pra não quebrar o build/render de outras
// rotas caso o pacote/instalação ainda não esteja presente — só a rota /apply
// depende dele.
// =============================================================================

import "server-only";
import Stripe from "stripe";

export const APPLICATION_FEE_CENTS = 10000; // $100.00 — taxa não reembolsável

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// Retorna uma instância do Stripe (lazy). Lança se a secret key não existir.
// Import estático do pacote (server-only): forma canônica, evita ambiguidade de
// `.default` no import dinâmico de um pacote CJS (`export =`).
export async function getStripe(): Promise<Stripe> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY ausente. Configure no Vercel (Project Settings · " +
        "Environment Variables) com a secret key da conta Stripe da By the C."
    );
  }
  // Sem apiVersion explícita: usa a versão fixada pelo próprio SDK.
  return new Stripe(key);
}
