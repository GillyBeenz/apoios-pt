/**
 * O corpo do pedido ao endpoint de avisos do Portugal 2030.
 *
 * Vive à parte do `index.ts` porque tem dois leitores: a fonte, que o envia em
 * cada corrida, e a sonda, que o usa como base para variantes. Duas cópias do
 * mesmo corpo divergiriam, e uma sonda que interroga um corpo diferente daquele
 * que a fonte envia não prova nada sobre a fonte.
 */

/**
 * Os 23 programas operacionais, tal como a própria página os envia.
 *
 * Copiados do pedido observado, não escolhidos: mandar a lista inteira é o que o
 * sítio faz, e é o que devolve tudo. Uma lista mais curta seria um filtro nosso
 * disfarçado de contrato deles.
 */
export const PROGRAMAS = [
  100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122,
] as const;

export const URL_QUERY = "https://portugal2030.pt/wp-json/avisos/query";

export const TIPO_CONTEUDO = "application/x-www-form-urlencoded; charset=UTF-8";

/**
 * Os pares do corpo, por ordem, tal como a página os envia.
 *
 * Uma lista de pares e não um objecto: `programaId[]` aparece 23 vezes, e um
 * objecto só guardaria a última.
 */
export function paresDoPedido(): [string, string][] {
  return [
    // `estadoAvisoId=7` é o filtro da vista inicial do sítio — os avisos com
    // candidaturas a decorrer. Não se sabe o que valem os outros valores, e isso
    // está escrito como nota em
    // `comum/fixtures-permanentes/pt2030-avisos-query-contrato.json` em vez de
    // adivinhado aqui.
    ["estadoAvisoId", "7"],
    ...PROGRAMAS.map((id) => ["programaId[]", String(id)] as [string, string]),
    // Os quatro filtros vazios que a página envia e que este corpo não enviava.
    //
    // Estavam no pedido observado desde o primeiro dia e ninguém reparou, porque
    // um filtro vazio parece não fazer nada. Talvez não faça — mas «talvez» é uma
    // variável a mais numa sonda que existe para descobrir o que este endpoint
    // faz com os parâmetros que recebe, e o corpo que se sabe produzir a resposta
    // conhecida é o da página, não uma versão nossa com campos a menos.
    //
    // Presente-e-vazio não é o mesmo que ausente para muitos servidores, e qual
    // dos dois este é não se sabe. Manda-se o que a página manda.
    ["NUTSIIId", ""],
    ["fundoId", ""],
    ["tipoAvisoId", ""],
    ["tipoModalidadeApresentacaoCandidaturaId", ""],
    ["order_by_field", "publicacao"],
    ["order_by_direction", "desc"],
  ];
}

/** O corpo exacto que a fonte envia em cada corrida. */
export function corpoDoPedido(): string {
  const p = new URLSearchParams();
  for (const [chave, valor] of paresDoPedido()) p.append(chave, valor);
  return p.toString();
}

/**
 * O corpo do varrimento: o mesmo, mas do fim para o princípio.
 *
 * A única diferença é `order_by_direction=asc`, e são duas razões, nenhuma
 * estética.
 *
 * **A que faz o portão da mudança valer alguma coisa.** Cada página tem a sua
 * chave no livro, e o portão pergunta se o conteúdo daquela chave mudou. Em
 * `desc`, um único aviso publicado empurra tudo uma posição: a página 0 perde o
 * último para a 1, a 1 perde o seu para a 2, e assim até ao fim. As 46 páginas
 * mudam de conteúdo ao mesmo tempo, e o portão — a melhor parte deste desenho —
 * passa a deixar passar tudo, todos os dias. Em `asc` os avisos novos caem no
 * **fim**: só a última página muda, e as outras 45 acertam no hash.
 *
 * **A que evita perder um aviso dentro de uma corrida.** Paginar por
 * deslocamento uma lista que se desloca é instável: um aviso publicado a meio do
 * varrimento empurra as fronteiras, e um aviso que estava no fim da página 3
 * escorrega para a 4 depois de a 3 já ter sido lida — não entra nessa corrida.
 * Em `asc` as páginas já lidas ficam onde estavam, e o pior caso é um aviso
 * entrar só na corrida seguinte.
 *
 * `order_by_direction` é, além disso, o único parâmetro que se **sabe** que este
 * endpoint lê: foi o controlo positivo da sonda, gravado em
 * `comum/fixtures-permanentes/pt2030-avisos-query-paginacao.json`. Tudo o resto
 * do corpo continua a ser, byte a byte, o que a página envia.
 */
export function corpoDoVarrimento(): string {
  const p = new URLSearchParams();
  for (const [chave, valor] of paresDoPedido()) {
    p.append(chave, chave === "order_by_direction" ? "asc" : valor);
  }
  return p.toString();
}
