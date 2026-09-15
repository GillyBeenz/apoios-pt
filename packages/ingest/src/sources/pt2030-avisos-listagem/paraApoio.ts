import type { ApoioNovo } from "@apoios/core";
import type { AvisoAberto } from "./resposta.ts";

/**
 * Turn one open notice from the Portugal 2030 endpoint into a fund.
 *
 * No model call, for the same reason as the annual plan: the endpoint already
 * answers in fields. What it does *not* answer is who may apply and what work is
 * paid for — and those two absences are what this file spends its care on, because
 * getting them wrong is the failure that costs a reader money.
 */

/**
 * The listing page, plus the notice code as a parameter.
 *
 * Identity keys on the canonical URL and every notice comes from one endpoint, so
 * without a distinguishing parameter all of them would resolve to a single fund
 * and all but one would vanish. `canonicalizarUrl` keeps query parameters, so the
 * code survives into the key.
 *
 * Deliberately the human page and not the API URL: it is what a reader should be
 * sent to, and an undocumented `wp-json` path is not somewhere to send anybody.
 */
export function urlDoAviso(urlListagem: string, codigo: string): string {
  const u = new URL(urlListagem);
  u.searchParams.set("aviso", codigo);
  return u.toString();
}

export function avisoAbertoParaApoio(
  a: AvisoAberto,
  opcoes: { readonly urlListagem: string; readonly entidade: string },
): ApoioNovo {
  // Both stated, never inferred.
  //
  // The endpoint has no beneficiary field at all — not an empty one, none. And
  // `tipologiaOperacaoDesignacao` says what kind of operation is funded
  // («Estruturação de produtos turísticos»), which is a category and not a list of
  // works a homeowner could pay for. Reading measures out of it would be inventing
  // the one thing this product must never invent.
  const motivoRevisao = ["admite_particulares:desconhecido", "sem_medidas"];

  return {
    sourceId: "pt2030-avisos-listagem",
    titulo: a.titulo,
    resumo: resumoDe(a),
    programaPai: a.programa,
    entidadeGestora: opcoes.entidade,

    // Nulo, e o código fica só no `urlOficial`. Isto é uma correcção, e a razão
    // interessa mais do que a linha.
    //
    // O comentário que aqui estava dizia que `codigoAviso` é uma referência a
    // sério, que `canonicalizarReferenciaLegal` a aceita, e que é a chave de
    // identidade mais forte que existe. As três coisas são verdade, e juntas
    // apagaram um apoio do catálogo.
    //
    // Essa função exige que o corpo da referência comece por um dígito — o que
    // está certo para `AVISO N.º 03/2026`, onde o prefixo é ruído, e errado aqui,
    // onde o prefixo é a parte que distingue:
    //
    //     CENTRO2030-2026-23  →  2026-23
    //     NORTE2030-2026-23   →  2026-23
    //
    // O `2030` de `CENTRO2030` não está numa fronteira de palavra, por isso a
    // captura só começa em `2026`. Os dois códigos dão a mesma chave, com força
    // 100, e a 15/09/2026 o segundo a chegar substituiu o primeiro: o aviso de
    // cuidados de saúde primários do Norte 2030 desapareceu.
    //
    // A identidade passa a assentar no `url_canonica`, que é único porque o URL
    // leva `?aviso=<codigo>`. É uma chave mais fraca (70), e o custo real é esse:
    // o mesmo aviso visto por outra fonte deixa de se reconhecer por referência.
    // Uma fusão que não acontece é uma linha a mais no catálogo; uma chave que
    // colide é uma linha a menos, em silêncio. Entre as duas, esta.
    //
    // A correcção de fundo é ensinar `canonicalizarReferenciaLegal` a guardar o
    // prefixo. Não é feita aqui de propósito: essa função decide a identidade dos
    // 450 apoios já gravados, e mudá-la sem uma passagem de reparação é como este
    // repositório já perdeu apoios antes. Fica em `docs/estado-actual.md`.
    referenciaLegal: null,

    // `aberto`, and this is the point of the whole source.
    //
    // Everything else the catalogue holds is either a plan (`previsto`) or already
    // closed. This endpoint answers with notices whose window is open *now* —
    // which is the thing the product exists to tell somebody.
    estado: "aberto",
    dotacaoEsgotada: false,

    // `textoFonte` null: the endpoint returned an ISO timestamp, so there is no
    // source *text* to quote. Rendering «14 de setembro de 2026» here would put a
    // string in an evidence field that no document contains.
    abreEm: { iso: a.abreEm, precisao: a.abreEm === null ? "desconhecida" : "dia", textoFonte: null },
    fechaEm: { iso: a.fechaEm, precisao: a.fechaEm === null ? "desconhecida" : "dia", textoFonte: null },

    // Empty, not guessed. See the note on `motivoRevisao` above.
    beneficiarios: [],
    admiteParticulares: "desconhecido",
    restricoesBeneficiario: null,

    ambito: a.regioes.length > 0 ? "nuts" : "nacional",
    // DICOFRE codes, which the endpoint does not carry — its `marca` is a
    // programme brand (`ALENTEJO2030`), not a municipality.
    municipios: [],

    medidas: [],
    medidasPorClassificar: [],
    detalheApoios: [],

    dotacaoTotalEur: a.dotacaoEur,
    apoioMaxEur: null,

    urlOficial: urlDoAviso(opcoes.urlListagem, a.codigo),
    urlCandidatura: null,
    // The endpoint lists documents with a storage `path` and `container` but no
    // URL, and the download address is not derivable from them. Linking to a file
    // we cannot address is worse than not listing it.
    documentos: [],

    needsReview: true,
    motivoRevisao,
    // `media`. The dates and the code come straight from the managing authority's
    // own system, which is as authoritative as this gets — but a fund whose
    // eligibility and measures are both unknown is not something to call `alta`.
    confiancaGlobal: "media",
    publicado: true,
    // Follows from `admiteParticulares` being `desconhecido`, and stated rather
    // than derived so a later change to this file cannot open an alert path by
    // accident. An open notice nobody can be matched to is still worth showing.
    alertavel: false,
  };
}

function resumoDe(a: AvisoAberto): string | null {
  // Assembled from fields the endpoint actually returned. Nothing inferred: an
  // absent field simply does not appear.
  const partes = [
    a.tipologia,
    a.fundo === null ? null : `Fundo: ${a.fundo}`,
    a.regioes.length > 0 ? `Programa: ${a.regioes.join(", ")}` : null,
    a.publicadoEm === null ? null : `Publicado em ${a.publicadoEm}`,
  ].filter((p): p is string => p !== null && p.length > 0);

  return partes.length > 0 ? partes.join(". ") : null;
}
