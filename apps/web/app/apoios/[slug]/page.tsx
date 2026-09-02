import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ETIQUETAS_ESTADO,
  ETIQUETAS_MEDIDAS,
  ETIQUETAS_BENEFICIARIO,
} from "@apoios/core";
import { repositorio } from "@/lib/dados/index.ts";
import { BannerElegibilidade } from "@/components/BannerElegibilidade.tsx";
import {
  etiquetaPrecisao,
  formatarData,
  formatarEuros,
  formatarPrazo,
} from "@/lib/formatar.ts";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const apoio = await repositorio().obterPorSlug(slug);
  if (apoio === null) return { title: "Apoio não encontrado" };
  return { title: apoio.titulo, description: apoio.resumo ?? undefined };
}

export default async function DetalheApoio({ params }: Props) {
  const { slug } = await params;
  const apoio = await repositorio().obterPorSlug(slug);
  if (apoio === null) notFound();

  const precisaoFecho = etiquetaPrecisao(apoio.fechaEm);
  const precisaoAbertura = etiquetaPrecisao(apoio.abreEm);

  return (
    <article className="max-w-3xl space-y-6">
      <div className="text-sm text-[--color-suave]">
        {ETIQUETAS_ESTADO[apoio.estado]}
        {apoio.programaPai !== null && ` · ${apoio.programaPai}`}
        {apoio.referenciaLegal !== null && ` · ${apoio.referenciaLegal}`}
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-balance">{apoio.titulo}</h1>

      {/* Top of the page, always. Whether they can apply decides whether the rest
          of this page is worth their time. */}
      <BannerElegibilidade apoio={apoio} />

      {apoio.needsReview && (
        <div className="rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-3 text-sm">
          <p className="font-medium">Informação por rever</p>
          <p className="mt-1 text-[--color-suave]">
            A leitura automática deste aviso não atingiu o nível de confiança que
            exigimos, por isso não geramos alertas a partir dele. Confirme os dados
            no aviso oficial.
          </p>
        </div>
      )}

      {apoio.dotacaoEsgotada && (
        <div className="rounded-lg border border-red-600/30 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-medium">Dotação esgotada</p>
          <p className="mt-1">
            O orçamento deste aviso foi esgotado, o que na prática encerra as
            candidaturas mesmo que o prazo ainda não tenha terminado.
          </p>
        </div>
      )}

      {apoio.resumo !== null && <p className="leading-relaxed">{apoio.resumo}</p>}

      <dl className="grid gap-4 sm:grid-cols-2 rounded-lg border border-[--color-linha] p-5 text-sm">
        <div>
          <dt className="text-xs text-[--color-suave]">Abertura</dt>
          <dd>
            {formatarPrazo(apoio.abreEm)}
            {precisaoAbertura !== null && (
              <span className="ml-1 text-xs text-[--color-suave]">({precisaoAbertura})</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[--color-suave]">Encerramento</dt>
          <dd>
            {formatarPrazo(apoio.fechaEm)}
            {precisaoFecho !== null && (
              <span className="ml-1 text-xs text-[--color-suave]">({precisaoFecho})</span>
            )}
          </dd>
        </div>
        {apoio.apoioMaxEur !== null && (
          <div>
            <dt className="text-xs text-[--color-suave]">Apoio máximo</dt>
            <dd>{formatarEuros(apoio.apoioMaxEur)}</dd>
          </div>
        )}
        {apoio.dotacaoTotalEur !== null && (
          <div>
            <dt className="text-xs text-[--color-suave]">Dotação global</dt>
            <dd>{formatarEuros(apoio.dotacaoTotalEur)}</dd>
          </div>
        )}
        <div className="sm:col-span-2">
          <dt className="text-xs text-[--color-suave]">Beneficiários</dt>
          <dd>
            {apoio.beneficiarios.length > 0
              ? apoio.beneficiarios.map((b) => ETIQUETAS_BENEFICIARIO[b]).join(", ")
              : "Não especificado no aviso"}
          </dd>
        </div>
      </dl>

      {apoio.detalheApoios.length > 0 && (
        <section>
          <h2 className="font-semibold">Medidas apoiadas</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs text-[--color-suave]">
                  <th className="border-b border-[--color-linha] py-2 pr-4">Medida</th>
                  <th className="border-b border-[--color-linha] py-2 pr-4">Comparticipação</th>
                  <th className="border-b border-[--color-linha] py-2">Limite</th>
                </tr>
              </thead>
              <tbody>
                {apoio.detalheApoios.map((d, i) => (
                  <tr key={`${d.medida}-${i}`}>
                    <td className="border-b border-[--color-linha] py-2 pr-4">
                      {ETIQUETAS_MEDIDAS[d.medida]}
                    </td>
                    <td className="border-b border-[--color-linha] py-2 pr-4">
                      {d.percentagemApoio !== null ? `${d.percentagemApoio}%` : "—"}
                    </td>
                    <td className="border-b border-[--color-linha] py-2">
                      {formatarEuros(d.valorMaxEur) ?? "—"}
                      {d.unidade !== null && (
                        <span className="text-[--color-suave]"> {d.unidade}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* In the same card as the content, never relegated to the footer. */}
      <section className="rounded-lg border border-[--color-linha] bg-[--color-marca-suave]/40 p-5 text-sm">
        <p className="font-medium">Fonte oficial</p>
        <p className="mt-1 text-[--color-suave]">
          Informação recolhida em {formatarData(apoio.vistoPelaUltimaVez)} a partir de{" "}
          {apoio.entidadeGestora ?? "fonte pública"}. Os termos do aviso oficial
          prevalecem sobre o que consta desta página.
        </p>
        <a
          href={apoio.urlOficial}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 inline-block rounded-md bg-[--color-marca] px-4 py-2 font-medium text-white"
        >
          Ver aviso oficial ↗
        </a>
      </section>
    </article>
  );
}
