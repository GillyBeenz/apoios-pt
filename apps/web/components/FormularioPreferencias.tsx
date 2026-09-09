"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  BENEFICIARIOS_PROPRIETARIO,
  ETIQUETAS_BENEFICIARIO,
  ETIQUETAS_MEDIDAS,
  TAXONOMIA_MEDIDAS,
  type Medida,
  type TipoBeneficiario,
  // From `@apoios/core/taxonomia`, not the package root: the root barrel reaches
  // `diferencas.ts`, which imports `node:crypto`, and this is a client component —
  // the bundler cannot follow that and the build fails outright. The taxonomy
  // module has no imports of its own, so it is safe in a browser bundle.
} from "@apoios/core/taxonomia";
import { guardarPreferencias } from "@/lib/conta/accoes.ts";
import type { EstadoFormulario, Frequencia } from "@/lib/conta/tipos.ts";

const FREQUENCIAS = [
  ["diaria", "Resumo diário", "Recomendado. Uma mensagem por dia, só se houver algo."],
  ["semanal", "Resumo semanal", "Uma mensagem à segunda-feira com tudo o que abriu."],
  ["imediata", "Assim que houver novidades", "Uma mensagem por cada aviso novo."],
] as const;

function Guardar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-marca px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "A guardar…" : "Guardar preferências"}
    </button>
  );
}

/**
 * The measure list is derived from TAXONOMIA_MEDIDAS, never re-typed — this is the
 * constant's second consumer, and drift between the two would silently break
 * matching for whichever measure diverged.
 */
export function FormularioPreferencias({
  medidas,
  beneficiarios,
  frequencia,
}: {
  medidas: readonly Medida[];
  beneficiarios: readonly TipoBeneficiario[];
  frequencia: Frequencia;
}) {
  const [estado, accao] = useActionState<EstadoFormulario, FormData>(
    guardarPreferencias,
    {},
  );

  const medidasActivas = new Set(medidas);
  const beneficiariosActivos = new Set(beneficiarios);

  return (
    <form action={accao} className="space-y-8">
      <fieldset className="border-0 p-0">
        <legend className="font-semibold tracking-tight">Medidas a seguir</legend>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {TAXONOMIA_MEDIDAS.map((m) => (
            <label
              key={m}
              className="flex gap-3 rounded-lg border border-linha bg-superficie p-3"
            >
              <input
                type="checkbox"
                name="medida"
                value={m}
                defaultChecked={medidasActivas.has(m)}
                className="mt-0.5 size-4 shrink-0 accent-marca"
              />
              <span>{ETIQUETAS_MEDIDAS[m]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="border-0 p-0">
        <legend className="font-semibold tracking-tight">Candidata-se como</legend>
        <div className="mt-3 space-y-2 text-sm">
          {BENEFICIARIOS_PROPRIETARIO.map((b) => (
            <label
              key={b}
              className="flex gap-3 rounded-lg border border-linha bg-superficie p-3"
            >
              <input
                type="checkbox"
                name="beneficiario"
                value={b}
                defaultChecked={beneficiariosActivos.has(b)}
                className="mt-0.5 size-4 shrink-0 accent-marca"
              />
              <span>{ETIQUETAS_BENEFICIARIO[b]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="border-0 p-0">
        <legend className="font-semibold tracking-tight">Frequência</legend>
        <div className="mt-3 space-y-2 text-sm">
          {FREQUENCIAS.map(([valor, etiqueta, detalhe]) => (
            <label
              key={valor}
              className="flex gap-3 rounded-lg border border-linha bg-superficie p-3"
            >
              <input
                type="radio"
                name="frequencia"
                value={valor}
                defaultChecked={valor === frequencia}
                className="mt-0.5 size-4 shrink-0 accent-marca"
              />
              <span>
                <span className="block">{etiqueta}</span>
                <span className="mt-0.5 block text-xs text-tenue">{detalhe}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-tenue">
          Independentemente da frequência escolhida, avisos urgentes — como a dotação
          esgotar-se — são enviados de imediato.
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Guardar />
        {estado.guardado === true && (
          <span role="status" className="text-sm text-marca">
            Preferências guardadas.
          </span>
        )}
        {estado.erro !== undefined && (
          <span role="alert" className="text-sm text-aviso-tinta">
            {estado.erro}
          </span>
        )}
      </div>
    </form>
  );
}
