import type {
  Confianca,
  EstadoApoio,
  Medida,
  PrecisaoData,
  TipoBeneficiario,
  TipoEvento,
  Triestado,
} from "./taxonomia.ts";

/** A date extracted from a notice, carrying how precisely it is actually known. */
export interface DataComPrecisao {
  /** Absolute instant. Civil deadlines are anchored to Europe/Lisbon. */
  readonly iso: string | null;
  readonly precisao: PrecisaoData;
  /** The literal source string, kept so parsing bugs are debuggable after the fact. */
  readonly textoFonte: string | null;
}

/**
 * A listing entry found by a source's deterministic extractor.
 *
 * Deliberately cheap: no LLM has run yet. The pipeline uses these to decide which
 * detail documents are worth fetching and extracting.
 */
export interface Candidato {
  readonly titulo: string;
  readonly urlDetalhe: string;
  readonly urlCanonica: string;
  readonly referenciaLegalBruta: string | null;
  readonly dataBruta: string | null;
  readonly tipoDocumento: "html" | "pdf" | "desconhecido";
}

/** Per-measure support terms, which vary widely within a single notice. */
export interface DetalheApoio {
  readonly medida: Medida;
  readonly percentagemApoio: number | null;
  readonly valorMaxEur: number | null;
  /** e.g. "por fracção", "por kWp", "por habitação". */
  readonly unidade: string | null;
}

export interface DocumentoApoio {
  readonly titulo: string;
  readonly url: string;
  readonly tipo: "aviso" | "formulario" | "faq" | "legislacao" | "anexo" | "outro";
}

/**
 * The canonical, normalised record for one funding programme.
 *
 * Everything here is the product of deterministic normalisation over an extraction —
 * the model never writes these values directly (see `packages/extraction`).
 */
export interface Apoio {
  readonly id: string;
  readonly slug: string;
  readonly sourceId: string;

  readonly titulo: string;
  readonly resumo: string | null;
  readonly programaPai: string | null;
  readonly entidadeGestora: string | null;
  /** Canonicalised, e.g. "AVISO 03/C13-I01/2024". The strongest identity key. */
  readonly referenciaLegal: string | null;

  readonly estado: EstadoApoio;
  readonly dotacaoEsgotada: boolean;

  readonly abreEm: DataComPrecisao;
  readonly fechaEm: DataComPrecisao;

  readonly beneficiarios: readonly TipoBeneficiario[];
  /** Fails closed: only `sim` permits an alert to an individual homeowner. */
  readonly admiteParticulares: Triestado;
  readonly restricoesBeneficiario: string | null;

  readonly ambito:
    | "nacional"
    | "continente"
    | "regiao_autonoma"
    | "nuts"
    | "distrito"
    | "municipio"
    | "desconhecido";
  /** DICOFRE codes. Empty when the scope is national. */
  readonly municipios: readonly string[];

  readonly medidas: readonly Medida[];
  /** Measures the notice mentions that no taxonomy slug covers — a taxonomy-gap signal. */
  readonly medidasPorClassificar: readonly string[];
  readonly detalheApoios: readonly DetalheApoio[];

  readonly dotacaoTotalEur: number | null;
  readonly apoioMaxEur: number | null;

  /** Never null. The escape hatch to the authoritative source, rendered everywhere. */
  readonly urlOficial: string;
  readonly urlCandidatura: string | null;
  readonly documentos: readonly DocumentoApoio[];

  readonly needsReview: boolean;
  readonly motivoRevisao: readonly string[];
  readonly confiancaGlobal: Confianca;
  /** Visible in the catalogue. */
  readonly publicado: boolean;
  /** May generate emails. Strictly stronger than `publicado`. */
  readonly alertavel: boolean;

  readonly vistoPelaPrimeiraVez: string;
  readonly vistoPelaUltimaVez: string;
  readonly actualizadoEm: string;
}

/** The subset of `Apoio` a newly-extracted record carries before it has an identity. */
export type ApoioNovo = Omit<
  Apoio,
  "id" | "slug" | "vistoPelaPrimeiraVez" | "vistoPelaUltimaVez" | "actualizadoEm"
>;

export interface EventoApoio {
  readonly fundId: string;
  readonly tipo: TipoEvento;
  readonly ocorreuEm: string;
  readonly payload: Readonly<Record<string, unknown>>;
  /** Deterministic fingerprint; the unique key that makes re-runs idempotent. */
  readonly impressao: string;
  readonly alertavel: boolean;
}

/** Identity keys, strongest first. Higher `forca` wins a conflict. */
export type TipoIdentidade = "referencia_legal" | "url_canonica" | "titulo_norm";

export interface ChaveIdentidade {
  readonly tipo: TipoIdentidade;
  readonly valor: string;
  readonly forca: number;
}

export interface PerfilUtilizador {
  readonly userId: string;
  readonly concelho: string | null;
  readonly distrito: string | null;
  readonly tiposBeneficiario: readonly TipoBeneficiario[];
  readonly frequencia: "imediata" | "diaria" | "semanal";
  readonly medidas: readonly Medida[];
  readonly cancelouEm: string | null;
}

/**
 * Injected clock.
 *
 * Extractors and the time sweep never read the wall clock directly, so every
 * time-dependent behaviour is testable at an arbitrary instant.
 */
export interface Relogio {
  agora(): Date;
}

export const relogioReal: Relogio = {
  agora: () => new Date(),
};

export function relogioFixo(instante: Date | string): Relogio {
  const d = typeof instante === "string" ? new Date(instante) : instante;
  return { agora: () => new Date(d.getTime()) };
}
