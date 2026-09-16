/**
 * Varrer uma fonte que responde por páginas.
 *
 * ## O problema que isto resolve
 *
 * O livro de snapshots é indexado por URL: o portão da mudança pergunta «o que
 * é que este URL trouxe da última vez?». Isso chega enquanto cada entrada de uma
 * fonte for um endereço diferente.
 *
 * O endpoint de avisos do PT2030 não é assim. São 46 `POST` ao **mesmo** URL,
 * distinguidos só pelo corpo — e 46 pedidos a partilhar uma chave sobrescrevem
 * o portão uns dos outros, ficando todos a parecer permanentemente mudados. A
 * fonte esteve a ler 5 de 228 avisos precisamente por não haver forma de os
 * pedir.
 *
 * A saída é separar duas coisas que até aqui eram a mesma: **o endereço a que se
 * bate** e **a chave com que se arruma o resultado**. O pedido continua a ir ao
 * URL real; o livro passa a guardar cada página debaixo de uma chave própria.
 *
 * ## Porque é um parâmetro de query e não um fragmento
 *
 * A chave tem de sobreviver ao `canonicalizarUrl`, que é quem produz o
 * `url_canonica` de que depende a restrição de deduplicação
 * `(url_canonica, hash_conteudo)`. Essa função **apaga o fragmento** — um
 * `#pagina=3` colapsaria as 46 páginas numa só chave canónica, e duas páginas
 * com o mesmo conteúdo passariam a apagar-se uma à outra em silêncio.
 *
 * Um parâmetro de query sobrevive, e fica ordenado com os outros. O nome leva um
 * underscore à frente para não se confundir com um parâmetro que o servidor
 * conheça: isto nunca é enviado a lado nenhum.
 */

// O contrato vive com as fontes, que é quem o declara; aqui só se usa. Importar
// ao contrário poria a pipeline a definir a forma daquilo que ela consome.
import type { Paginacao } from "../sources/tipos.ts";

export type { Paginacao };

/** O sufixo que identifica a página no livro de snapshots. */
const PARAMETRO_CHAVE = "_pagina";

/**
 * A chave do livro de snapshots para uma página.
 *
 * Nunca é usada como endereço: o pedido vai ao `url` tal como está. Isto é só
 * como a página fica arrumada.
 */
export function chaveDePagina(url: string, pagina: number): string {
  try {
    const u = new URL(url);
    u.searchParams.set(PARAMETRO_CHAVE, String(pagina));
    return u.toString();
  } catch {
    // Um URL que o `URL` não analisa não vai ser melhorado por concatenação
    // cega, mas também não pode colidir com as outras páginas.
    return `${url}${url.includes("?") ? "&" : "?"}${PARAMETRO_CHAVE}=${pagina}`;
  }
}

/**
 * O corpo do pedido para uma página.
 *
 * Substitui o parâmetro se já lá estiver, em vez de o repetir: um corpo
 * form-encoded com `page` duas vezes deixa a escolha ao servidor, e um
 * varrimento cujo resultado depende disso não prova nada.
 */
export function corpoDaPagina(
  corpoBase: string,
  paginacao: Paginacao,
  pagina: number,
): string {
  const origem = new URLSearchParams(corpoBase);
  const destino = new URLSearchParams();
  let escrito = false;

  for (const [chave, valor] of origem) {
    if (chave === paginacao.parametro) {
      if (!escrito) {
        destino.append(chave, String(pagina));
        escrito = true;
      }
    } else {
      destino.append(chave, valor);
    }
  }
  if (!escrito) destino.append(paginacao.parametro, String(pagina));

  return destino.toString();
}

/**
 * Há mais uma página a pedir?
 *
 * A regra é a mais simples que funciona sem a fonte ter de descrever o seu
 * sentinela de fim: **para-se quando uma página não rende registo nenhum.**
 *
 * O PT2030 acaba com um `200` cujo corpo traz `{code: 404}` e nenhum `avisos` —
 * o leitor devolve lista vazia, e é isso que se vê aqui. Descrever esse formato
 * no contrato da fonte seria codificar um detalhe de outra pessoa num sítio onde
 * a próxima fonte paginada não o reconheceria.
 *
 * O custo é conhecido e fica escrito: uma página vazia **no meio** trunca o
 * varrimento. Não acontece neste endpoint, onde as páginas são densas até à
 * última, e o dia em que acontecer aparece como uma queda no número de apoios,
 * não como silêncio.
 */
export function haMaisPaginas(
  rendeuNestaPagina: number,
  paginaActual: number,
  paginacao: Paginacao,
): boolean {
  if (rendeuNestaPagina === 0) return false;
  return paginaActual - paginacao.primeiraPagina + 1 < paginacao.maxPaginas;
}

/** O tecto foi atingido com a página ainda a render? Isso é para dizer alto. */
export function atingiuOTecto(
  rendeuNestaPagina: number,
  paginaActual: number,
  paginacao: Paginacao,
): boolean {
  return (
    rendeuNestaPagina > 0 &&
    paginaActual - paginacao.primeiraPagina + 1 >= paginacao.maxPaginas
  );
}
