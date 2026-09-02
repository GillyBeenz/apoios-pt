import * as z from "zod/v4";
import {
  NIVEIS_CONFIANCA,
  PRECISOES_DATA,
  TAXONOMIA_MEDIDAS,
  TIPOS_BENEFICIARIO,
  TRIESTADOS,
} from "@apoios/core";

export const VERSAO_ESQUEMA = "1";

/**
 * The trust envelope.
 *
 * Every field that can decide whether an email is sent carries not just a value
 * but a confidence and a **verbatim quote** from the source document. The quote is
 * the load-bearing part: `verificar.ts` checks it is literally present in the text,
 * which catches a plausible-sounding claim with no basis in the notice — the exact
 * failure mode that would otherwise send someone after money they cannot claim.
 *
 * We ask for a quote rather than relying on the API's Citations feature because
 * Citations is incompatible with `output_config.format` (the API returns 400), so
 * structured output and API-verified citations cannot be combined.
 */
function comProva<T extends z.ZodType>(valor: T) {
  return z.object({
    valor,
    confianca: z.enum(NIVEIS_CONFIANCA),
    evidencia: z
      .string()
      .max(400)
      .describe(
        "Citação LITERAL e contígua do documento que suporta o valor. " +
          'Se não existir suporte textual, devolve "" e confianca "baixa". NUNCA parafraseies.',
      ),
    pagina: z.number().int().nullable(),
  });
}

const dataDeclarada = z.object({
  texto_fonte: z
    .string()
    .nullable()
    .describe('A expressão exacta usada no documento, ex.: "até às 18:00 do dia 30 de setembro de 2026".'),
  data_iso: z.string().nullable().describe("A tua leitura da data, em AAAA-MM-DD."),
  precisao: z.enum(PRECISOES_DATA),
});

export const EsquemaExtraccao = z.object({
  schema_version: z.literal(VERSAO_ESQUEMA),

  identificacao: z.object({
    titulo: z.string(),
    referencia_legal: comProva(z.string().nullable()).describe(
      'Ex.: "Aviso n.º 03/C13-i01/2024". null se o documento não tiver referência.',
    ),
    programa_pai: z.string().nullable(),
    entidade_gestora: z.string().nullable(),
    resumo_pt: z.string().max(600).describe("Resumo em português claro, para um proprietário."),
  }),

  estado: comProva(z.enum(["previsto", "aberto", "encerrado", "suspenso", "desconhecido"])),
  dotacao_esgotada: comProva(z.boolean().nullable()),

  prazos: z.object({
    abertura: comProva(dataDeclarada),
    encerramento: comProva(dataDeclarada),
  }),

  /**
   * The decisive block. Several major Portuguese programmes exclude individuals
   * entirely, so this is asked for explicitly and separately rather than inferred
   * from the beneficiary list.
   */
  beneficiarios: z.object({
    tipos: comProva(z.array(z.enum(TIPOS_BENEFICIARIO)).max(11)),
    admite_particulares: comProva(z.enum(TRIESTADOS)).describe(
      '"sim" SÓ se o documento admitir explicitamente pessoas singulares ou proprietários. ' +
        'Se listar apenas entidades colectivas (municípios, IPSS, associações), é "nao". ' +
        'Na dúvida, "desconhecido" — NUNCA "sim" por omissão.',
    ),
    restricoes_texto: z.string().nullable(),
  }),

  ambito: z.object({
    nivel: z.enum([
      "nacional",
      "continente",
      "regiao_autonoma",
      "nuts",
      "distrito",
      "municipio",
      "desconhecido",
    ]),
    municipios: z.array(z.string()).max(308),
    observacoes: z.string().nullable(),
  }),

  medidas: comProva(
    z
      .array(
        z.object({
          medida: z.enum(TAXONOMIA_MEDIDAS),
          percentagem_apoio: z.number().nullable(),
          valor_max_eur: z.number().nullable(),
          unidade: z.string().nullable().describe('Ex.: "por fracção", "por kWp".'),
        }),
      )
      .max(40),
  ),
  medidas_nao_classificadas: z
    .array(z.string())
    .max(20)
    .describe("Medidas do documento que não encaixam na taxonomia — para a melhorarmos."),

  dotacao: z.object({
    total_texto: z.string().nullable(),
    total_eur: z.number().nullable(),
    apoio_max_por_beneficiario_eur: z.number().nullable(),
  }),

  candidatura: z.object({
    url: z.string().nullable(),
    plataforma: z.string().nullable(),
  }),

  documentos: z
    .array(
      z.object({
        titulo: z.string(),
        url: z.string(),
        tipo: z.enum(["aviso", "formulario", "faq", "legislacao", "anexo", "outro"]),
      }),
    )
    .max(30),

  avisos_importantes: z.array(z.string()).max(10),

  /** The model's own read on the document. Useful signal, never the gate. */
  auto_avaliacao: z.object({
    documento_e_aviso_de_apoio: z.boolean(),
    qualidade_ocr: z.enum(["boa", "media", "ma", "nao_aplicavel"]),
    notas: z.string().nullable(),
  }),
});

export type Extraccao = z.infer<typeof EsquemaExtraccao>;

/** The fields whose confidence decides whether an alert may be sent at all. */
export const CAMPOS_CRITICOS = [
  "estado",
  "prazos.encerramento",
  "beneficiarios.admite_particulares",
] as const;
