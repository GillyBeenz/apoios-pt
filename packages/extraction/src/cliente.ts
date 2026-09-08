import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { EsquemaExtraccao, VERSAO_ESQUEMA, type Extraccao } from "./esquema.ts";
import { CONTRATO_JSON, extrairJson } from "./contrato.ts";
import {
  PROMPT_SISTEMA,
  VERSAO_PROMPT,
  hashPrompt,
  instrucaoVolatil,
} from "./prompt.ts";

export const MODELO = "claude-opus-5";

export interface DocumentoEntrada {
  readonly urlFonte: string;
  readonly entidade: string;
  readonly dataRecolha: string;
  /** Plain text of the document. Always required — evidence is verified against it. */
  readonly texto: string;
  /** Raw PDF bytes when the notice is a PDF; sent as a document block. */
  readonly pdf?: Uint8Array | undefined;
}

export interface ResultadoExtraccao {
  readonly extraccao: Extraccao | null;
  readonly stopReason: string | null;
  readonly modelo: string;
  readonly versaoPrompt: string;
  readonly versaoEsquema: string;
  readonly tokensEntrada: number;
  readonly tokensSaida: number;
  readonly tokensCacheLidos: number;
  readonly erro: string | null;
}

/**
 * Cassette key.
 *
 * Includes the prompt hash and schema version, so changing either deliberately
 * invalidates every recording and forces a re-record rather than silently testing
 * yesterday's prompt against today's code.
 */
export function chaveCassete(doc: DocumentoEntrada): string {
  const material = [
    MODELO,
    VERSAO_PROMPT,
    hashPrompt(),
    VERSAO_ESQUEMA,
    createHash("sha256").update(doc.texto, "utf8").digest("hex"),
  ].join("|");
  return createHash("sha256")
    .update(material, "utf8")
    .digest("hex")
    .slice(0, 32);
}

/**
 * What the pipeline depends on. Declared structurally so tests can substitute a
 * stub without a client, a key, or a cassette on disk.
 */
export interface ExtractorLike {
  extrair(doc: DocumentoEntrada): Promise<ResultadoExtraccao>;
}

export type ModoExtraccao = "replay" | "record" | "live";

export interface OpcoesExtractor {
  readonly modo?: ModoExtraccao;
  readonly dirCassetes?: string;
  readonly cliente?: Anthropic;
}

function modoPorDefeito(): ModoExtraccao {
  const m = process.env.ANTHROPIC_MODE;
  if (m === "record" || m === "live" || m === "replay") return m;
  // Replay by default so a test run can never make a surprise paid API call —
  // and so the suite behaves identically in CI and in the egress-blocked sandbox.
  return "replay";
}

export class ErroCasseteEmFalta extends Error {
  constructor(chave: string, dir: string) {
    super(
      `Cassete em falta: ${chave} (em ${dir}). ` +
        `Corre com ANTHROPIC_MODE=record e uma ANTHROPIC_API_KEY válida para a gravar.`,
    );
    this.name = "ErroCasseteEmFalta";
  }
}

export class Extractor {
  readonly #modo: ModoExtraccao;
  readonly #dirCassetes: string;
  #cliente: Anthropic | undefined;

  constructor(opcoes: OpcoesExtractor = {}) {
    this.#modo = opcoes.modo ?? modoPorDefeito();
    this.#dirCassetes =
      opcoes.dirCassetes ??
      join(process.cwd(), "packages/extraction/fixtures/cassetes");
    this.#cliente = opcoes.cliente;
  }

