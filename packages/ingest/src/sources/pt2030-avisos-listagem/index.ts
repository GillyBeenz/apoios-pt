import type { ApoioNovo } from "@apoios/core";
import type { ContextoDataset, Fonte } from "../tipos.ts";
import { lerAvisos } from "./resposta.ts";
import { avisoAbertoParaApoio } from "./paraApoio.ts";

/** A página humana. É para aqui que um leitor deve ser mandado. */
const LISTAGEM = "https://portugal2030.pt/avisos/";

/**
 * Os 23 programas operacionais, tal como a própria página os envia.
 *
 * Copiados do pedido observado, não escolhidos: mandar a lista inteira é o que o
 * sítio faz, e é o que devolve tudo. Uma lista mais curta seria um filtro nosso
 * disfarçado de contrato deles.
 */
const PROGRAMAS = [
  100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122,
] as const;

/**
 * O corpo do pedido, montado a partir das mesmas partes que a página envia.
 *
 * `estadoAvisoId=7` é o filtro da vista inicial do sítio — os avisos com
 * candidaturas a decorrer. Não se sabe o que valem os outros valores, e isso está
 * escrito como nota em `comum/fixtures-permanentes/pt2030-avisos-query-contrato.json`
 * em vez de adivinhado aqui.
 */
function corpoDoPedido(): string {
  const p = new URLSearchParams();
  p.set("estadoAvisoId", "7");
  for (const id of PROGRAMAS) p.append("programaId[]", String(id));
  p.set("order_by_field", "publicacao");
  p.set("order_by_direction", "desc");
  return p.toString();
}

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
      url: "https://portugal2030.pt/wp-json/avisos/query",
      metodo: "POST",
      corpo: corpoDoPedido(),
      tipoConteudo: "application/x-www-form-urlencoded; charset=UTF-8",
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

  // Um, e agora quer dizer alguma coisa: numa fonte cuja entrada já é o conjunto
  // de dados, a métrica `candidatos` passou a contar os apoios que a resposta
  // rendeu, porque candidatos a sério não há nenhum.
  //
  // Um e não cinco. Cinco é quantos estavam abertos no dia da captura, e é um
  // número sobre o calendário do Estado, não sobre a saúde desta fonte: uma
  // semana em que só abre um aviso é uma semana normal, não uma avaria. Zero é
  // que não é — o endpoint devolver lista vazia significa que alguma coisa mudou
  // do lado de lá.
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
