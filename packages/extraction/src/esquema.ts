import * as z from "zod/v4";
import {
  NIVEIS_CONFIANCA,
  PRECISOES_DATA,
  TAXONOMIA_MEDIDAS,
  TIPOS_BENEFICIARIO,
  TRIESTADOS,
} from "@apoios/core";

export const VERSAO_ESQUEMA = "2";

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
    // 0 quando não se aplica. Era `nullable`, e cada `comProva` no esquema
    // multiplicava essa união — ver o cabeçalho deste ficheiro.
    pagina: z
      .number()
      .int()
      .describe("Página do PDF onde a citação aparece; 0 se não se aplicar."),
  });
}

const dataDeclarada = z.object({
  texto_fonte: z
    .string()
    .describe(
      'A expressão exacta usada no documento, ex.: "até às 18:00 do dia 30 de setembro de 2026". "" se não houver.',
    ),
  data_iso: z
    .string()
    .describe('A tua leitura da data, em AAAA-MM-DD. "" se não houver data.'),
  precisao: z.enum(PRECISOES_DATA),
});

/**
 * O esquema de saída estruturada.
 *
 * Uma restrição da API molda-o e não é óbvia ao lê-lo: **um esquema não pode ter
 * mais de 16 parâmetros com tipos-união**. Cada `.nullable()` é uma união
 * (`anyOf: [T, null]`), e a execução #20 bateu no limite com 17 —
 * `invalid_request_error`, todas as chamadas recusadas antes de gerarem um único
 * token.
 *
 * Por isso a ausência é representada de duas maneiras diferentes, deliberadamente:
 *
 * - **Texto ausente é `""`** — a convenção que a `evidencia` já usava. Uma string
 *   vazia não se confunde com nenhum valor real, e o `paraApoio.ts` converte-a de
 *   volta a `null` antes de gravar.
 * - **Números e booleanos ausentes continuam `null`** — e isso não é negociável.
 *   `0 €` não é "não sabemos quanto"; `false` não é "não sabemos se esgotou". Trocar
 *   estes por sentinelas transformaria uma incerteza honesta numa afirmação falsa,
 *   que é exactamente o erro que este projecto evita em todo o lado.
 *
 * Restam cinco uniões, todas numéricas ou booleanas, bem abaixo do limite.
 */
export const EsquemaExtraccao = z.object({
  schema_version: z.literal(VERSAO_ESQUEMA),

  identificacao: z.object({
    titulo: z.string(),
    referencia_legal: comProva(z.string()).describe(
      'Ex.: "Aviso n.º 03/C13-i01/2024". "" se o documento não tiver referência.',
    ),
    programa_pai: z.string().describe('"" se não houver programa acima deste.'),
    entidade_gestora: z
      .string()
      .describe('"" se o documento não a identificar.'),
    resumo_pt: z
      .string()
      .max(600)
      .describe("Resumo em português claro, para um proprietário."),
  }),

  estado: comProva(
    z.enum(["previsto", "aberto", "encerrado", "suspenso", "desconhecido"]),
  ),
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
    restricoes_texto: z
      .string()
      .describe('"" se não houver restrições declaradas.'),
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
    observacoes: z.string().describe('"" se não houver observações.'),
  }),

  medidas: comProva(
    z
      .array(
        z.object({
          medida: z.enum(TAXONOMIA_MEDIDAS),
          percentagem_apoio: z.number().nullable(),
          valor_max_eur: z.number().nullable(),
          unidade: z
            .string()
            .describe('Ex.: "por fracção", "por kWp". "" se não indicada.'),
        }),
      )
      .max(40),
  ),
  medidas_nao_classificadas: z
    .array(z.string())
    .max(20)
    .describe(
      "Medidas do documento que não encaixam na taxonomia — para a melhorarmos.",
    ),

  dotacao: z.object({
    total_texto: z
      .string()
      .describe('A dotação como o documento a escreve. "" se não indicada.'),
    total_eur: z.number().nullable(),
    apoio_max_por_beneficiario_eur: z.number().nullable(),
  }),

  candidatura: z.object({
    url: z
      .string()
      .describe('"" se o documento não indicar URL de candidatura.'),
    plataforma: z.string().describe('"" se não indicada.'),
  }),

  documentos: z
    .array(
      z.object({
        titulo: z.string(),
        url: z.string(),
        tipo: z.enum([
          "aviso",
          "formulario",
          "faq",
          "legislacao",
          "anexo",
          "outro",
        ]),
      }),
    )
    .max(30),

  avisos_importantes: z.array(z.string()).max(10),

  /** The model's own read on the document. Useful signal, never the gate. */
  auto_avaliacao: z.object({
    documento_e_aviso_de_apoio: z.boolean(),
    qualidade_ocr: z.enum(["boa", "media", "ma", "nao_aplicavel"]),
    notas: z.string().describe('"" se não houver nada a assinalar.'),
  }),
});

export type Extraccao = z.infer<typeof EsquemaExtraccao>;

/** The fields whose confidence decides whether an alert may be sent at all. */
export const CAMPOS_CRITICOS = [
  "estado",
  "prazos.encerramento",
  "beneficiarios.admite_particulares",
] as const;
