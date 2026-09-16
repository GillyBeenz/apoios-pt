import type { Buscador, RespostaHttp } from "../http/tipos.ts";
import type { PedidoDeEntrada, Varredura } from "../sources/tipos.ts";

/**
 * Walk a paginated entry to its end and hand back one response.
 *
 * The PT2030 avisos endpoint answers five notices at a time out of 228. Asking it
 * once and calling that «the open notices» is how this catalogue spent weeks
 * publishing 5 of 228, with each newly published notice quietly pushing an older
 * one out. Walking it is the fix; the shape of the walk is what this file is about.
 *
 * **The walk collapses to a single request as far as everything downstream is
 * concerned.** The snapshot ledger is keyed by URL, so 46 POSTs to one URL would
 * overwrite each other's change gate and each look permanently changed to the
 * others. Joining the pages into one document keeps the ledger's invariant true:
 * one entry, one URL, one body, one hash — and a better gate than before, because
 * the hash now covers the whole set instead of its first five.
 *
 * **It fails closed, and that is the important part.** A sweep that dies on page 7
 * of 46 has read 35 notices. Storing those 35 as if they were the answer would
 * read downstream as 193 notices having vanished overnight, which is an event this
 * pipeline is built to act on. So a partial sweep produces no document at all: the
 * source reports the error and the previous snapshot stands. A missing update is a
 * day of staleness; a partial one that looks complete closes funds that are open.
 */
/**
 * Quantas vezes se pede a mesma página antes de desistir do varrimento todo.
 *
 * Duas, e o número vem de uma medição: o primeiro varrimento a sério deste
 * endpoint morreu na página 44 de 46 com um `timeout`, depois de sete minutos de
 * pedidos bem sucedidos. Falhar fechado é a regra certa, mas uma regra certa
 * aplicada a uma falha passageira transforma-se noutra coisa — uma fonte que
 * quase nunca chega ao fim e que, por isso, nunca actualiza nada.
 *
 * Duas e não mais: se a segunda também falha, o problema não é passageiro, e
 * insistir só carrega um servidor que já está a dizer que não consegue.
 */
const TENTATIVAS_POR_PAGINA = 2;

export async function varrerPaginas(
  buscador: Buscador,
  pedido: PedidoDeEntrada,
  varredura: Varredura,
  paginaTemItens: (corpo: string) => boolean,
  juntarPaginas: (corpos: readonly string[]) => string,
): Promise<RespostaHttp> {
  const corpos: string[] = [];
  let ultimoStatus = 0;
  let contentType: string | null = null;

  const falha = (erro: string): RespostaHttp => ({
    url: pedido.url,
    status: ultimoStatus,
    naoModificado: false,
    corpo: null,
    bytes: null,
    contentType,
    etag: null,
    lastModified: null,
    erro,
  });

  for (let n = 0; n < varredura.maxPaginas; n++) {
    const pagina = varredura.primeiraPagina + n;

    let resposta: RespostaHttp | null = null;
    for (let tentativa = 1; tentativa <= TENTATIVAS_POR_PAGINA; tentativa++) {
      resposta = await buscador.buscar({
        url: pedido.url,
        metodo: pedido.metodo,
        // O corpo da página é o corpo declarado mais o parâmetro. Acrescentado
        // como texto e não por `URLSearchParams` de propósito: o corpo leva
        // `programaId[]` vinte e três vezes, e uma ida e volta por um objecto
        // perdia-as todas menos a última.
        corpo: `${pedido.corpo}&${varredura.parametro}=${pagina}`,
        tipoConteudo: pedido.tipoConteudo,
      });
      if (resposta.erro === null) break;
    }
    if (resposta === null) return falha("varrimento sem tentativas configuradas");

    ultimoStatus = resposta.status;
    contentType = resposta.contentType;

    if (resposta.erro !== null) {
      return falha(
        `varrimento interrompido na página ${pagina} de ${pedido.url}` +
          ` (${TENTATIVAS_POR_PAGINA} tentativas): ${resposta.erro}`,
      );
    }
    if (resposta.corpo === null) {
      return falha(`varrimento interrompido na página ${pagina}: resposta sem corpo`);
    }

    if (!paginaTemItens(resposta.corpo)) {
      // O fim, e é o único sítio por onde o varrimento sai bem.
      const documento = juntarPaginas(corpos);
      return {
        url: pedido.url,
        status: resposta.status,
        naoModificado: false,
        corpo: documento,
        bytes: new TextEncoder().encode(documento),
        contentType,
        // Um documento montado aqui não tem validador nenhum do servidor, e
        // inventar um seria pior do que não ter: o portão da mudança é o hash.
        etag: null,
        lastModified: null,
        erro: null,
      };
    }

    corpos.push(resposta.corpo);
  }

  // Chegar aqui é o servidor ter deixado de dizer onde acaba. Falha, e falha alto:
  // as páginas lidas até agora podem ser o conjunto todo ou metade dele, e não há
  // maneira de saber qual.
  return falha(
    `varrimento de ${pedido.url} passou das ${varredura.maxPaginas} páginas sem chegar ao fim`,
  );
}
