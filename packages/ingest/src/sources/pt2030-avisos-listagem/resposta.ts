import { normalizarEspacos } from "@apoios/core";

/**
 * Read the Portugal 2030 avisos endpoint's answer.
 *
 * Deterministic and offline, like every other reader here. The response is already
 * structured — code, designation, dates, dotação, programme, tipologia — so putting
 * it through a model would be paying to make a certain table less certain.
 *
 * Written against `comum/fixtures-permanentes/pt2030-avisos-query-resposta.json`,
 * which is the real answer of 14/09/2026 and not a reconstruction.
 */

export interface AvisoAberto {
  /** `ALT2030-2026-44`. A real notice code, which is what makes it an identity key. */
  readonly codigo: string;
  readonly titulo: string;
  readonly programa: string | null;
  readonly fundo: string | null;
  readonly tipologia: string | null;
  readonly dotacaoEur: number | null;
  /** ISO dates, day precision. The endpoint gives a time; the day is what we claim. */
  readonly publicadoEm: string | null;
  readonly abreEm: string | null;
  readonly fechaEm: string | null;
  readonly regioes: readonly string[];
}

/** `2026-09-14T09:00:00` → `2026-09-14`. Anything else → null. */
function diaDe(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(valor);
  return m?.[1] ?? null;
}

function texto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = normalizarEspacos(valor);
  return limpo.length > 0 ? limpo : null;
}

/**
 * Sum the dotação across the notice's structure rows.
 *
 * A notice can sit under several programmes, each with its own slice — the real
 * answer has four rows totalling 418 879 € — and the total is what a reader means
 * by "how much is there".
 *
 * **A total of zero comes back as null, not as 0.** Two of the five notices in the
 * captured answer report `dotacao: 0` on every row, and an open call for
 * applications does not have a budget of zero euros: the field was not filled in.
 * Passing the 0 through would put "0 €" on a card as a statement of fact, which is
 * the confident-wrongness this catalogue exists to avoid. Null says we do not
 * know, and the card simply omits the figure.
 *
 * The cost of being wrong here is asymmetric and that is why it falls this way: a
 * missing amount makes a reader open the notice, a zero makes them skip it.
 */
function dotacaoDe(estrutura: readonly unknown[]): number | null {
  let soma = 0;
  for (const linha of estrutura) {
    if (typeof linha !== "object" || linha === null) continue;
    const d = (linha as Record<string, unknown>)["dotacao"];
    if (typeof d === "number" && Number.isFinite(d)) soma += d;
  }
  return soma > 0 ? Math.round(soma) : null;
}

function regioesDe(estrutura: readonly unknown[]): string[] {
  const vistas = new Set<string>();
  for (const linha of estrutura) {
    if (typeof linha !== "object" || linha === null) continue;
    const marca = texto((linha as Record<string, unknown>)["marca"]);
    if (marca !== null) vistas.add(marca);
  }
  return [...vistas];
}

/**
 * Parse the endpoint's body.
 *
 * Every field is checked rather than trusted. This is somebody else's API, it is
 * undocumented, and it was learned by watching a browser — a shape change here
 * should drop the notice it affects, not throw and take the whole run with it.
 */
export function lerAvisos(json: string): AvisoAberto[] {
  let raiz: unknown;
  try {
    raiz = JSON.parse(json);
  } catch {
    return [];
  }

  if (typeof raiz !== "object" || raiz === null) return [];
  const lista = (raiz as Record<string, unknown>)["avisos"];
  if (!Array.isArray(lista)) return [];

  const avisos: AvisoAberto[] = [];

  for (const item of lista) {
    if (typeof item !== "object" || item === null) continue;
    const registo = item as Record<string, unknown>;

    const aviso = registo["aviso"];
    if (typeof aviso !== "object" || aviso === null) continue;
    const a = aviso as Record<string, unknown>;

    const codigo = texto(a["codigoAviso"]);
    const titulo = texto(a["designacaoPT"]);
    // Sem código não há chave de identidade, e sem título não há nada para
    // mostrar. Qualquer um em falta é uma linha que não se consegue publicar com
    // honestidade, por isso cai aqui em vez de virar um apoio meio vazio.
    if (codigo === null || titulo === null) continue;

    const estrutura = Array.isArray(registo["estrutura"]) ? registo["estrutura"] : [];
    const calendario =
      typeof registo["calendario"] === "object" && registo["calendario"] !== null
        ? (registo["calendario"] as Record<string, unknown>)
        : {};

    const primeira =
      typeof estrutura[0] === "object" && estrutura[0] !== null
        ? (estrutura[0] as Record<string, unknown>)
        : {};

    avisos.push({
      codigo,
      titulo,
      programa: texto(primeira["programaOperacionalDesignacao"]),
      fundo: texto(primeira["fundoDesignacao"]),
      tipologia: texto(primeira["tipologiaOperacaoDesignacao"]),
      dotacaoEur: dotacaoDe(estrutura),
      publicadoEm: diaDe(calendario["dataPublicacao"]),
      abreEm: diaDe(calendario["dataInicio"]),
      // `dataFimAtual` antes de `dataFim`: quando um aviso é prorrogado é a
      // primeira que muda, e é a que vale para quem ainda quer candidatar-se.
      fechaEm: diaDe(calendario["dataFimAtual"]) ?? diaDe(calendario["dataFim"]),
      regioes: regioesDe(estrutura),
    });
  }

  return avisos;
}
