/**
 * Prova, num processo só seu, que a espera do `ExtractorLote` mantém o Node vivo.
 *
 * Tem de ser um processo à parte. Dentro do vitest o ciclo de eventos é mantido
 * vivo pelo próprio runner, por isso a avaria — um temporizador `unref`ed, que
 * não conta para manter o ciclo vivo — **não se reproduz lá**. Verifiquei: com o
 * `.unref()` reposto, os quinze testes do `lote.test.ts` passavam todos.
 *
 * Aqui não há runner. Se a espera não segurar o processo, o Node sai antes de
 * imprimir a marca, que é exactamente o que aconteceu em produção: 117 pedidos
 * submetidos, processo terminado quatro segundos depois com código 0, zero
 * extracções escritas.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { ExtractorLote } from "../lote.ts";

const doc = {
  urlFonte: "https://exemplo.pt/a",
  entidade: "Fundo Ambiental",
  dataRecolha: "2026-10-04",
  texto: "um aviso qualquer",
};

let sondagens = 0;
const cliente = {
  beta: {
    messages: {
      batches: {
        create: async () => ({ id: "batch_x", processing_status: "in_progress" }),
        retrieve: async () => ({
          id: "batch_x",
          // Só ao fim de duas sondagens: obriga a espera a correr duas vezes.
          processing_status: ++sondagens >= 2 ? "ended" : "in_progress",
        }),
        results: async () => [],
      },
    },
  },
} as unknown as Anthropic;

await new ExtractorLote({ cliente, intervaloMs: 40 }).prepararLote([doc]);

// A marca. Se a espera não segurar o processo, isto nunca é impresso.
console.log(`ESPERA-SEGUROU sondagens=${sondagens}`);
