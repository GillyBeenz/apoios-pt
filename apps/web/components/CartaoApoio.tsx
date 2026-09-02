import Link from "next/link";
import { ETIQUETAS_ESTADO, ETIQUETAS_MEDIDAS, type Apoio } from "@apoios/core";
import { diasRestantes, etiquetaPrecisao, formatarEuros, formatarPrazo } from "@/lib/formatar.ts";
import { elegibilidade } from "@/lib/elegibilidade.ts";

const PONTO_ESTADO = {
  aberto: "bg-green-600",
  previsto: "bg-blue-600",
  encerrado: "bg-neutral-400",
  suspenso: "bg-amber-500",
  desconhecido: "bg-neutral-300",
} as const;

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

  return (
    <article className="rounded-lg border border-[--color-linha] bg-white p-5">
      <div className="flex items-center gap-2 text-xs text-[--color-suave]">
        <span className={`inline-block size-2 rounded-full ${PONTO_ESTADO[apoio.estado]}`} />
        <span>{ETIQUETAS_ESTADO[apoio.estado]}</span>
        {apoio.programaPai !== null && <span>· {apoio.programaPai}</span>}
        {apoio.dotacaoEsgotada && (
          <span className="text-red-700 font-medium">· dotação esgotada</span>
        )}
      </div>

      <h3 className="mt-2 font-semibold leading-snug">
        <Link href={`/apoios/${apoio.slug}`} className="hover:underline underline-offset-2">
          {apoio.titulo}
        </Link>
      </h3>

      {apoio.resumo !== null && (
        <p className="mt-2 text-sm text-[--color-suave] line-clamp-3">{apoio.resumo}</p>
      )}

      {apoio.medidas.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {apoio.medidas.map((m) => (
            <li
              key={m}
              className="rounded-full bg-[--color-marca-suave] px-2.5 py-0.5 text-xs text-[--color-marca]"
            >
              {ETIQUETAS_MEDIDAS[m]}
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-[--color-suave]">Prazo</dt>
          <dd>
            {formatarPrazo(apoio.fechaEm)}
            {/* Say so out loud when the date is approximate, rather than letting a
                confident-looking string imply precision the notice never gave. */}
            {precisao !== null && (
              <span className="ml-1 text-xs text-[--color-suave]">({precisao})</span>
            )}
            {dias !== null && dias >= 0 && dias <= 14 && (
              <span className="ml-1 text-xs font-medium text-red-700">
                faltam {dias} {dias === 1 ? "dia" : "dias"}
              </span>
            )}
          </dd>
        </div>
        {apoioMax !== null && (
          <div>
            <dt className="text-xs text-[--color-suave]">Apoio máximo</dt>
            <dd>{apoioMax}</dd>
          </div>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
        <span
          data-estado={e.estado}
          className={
            e.estado === "aberto"
              ? "rounded px-2 py-1 bg-green-50 text-green-900"
              : e.estado === "fechado"
                ? "rounded px-2 py-1 bg-red-50 text-red-900"
                : "rounded px-2 py-1 bg-amber-50 text-amber-900"
          }
        >
          {e.titulo}
        </span>

        {apoio.needsReview && (
          <span className="rounded px-2 py-1 bg-neutral-100 text-neutral-700" data-rever="1">
            Por rever
          </span>
        )}

        {/* Unconditional. Every fund, everywhere, links to the authority. */}
        <a
          href={apoio.urlOficial}
          target="_blank"
          rel="noreferrer noopener"
          className="ml-auto underline underline-offset-2 text-[--color-suave]"
        >
          Ver aviso oficial ↗
        </a>
      </div>
    </article>
  );
}
