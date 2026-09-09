import type { Metadata } from "next";
import Link from "next/link";
import { FormularioEntrar } from "@/components/FormularioEntrar.tsx";

export const metadata: Metadata = { title: "Entrar" };

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
        <p className="mt-2 text-sm leading-relaxed text-suave">
          Escreva o seu email e enviamos uma ligação para entrar. Não há palavra-passe
          para criar nem para esquecer.
        </p>
      </div>

      {erro !== undefined && (
        <p
          role="alert"
          className="rounded-xl border border-aviso-tinta/25 bg-aviso-suave px-4 py-3 text-sm text-aviso-tinta"
        >
          Essa ligação já foi usada ou expirou. Peça outra abaixo.
        </p>
      )}

      <FormularioEntrar />

      <p className="text-xs leading-relaxed text-tenue">
        Usamos o seu email apenas para lhe enviar os alertas que pedir e para o
        identificar quando volta. Pode cancelar em qualquer alerta ou apagar a conta a
        qualquer momento — veja a{" "}
        <Link href="/privacidade" className="underline underline-offset-4">
          política de privacidade
        </Link>
        .
      </p>
    </div>
  );
}
