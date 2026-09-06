import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Apoio,
  Confianca,
  DetalheApoio,
  DocumentoApoio,
  EstadoApoio,
  Medida,
  PrecisaoData,
  TipoBeneficiario,
  Triestado,
} from "@apoios/core";
import { correspondeAosFiltros, ordenarApoios, type FiltrosApoio } from "./filtros.ts";
import type { RepositorioApoios } from "./repositorio.ts";

/**
 * The catalogue, backed by Supabase.
 *
 * Reads with the ANON key and leans on row-level security rather than filtering in
 * application code: the `apoios_publicados` policy is `using (publicado = true)`, so an
 * unpublished fund is not merely hidden by a `.eq()` someone could forget — it does not
 * come back over the wire at all. A bug in this file cannot leak one.
 *
 * The rest of the filtering deliberately reuses `correspondeAosFiltros`, the same pure
 * predicate the seed uses. Pushing measure, region and beneficiary filters into SQL
 * would mean two definitions of "does this fund match?" — and the catalogue is small
 * enough that the honest, single-definition version costs nothing.
 */
export class RepositorioSupabase implements RepositorioApoios {
  readonly #cliente: SupabaseClient;

  constructor(url: string, chaveAnon: string) {
    this.#cliente = createClient(url, chaveAnon, {
      auth: { persistSession: false },
    });
  }

  async listar(filtros: FiltrosApoio): Promise<Apoio[]> {
    // `.returns` because COLUNAS is joined at runtime, so the client cannot infer the
    // row shape from it. `paraApoio` is where the shape is actually asserted.
    const { data, error } = await this.#cliente
      .from("funds")
      .select(COLUNAS)
      .returns<Linha[]>();
    if (error !== null) throw new Error(`Supabase: ${error.message}`);

    const apoios = (data ?? []).map(paraApoio);
    return ordenarApoios(apoios.filter((a) => correspondeAosFiltros(a, filtros)));
  }

  async obterPorSlug(slug: string): Promise<Apoio | null> {
    const { data, error } = await this.#cliente
      .from("funds")
      .select(COLUNAS)
      .eq("slug", slug)
      .returns<Linha[]>()
      .maybeSingle();
    if (error !== null) throw new Error(`Supabase: ${error.message}`);
    return data === null ? null : paraApoio(data);
  }

  async contarPorMedida(): Promise<Partial<Record<Medida, number>>> {
    const { data, error } = await this.#cliente
      .from("funds")
      .select("medidas, needs_review")
      .returns<{ medidas: Medida[] | null; needs_review: boolean }[]>();
    if (error !== null) throw new Error(`Supabase: ${error.message}`);

    const contagem: Partial<Record<Medida, number>> = {};
    for (const linha of data ?? []) {
      // Counts drive the filter chips. Including funds still under review would
      // promise results the default view then does not show.
      if (linha.needs_review === true) continue;
      for (const m of linha.medidas ?? []) {
        contagem[m] = (contagem[m] ?? 0) + 1;
      }
    }
    return contagem;
  }
}

/** A row as it comes back: keys unknown to the type system, asserted by `paraApoio`. */
type Linha = Record<string, unknown>;

const COLUNAS = [
  "id", "slug", "source_id", "titulo", "resumo", "programa_pai", "entidade_gestora",
  "referencia_legal", "estado", "dotacao_esgotada", "abre_em", "abre_em_precisao",
  "fecha_em", "fecha_em_precisao", "beneficiarios", "admite_particulares",
  "restricoes_beneficiario", "ambito", "municipios", "medidas",
  "medidas_por_classificar", "detalhe_apoios", "dotacao_total_eur", "apoio_max_eur",
  "url_oficial", "url_candidatura", "documentos", "needs_review", "motivo_revisao",
  "confianca_global", "publicado", "alertavel", "visto_pela_primeira_vez",
  "visto_pela_ultima_vez", "actualizado_em",
].join(", ");

/**
 * snake_case row to the domain type.
 *
 * Written out by hand rather than generated, because two fields carry meaning that a
 * mechanical mapping would flatten: a date and its precision belong together in one
 * `DataComPrecisao`, and `admite_particulares` is a tri-state where the absent value
 * must become `desconhecido` — never a falsy `nao` and never a silent `sim`.
 */
function paraApoio(l: Record<string, unknown>): Apoio {
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

export { paraApoio };
