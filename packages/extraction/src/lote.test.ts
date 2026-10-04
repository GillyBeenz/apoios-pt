import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { chaveCassete, type DocumentoEntrada } from "./cliente.ts";
import { DESCONTO_LOTE, ErroLoteNaoPreparado, ExtractorLote } from "./lote.ts";
import { extraccaoSolar } from "./teste/extraccoes.ts";
import { custoDaChamada } from "./precos.ts";

const doc = (texto: string): DocumentoEntrada => ({
  urlFonte: `https://exemplo.pt/${encodeURIComponent(texto)}`,
  entidade: "Fundo Ambiental",
  dataRecolha: "2026-09-21",
  texto,
});

const USO = {
  input_tokens: 20_000,
  output_tokens: 3_000,
  cache_read_input_tokens: 5_000,
  cache_creation_input_tokens: 0,
};

function mensagem(): unknown {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5",
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify(extraccaoSolar()) }],
    usage: USO,
  };
}

/** Um cliente falso com só o que o `ExtractorLote` toca. */
function clienteFalso(opcoes: {
  linhas: unknown[];
  estados?: string[];
}): { cliente: Anthropic; criar: ReturnType<typeof vi.fn> } {
  const estados = opcoes.estados ?? ["ended"];
  let i = 0;
  const criar = vi.fn(async () => ({
    id: "batch_1",
    processing_status: estados[0],
  }));
  const cliente = {
    beta: {
      messages: {
        batches: {
          create: criar,
          retrieve: async () => ({
            id: "batch_1",
            processing_status: estados[Math.min(++i, estados.length - 1)],
          }),
          results: async () => opcoes.linhas,
        },
      },
    },
  } as unknown as Anthropic;
  return { cliente, criar };
}

const semEspera = { esperar: async () => {}, intervaloMs: 0 };

describe("a espera por omissão", () => {
  /**
   * Tinha `.unref()`, e isso fazia o processo sair antes de a espera resolver.
   *
   * Um temporizador `unref`ed não conta para manter o ciclo de eventos vivo. Com
   * o lote submetido e nada mais pendente, o Node saía do ciclo, o processo
   * terminava com código **0**, e a promessa nunca resolvia. O job dava
   * `success`, o lote ficava submetido e pago, e ninguém recolhia nada.
   *
   * Medido em produção: 117 pedidos submetidos às 16:54:27, processo terminado
   * às 16:54:31, zero extracções escritas, `msgbatch_01214cw6cBPuao8pscu5Ak8K`
   * pago e por recolher.
   *
   * Este teste é o guarda, e é um teste sobre o ciclo de eventos e não sobre
   * lotes: confere que a espera real resolve.
   */
  it("segura o processo, provado num processo à parte", () => {
    // **Tem de ser um subprocesso.** Dentro do vitest o ciclo de eventos é
    // mantido vivo pelo runner, por isso a avaria não se reproduz aqui:
    // verifiquei que, com o `.unref()` reposto, os quinze testes deste ficheiro
    // passavam todos. Um teste que não se vê falhar não é um guarda.
    //
    // E o que se confere é a **marca na saída**, não o código de saída. Em
    // produção o processo saiu com 0 — o job deu `success` — e foi isso que
    // tornou a avaria invisível.
    const guiao = new URL("./teste/espera-em-subprocesso.ts", import.meta.url);
    const r = spawnSync(
      process.execPath,
      ["--experimental-strip-types", fileURLToPath(guiao)],
      { encoding: "utf8", timeout: 60_000 },
    );

    expect(r.stdout).toContain("ESPERA-SEGUROU");
    // Duas sondagens: a espera correu mesmo, não foi saltada.
    expect(r.stdout).toContain("sondagens=2");
  });

  it("o lote espera enquanto o estado não é `ended`, e chega ao fim", async () => {
    // O teste que interessa: com a espera real (sem injecção), o ciclo de
    // sondagem completa-se e as respostas são servidas. Antes da correcção, o
    // processo saía no primeiro `await`.
    const a = doc("aviso A");
    const { cliente } = clienteFalso({
      estados: ["in_progress", "ended"],
      linhas: [{ custom_id: chaveCassete(a), result: { type: "succeeded", message: mensagem() } }],
    });
    const lote = new ExtractorLote({ cliente, intervaloMs: 1 });

    await lote.prepararLote([a]);

    expect((await lote.extrair(a)).extraccao).not.toBeNull();
  });
});

