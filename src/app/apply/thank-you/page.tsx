// =============================================================================
// /apply/thank-you — confirmação pública bilíngue após envio da aplicação.
// =============================================================================

export const metadata = {
  title: "Application received · By the C Realty",
};

export default function ThankYouPage() {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-lg place-items-center px-5 py-12">
      <div className="w-full text-center">
        <img src="/logo.png" alt="By the C Realty" className="mx-auto mb-5 h-14 w-14 object-contain" />
        <div className="glass p-8">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-2xl">
            ✓
          </div>
          <h1 className="h-display text-xl text-ink">Application received</h1>
          <p className="mt-2 text-sm text-ink/65">
            Thank you. We&apos;ve received your rental application and the $100 processing fee.
            A member of our team will review it and be in touch. Questions? Call (508) 364-8556
            or email info@bythecrealty.com.
          </p>

          <hr className="my-5 border-black/[0.06]" />

          <h2 className="h-display text-lg text-ink">Aplicação recebida</h2>
          <p className="mt-2 text-sm text-ink/65">
            Obrigado. Recebemos a sua aplicação de aluguel e a taxa de processamento de $100.
            Um membro da nossa equipe irá analisá-la e entrar em contato. Dúvidas? Ligue para
            (508) 364-8556 ou envie um e-mail para info@bythecrealty.com.
          </p>
        </div>
        <p className="mt-6 text-center text-xs text-ink/40">By the C Realty and Property Management · Cape Cod, MA</p>
      </div>
    </main>
  );
}
