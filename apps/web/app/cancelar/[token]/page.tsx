import type { Metadata } from "next";
import Link from "next/link";
import { BotaoCancelar } from "@/components/BotaoCancelar.tsx";

export const metadata: Metadata = {
  title: "Cancelar alertas",
  // Never index an unsubscribe URL: the token is in the path.
  robots: { index: false, follow: false },
};

/**
 * The unsubscribe landing page.
 *
 * Deliberately does **not** unsubscribe on load. Corporate mail scanners and link
 * previewers fetch every URL in a message before a human sees it, so a GET that
 * mutates would silently unsubscribe people who never clicked anything — and the
 * failure is invisible: they simply stop hearing about funding and never learn why.
 * The click below is a POST, which scanners do not make.
 *
 * (The RFC 8058 one-click header in the email is also a POST, to a route that
 * accepts nothing else. Same rule, same reason.)
 */
export default async function Cancelar({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Cancelar alertas</h1>
      <p className="text-sm leading-relaxed text-suave">
        Confirme abaixo e deixa de receber. Não perde a conta nem as preferências —
        pode voltar a ligar os alertas quando quiser.
      </p>

      <BotaoCancelar token={token} />

      <p className="text-xs text-tenue">
        Enganou-se?{" "}
        <Link href="/conta/preferencias" className="underline underline-offset-4">
          Ver as preferências
        </Link>
        .
      </p>
    </div>
  );
}
