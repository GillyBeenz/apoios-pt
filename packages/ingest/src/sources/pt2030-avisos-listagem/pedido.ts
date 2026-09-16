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
