import { paresDoPedido } from "./pedido.ts";

/**
 * Interrogar o endpoint de avisos do PT2030 sobre paginação.
 *
 * ## Porque é que isto existe
 *
 * A resposta traz cinco avisos e mais nada — nem total, nem número de páginas,
 * nem cursor. O contrato gravado a 14/09 já dizia que nenhum parâmetro de página
 * foi observado, e a 15/09 isso deixou de ser uma curiosidade: dois avisos do
 * Norte saíram da resposta no dia em que dois do Alentejo foram publicados, e o
 * `NORTE2030-2026-22` tem prazo até 31/12/2026, por isso não pode ter encerrado.
 * O que a resposta parece ser não são «os avisos abertos» mas **os cinco avisos
 * abertos publicados mais recentemente**.
 *
 * Se isso for verdade, o catálogo perde avisos abertos em silêncio a cada
 * publicação nova, e a pergunta que o produto existe para responder — «o que
 * posso pedir agora?» — passa a ter uma resposta truncada em cinco.
 *
 * ## Porque é que é uma sonda e não uma implementação
 *
 * Não se sabe o nome do parâmetro. Adivinhá-lo e implementá-lo seria inventar um
 * campo que o documento não diz, que é precisamente o que este repositório não
 * faz. Esta sonda pergunta ao servidor e **escreve o que ele responde**; a
 * implementação vem depois, contra a prova.
 *
 * Isto corre no GitHub Actions, como toda a rede deste repositório. O núcleo aqui
 * é puro: monta corpos e classifica respostas, sem nunca tocar na rede. A casca
 * que faz os pedidos é `scripts/sondar-paginacao-pt2030.mjs`.
 */

export type Familia = "controlo" | "pagina" | "indexacao" | "limite" | "deslocamento";

export interface Variante {
  /** `page=2`. Serve de nome na tabela de resultados. */
  readonly nome: string;
  readonly familia: Familia;
  /** O corpo completo a enviar, já codificado. */
  readonly corpo: string;
}

/** Um par a acrescentar ao corpo base, ou a substituir se a chave já lá estiver. */
function comPar(chave: string, valor: string): string {
  const p = new URLSearchParams();
  let substituido = false;
  for (const [k, v] of paresDoPedido()) {
    if (k === chave) {
      // Substituir em vez de acrescentar: mandar `order_by_direction` duas vezes
      // deixa a escolha ao servidor, e uma sonda cujo resultado depende disso não
      // prova nada.
      p.append(k, valor);
      substituido = true;
    } else {
      p.append(k, v);
    }
  }
  if (!substituido) p.append(chave, valor);
  return p.toString();
}

/**
 * Os nomes a experimentar.
 *
 * Três famílias, porque as três dão provas diferentes: um parâmetro de página
 * devolve avisos que a base não trouxe, um de limite devolve mais do que cinco, e
 * um de deslocamento devolve a lista a começar noutro sítio.
 *
 * Os nomes vêm de três convenções que este endpoint podia estar a seguir — as do
 * WordPress (`paged`, `posts_per_page`, `per_page`), as de APIs REST em geral
 * (`page`, `limit`, `offset`) e as do próprio sítio, que é português e já usa
 * `order_by_field` em snake_case. Nenhum deles é uma aposta: são todos baratos e
 * a sonda diz quais é que o servidor reconhece.
 */
export function variantes(): Variante[] {
  const lista: Variante[] = [
    // O controlo positivo, e é a variante mais importante das que aqui estão.
    //
    // `order_by_direction` é o único parâmetro que se SABE que o endpoint lê, por
    // ter sido observado no pedido da própria página. Invertê-lo tem de mudar a
    // resposta. Se não mudar, o que a sonda descobriu foi um defeito nela própria
    // — e sem isto, «todos ignorados» seria indistinguível de «a sonda está
    // partida», que é a conclusão errada mais cara que esta investigação podia
    // produzir.
    { nome: "order_by_direction=asc", familia: "controlo", corpo: comPar("order_by_direction", "asc") },
  ];

  for (const chave of ["page", "paged", "pagina", "page_number", "pageIndex", "numeroPagina"]) {
    lista.push({ nome: `${chave}=2`, familia: "pagina", corpo: comPar(chave, "2") });
  }

  // Saber que o parametro existe nao chega: falta saber por onde comeca a contar.
  //
  // Um parametro 0-indexado lido como 1-indexado salta a segunda pagina do
  // conjunto sem dar erro nenhum — a varredura devolve menos avisos e parece
  // completa. Foi exactamente o que aconteceu aqui: a primeira leitura desta
  // sonda concluiu que dois avisos tinham saido do conjunto, quando o que se
  // tinha passado era que a pagina onde eles estavam nunca foi pedida.
  //
  // `page=0` e a prova, e le-se ao contrario das outras: um veredicto
  // `ignorado` aqui quer dizer que a resposta e igual a base, ou seja que o
  // zero JA E a primeira pagina. Um `reconhecido` quereria dizer o oposto.
  for (const valor of ["0", "1"]) {
    lista.push({ nome: `page=${valor}`, familia: "indexacao", corpo: comPar("page", valor) });
  }

  for (const chave of ["limit", "per_page", "perPage", "posts_per_page", "pageSize", "page_size", "length", "rows", "take", "numeroRegistos"]) {
    lista.push({ nome: `${chave}=50`, familia: "limite", corpo: comPar(chave, "50") });
  }

  for (const chave of ["offset", "skip", "start", "inicio"]) {
    lista.push({ nome: `${chave}=5`, familia: "deslocamento", corpo: comPar(chave, "5") });
  }

  return lista;
}

