"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { cancelar, type ResultadoCancelamento } from "@/lib/conta/cancelar.ts";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-marca px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "A cancelar…" : "Confirmar cancelamento"}
    </button>
  );
}

const MENSAGENS: Record<ResultadoCancelamento["estado"], string> = {
  tudo: "Pronto. Deixou de receber alertas.",
  medida: "Pronto. Deixou de receber alertas sobre esta medida.",
  desconhecido:
    "Esta ligação já não é válida. Se ainda receber alertas, cancele nas preferências.",
  erro: "Não foi possível cancelar agora. Tente novamente daqui a pouco.",
};

export function BotaoCancelar({ token }: { token: string }) {
  const [estado, accao] = useActionState<ResultadoCancelamento | null, FormData>(
    async () => cancelar(token),
    null,
  );

  if (estado !== null) {
    const texto =
      estado.estado === "medida" && estado.medida !== undefined
        ? `Pronto. Deixou de receber alertas sobre ${estado.medida}.`
        : MENSAGENS[estado.estado];
    return (
      <p
        role="status"
        className="rounded-xl border border-marca/25 bg-marca-suave px-4 py-3 text-sm"
      >
        {texto}
      </p>
    );
  }

  return (
    <form action={accao}>
      <Botao />
    </form>
  );
}
