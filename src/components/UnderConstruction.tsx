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
        title="Module under construction"
        message="This area ships in the next Wave 2 rounds. The database schema is already modeled — only the interface is left."
        cta={
          <Link href="/clientes" className={buttonClass("ghost")}>
            Go to Clients
          </Link>
        }
      />
    </>
  );
}
