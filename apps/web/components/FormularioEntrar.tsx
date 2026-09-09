"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { pedirLigacao } from "@/lib/conta/accoes.ts";
import type { EstadoFormulario } from "@/lib/conta/tipos.ts";

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-marca px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "A enviar…" : "Enviar ligação de entrada"}
    </button>
  );
}

export function FormularioEntrar() {
  const [estado, accao] = useActionState<EstadoFormulario, FormData>(pedirLigacao, {});

  if (estado.guardado === true) {
    return (
      <p
        role="status"
        className="rounded-xl border border-marca/25 bg-marca-suave px-4 py-3 text-sm"
      >
        Enviámos-lhe uma ligação. Abra-a no telemóvel ou no computador — funciona em
        qualquer um. Se não aparecer em poucos minutos, verifique o spam.
      </p>
    );
  }

  return (
    <form action={accao} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-1.5 w-full rounded-lg border border-linha bg-superficie px-3 py-2 text-sm"
        />
      </div>

      <label className="flex gap-3 text-sm">
        <input
          type="checkbox"
          name="consentimento"
          value="sim"
          required
          className="mt-0.5 size-4 shrink-0 accent-marca"
        />
        <span className="text-suave">
          Aceito a{" "}
          <Link href="/privacidade" className="underline underline-offset-4">
            política de privacidade
          </Link>{" "}
          e que me enviem alertas por email.
        </span>
      </label>

      {estado.erro !== undefined && (
        <p role="alert" className="text-sm text-aviso-tinta">
          {estado.erro}
        </p>
      )}

      <Botao />
    </form>
  );
}
