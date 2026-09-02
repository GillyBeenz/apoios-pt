/**
 * The closed taxonomy of home-improvement measures.
 *
 * This constant has exactly two consumers: the `medidas` enum in the Claude
 * extraction schema, and the subscription options users pick from in the web app.
 * If those two ever drift apart, matching silently fails for the drifted measure —
 * a user subscribed to `solar_fotovoltaico` would simply never be told about solar
 * funding, with no error anywhere. `taxonomia.test.ts` asserts both derive from here.
 */
export const TAXONOMIA_MEDIDAS = [
  // Produção e armazenamento de energia
  "solar_fotovoltaico",
  "solar_termico",
  "baterias",
  "autoconsumo_coletivo",
  "eolica_domestica",

  // Climatização e águas quentes
  "bomba_calor",
  "ar_condicionado",
  "termoacumulador",
  "caldeira_biomassa",
  "recuperador_calor",

  // Envolvente do edifício
  "janelas",
  "isolamento_cobertura",
  "isolamento_paredes",
  "isolamento_pavimento",
  "sombreamento",
  "ventilacao_natural",

  // Água
  "eficiencia_hidrica",
  "reaproveitamento_aguas_pluviais",
  "reutilizacao_aguas_cinzentas",

  // Mobilidade
  "carregador_veiculo_eletrico",
  "veiculo_eletrico",
  "bicicleta_eletrica",

  // Transversais
  "certificado_energetico",
  "auditoria_energetica",
  "reabilitacao_integral",
  "remocao_amianto",
  "arquitetura_bioclimatica",
  "eletrodomesticos_eficientes",
] as const;

export type Medida = (typeof TAXONOMIA_MEDIDAS)[number];

/** Human-readable pt-PT labels. Shown in the UI and in alert emails. */
export const ETIQUETAS_MEDIDAS: Record<Medida, string> = {
  solar_fotovoltaico: "Painéis solares fotovoltaicos",
  solar_termico: "Painéis solares térmicos",
  baterias: "Baterias de armazenamento",
  autoconsumo_coletivo: "Autoconsumo coletivo",
  eolica_domestica: "Micro-eólica doméstica",
  bomba_calor: "Bomba de calor",
  ar_condicionado: "Ar condicionado eficiente",
  termoacumulador: "Termoacumulador / cilindro",
  caldeira_biomassa: "Caldeira ou salamandra a biomassa",
  recuperador_calor: "Recuperador de calor",
  janelas: "Substituição de janelas",
  isolamento_cobertura: "Isolamento de cobertura",
  isolamento_paredes: "Isolamento de paredes",
  isolamento_pavimento: "Isolamento de pavimento",
  sombreamento: "Sombreamento exterior",
  ventilacao_natural: "Ventilação natural",
  eficiencia_hidrica: "Eficiência hídrica",
  reaproveitamento_aguas_pluviais: "Aproveitamento de águas pluviais",
  reutilizacao_aguas_cinzentas: "Reutilização de águas cinzentas",
  carregador_veiculo_eletrico: "Carregador de veículo elétrico",
  veiculo_eletrico: "Veículo elétrico",
  bicicleta_eletrica: "Bicicleta elétrica",
  certificado_energetico: "Certificado energético",
  auditoria_energetica: "Auditoria energética",
  reabilitacao_integral: "Reabilitação integral",
  remocao_amianto: "Remoção de amianto",
  arquitetura_bioclimatica: "Arquitetura bioclimática",
  eletrodomesticos_eficientes: "Eletrodomésticos eficientes",
};

/**
 * Who a programme is open to.
 *
 * This is the field that decides whether a homeowner ever hears about a fund, so
 * it is modelled explicitly rather than as a free-text tag. Several major
 * Portuguese programmes (E-Lar being the canonical example) are restricted to
 * collective entities and are useless — worse than useless — to an individual.
 */
export const TIPOS_BENEFICIARIO = [
  "particular",
  "condominio",
  "cooperativa",
  "associacao_moradores",
  "ipss",
  "municipio",
  "empresa_municipal_habitacao",
  "empresa",
  "agricultor",
  "entidade_publica",
  "outro",
] as const;

export type TipoBeneficiario = (typeof TIPOS_BENEFICIARIO)[number];

export const ETIQUETAS_BENEFICIARIO: Record<TipoBeneficiario, string> = {
  particular: "Particulares (pessoas singulares)",
  condominio: "Condomínios",
  cooperativa: "Cooperativas",
  associacao_moradores: "Associações de moradores",
  ipss: "IPSS",
  municipio: "Municípios",
  empresa_municipal_habitacao: "Empresas municipais de habitação",
  empresa: "Empresas",
  agricultor: "Agricultores",
  entidade_publica: "Entidades públicas",
  outro: "Outros",
};

/** The beneficiary types a typical homeowner can act under, directly or collectively. */
export const BENEFICIARIOS_PROPRIETARIO: readonly TipoBeneficiario[] = [
  "particular",
  "condominio",
];

export const ESTADOS_APOIO = [
  "previsto",
  "aberto",
  "encerrado",
  "suspenso",
  "desconhecido",
] as const;

export type EstadoApoio = (typeof ESTADOS_APOIO)[number];

export const ETIQUETAS_ESTADO: Record<EstadoApoio, string> = {
  previsto: "Previsto",
  aberto: "Aberto",
  encerrado: "Encerrado",
  suspenso: "Suspenso",
  desconhecido: "Por confirmar",
};

/**
 * How precisely a date is known.
 *
 * A notice saying "durante o mês de outubro" cannot honestly drive a "closes in 3
 * days" countdown, so precision travels with every date and gates the time sweep.
 */
export const PRECISOES_DATA = ["minuto", "dia", "mes", "desconhecida"] as const;
export type PrecisaoData = (typeof PRECISOES_DATA)[number];

export const NIVEIS_CONFIANCA = ["alta", "media", "baixa"] as const;
export type Confianca = (typeof NIVEIS_CONFIANCA)[number];

/** Tri-state. `desconhecido` is not a synonym for `nao` — it blocks alerts either way. */
export const TRIESTADOS = ["sim", "nao", "desconhecido"] as const;
export type Triestado = (typeof TRIESTADOS)[number];

export const TIPOS_EVENTO = [
  "programa_novo",
  "abriu",
  "reaberto",
  "fecha_em_breve",
  "encerrou",
  "prazo_alterado",
  "reforco_dotacao",
  "dotacao_esgotada",
  "elegibilidade_alterada",
] as const;

export type TipoEvento = (typeof TIPOS_EVENTO)[number];

/** Days before the deadline at which `fecha_em_breve` fires. */
export const LIMIARES_FECHA_EM_BREVE = [14, 7, 3, 1] as const;

/**
 * Events that must not wait for the daily digest.
 *
 * An exhausted budget closes the window early with no warning, and a one-day
 * deadline cannot survive a night in a queue.
 */
export const EVENTOS_IMEDIATOS: readonly TipoEvento[] = [
  "dotacao_esgotada",
  "elegibilidade_alterada",
];
