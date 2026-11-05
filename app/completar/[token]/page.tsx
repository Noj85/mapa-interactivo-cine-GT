import type { Metadata } from "next";
import { CompleteGate } from "@/components/aportar/CompleteGate";
import { BrandFooter } from "@/components/site/Brand";
import { SiteHeader } from "@/components/site/SiteHeader";

export const dynamic = "force-dynamic";
// Enlace privado: no debe aparecer en buscadores ni guardarse en cachés
export const metadata: Metadata = {
  title: "Completar información · Mapa del Cine de Guatemala",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function CompletarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-10">
        <CompleteGate token={token} />
      </main>
      <BrandFooter />
    </div>
  );
}