  #obterCliente(): Anthropic {
    // Constructed lazily so replay-mode tests never need a key present.
    this.#cliente ??= new Anthropic();
    return this.#cliente;
  }

  async extrair(doc: DocumentoEntrada): Promise<ResultadoExtraccao> {
    const chave = chaveCassete(doc);

    if (this.#modo === "replay") {
      return this.#lerCassete(chave);
    }

    const resultado = await this.#chamarApi(doc);

    if (this.#modo === "record") {
      await mkdir(this.#dirCassetes, { recursive: true });
      await writeFile(
        join(this.#dirCassetes, `${chave}.json`),
        JSON.stringify(resultado, null, 2),
        "utf8",
      );
    }

    return resultado;
  }

  async #lerCassete(chave: string): Promise<ResultadoExtraccao> {
    const caminho = join(this.#dirCassetes, `${chave}.json`);
    let bruto: string;
    try {
      bruto = await readFile(caminho, "utf8");
    } catch {
      // Deliberately loud. A silent fallthrough to the network would make the
      // suite non-deterministic and, in the blocked sandbox, mysteriously slow.
      throw new ErroCasseteEmFalta(chave, this.#dirCassetes);
    }
    return JSON.parse(bruto) as ResultadoExtraccao;
  }

  async #chamarApi(doc: DocumentoEntrada): Promise<ResultadoExtraccao> {
    const cliente = this.#obterCliente();

    const conteudo: Anthropic.Beta.BetaContentBlockParam[] = [];

    if (doc.pdf) {
      // The PDF goes in raw. Parsing it locally first would mangle the multi-column
      // measure/percentage/cap tables these notices use, and feeding the model that
      // mangled text is strictly worse than feeding it the document.
      conteudo.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: Buffer.from(doc.pdf).toString("base64"),
        },
      });
    } else {
      conteudo.push({ type: "text", text: doc.texto });
    }

    // Volatile context goes last, after the cached prefix.
    conteudo.push({
      type: "text",
      text: instrucaoVolatil({
        urlFonte: doc.urlFonte,
        entidade: doc.entidade,
        dataRecolha: doc.dataRecolha,
      }),
    });

    try {
      const resposta = await cliente.beta.messages.create({
        model: MODELO,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        // `format` is deliberately absent — see `contrato.ts`. `effort` stays:
        // it governs how hard the model thinks, not how the output is decoded.
        output_config: { effort: "high" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [
          {
            type: "text",
            // The contract goes inside the cached block: it is the same bytes on
            // every call, so it is read from cache at ~0.1x rather than re-sent.
            text: `${PROMPT_SISTEMA}\n\n${CONTRATO_JSON}`,
            // The whole taxonomy and rubric sit before this breakpoint, so every
            // document after the first reads them from cache at ~0.1x.
            cache_control: { type: "ephemeral", ttl: "1h" },
          },
        ],
        messages: [{ role: "user", content: conteudo }],
      });

      const uso = resposta.usage;
      const base = {
        modelo: resposta.model ?? MODELO,
        versaoPrompt: VERSAO_PROMPT,
        versaoEsquema: VERSAO_ESQUEMA,
        tokensEntrada: uso?.input_tokens ?? 0,
        tokensSaida: uso?.output_tokens ?? 0,
        tokensCacheLidos: uso?.cache_read_input_tokens ?? 0,
      };

      // Check the stop reason before touching content: on a refusal there is no
      // usable output, and throwing here would take down the whole run for one
      // awkward document.
      if (resposta.stop_reason === "refusal") {
        return {
          ...base,
          extraccao: null,
          stopReason: "refusal",
          erro: "modelo recusou",
        };
      }

      // Validation moved from the decoder to here, and the schema doing it is the
      // same one that used to constrain it — so a response that would have been
      // rejected mid-decode is now rejected on arrival, by `EsquemaExtraccao`
      // itself. What is lost is the guarantee that the model *cannot* produce
      // something invalid; what is gained is a schema that the API will accept.
      const texto = resposta.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      const json = extrairJson(texto);
      if (json === null) {
        return {
          ...base,
          extraccao: null,
          stopReason: resposta.stop_reason ?? null,
          erro:
            resposta.stop_reason === "max_tokens"
              ? "resposta truncada em max_tokens antes de fechar o JSON"
              : "resposta sem JSON reconhecível",
        };
      }

      const validado = EsquemaExtraccao.safeParse(json);
      if (!validado.success) {
        // The message names the offending paths, so a prompt or schema drift
        // shows up as "beneficiarios.tipos: invalid enum" instead of silence.
        const problemas = validado.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        return {
          ...base,
          extraccao: null,
          stopReason: resposta.stop_reason ?? null,
          erro: `JSON não valida contra o esquema — ${problemas}`,
        };
      }

      return {
        ...base,
        extraccao: validado.data,
        stopReason: resposta.stop_reason ?? null,
        erro: null,
      };
    } catch (erro) {
      return {
        extraccao: null,
        stopReason: null,
        modelo: MODELO,
        versaoPrompt: VERSAO_PROMPT,
        versaoEsquema: VERSAO_ESQUEMA,
        tokensEntrada: 0,
        tokensSaida: 0,
        tokensCacheLidos: 0,
        erro: erro instanceof Error ? erro.message : String(erro),
      };
    }
  }
}
