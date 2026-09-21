import Anthropic from "@anthropic-ai/sdk";
import {
  BETA_FALLBACK,
  chaveCassete,
  corpoDoPedido,
  interpretarResposta,
  resultadoDeErro,
  type DocumentoEntrada,
  type ExtractorLike,
  type ResultadoExtraccao,
} from "./cliente.ts";

/**
 * The Batches API, at half the list price.
 *
 * Same model, same prompt, same schema, same cached prefix — the request body is
 * literally `corpoDoPedido`, shared with the single-call path so the two cannot
 * drift. What changes is only when the answer arrives: a batch is submitted, then
 * polled, and most finish within the hour against a 24-hour ceiling.
 *
 * That wait is the whole cost of this, and it is why it is opt-in. A nightly run
 * that must finish tonight cannot use it. The first pass over a source's entire
 * back catalogue can, because nobody is waiting for it.
 *
 * The shape is deliberately unlike `Extractor`: `prepararLote` does the work and
 * `extrair` only serves what came back. The pipeline calls them in that order, so
 * every document is already answered by the time the loop that uses them runs.
 */

/** Half. Applied to the priced cost, never to the token counts. */
export const DESCONTO_LOTE = 0.5;

export interface OpcoesExtractorLote {
  readonly cliente?: Anthropic;
  /** How long to wait for the batch before giving up, in milliseconds. */
  readonly tempoMaximoMs?: number;
  /** Seconds between polls. */
  readonly intervaloMs?: number;
  /** Injected so tests do not sleep. */
  readonly esperar?: (ms: number) => Promise<void>;
  /** Injected so tests do not watch a clock. */
  readonly agora?: () => number;
}

const DUAS_HORAS = 2 * 60 * 60 * 1000;
const UM_MINUTO = 60_000;

export class ErroLoteNaoPreparado extends Error {
  constructor(chave: string) {
    super(
      `Documento não está no lote: ${chave}. ` +
        `O ExtractorLote só responde ao que passou por prepararLote().`,
    );
    this.name = "ErroLoteNaoPreparado";
  }
}

export class ExtractorLote implements ExtractorLike {
  readonly #tempoMaximoMs: number;
  readonly #intervaloMs: number;
  readonly #esperar: (ms: number) => Promise<void>;
  readonly #agora: () => number;
  #cliente: Anthropic | undefined;
  #respostas = new Map<string, ResultadoExtraccao>();

  constructor(opcoes: OpcoesExtractorLote = {}) {
    this.#cliente = opcoes.cliente;
    this.#tempoMaximoMs = opcoes.tempoMaximoMs ?? DUAS_HORAS;
    this.#intervaloMs = opcoes.intervaloMs ?? UM_MINUTO;
    this.#esperar =
      opcoes.esperar ??
      ((ms) => new Promise<void>((r) => setTimeout(r, ms).unref?.()));
    this.#agora = opcoes.agora ?? Date.now;
  }

  #obterCliente(): Anthropic {
    this.#cliente ??= new Anthropic();
    return this.#cliente;
  }

  /**
   * Submit every document as one batch and wait for it.
   *
   * `chaveCassete` is the `custom_id`, and that is not an accident of reuse: it
   * already hashes the model, the prompt version, the prompt itself, the schema
   * version and the document text, which is exactly the identity `extrair` needs
   * to look an answer up by. Two candidates pointing at byte-identical documents
   * collapse onto one request, and pay once.
   */
  async prepararLote(docs: readonly DocumentoEntrada[]): Promise<void> {
    this.#respostas = new Map();
    if (docs.length === 0) return;

    const porChave = new Map<string, DocumentoEntrada>();
    for (const doc of docs) porChave.set(chaveCassete(doc), doc);

    const cliente = this.#obterCliente();
    const lote = await cliente.beta.messages.batches.create({
      betas: [BETA_FALLBACK],
      requests: [...porChave].map(([chave, doc]) => ({
        custom_id: chave,
        params: corpoDoPedido(doc),
      })),
    });

    // O identificador vai para o log antes de se esperar por ele, e isso é o
    // que torna o tempo de espera recuperável em vez de caro.
    //
    // Um lote é pago quando é processado, não quando é lido, e os resultados
    // ficam disponíveis 29 dias. Se o processo morrer a meio da espera — o job
    // esgota o tempo, o runner cai — o trabalho está feito e pago; sem o
    // identificador escrito em lado nenhum, não há como ir buscá-lo e a corrida
    // seguinte paga tudo outra vez.
    console.log(
      `[lote] ${lote.id} submetido com ${porChave.size} pedidos. ` +
        `Os resultados ficam disponíveis 29 dias: se esta corrida morrer a ` +
        `meio, é por este identificador que se recuperam.`,
    );

    const limite = this.#agora() + this.#tempoMaximoMs;
    let estado = lote;
    while (estado.processing_status !== "ended") {
      if (this.#agora() >= limite) {
        // Não cancela. Um lote que passou do tempo continua a ser processado e
        // os resultados ficam disponíveis 29 dias — desistir de esperar não é
        // desistir do trabalho, e cancelar seria deitar fora o que já foi pago.
        for (const chave of porChave.keys()) {
          this.#respostas.set(
            chave,
            resultadoDeErro(
              new Error(
                `lote ${lote.id} não terminou em ${Math.round(this.#tempoMaximoMs / 60000)} min`,
              ),
            ),
          );
        }
        return;
      }
      await this.#esperar(this.#intervaloMs);
      estado = await cliente.beta.messages.batches.retrieve(lote.id);
    }

    for await (const linha of await cliente.beta.messages.batches.results(
      lote.id,
    )) {
      this.#respostas.set(linha.custom_id, resultadoDaLinha(linha));
    }

    // Um pedido que não voltou não é um pedido que correu bem. Sem isto, uma
    // resposta em falta virava um `ErroLoteNaoPreparado` lançado do meio do
    // ciclo, que derruba a corrida inteira por causa de um documento.
    for (const chave of porChave.keys()) {
      if (!this.#respostas.has(chave)) {
        this.#respostas.set(
          chave,
          resultadoDeErro(new Error(`lote ${lote.id} não devolveu ${chave}`)),
        );
      }
    }
  }

  async extrair(doc: DocumentoEntrada): Promise<ResultadoExtraccao> {
    const chave = chaveCassete(doc);
    const r = this.#respostas.get(chave);
    if (r === undefined) throw new ErroLoteNaoPreparado(chave);
    return r;
  }
}

type Linha = Anthropic.Beta.Messages.BetaMessageBatchIndividualResponse;

function resultadoDaLinha(linha: Linha): ResultadoExtraccao {
  const r = linha.result;
  switch (r.type) {
    case "succeeded":
      return interpretarResposta(r.message, DESCONTO_LOTE);
    case "errored":
      return resultadoDeErro(
        new Error(`lote: ${r.error.error.type} — ${r.error.error.message}`),
      );
    case "canceled":
      return resultadoDeErro(new Error("lote: pedido cancelado"));
    case "expired":
      return resultadoDeErro(new Error("lote: pedido expirou sem resposta"));
    default:
      // Um tipo novo do lado da API. Contá-lo como falha é a leitura segura:
      // o que não se sabe ler não produziu extracção nenhuma.
      return resultadoDeErro(
        new Error(`lote: resultado de tipo desconhecido`),
      );
  }
}
