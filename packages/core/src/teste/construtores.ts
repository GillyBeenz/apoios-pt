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
 * The E-Lar shape: a real Portuguese programme restricted to collective entities.
 * Used to prove that such a fund is published but reaches no homeowner.
 */
export function apoioSoParaEntidades(sobrepor: Partial<Apoio> = {}): Apoio {
  return apoioDe({
    id: "fund-elar",
    slug: "e-lar",
    titulo: "Programa E-Lar",
    beneficiarios: ["municipio", "empresa_municipal_habitacao", "ipss", "associacao_moradores"],
    admiteParticulares: "nao",
    restricoesBeneficiario:
      "Destina-se a municípios, empresas municipais de habitação, IPSS e associações de moradores.",
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
