import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { RegistarServiceWorker } from "@/components/RegistarServiceWorker.tsx";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://apoios.pt"),
  title: {
    default: "Apoios — financiamento ambiental para a sua casa",
    template: "%s · Apoios",
  },
  description:
    "Alertas de apoios ambientais e energéticos em Portugal, para as melhorias " +
    "que quer fazer em casa e a que se pode mesmo candidatar.",
  applicationName: "Apoios",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Apoios",
    // `default` keeps the status bar legible in both colour schemes; `black-translucent`
    // would put iOS's own text over the header.
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icone.svg", type: "image/svg+xml" },
      { url: "/icone-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // Both, so the installed app matches the system scheme instead of flashing
  // a light chrome around a dark page.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbf9" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1c20" },
  ],
  colorScheme: "light dark",
  viewportFit: "cover",
};

const LIGACOES = [
  { href: "/apoios", texto: "Apoios" },
  { href: "/conta/preferencias", texto: "Preferências" },
  { href: "/sobre", texto: "Sobre" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT">
      <body className="flex min-h-screen flex-col antialiased">
        {/* First tab stop. The filter panel is long, and without this a keyboard
            user has to walk the whole of it to reach the results. */}
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-marca focus:px-4 focus:py-2 focus:text-white"
        >
          Saltar para o conteúdo
        </a>

        <header className="sticky top-0 z-40 border-b border-linha bg-fundo/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <Link
              href="/"
              className="flex items-center gap-2 text-lg font-semibold tracking-tight"
            >
              <span
                aria-hidden
                className="grid size-7 place-items-center rounded-lg bg-marca text-sm font-bold text-white"
              >
                A
              </span>
              Apoios
            </Link>
            <nav aria-label="Principal" className="flex gap-1 text-sm">
              {LIGACOES.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="rounded-md px-2.5 py-1.5 text-suave transition-colors hover:bg-marca-suave hover:text-tinta"
                >
                  {l.texto}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>

        {/*
          The disclaimer is in the footer of every page, not only the legal ones.
          This is an unofficial aggregator and a reader must never be able to spend
          time here without seeing that the official notice is what governs.
        */}
        <footer className="mt-16 border-t border-linha bg-superficie">
          <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 text-sm text-suave">
            <p className="max-w-3xl">
              O Apoios não está associado ao Fundo Ambiental, ao Portugal 2030, ao PRR
              nem a qualquer entidade pública. A informação é recolhida
              automaticamente e pode estar incompleta ou desatualizada.{" "}
              <strong className="font-medium text-tinta">
                O aviso oficial prevalece sempre.
              </strong>
            </p>
            <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
              <Link href="/sobre" className="underline underline-offset-4 hover:text-tinta">
                Sobre
              </Link>
              <Link href="/privacidade" className="underline underline-offset-4 hover:text-tinta">
                Privacidade
              </Link>
              <Link href="/termos" className="underline underline-offset-4 hover:text-tinta">
                Termos
              </Link>
              <Link
                href="/isencao-responsabilidade"
                className="underline underline-offset-4 hover:text-tinta"
              >
                Isenção de responsabilidade
              </Link>
            </nav>
          </div>
        </footer>

        <RegistarServiceWorker />
      </body>
    </html>
  );
}
