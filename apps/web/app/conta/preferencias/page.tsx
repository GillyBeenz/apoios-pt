import type { Metadata } from "next";
import {
  ETIQUETAS_MEDIDAS,
  TAXONOMIA_MEDIDAS,
  BENEFICIARIOS_PROPRIETARIO,
  ETIQUETAS_BENEFICIARIO,
} from "@apoios/core";

export const metadata: Metadata = { title: "Preferências" };

const FREQUENCIAS = [
  ["diaria", "Resumo diário", "Recomendado. Uma mensagem por dia, só se houver algo."],
  ["semanal", "Resumo semanal", "Uma mensagem à segunda-feira com tudo o que abriu."],
  ["imediata", "Assim que houver novidades", "Uma mensagem por cada aviso novo."],
] as const;

function Caixa({
  nome,
  valor,
  marcada,
  children,
  descricao,
}: {
  nome: string;
  valor: string;
  marcada?: boolean;
  children: React.ReactNode;
  descricao?: string;
}) {
  return (
    <label className="flex gap-3 rounded-lg border border-linha bg-superficie p-3 opacity-70">
      <input
        type="checkbox"
        name={nome}
        value={valor}
        defaultChecked={marcada}
        disabled
        aria-describedby="aviso-por-ligar"
        className="mt-0.5 size-4 shrink-0 accent-marca"
      />
      <span>
        <span className="block">{children}</span>
        {descricao !== undefined && (
          <span className="mt-0.5 block text-xs text-tenue">{descricao}</span>
        )}
      </span>
    </label>
  );
}

/**
 * Subscription UI.
 *
 * The measure list is derived from TAXONOMIA_MEDIDAS, never re-typed — this is the
 * constant's second consumer, and drift between the two would silently break
 * matching for whichever measure diverged.
 *
 * Every control is `disabled` and says why. There is a database now, but no way to
 * sign in, so nothing here has anywhere to be saved to. An enabled form that threw
 * the answers away would be worse than no form: someone would set their measures,
 * believe they were subscribed, and hear nothing when their funding opened.
 */
export default function Preferencias() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Preferências de alerta
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-suave">
          Escolha o que quer melhorar em casa. Avisamos quando abrir financiamento a
          que se possa candidatar — e só nesse caso.
        </p>
      </div>

      <p
        id="aviso-por-ligar"
        role="status"
        className="rounded-xl border border-aviso-tinta/25 bg-aviso-suave px-4 py-3 text-sm text-aviso-tinta"
      >
        Ainda não é possível guardar preferências: falta o início de sessão. O
        formulário abaixo mostra, desativado, as opções que existirão.
      </p>

      <fieldset className="border-0 p-0">
        <legend className="font-semibold tracking-tight">Medidas a seguir</legend>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {TAXONOMIA_MEDIDAS.map((m) => (
            <Caixa key={m} nome="medida" valor={m}>
              {ETIQUETAS_MEDIDAS[m]}
            </Caixa>
          ))}
        </div>
      </fieldset>

      <fieldset className="border-0 p-0">
        <legend className="font-semibold tracking-tight">Candidata-se como</legend>
        <div className="mt-3 space-y-2 text-sm">
          {BENEFICIARIOS_PROPRIETARIO.map((b) => (
            <Caixa key={b} nome="beneficiario" valor={b} marcada>
              {ETIQUETAS_BENEFICIARIO[b]}
            </Caixa>
          ))}
        </div>
      </fieldset>

      <fieldset className="border-0 p-0">
        <legend className="font-semibold tracking-tight">Frequência</legend>
        <div className="mt-3 space-y-2 text-sm">
          {FREQUENCIAS.map(([valor, etiqueta, detalhe]) => (
            <label
              key={valor}
              className="flex gap-3 rounded-lg border border-linha bg-superficie p-3 opacity-70"
            >
              <input
                type="radio"
                name="frequencia"
                value={valor}
                defaultChecked={valor === "diaria"}
                disabled
                aria-describedby="aviso-por-ligar"
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
    </div>
  );
}
