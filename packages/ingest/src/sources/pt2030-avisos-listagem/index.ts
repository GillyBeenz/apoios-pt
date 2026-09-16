import type { ApoioNovo } from "@apoios/core";
import type { ContextoDataset, Fonte } from "../tipos.ts";
import { lerAvisos } from "./resposta.ts";
import { avisoAbertoParaApoio } from "./paraApoio.ts";
import { corpoDoVarrimento, TIPO_CONTEUDO, URL_QUERY } from "./pedido.ts";

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

  pedidosEntrada: [
    {
      url: URL_QUERY,
      metodo: "POST",
      corpo: corpoDoVarrimento(),
      tipoConteudo: TIPO_CONTEUDO,

      // Sem isto a fonte lia 5 de 228. O endpoint devolve cinco avisos por
      // página, ordenados por `publicacao desc`, e cada aviso novo empurrava um
      // antigo para fora da única página que se pedia — em silêncio, porque uma
      // resposta com cinco avisos é indistinguível de uma fonte saudável.
      //
      // `page` foi o único de vinte nomes que o servidor reconheceu, e **conta
      // a partir do zero**: `page=0` devolve byte a byte o mesmo que não mandar
      // `page` nenhum. Ler isto como 1-indexado salta a segunda página inteira
      // sem dar erro. A prova está em
      // `comum/fixtures-permanentes/pt2030-avisos-query-paginacao.json`.
      //
      // 200 é tecto, não expectativa: a 16/09 havia 46 páginas. É folga para a
      // fonte crescer sem que uma corrida ande até ao timeout no dia em que o
      // sentinela de fim mudar. Atingi-lo é um aviso em voz alta.
      paginacao: { parametro: "page", primeiraPagina: 0, maxPaginas: 200 },
    },
  ],

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

  // Cinquenta, e o número mudou quando a fonte passou a varrer.
  //
  // Era um, e um estava certo enquanto isto lia uma página: cinco era quantos
  // estavam abertos no dia da captura, um número sobre o calendário do Estado e
  // não sobre a saúde da fonte. Com o varrimento a resposta real tem 229 avisos,
  // e «zero» deixou de ser o modo de falha que interessa.
  //
  // O que interessa agora é a truncagem. Uma página que não responde é pedida
  // segunda vez e, se voltar a falhar, a corrida regista erro — isso vê-se. O que
  // não se vê é o varrimento parar cedo e sair uma corrida bem formada com os
  // cinco da primeira página e nenhum erro. É a falha silenciosa que este
  // repositório já pagou duas vezes, e um piso de um deixava-a passar inteira.
  //
  // Cinquenta está muito acima de uma página e muito abaixo dos 229 medidos. Não
  // é uma previsão do calendário do Estado: é a fronteira entre «uma semana fraca»
  // e «isto está partido». Um dia em que os avisos abertos do PT2030 caiam abaixo
  // de cinquenta é, ele próprio, coisa para alguém ir ver.
  candidatosMin: 50,

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