export interface RespostaSondada {
  readonly status: number;
  /** Os códigos dos avisos devolvidos, por ordem. `null` se a resposta não se leu. */
  readonly codigos: readonly string[] | null;
}

export type Veredicto =
  /** Não-200, ou um corpo que não se consegue ler. */
  | "quebrou"
  /** Exactamente os mesmos avisos que a base, na mesma ordem. */
  | "ignorado"
  /** A resposta mudou. O servidor leu o parâmetro. */
  | "reconhecido";

/**
 * O que a resposta a uma variante diz sobre o parâmetro que a produziu.
 *
 * A regra é deliberadamente grosseira: **qualquer diferença em relação à base
 * conta como reconhecimento.** Um servidor que não percebe um parâmetro de um
 * corpo form-encoded ignora-o e devolve o mesmo que devolvia; se a resposta
 * mudou, alguma coisa do outro lado leu aquele nome.
 *
 * Não se tenta aqui adivinhar a semântica — se `limit=50` devolve três avisos em
 * vez de cinquenta, isso é interessante e fica escrito, mas classificá-lo como
 * «funciona» ou «não funciona» seria a sonda a dar uma opinião em vez de uma
 * observação. O ficheiro de prova leva os códigos todos, e quem o ler decide.
 *
 * Uma lista vazia também é reconhecimento, e é o caso menos óbvio: `page=2` a
 * devolver zero avisos não é uma falha, é o servidor a dizer que percebeu a
 * pergunta e que não há segunda página.
 */
export function classificar(base: RespostaSondada, variante: RespostaSondada): Veredicto {
  if (variante.status !== 200 || variante.codigos === null) return "quebrou";
  if (base.codigos === null) return "quebrou";

  const iguais =
    base.codigos.length === variante.codigos.length &&
    base.codigos.every((c, i) => c === variante.codigos?.[i]);

  return iguais ? "ignorado" : "reconhecido";
}

/**
 * O endpoint é de outra pessoa e muda sozinho.
 *
 * Um aviso publicado a meio da sonda muda a base debaixo dos pés dela, e uma
 * variante classificada como `reconhecido` por causa disso seria uma pista falsa
 * que custaria a próxima sessão inteira a perseguir. Por isso a base é pedida
 * duas vezes, no princípio e no fim, e se as duas não baterem certo o resultado
 * inteiro fica marcado como não fiável em vez de silenciosamente errado.
 */
export function baseEstavel(primeira: RespostaSondada, ultima: RespostaSondada): boolean {
  if (primeira.codigos === null || ultima.codigos === null) return false;
  return (
    primeira.codigos.length === ultima.codigos.length &&
    primeira.codigos.every((c, i) => c === ultima.codigos?.[i])
  );
}

/** Os códigos dos avisos de um corpo de resposta, ou `null` se não se ler. */
export function codigosDe(json: string): string[] | null {
  let raiz: unknown;
  try {
    raiz = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raiz !== "object" || raiz === null) return null;
  const lista = (raiz as Record<string, unknown>)["avisos"];
  if (!Array.isArray(lista)) return null;

  const codigos: string[] = [];
  for (const item of lista) {
    if (typeof item !== "object" || item === null) continue;
    const aviso = (item as Record<string, unknown>)["aviso"];
    if (typeof aviso !== "object" || aviso === null) continue;
    const codigo = (aviso as Record<string, unknown>)["codigoAviso"];
    if (typeof codigo === "string") codigos.push(codigo);
  }
  return codigos;
}
