import { PageHeader, EmptyState, buttonClass } from "@/components/ui";
import { Hammer } from "lucide-react";
import Link from "next/link";

export function UnderConstruction({
  title,
  phase,
}: {
  title: string;
  phase: string;
}) {
  return (
    <>
      <PageHeader title={title} subtitle={phase} />
      <EmptyState
        icon={<Hammer className="h-6 w-6" />}
        title="Módulo em construção"
        message="Esta área entra nas próximas rodadas da Onda 2. O schema do banco já está modelado — falta a interface."
        cta={
          <Link href="/clientes" className={buttonClass("ghost")}>
            Ir para Clientes
          </Link>
        }
      />
    </>
  );
}
