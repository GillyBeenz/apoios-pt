import Link from "next/link";
import { ETIQUETAS_ESTADO, ETIQUETAS_MEDIDAS, type Apoio, type EstadoApoio } from "@apoios/core";
import { diasRestantes, etiquetaPrecisao, formatarEuros, formatarPrazo } from "@/lib/formatar.ts";
import { elegibilidade, type EstadoElegibilidade } from "@/lib/elegibilidade.ts";

const PONTO_ESTADO = {
  aberto: "bg-aberto",
  previsto: "bg-previsto",
  encerrado: "bg-encerrado",
  suspenso: "bg-suspenso",
  desconhecido: "bg-encerrado",
} as const satisfies Record<EstadoApoio, string>;

// `satisfies` rather than a chain of ternaries: the old form quietly funnelled
// any unhandled state into the amber branch, so adding one to the union changed
// what the badge said with nothing to flag it.
const CAIXA_ELEGIBILIDADE = {
  aberto: "bg-ok-suave text-ok-tinta",
  fechado: "bg-urgente-suave text-urgente",
  por_confirmar: "bg-aviso-suave text-aviso-tinta",
} as const satisfies Record<EstadoElegibilidade, string>;

/**
 * One component for every place a fund appears.
 *
 * Concentrating it here is what makes the non-negotiables structural rather than
 * a matter of remembering: the official-source link is rendered unconditionally
 * (the column is `not null`, so it cannot silently vanish), the deadline always
 * carries its precision, and a fund under review always shows that it is.
 */
export function CartaoApoio({ apoio }: { apoio: Apoio }) {
  const e = elegibilidade(apoio);
  const dias = diasRestantes(apoio.fechaEm);
  const precisao = etiquetaPrecisao(apoio.fechaEm);
  const apoioMax = formatarEuros(apoio.apoioMaxEur);
  const urgente = dias !== null && dias >= 0 && dias <= 14;

  return (
    <article className="group relative flex flex-col rounded-xl border border-linha bg-superficie p-5 shadow-cartao transition-all hover:border-linha-forte hover:shadow-alta focus-within:border-marca-linha">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-suave">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <span
            aria-hidden
            className={`inline-block size-2 rounded-full ${PONTO_ESTADO[apoio.estado]}`}
          />
          {ETIQUETAS_ESTADO[apoio.estado]}
        </span>
        {apoio.programaPai !== null && (
          <span className="text-tenue">· {apoio.programaPai}</span>
        )}
        {apoio.dotacaoEsgotada && (
          <span className="font-medium text-urgente">· dotação esgotada</span>
        )}
      </div>

      <h3 className="mt-2.5 text-[0.9375rem] font-semibold leading-snug tracking-tight">
        {/*
          Stretched link: the whole card is the target, but the accessible name and
          the focus ring stay on the real anchor. Anything interactive that must sit
          on top of it — the official-source link — is given its own stacking level.
        */}
        <Link
          href={`/apoios/${apoio.slug}`}
          className="after:absolute after:inset-0 after:rounded-xl hover:underline underline-offset-4"
        >
          {apoio.titulo}
        </Link>
      </h3>

      {apoio.resumo !== null && (
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-suave">{apoio.resumo}</p>
      )}

      {apoio.medidas.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {apoio.medidas.map((m) => (
            <li
              key={m}
              className="rounded-full border border-marca-linha bg-marca-suave px-2.5 py-0.5 text-xs font-medium text-marca"
            >
              {ETIQUETAS_MEDIDAS[m]}
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-linha pt-4 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-tenue">Prazo</dt>
          <dd className="mt-0.5">
            {formatarPrazo(apoio.fechaEm)}
            {/* Say so out loud when the date is approximate, rather than letting a
                confident-looking string imply precision the notice never gave. */}
            {precisao !== null && (
              <span className="ml-1 text-xs text-tenue">({precisao})</span>
            )}
          </dd>
          {urgente && (
            <dd className="mt-1 inline-flex rounded px-1.5 py-0.5 text-xs font-semibold bg-urgente-suave text-urgente">
              faltam {dias} {dias === 1 ? "dia" : "dias"}
            </dd>
          )}
        </div>
        {apoioMax !== null && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-tenue">
              Apoio máximo
            </dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{apoioMax}</dd>
          </div>
        )}
      </dl>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-xs">
        <span
          data-estado={e.estado}
          className={`rounded-md px-2 py-1 font-medium ${CAIXA_ELEGIBILIDADE[e.estado]}`}
        >
          {e.titulo}
        </span>

        {apoio.needsReview && (
          <span
            data-rever="1"
            className="rounded-md border border-linha px-2 py-1 font-medium text-suave"
          >
            Por rever
          </span>
        )}

        {/* Unconditional. Every fund, everywhere, links to the authority. */}
        <a
          href={apoio.urlOficial}
          target="_blank"
          rel="noreferrer noopener"
          className="relative z-10 ml-auto underline underline-offset-4 text-suave hover:text-tinta"
        >
          Aviso oficial ↗
        </a>
      </div>
    </article>
  );
}
