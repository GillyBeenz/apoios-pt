/**
 * As duas regras puras do varrimento paginado dos avisos do PT2030.
 *
 * Vivem aqui, e não no pipeline, porque são as duas coisas que só esta fonte sabe:
 * onde é que o endpoint diz que acabou, e que forma tem o documento que o
 * `lerDataset` vai ler. Puras e sem rede, como tudo o que se testa contra uma
 * fixture commitada.
 */

/** O envelope que o endpoint devolve, e o que o `lerAvisos` já sabe ler. */
interface Envelope {
  readonly avisos?: unknown;
}

function avisosDe(corpo: string): unknown[] | null {
  let raiz: unknown;
  try {
    raiz = JSON.parse(corpo);
  } catch {
    return null;
  }
  if (typeof raiz !== "object" || raiz === null) return null;
  const lista = (raiz as Envelope).avisos;
  return Array.isArray(lista) ? lista : null;
}

/**
 * Ainda vem alguma coisa nesta página?
 *
 * O endpoint acaba um varrimento com **HTTP 200** e um corpo a dizer
 * `{code: 404, info: "No data found"}` — o 404 vai dentro do envelope, não no
 * estado da resposta. Quem olhasse só para o `status` andava a pedir páginas para
 * sempre.
 *
 * Uma página ilegível conta como vazia de propósito. O varrimento pára, e quem
 * decide o que fazer a seguir é o `juntarPaginas`: um documento com menos avisos
 * do que a verdade é pior do que nenhum, por isso o corte é aqui e a decisão é
 * de quem chama.
 */
export function paginaTemItens(corpo: string): boolean {
  const avisos = avisosDe(corpo);
  return avisos !== null && avisos.length > 0;
}

/**
 * Junta as páginas num documento só, com a forma que o endpoint já tem.
 *
 * `{"avisos": [...]}`, que é exactamente o que uma página é — só que com os 228
 * em vez dos cinco do costume. Isso não é uma coincidência aproveitada: é o que
 * faz o `lerAvisos` e o `lerDataset` não precisarem de saber que houve varrimento
 * nenhum. Um formato novo aqui obrigava os dois a aprender duas formas, e a
 * segunda só teria um leitor.
 *
 * Sem data, sem contagem de páginas, sem nada que mude quando os dados não mudam:
 * este documento é o que vai ao hash do portão da mudança, e um relógio lá dentro
 * fazia todas as corridas parecerem uma mudança.
 */
export function juntarPaginas(corpos: readonly string[]): string {
  const todos: unknown[] = [];
  for (const corpo of corpos) {
    const avisos = avisosDe(corpo);
    if (avisos !== null) todos.push(...avisos);
  }
  return JSON.stringify({ avisos: todos });
}
