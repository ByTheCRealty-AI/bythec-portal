import { Sidebar } from "@/components/Sidebar";

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-8 py-8">
        <div className="mx-auto max-w-6xl animate-fade-up">{children}</div>
      </main>
    </div>
  );
}
