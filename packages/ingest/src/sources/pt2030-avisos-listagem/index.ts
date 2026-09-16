import type { ApoioNovo } from "@apoios/core";
import type { ContextoDataset, Fonte } from "../tipos.ts";
import { lerAvisos } from "./resposta.ts";
import { avisoAbertoParaApoio } from "./paraApoio.ts";
import { corpoDoVarrimento, TIPO_CONTEUDO, URL_QUERY } from "./pedido.ts";
import { juntarPaginas, paginaTemItens } from "./varredura.ts";

/** A página humana. É para aqui que um leitor deve ser mandado. */
const LISTAGEM = "https://portugal2030.pt/avisos/";

export const pt2030AvisosListagem: Fonte = {
  id: "pt2030-avisos-listagem",
  nome: "Portugal 2030 — Avisos abertos",
  entidade: "Agência para o Desenvolvimento e Coesão",
  urlBase: "https://portugal2030.pt",

  // Vazio, e é isso que importa nesta fonte: a página `/avisos/` é montada no
  // browser e não serve avisos nenhuns a quem a busca. Duas capturas provaram-no —
  // 2,87 MB de HTML com zero avisos sem browser, 4417 caracteres com ele — e a
  // segunda mostrou de onde vêm mesmo.
  urlsEntrada: [],

  // Um pedido declarado, e um varrimento por trás dele.
  //
  // Sem `varredura` esta fonte lia cinco avisos de 228. Não era um filtro: era a
  // primeira página, e cada aviso novo que o PT2030 publicava empurrava um antigo
  // para fora do catálogo sem deixar rasto. O `NORTE2030-2026-22`, com prazo até
  // 31/12/2026, saiu assim.
  //
  // O `page` é **0-indexado** — está medido, não suposto: `page=0` devolve byte a
  // byte o mesmo que o pedido sem `page`. Ler isto ao contrário salta a segunda
  // página inteira em silêncio, e já aconteceu uma vez.
  //
  // `maxPaginas: 200` são mil avisos a cinco por página, contra os 46 que o
  // varrimento observado precisou. Não é um limite de leitura, é um corta-circuito
  // para o dia em que o endpoint deixar de dizer onde acaba.
  pedidosEntrada: [
    {
      url: URL_QUERY,
      metodo: "POST",
      corpo: corpoDoVarrimento(),
      tipoConteudo: TIPO_CONTEUDO,
      varredura: { parametro: "page", primeiraPagina: 0, maxPaginas: 200 },
    },
  ],

  paginaTemItens,
  juntarPaginas,

  // A resposta é o conjunto de dados. Não há listagem para analisar nem segundo
  // pedido a fazer, e pedir outra vez seria mandar o mesmo corpo para receber os
  // mesmos bytes.
  entradaEDataset: true,

  tipo: "dataset",
  cadenciaHoras: 24,

  // `activa`. A captura nº 21 fez o POST a sério e trouxe 26 858 bytes de JSON —
  // ao byte, a mesma resposta que o browser tinha visto. O caminho inteiro correu
  // de ponta a ponta, que era a condição.
  estado: "activa",

  // Um, e está baixo de mais — de propósito, e com data para subir.
  //
  // Com o varrimento a resposta real tem 229 avisos, e o modo de falha que
  // interessa deixou de ser «zero». O varrimento falha fechado em quase tudo: uma
  // página que não responde não produz documento nenhum. O que ele não apanha é o
  // `paginaTemItens` passar a dizer «acabou» cedo de mais — aí sai um documento
  // bem formado com os cinco da primeira página, e nada a jusante estranha. Um
  // piso à volta de cinquenta apanhava isso.
  //
  // Não sobe já porque o `registo.test.ts` mede este piso contra a captura
  // committada desta fonte, e essa captura é de **uma página**. Subir o piso agora
  // era pôr a build vermelha por causa de uma fixture velha, e commitar à mão uma
  // fixture varrida era saltar o `capturar-fixtures.yml`, que é por onde as
  // fixtures deste repositório entram. O script de captura já varre (mudança deste
  // PR); o piso sobe no PR que trouxer a captura varrida.
  candidatosMin: 1,

  // Não há markup para analisar. O contrato do `Fonte` pede um `extrair`, e a
  // resposta honesta desta fonte a essa pergunta é uma lista vazia.
  extrair: () => [],

  lerDataset(bytes: Uint8Array, ctx: ContextoDataset): ApoioNovo[] {
    return lerAvisos(new TextDecoder("utf-8").decode(bytes)).map((a) =>
      avisoAbertoParaApoio(a, {
        // A página humana, não o endpoint: `ctx.urlOrigem` é o `wp-json`, que não
        // é sítio para mandar ninguém.
        urlListagem: LISTAGEM,
        entidade: ctx.entidade,
      }),
    );
  },
};
