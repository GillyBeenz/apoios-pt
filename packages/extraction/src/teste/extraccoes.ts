import type { Extraccao } from "../esquema.ts";

/**
 * The literal text of a plausible Portuguese notice, used as the source document
 * that evidence quotes are verified against.
 */
export const TEXTO_AVISO_SOLAR = `
Aviso de Abertura de Concurso n.º 02/2026

Apoio à instalação de sistemas solares fotovoltaicos para autoconsumo em habitação
própria e permanente.

Beneficiários: pessoas singulares proprietárias de habitação própria e permanente,
bem como condomínios de edifícios de habitação.

As candidaturas decorrem entre 1 de março de 2026 e até às 18:00 do dia 30 de
setembro de 2026.

A dotação global do presente aviso é de 15.000.000,00 €.

O apoio corresponde a 85% do investimento elegível, até ao limite de 15.000,00 €
por fracção.
`.trim();

/** A well-formed, fully-supported extraction of the notice above. */
export function extraccaoSolar(sobrepor: Partial<Extraccao> = {}): Extraccao {
  const base: Extraccao = {
    schema_version: "1",
    identificacao: {
      titulo: "Aviso de Abertura de Concurso n.º 02/2026 — Solar fotovoltaico",
      referencia_legal: {
        valor: "Aviso n.º 02/2026",
        confianca: "alta",
        evidencia: "Aviso de Abertura de Concurso n.º 02/2026",
        pagina: 1,
      },
      programa_pai: "Fundo Ambiental",
      entidade_gestora: "Fundo Ambiental",
      resumo_pt: "Apoio à instalação de painéis solares em habitação própria e permanente.",
    },
    estado: {
      valor: "aberto",
      confianca: "alta",
      evidencia: "As candidaturas decorrem entre 1 de março de 2026",
      pagina: 1,
    },
    dotacao_esgotada: { valor: false, confianca: "alta", evidencia: "", pagina: null },
    prazos: {
      abertura: {
        valor: { texto_fonte: "1 de março de 2026", data_iso: "2026-03-01", precisao: "dia" },
        confianca: "alta",
        evidencia: "As candidaturas decorrem entre 1 de março de 2026",
        pagina: 1,
      },
      encerramento: {
        valor: {
          texto_fonte: "até às 18:00 do dia 30 de setembro de 2026",
          data_iso: "2026-09-30",
          precisao: "minuto",
        },
        confianca: "alta",
        evidencia: "até às 18:00 do dia 30 de\nsetembro de 2026",
        pagina: 1,
      },
    },
    beneficiarios: {
      tipos: {
        valor: ["particular", "condominio"],
        confianca: "alta",
        evidencia: "pessoas singulares proprietárias de habitação própria e permanente",
        pagina: 1,
      },
      admite_particulares: {
        valor: "sim",
        confianca: "alta",
        evidencia: "Beneficiários: pessoas singulares proprietárias",
        pagina: 1,
      },
      restricoes_texto: "Habitação própria e permanente.",
    },
    ambito: { nivel: "nacional", municipios: [], observacoes: null },
    medidas: {
      valor: [
        {
          medida: "solar_fotovoltaico",
          percentagem_apoio: 85,
          valor_max_eur: 15000,
          unidade: "por fracção",
        },
      ],
      confianca: "alta",
      evidencia: "sistemas solares fotovoltaicos para autoconsumo",
      pagina: 1,
    },
    medidas_nao_classificadas: [],
    dotacao: {
      total_texto: "15.000.000,00 €",
      total_eur: 15_000_000,
      apoio_max_por_beneficiario_eur: 15_000,
    },
    candidatura: { url: null, plataforma: null },
    documentos: [],
    avisos_importantes: [],
    auto_avaliacao: {
      documento_e_aviso_de_apoio: true,
      qualidade_ocr: "boa",
      notas: null,
    },
  };
  return { ...base, ...sobrepor };
}
