import type { ApoioNovo } from "@apoios/core";
import type { AvisoPrevisto } from "./folha.ts";

/**
 * Turn one planned notice from the annual plan into a fund.
 *
 * No model call. The spreadsheet is already structured — dates, dotação, programme,
 * beneficiary type — so asking a model to read it would be paying to make a
 * deterministic table less certain.
 */

/**
 * Each row needs its own URL, and this is not cosmetic.
 *
 * Identity keys on the canonical URL, and all 211 rows come from one page. Left
 * sharing it, every planned notice in the plan would resolve to the *same* fund
 * and 210 of them would vanish into one row. `canonicalizarUrl` strips the
 * fragment but keeps query parameters, so `?aviso=` survives into the key while
 * the link still opens the authoritative page — the site ignores the parameter.
 */
export function urlDoAviso(urlPlano: string, id: string): string {
  const u = new URL(urlPlano);
  u.searchParams.set("aviso", id);
  return u.toString();
}

export function avisoPrevistoParaApoio(
  a: AvisoPrevisto,
  opcoes: { readonly urlPlano: string; readonly entidade: string },
): ApoioNovo {
  const motivoRevisao = [`admite_particulares:${a.admiteParticulares}`];
  // The plan says what a notice is for, never what work it pays for. Recorded as a
  // reason rather than left implicit: a fund with no measures matches no
  // subscriber, so this is why it will never reach an inbox even if its
  // eligibility is later confirmed.
  motivoRevisao.push("sem_medidas");

  return {
    sourceId: "pt2030-plano-anual-avisos",
    titulo: a.titulo,
    resumo: resumoDe(a),
    programaPai: a.programa,
    entidadeGestora: opcoes.entidade,
    // The plan's own notice code. The strongest identity key available here, and
    // the one that survives the plan being revised and re-published.
    referenciaLegal: a.id,

    // Always `previsto`, even when the planned opening date has passed.
    //
    // This document is a *plan*. It says when a notice is expected to open, not
    // that it opened — those are different claims, and the second one is the one
    // that would send somebody to a page that does not exist yet. When the notice
    // really opens it appears in `pt2030-avisos`, which reads actual notices, and
    // identity merges the two.
    estado: "previsto",
    dotacaoEsgotada: false,

    // `textoFonte` is null and not a re-rendered date. The cell held an Excel
    // serial, so there is no source *text* to quote — inventing "setembro de 2026"
    // here would put a string in an evidence field that no document contains.
    abreEm: { iso: a.abreEm, precisao: a.abreEmPrecisao, textoFonte: null },
    fechaEm: { iso: a.fechaEm, precisao: a.fechaEmPrecisao, textoFonte: null },

    beneficiarios: a.beneficiarios,
    // Never `sim`: the plan's entity-type column distinguishes public from private
    // bodies and says nothing about pessoas singulares. `folha.ts` is right to
    // refuse to infer one, and this is where that refusal becomes visible.
    admiteParticulares: a.admiteParticulares,
    restricoesBeneficiario: a.natureza,

    ambito: a.regioes.length > 0 ? "nuts" : "nacional",
    // DICOFRE codes, which the plan does not carry — its regions are NUTS II names.
    municipios: [],

    medidas: [],
    medidasPorClassificar: [],
    detalheApoios: [],

    dotacaoTotalEur: a.dotacaoEur,
    apoioMaxEur: null,

    urlOficial: urlDoAviso(opcoes.urlPlano, a.id),
    urlCandidatura: null,
    documentos: [],

    needsReview: true,
    motivoRevisao,
    // `media`, not `alta`. The sheet is authoritative about what is *planned*, and
    // a plan is revised several times a year — the dates are real intentions, not
    // commitments.
    confiancaGlobal: "media",
    publicado: true,
    // Follows from `admiteParticulares` never being `sim`, and stated rather than
    // derived so a future change to the mapping cannot open an alert path by
    // accident.
    alertavel: false,
  };
}

function resumoDe(a: AvisoPrevisto): string | null {
  // Assembled from columns the sheet actually has. Nothing here is inferred: if a
  // column is empty it simply does not appear.
  const partes = [
    a.objetivoEspecifico,
    a.fundo === null ? null : `Fundo: ${a.fundo}`,
    a.regioes.length > 0 ? `Regiões: ${a.regioes.join(", ")}` : null,
  ].filter((p): p is string => p !== null && p.length > 0);

  return partes.length > 0 ? partes.join(". ") : null;
}
