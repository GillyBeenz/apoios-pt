import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Apoios — financiamento ambiental para a sua casa",
    template: "%s · Apoios",
  },
  description:
    "Alertas de apoios ambientais e energéticos em Portugal, para as melhorias " +
    "que quer fazer em casa e a que se pode mesmo candidatar.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#1f7a4d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT">
      <body className="min-h-screen antialiased flex flex-col">
        <header className="border-b border-[--color-linha]">
          <div className="mx-auto max-w-5xl px-4 py-4 flex items-center gap-6">
            <Link href="/" className="font-semibold tracking-tight text-lg">
              Apoios
            </Link>
            <nav className="flex gap-5 text-sm text-[--color-suave]">
              <Link href="/apoios" className="hover:text-[--color-tinta]">
                Apoios
              </Link>
              <Link href="/conta/preferencias" className="hover:text-[--color-tinta]">
                Preferências
              </Link>
              <Link href="/sobre" className="hover:text-[--color-tinta]">
                Sobre
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8">{children}</main>

        {/*
          The disclaimer is in the footer of every page, not only the legal ones.
          This is an unofficial aggregator and a reader must never be able to spend
          time here without seeing that the official notice is what governs.
        */}
        <footer className="border-t border-[--color-linha] mt-12">
          <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-[--color-suave] space-y-3">
            <p>
              O Apoios não está associado ao Fundo Ambiental, ao Portugal 2030, ao PRR
              nem a qualquer entidade pública. A informação é recolhida
              automaticamente e pode estar incompleta ou desatualizada.{" "}
              <strong className="font-medium text-[--color-tinta]">
                O aviso oficial prevalece sempre.
              </strong>
            </p>
            <nav className="flex flex-wrap gap-4">
              <Link href="/sobre" className="underline underline-offset-2">Sobre</Link>
              <Link href="/privacidade" className="underline underline-offset-2">Privacidade</Link>
              <Link href="/termos" className="underline underline-offset-2">Termos</Link>
              <Link href="/isencao-responsabilidade" className="underline underline-offset-2">
                Isenção de responsabilidade
              </Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