describe("recolher um lote já submetido", () => {
  /**
   * A saída para trabalho pago que ficou por recolher. Um lote é pago quando é
   * processado, não quando é lido, e os resultados ficam 29 dias.
   */
  it("recolhe em vez de submeter, e não cria nada", async () => {
    const a = doc("aviso A");
    const { cliente, criar } = clienteFalso({
      linhas: [{ custom_id: chaveCassete(a), result: { type: "succeeded", message: mensagem() } }],
    });
    const lote = new ExtractorLote({
      cliente,
      ...semEspera,
      loteExistente: "msgbatch_jaPago",
    });

    await lote.prepararLote([a]);

    expect(criar).not.toHaveBeenCalled();
    expect((await lote.extrair(a)).extraccao).not.toBeNull();
  });

  it("um documento que mudou desde a submissão vira falha, não casa com o errado", async () => {
    // A chave é o `chaveCassete`, que inclui o texto do documento. Se o
    // documento mudou, a chave mudou e a resposta do lote não lhe pertence.
    const antigo = doc("aviso como estava");
    const mudado = doc("aviso com texto novo");
    const { cliente } = clienteFalso({
      linhas: [{ custom_id: chaveCassete(antigo), result: { type: "succeeded", message: mensagem() } }],
    });
    const lote = new ExtractorLote({
      cliente,
      ...semEspera,
      loteExistente: "msgbatch_jaPago",
    });

    await lote.prepararLote([mudado]);

    const r = await lote.extrair(mudado);
    expect(r.extraccao).toBeNull();
    expect(r.erro).toContain("não devolveu");
  });
});

describe("o corpo do pedido em lote", () => {
  /**
   * A API de lotes recusa o `fallbacks`, e os tipos do SDK não o dizem.
   *
   * Medido contra uma submissão a sério: HTTP 400, `requests[0]: The
   * 'fallbacks' parameter is not supported for batch requests`. O tipo do pedido
   * de lote declara `fallbacks?: BetaFallbacksParam | null`, por isso um corpo
   * partilhado que o leve compila e só falha no servidor — 10 minutos de
   * descargas depois.
   *
   * É este teste que impede que ele volte, porque o compilador não o faz.
   */
  it("não leva `fallbacks`, que o lote recusa", async () => {
    const a = doc("aviso A");
    const { cliente, criar } = clienteFalso({
      linhas: [{ custom_id: chaveCassete(a), result: { type: "succeeded", message: mensagem() } }],
    });
    await new ExtractorLote({ cliente, ...semEspera }).prepararLote([a]);

    const params = criar.mock.calls[0]?.[0]?.requests?.[0]?.params;
    expect(params).toBeDefined();
    expect(params).not.toHaveProperty("fallbacks");
    // E o resto do corpo continua lá: o que muda é um campo, não o pedido.
    expect(params.model).toBe("claude-opus-5");
    expect(params.system).toBeDefined();
    expect(params.thinking).toEqual({ type: "adaptive" });
  });
});

