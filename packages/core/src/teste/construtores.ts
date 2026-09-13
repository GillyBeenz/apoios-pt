import type { Apoio, PerfilUtilizador } from "../tipos.ts";
import { analisarDataPt } from "../normalizar/data.ts";

/** Test builder. Defaults describe a healthy, fully-trusted, national fund. */
export function apoioDe(sobrepor: Partial<Apoio> = {}): Apoio {
  const base: Apoio = {
    id: "fund-1",
    slug: "apoio-teste",
    sourceId: "fundo-ambiental-aac",
    titulo: "Apoio a painéis solares fotovoltaicos",
    resumo: "Apoio à instalação de sistemas solares para autoconsumo.",
    programaPai: "Fundo Ambiental",
    entidadeGestora: "Fundo Ambiental",
    referenciaLegal: "AVISO 02/2026",
    estado: "aberto",
    dotacaoEsgotada: false,
    abreEm: analisarDataPt("01/03/2026", { papel: "abertura" }),
    fechaEm: analisarDataPt("30/09/2026", { papel: "encerramento" }),
    beneficiarios: ["particular", "condominio"],
    admiteParticulares: "sim",
    restricoesBeneficiario: null,
    ambito: "nacional",
    municipios: [],
    medidas: ["solar_fotovoltaico"],
    medidasPorClassificar: [],
    detalheApoios: [],
    dotacaoTotalEur: 15_000_000,
    apoioMaxEur: 15_000,
    urlOficial: "https://www.fundoambiental.pt/avisos/aviso-02-2026.aspx",
    urlCandidatura: null,
    documentos: [],
    needsReview: false,
    motivoRevisao: [],
    confiancaGlobal: "alta",
    publicado: true,
    alertavel: true,
    vistoPelaPrimeiraVez: "2026-02-01T00:00:00.000Z",
    vistoPelaUltimaVez: "2026-02-01T00:00:00.000Z",
    actualizadoEm: "2026-02-01T00:00:00.000Z",
  };
  return { ...base, ...sobrepor };
}

/**
 * A fund open only to collective entities: published, and reaching no homeowner.
 *
 * Deliberately **hypothetical**. This fixture used to be called Programa E-Lar and
 * to assert that E-Lar excludes individuals. That is false — E-Lar is open to
 * pessoas singulares — and the claim had spread from here into the README, into the
 * seed catalogue the site serves, and into the prompt the model reads. A test shape
 * needs the eligibility, not a real programme's name; naming one turns a fixture
 * into a factual claim that nothing in the test suite can check.
 */
export function apoioSoParaEntidades(sobrepor: Partial<Apoio> = {}): Apoio {
  return apoioDe({
    id: "fund-so-entidades",
    slug: "apoio-so-para-entidades",
    titulo: "Apoio só para entidades",
    beneficiarios: ["municipio", "empresa_municipal_habitacao", "ipss", "associacao_moradores"],
    admiteParticulares: "nao",
    restricoesBeneficiario:
      "Destina-se a municípios, empresas municipais de habitação, IPSS e associações de moradores.",
    medidas: ["bomba_calor", "solar_fotovoltaico"],
    ...sobrepor,
  });
}

/**
 * Closed to pessoas singulares, open to condomínios: a homeowner who cannot apply
 * alone, and can apply through the building.
 *
 * Deliberately **hypothetical**, for the same reason as `apoioSoParaEntidades`.
 * This fixture used to name `04/C13-i01 — Programa de Apoio a Condomínios
 * Residenciais` and assert that a homeowner cannot apply to it alone. The real
 * notice says the opposite in the propriedade-total case: "são elegíveis
 * Condomínios Residenciais e os proprietários em nome individual no caso de
 * edifícios em propriedade total". So the programme admits particulares, goes
 * through the main door, and never exercises this shape at all.
 *
 * The shape itself is real — in propriedade horizontal the beneficiary is the
 * condomínio, represented by the administrador — so the fixture and the gate it
 * tests both stay. What goes is the claim about a named programme, which nothing
 * in this test suite could ever have checked.
 */
export function apoioParaCondominios(sobrepor: Partial<Apoio> = {}): Apoio {
  return apoioDe({
    id: "fund-condominios",
    slug: "apoio-so-atraves-do-condominio",
    titulo: "Apoio só através do condomínio",
    beneficiarios: ["condominio"],
    admiteParticulares: "nao",
    restricoesBeneficiario:
      "Candidaturas apresentadas pelo condomínio, representado pelo administrador.",
    medidas: ["bomba_calor", "solar_fotovoltaico"],
    ...sobrepor,
  });
}

export function perfilDe(sobrepor: Partial<PerfilUtilizador> = {}): PerfilUtilizador {
  const base: PerfilUtilizador = {
    userId: "user-1",
    concelho: null,
    distrito: null,
    tiposBeneficiario: ["particular"],
    frequencia: "diaria",
    medidas: ["solar_fotovoltaico"],
    cancelouEm: null,
  };
  return { ...base, ...sobrepor };
}
