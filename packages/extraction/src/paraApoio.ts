import {
  analisarDataPt,
  analisarMontanteEur,
  canonicalizarReferenciaLegal,
  type ApoioNovo,
  type DataComPrecisao,
  type DetalheApoio,
  type EstadoApoio,
  type PrecisaoData,
} from "@apoios/core";
import type { Extraccao } from "./esquema.ts";
import type { Decisao } from "./portao.ts";

interface DataDeclarada {
  readonly texto_fonte: string;
  readonly data_iso: string;
  readonly precisao: PrecisaoData;
}

/**
 * `""` back to `null`, at the boundary.
 *
 * The schema represents absent *text* as an empty string, because every
 * `.nullable()` costs one of the API's sixteen permitted union-typed parameters
 * and the schema ran out (see `esquema.ts`). Nothing downstream should inherit
 * that workaround: the database column is nullable, the UI checks for null, and
 * an empty string would render as a present-but-blank field. So the conversion
 * happens here, once, rather than being remembered at thirty call sites.
 */
function semVazio(s: string): string | null {
  const t = s.trim();
  return t.length === 0 ? null : t;
}

/**
 * Turn the model's *reading* of a date into a stored instant.
 *
 * The model never writes the final timestamp. It reports the source expression and
 * its own interpretation, and our deterministic parser produces the value — which
 * means a date bug is reproducible in a unit test rather than only in a paid API
 * call, and the Europe/Lisbon and DST handling lives in one audited place.
 *
 * The source text is authoritative where we can parse it; `data_iso` is the fallback
 * for phrasings our parser does not yet cover, so an unusual notice degrades to the
 * model's reading rather than to nothing.
 */
function resolverData(
  d: DataDeclarada,
  papel: "abertura" | "encerramento",
  anoPredefinido: number | null,
): DataComPrecisao {
  const nosso = analisarDataPt(semVazio(d.texto_fonte), {
    papel,
    anoPredefinido,
  });
  if (nosso.iso !== null) return nosso;

  if (d.data_iso) {
    const doModelo = analisarDataPt(d.data_iso, { papel, anoPredefinido });
    if (doModelo.iso !== null) {
      return {
        ...doModelo,
        // Never report better precision than the model claimed for it.
        precisao:
          d.precisao === "desconhecida" ? doModelo.precisao : d.precisao,
        textoFonte: semVazio(d.texto_fonte) ?? semVazio(d.data_iso),
      };
    }
  }

  return {
    iso: null,
    precisao: "desconhecida",
    textoFonte: semVazio(d.texto_fonte),
  };
}

export interface ContextoNormalizacao {
  readonly sourceId: string;
  readonly urlOficial: string;
  readonly anoPredefinido?: number | null;
}

/**
 * Normalise an extraction into the canonical record the rest of the system uses.
 *
 * Everything downstream — diffing, matching, the catalogue — reads this shape and
 * never the raw extraction, which is why diffing produces no events for cosmetic
 * changes: a reworded sentence simply does not survive into this structure.
 */
export function extraccaoParaApoio(
  e: Extraccao,
  decisao: Decisao,
  ctx: ContextoNormalizacao,
): ApoioNovo {
  const abreEm = resolverData(
    e.prazos.abertura.valor,
    "abertura",
    ctx.anoPredefinido ?? null,
  );
  const anoAbertura = abreEm.iso
    ? new Date(abreEm.iso).getUTCFullYear()
    : (ctx.anoPredefinido ?? null);
  const fechaEm = resolverData(
    e.prazos.encerramento.valor,
    "encerramento",
    anoAbertura,
  );

  const detalheApoios: DetalheApoio[] = e.medidas.valor.map((m) => ({
    medida: m.medida,
    percentagemApoio: m.percentagem_apoio,
    valorMaxEur: m.valor_max_eur,
    unidade: semVazio(m.unidade),
  }));

  // De-duplicate: a notice often lists the same measure under several typologies.
  const medidas = [...new Set(detalheApoios.map((d) => d.medida))];

  const dotacaoTotalEur =
    e.dotacao.total_eur ?? analisarMontanteEur(semVazio(e.dotacao.total_texto));

  const apoioMaxEur =
    e.dotacao.apoio_max_por_beneficiario_eur ??
    // Fall back to the largest per-measure cap the notice states.
    detalheApoios.reduce<number | null>(
      (max, d) =>
        d.valorMaxEur !== null && (max === null || d.valorMaxEur > max)
          ? d.valorMaxEur
          : max,
      null,
    );

  const estado: EstadoApoio = e.estado.valor;

  return {
    sourceId: ctx.sourceId,
    titulo: e.identificacao.titulo,
    resumo: e.identificacao.resumo_pt,
    programaPai: semVazio(e.identificacao.programa_pai),
    entidadeGestora: semVazio(e.identificacao.entidade_gestora),
    referenciaLegal: canonicalizarReferenciaLegal(
      semVazio(e.identificacao.referencia_legal.valor),
    ),

    estado,
    dotacaoEsgotada: e.dotacao_esgotada.valor === true,

    abreEm,
    fechaEm,

    beneficiarios: e.beneficiarios.tipos.valor,
    admiteParticulares: e.beneficiarios.admite_particulares.valor,
    restricoesBeneficiario: semVazio(e.beneficiarios.restricoes_texto),

    ambito: e.ambito.nivel,
    municipios: e.ambito.municipios,

    medidas,
    medidasPorClassificar: e.medidas_nao_classificadas,
    detalheApoios,

    dotacaoTotalEur,
    apoioMaxEur,

    urlOficial: ctx.urlOficial,
    urlCandidatura: semVazio(e.candidatura.url),
    documentos: e.documentos,

    needsReview: decisao.needsReview,
    motivoRevisao: decisao.motivoRevisao,
    confiancaGlobal: decisao.confiancaGlobal,
    publicado: decisao.publicado,
    alertavel: decisao.alertavel,
  };
}