describe("ExtractorLote", () => {
  it("submete tudo num pedido só e serve o que voltou", async () => {
    const a = doc("aviso A");
    const b = doc("aviso B");
    const { cliente, criar } = clienteFalso({
      linhas: [
        { custom_id: chaveCassete(a), result: { type: "succeeded", message: mensagem() } },
        { custom_id: chaveCassete(b), result: { type: "succeeded", message: mensagem() } },
      ],
    });
    const lote = new ExtractorLote({ cliente, ...semEspera });

    await lote.prepararLote([a, b]);

    expect(criar).toHaveBeenCalledTimes(1);
    expect(criar.mock.calls[0]?.[0]?.requests).toHaveLength(2);
    expect((await lote.extrair(a)).extraccao).not.toBeNull();
    expect((await lote.extrair(b)).extraccao).not.toBeNull();
  });

  /**
   * Metade, e aplicada ao preço e não às contagens de tokens.
   *
   * Os tokens são os que são. Escalá-los para a aritmética bater certo seria
   * mentir na única tabela que existe para dizer o que foi perguntado e o que
   * voltou.
   */
  it("cobra metade do preço de lista, sem mexer nos tokens", async () => {
    const a = doc("aviso A");
    const { cliente } = clienteFalso({
      linhas: [{ custom_id: chaveCassete(a), result: { type: "succeeded", message: mensagem() } }],
    });
    const lote = new ExtractorLote({ cliente, ...semEspera });
    await lote.prepararLote([a]);

    const r = await lote.extrair(a);
    const listaCheia = custoDaChamada("claude-opus-5", {
      tokensEntrada: 20_000,
      tokensSaida: 3_000,
      tokensCacheLidos: 5_000,
      tokensCacheEscritos: 0,
    })!;

    expect(r.tokensEntrada).toBe(20_000);
    expect(r.tokensSaida).toBe(3_000);
    expect(r.custoUsd).toBeCloseTo(listaCheia * DESCONTO_LOTE, 6);
  });

  it("dois documentos idênticos são um pedido só, e pagam uma vez", async () => {
    // `chaveCassete` inclui o texto do documento. Dois candidatos que apontem
    // para bytes idênticos colapsam, que é o mesmo que a cassete já fazia.
    const a = doc("o mesmo aviso");
    const b = doc("o mesmo aviso");
    const { cliente, criar } = clienteFalso({
      linhas: [{ custom_id: chaveCassete(a), result: { type: "succeeded", message: mensagem() } }],
    });
    const lote = new ExtractorLote({ cliente, ...semEspera });

    await lote.prepararLote([a, b]);

    expect(criar.mock.calls[0]?.[0]?.requests).toHaveLength(1);
    expect((await lote.extrair(b)).extraccao).not.toBeNull();
  });

  it("espera enquanto o lote não acaba", async () => {
    const a = doc("aviso A");
    const { cliente } = clienteFalso({
      estados: ["in_progress", "in_progress", "ended"],
      linhas: [{ custom_id: chaveCassete(a), result: { type: "succeeded", message: mensagem() } }],
    });
    const esperar = vi.fn(async () => {});
    const lote = new ExtractorLote({ cliente, esperar, intervaloMs: 0 });

    await lote.prepararLote([a]);

    expect(esperar).toHaveBeenCalledTimes(2);
    expect((await lote.extrair(a)).extraccao).not.toBeNull();
  });

  it("desiste de esperar sem cancelar, e diz porquê", async () => {
    // Não cancela de propósito: um lote que passou do tempo continua a ser
    // processado e os resultados ficam 29 dias. Cancelar deitava fora o que já
    // foi pago.
    const a = doc("aviso A");
    const { cliente } = clienteFalso({ estados: ["in_progress"], linhas: [] });
    let relogio = 0;
    const lote = new ExtractorLote({
      cliente,
      esperar: async () => { relogio += 60_000; },
      intervaloMs: 0,
      tempoMaximoMs: 120_000,
      agora: () => relogio,
    });

    await lote.prepararLote([a]);

    const r = await lote.extrair(a);
    expect(r.extraccao).toBeNull();
    expect(r.erro).toContain("não terminou");
  });

  it("um pedido que não volta vira falha, não uma excepção no meio do ciclo", async () => {
    const a = doc("aviso A");
    const b = doc("aviso B");
    const { cliente } = clienteFalso({
      linhas: [{ custom_id: chaveCassete(a), result: { type: "succeeded", message: mensagem() } }],
    });
    const lote = new ExtractorLote({ cliente, ...semEspera });

    await lote.prepararLote([a, b]);

    expect((await lote.extrair(a)).extraccao).not.toBeNull();
    const r = await lote.extrair(b);
    expect(r.extraccao).toBeNull();
    expect(r.erro).toContain("não devolveu");
  });

  it("traduz cada tipo de falha do lote", async () => {
    const casos: Array<[unknown, string]> = [
      [{ type: "errored", error: { error: { type: "invalid_request", message: "mau" } } }, "invalid_request"],
      [{ type: "expired" }, "expirou"],
      [{ type: "canceled" }, "cancelado"],
    ];
    for (const [result, esperado] of casos) {
      const a = doc(`aviso ${esperado}`);
      const { cliente } = clienteFalso({ linhas: [{ custom_id: chaveCassete(a), result }] });
      const lote = new ExtractorLote({ cliente, ...semEspera });
      await lote.prepararLote([a]);
      const r = await lote.extrair(a);
      expect(r.extraccao).toBeNull();
      expect(r.erro).toContain(esperado);
    }
  });

  it("pedir algo que não passou pelo lote é um erro alto", async () => {
    const { cliente } = clienteFalso({ linhas: [] });
    const lote = new ExtractorLote({ cliente, ...semEspera });
    await lote.prepararLote([]);
    await expect(lote.extrair(doc("nunca preparado"))).rejects.toBeInstanceOf(
      ErroLoteNaoPreparado,
    );
  });

  it("escreve o identificador do lote antes de esperar por ele", async () => {
    // Um lote é pago quando é processado, não quando é lido. Se o processo
    // morrer a meio da espera, o identificador no log é a única forma de ir
    // buscar trabalho que já foi pago — os resultados ficam 29 dias.
    const a = doc("aviso A");
    const { cliente } = clienteFalso({
      linhas: [{ custom_id: chaveCassete(a), result: { type: "succeeded", message: mensagem() } }],
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await new ExtractorLote({ cliente, ...semEspera }).prepararLote([a]);
      expect(log.mock.calls.flat().join(" ")).toContain("batch_1");
    } finally {
      log.mockRestore();
    }
  });

  it("um lote vazio não chega a bater na API", async () => {
    const { cliente, criar } = clienteFalso({ linhas: [] });
    await new ExtractorLote({ cliente, ...semEspera }).prepararLote([]);
    expect(criar).not.toHaveBeenCalled();
  });
});
