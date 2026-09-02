import { analisarDataPt, type Apoio, type Medida } from "@apoios/core";
import { apoioDe, apoioSoParaEntidades } from "@apoios/core/teste";
import { correspondeAosFiltros, ordenarApoios, type FiltrosApoio } from "./filtros.ts";
import type { RepositorioApoios } from "./repositorio.ts";

const enc = { papel: "encerramento" } as const;
const abr = { papel: "abertura" } as const;

/**
 * Seed catalogue for local development.
 *
 * Chosen to cover the shapes whose presentation is easy to get wrong, and where
 * getting it wrong misleads someone about money:
 *
 *  - E-Lar, open only to collective entities (must render the red banner)
 *  - a fund whose extraction is under review (must be badged, never presented as fact)
 *  - a deadline known only to the month (must never render as an exact date)
 *  - a municipal fund (must not appear for a user in another concelho)
 *  - a closed fund and an announced one, so the ordering is exercised
 */
export const APOIOS_SEED: readonly Apoio[] = [
  apoioDe({
    id: "fund-1",
    slug: "solar-fotovoltaico-autoconsumo-1",
    titulo: "Apoio à instalação de sistemas solares fotovoltaicos para autoconsumo",
    resumo:
      "Comparticipação de 85% do investimento em painéis solares fotovoltaicos para " +
      "habitação própria e permanente, até 15.000 € por fracção.",
    referenciaLegal: "AVISO 02/2026",
    medidas: ["solar_fotovoltaico", "baterias"],
    detalheApoios: [
      { medida: "solar_fotovoltaico", percentagemApoio: 85, valorMaxEur: 15_000, unidade: "por fracção" },
      { medida: "baterias", percentagemApoio: 70, valorMaxEur: 5_000, unidade: "por fracção" },
    ],
    abreEm: analisarDataPt("01/03/2026", abr),
    fechaEm: analisarDataPt("até às 18:00 do dia 30 de setembro de 2026", enc),
  }),

  apoioDe({
    id: "fund-2",
    slug: "janelas-isolamento-eficiencia-2",
    titulo: "Apoio à substituição de janelas e ao isolamento térmico",
    resumo:
      "Apoio a obras de melhoria da envolvente do edifício: janelas eficientes, " +
      "isolamento de coberturas e paredes.",
    referenciaLegal: "AVISO 05/2026",
    medidas: ["janelas", "isolamento_cobertura", "isolamento_paredes"],
    detalheApoios: [
      { medida: "janelas", percentagemApoio: 65, valorMaxEur: 3_500, unidade: "por fracção" },
      { medida: "isolamento_cobertura", percentagemApoio: 65, valorMaxEur: 4_500, unidade: "por fracção" },
    ],
    dotacaoTotalEur: 8_000_000,
    apoioMaxEur: 8_000,
    abreEm: analisarDataPt("15/01/2026", abr),
    fechaEm: analisarDataPt("31/12/2026", enc),
  }),

  // The E-Lar shape: real, and closed to individuals. Must never read as available.
  apoioSoParaEntidades({
    id: "fund-3",
    slug: "programa-e-lar-3",
    titulo: "Programa E-Lar — substituição de equipamentos a gás",
    resumo:
      "Substituição de equipamentos a gás por soluções elétricas eficientes em " +
      "agregados em situação de pobreza energética.",
    referenciaLegal: "AVISO 07/2026",
    dotacaoTotalEur: 30_000_000,
    apoioMaxEur: 3_600,
    abreEm: analisarDataPt("01/02/2026", abr),
    fechaEm: analisarDataPt("30/11/2026", enc),
  }),

  // Deadline known only to the month. Must render as "durante ..." and generate
  // no countdown.
  apoioDe({
    id: "fund-4",
    slug: "bombas-de-calor-previsto-4",
    titulo: "Apoio previsto à instalação de bombas de calor",
    resumo:
      "Programa anunciado no Plano Anual de Avisos. As condições finais serão " +
      "publicadas no aviso de abertura.",
    referenciaLegal: null,
    estado: "previsto",
    medidas: ["bomba_calor", "termoacumulador"],
    detalheApoios: [
      { medida: "bomba_calor", percentagemApoio: null, valorMaxEur: null, unidade: null },
    ],
    dotacaoTotalEur: 12_000_000,
    apoioMaxEur: null,
    abreEm: analisarDataPt("outubro de 2026", abr),
    fechaEm: analisarDataPt("dezembro de 2026", enc),
    confiancaGlobal: "media",
  }),

  // Under review: shown, badged, and excluded from alerts. Note admiteParticulares
  // is 'desconhecido' — the amber case.
  apoioDe({
    id: "fund-5",
    slug: "eficiencia-hidrica-por-rever-5",
    titulo: "Apoio à eficiência hídrica em habitação",
    resumo:
      "Substituição de dispositivos por equivalentes de menor consumo e " +
      "aproveitamento de águas pluviais.",
    referenciaLegal: "AVISO 09/2026",
    medidas: ["eficiencia_hidrica", "reaproveitamento_aguas_pluviais"],
    admiteParticulares: "desconhecido",
    beneficiarios: ["particular", "condominio", "municipio"],
    needsReview: true,
    alertavel: false,
    motivoRevisao: ["confianca_insuficiente:beneficiarios.admite_particulares"],
    confiancaGlobal: "media",
    apoioMaxEur: 1_500,
    abreEm: analisarDataPt("01/04/2026", abr),
    fechaEm: analisarDataPt("30/06/2026", enc),
  }),

  // Municipal: must not reach a user in another concelho.
  apoioDe({
    id: "fund-6",
    slug: "lisboa-carregadores-ve-6",
    titulo: "Lisboa — apoio a carregadores de veículos elétricos em condomínios",
    resumo: "Instalação de pontos de carregamento em edifícios de habitação colectiva.",
    referenciaLegal: "EDITAL 03/2026",
    programaPai: "Câmara Municipal de Lisboa",
    entidadeGestora: "Câmara Municipal de Lisboa",
    medidas: ["carregador_veiculo_eletrico"],
    ambito: "municipio",
    municipios: ["1106"],
    apoioMaxEur: 2_000,
    abreEm: analisarDataPt("01/05/2026", abr),
    fechaEm: analisarDataPt("31/07/2026", enc),
    urlOficial: "https://www.lisboa.pt/avisos/edital-03-2026",
  }),

  apoioDe({
    id: "fund-7",
    slug: "solar-termico-encerrado-7",
    titulo: "Apoio a painéis solares térmicos (encerrado)",
    resumo: "Aviso encerrado. Dotação esgotada antes do fim do prazo.",
    referenciaLegal: "AVISO 11/2025",
    estado: "encerrado",
    dotacaoEsgotada: true,
    medidas: ["solar_termico"],
    apoioMaxEur: 2_500,
    abreEm: analisarDataPt("01/06/2025", abr),
    fechaEm: analisarDataPt("30/11/2025", enc),
  }),
];

export class RepositorioSeed implements RepositorioApoios {
  readonly #apoios: readonly Apoio[];

  constructor(apoios: readonly Apoio[] = APOIOS_SEED) {
    this.#apoios = apoios;
  }

  async listar(filtros: FiltrosApoio): Promise<Apoio[]> {
    return ordenarApoios(this.#apoios.filter((a) => correspondeAosFiltros(a, filtros)));
  }

  async obterPorSlug(slug: string): Promise<Apoio | null> {
    return this.#apoios.find((a) => a.slug === slug && a.publicado) ?? null;
  }

  async contarPorMedida(): Promise<Partial<Record<Medida, number>>> {
    const contagem: Partial<Record<Medida, number>> = {};
    for (const apoio of this.#apoios) {
      if (!apoio.publicado || apoio.needsReview) continue;
      if (apoio.estado !== "aberto" && apoio.estado !== "previsto") continue;
      for (const medida of apoio.medidas) {
        contagem[medida] = (contagem[medida] ?? 0) + 1;
      }
    }
    return contagem;
  }
}
