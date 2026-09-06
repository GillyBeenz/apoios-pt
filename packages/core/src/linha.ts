import type { Apoio, ApoioNovo, DetalheApoio, DocumentoApoio } from "./tipos.ts";
import type {
  Confianca,
  EstadoApoio,
  Medida,
  PrecisaoData,
  TipoBeneficiario,
  Triestado,
} from "./taxonomia.ts";

/**
 * The `funds` row shape, and the mapping to and from `Apoio`, in one place.
 *
 * Both directions live here because there are two consumers — the web app reads
 * rows, the ingestion pipeline writes and re-reads them — and the rules in this
 * mapping are not cosmetic. `admiteParticulares` fails closed, `needsReview`
 * fails safe, and a date's precision travels with the date. A second copy that
 * drifted on any of those would not throw; it would quietly email a homeowner
 * about a programme they cannot apply to, or render a month-known deadline as an
 * exact day.
 */
export const COLUNAS_APOIO = [
  "id", "slug", "source_id", "titulo", "resumo", "programa_pai", "entidade_gestora",
  "referencia_legal", "estado", "dotacao_esgotada", "abre_em", "abre_em_precisao",
  "fecha_em", "fecha_em_precisao", "beneficiarios", "admite_particulares",
  "restricoes_beneficiario", "ambito", "municipios", "medidas",
  "medidas_por_classificar", "detalhe_apoios", "dotacao_total_eur", "apoio_max_eur",
  "url_oficial", "url_candidatura", "documentos", "needs_review", "motivo_revisao",
  "confianca_global", "publicado", "alertavel", "visto_pela_primeira_vez",
  "visto_pela_ultima_vez", "actualizado_em",
] as const;

/** The same list PostgREST wants in a `select`. */
export const SELECT_APOIO = COLUNAS_APOIO.join(", ");

export function paraApoio(l: Record<string, unknown>): Apoio {
  const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);
  const lista = <T,>(v: unknown): readonly T[] => (Array.isArray(v) ? (v as T[]) : []);
  const numero = (v: unknown): number | null =>
    v === null || v === undefined ? null : Number(v);

  return {
    id: String(l.id),
    slug: String(l.slug),
    sourceId: String(l.source_id),

    titulo: String(l.titulo),
    resumo: texto(l.resumo),
    programaPai: texto(l.programa_pai),
    entidadeGestora: texto(l.entidade_gestora),
    referenciaLegal: texto(l.referencia_legal),

    estado: (l.estado ?? "desconhecido") as EstadoApoio,
    dotacaoEsgotada: l.dotacao_esgotada === true,

    // The precision travels with the date, always. Separating them is how a
    // month-known deadline ends up rendered as an exact day.
    //
    // `textoFonte` is not stored: there is no column for it, so it comes back
    // null even for a fund that had one at extraction time. That is a real loss
    // on the round trip and is written down here rather than left to be
    // rediscovered — the raw phrase survives in `fund_extractions`.
    abreEm: {
      iso: texto(l.abre_em),
      precisao: (l.abre_em_precisao ?? "desconhecida") as PrecisaoData,
      textoFonte: null,
    },
    fechaEm: {
      iso: texto(l.fecha_em),
      precisao: (l.fecha_em_precisao ?? "desconhecida") as PrecisaoData,
      textoFonte: null,
    },

    beneficiarios: lista<TipoBeneficiario>(l.beneficiarios),
    // Fails closed: anything that is not literally `sim` or `nao` is unknown, and
    // unknown blocks an alert exactly as `nao` does.
    admiteParticulares: (l.admite_particulares === "sim" || l.admite_particulares === "nao"
      ? l.admite_particulares
      : "desconhecido") as Triestado,
    restricoesBeneficiario: texto(l.restricoes_beneficiario),

    ambito: (l.ambito ?? "desconhecido") as Apoio["ambito"],
    municipios: lista<string>(l.municipios),

    medidas: lista<Medida>(l.medidas),
    medidasPorClassificar: lista<string>(l.medidas_por_classificar),
    detalheApoios: lista<DetalheApoio>(l.detalhe_apoios),

    dotacaoTotalEur: numero(l.dotacao_total_eur),
    apoioMaxEur: numero(l.apoio_max_eur),

    urlOficial: String(l.url_oficial),
    urlCandidatura: texto(l.url_candidatura),
    documentos: lista<DocumentoApoio>(l.documentos),

    // Fails safe in the other direction: anything but an explicit `false` counts
    // as needing review, so a missing column hides a fund rather than publishing
    // an unreviewed one.
    needsReview: l.needs_review !== false,
    motivoRevisao: lista<string>(l.motivo_revisao),
    confiancaGlobal: (l.confianca_global ?? "baixa") as Confianca,
    publicado: l.publicado === true,
    alertavel: l.alertavel === true,

    vistoPelaPrimeiraVez: String(l.visto_pela_primeira_vez),
    vistoPelaUltimaVez: String(l.visto_pela_ultima_vez),
    actualizadoEm: String(l.actualizado_em),
  };
}

/**
 * The write direction.
 *
 * Deliberately excludes `id`, `slug` and the three timestamps: the database owns
 * those. `slug` in particular must never be recomputed on an update — a retitled
 * fund keeps its URL, because a shared link that stops working costs more than a
 * tidy slug.
 */
export function paraLinha(a: ApoioNovo): Record<string, unknown> {
  return {
    source_id: a.sourceId,
    titulo: a.titulo,
    resumo: a.resumo,
    programa_pai: a.programaPai,
    entidade_gestora: a.entidadeGestora,
    referencia_legal: a.referenciaLegal,

    estado: a.estado,
    dotacao_esgotada: a.dotacaoEsgotada,

    abre_em: a.abreEm.iso,
    abre_em_precisao: a.abreEm.precisao,
    fecha_em: a.fechaEm.iso,
    fecha_em_precisao: a.fechaEm.precisao,

    beneficiarios: a.beneficiarios,
    admite_particulares: a.admiteParticulares,
    restricoes_beneficiario: a.restricoesBeneficiario,

    ambito: a.ambito,
    municipios: a.municipios,

    medidas: a.medidas,
    medidas_por_classificar: a.medidasPorClassificar,
    detalhe_apoios: a.detalheApoios,

    dotacao_total_eur: a.dotacaoTotalEur,
    apoio_max_eur: a.apoioMaxEur,

    url_oficial: a.urlOficial,
    url_candidatura: a.urlCandidatura,
    documentos: a.documentos,

    needs_review: a.needsReview,
    motivo_revisao: a.motivoRevisao,
    confianca_global: a.confiancaGlobal,
    publicado: a.publicado,
    alertavel: a.alertavel,
  };
}
