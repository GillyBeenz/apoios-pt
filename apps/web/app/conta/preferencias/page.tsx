import type { Metadata } from "next";
import {
  ETIQUETAS_MEDIDAS,
  TAXONOMIA_MEDIDAS,
  BENEFICIARIOS_PROPRIETARIO,
  ETIQUETAS_BENEFICIARIO,
} from "@apoios/core";

export const metadata: Metadata = { title: "Preferências" };

/**
 * Subscription UI.
 *
 * The measure list is derived from TAXONOMIA_MEDIDAS, never re-typed — this is the
 * constant's second consumer, and drift between the two would silently break
 * matching for whichever measure diverged.
 *
 * Not yet persisted: there is no Supabase project, so this renders the real shape
 * of the form without pretending to save. Wiring it up is part of the auth work.
 */
export default function Preferencias() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Preferências de alerta</h1>
        <p className="mt-2 text-sm text-[--color-suave]">
          Escolha o que quer melhorar em casa. Avisamos quando abrir financiamento a
          que se possa candidatar — e só nesse caso.
        </p>
      </div>

      <div className="rounded-lg border border-amber-600/30 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Ainda não é possível guardar preferências: falta ligar a base de dados e o
        início de sessão. O formulário abaixo mostra as opções que existirão.
      </div>

      <section>
        <h2 className="font-medium">Medidas a seguir</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
          {TAXONOMIA_MEDIDAS.map((m) => (
            <li key={m}>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="medida" value={m} disabled />
                <span>{ETIQUETAS_MEDIDAS[m]}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-medium">Candidata-se como</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {BENEFICIARIOS_PROPRIETARIO.map((b) => (
            <li key={b}>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="beneficiario" value={b} defaultChecked disabled />
                <span>{ETIQUETAS_BENEFICIARIO[b]}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-medium">Frequência</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {[
            ["diaria", "Resumo diário (recomendado)"],
            ["semanal", "Resumo semanal"],
            ["imediata", "Assim que houver novidades"],
          ].map(([valor, etiqueta]) => (
            <li key={valor}>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="frequencia"
                  value={valor}
                  defaultChecked={valor === "diaria"}
                  disabled
                />
                <span>{etiqueta}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-[--color-suave]">
          Independentemente da frequência escolhida, avisos urgentes — como a dotação
          esgotar-se — são enviados de imediato.
        </p>
      </section>
    </div>
  );
}
