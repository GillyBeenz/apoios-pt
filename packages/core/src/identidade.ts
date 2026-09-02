import { createHash } from "node:crypto";
import type { ChaveIdentidade, TipoIdentidade } from "./tipos.ts";
import { canonicalizarReferenciaLegal, normalizarTitulo } from "./normalizar/texto.ts";

/** Relative authority of each key type. A conflict resolves to the strongest. */
export const FORCA_IDENTIDADE: Record<TipoIdentidade, number> = {
  referencia_legal: 100,
  url_canonica: 70,
  titulo_norm: 30,
};

export function sha256(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

/**
 * Canonicalise a URL so cosmetic variants collapse to one key.
 *
 * Government sites append session and campaign parameters freely, and the same
 * notice is routinely linked with and without a trailing slash. Without this,
 * one notice acquires several URL identities and users get duplicate alerts.
 */
export function canonicalizarUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url.trim().toLowerCase();
  }

  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  u.protocol = "https:";

  const descartaveis = [
    /^utm_/i, /^fbclid$/i, /^gclid$/i, /^mc_/i,
    /^sessionid$/i, /^jsessionid$/i, /^phpsessid$/i, /^aspxauth$/i,
  ];
  for (const chave of [...u.searchParams.keys()]) {
    if (descartaveis.some((re) => re.test(chave))) u.searchParams.delete(chave);
  }
  u.searchParams.sort();

  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1);
  }

  return u.toString();
}

export interface EntradaIdentidade {
  readonly sourceId: string;
  readonly referenciaLegal: string | null;
  readonly url: string;
  readonly titulo: string;
  readonly anoAbertura: number | null;
}

/**
 * Build the candidate identity keys for a notice, strongest first.
 *
 * Keys are namespaced by source so an "AVISO 01/2026" from the Fundo Ambiental
 * never collides with an unrelated "AVISO 01/2026" from the PRR.
 */
export function construirChaves(e: EntradaIdentidade): ChaveIdentidade[] {
  const chaves: ChaveIdentidade[] = [];

  const ref = canonicalizarReferenciaLegal(e.referenciaLegal);
  if (ref) {
    chaves.push({
      tipo: "referencia_legal",
      valor: `${e.sourceId}:${ref}`,
      forca: FORCA_IDENTIDADE.referencia_legal,
    });
  }

  chaves.push({
    tipo: "url_canonica",
    valor: `${e.sourceId}:${sha256(canonicalizarUrl(e.url))}`,
    forca: FORCA_IDENTIDADE.url_canonica,
  });

  const titulo = normalizarTitulo(e.titulo, e.anoAbertura);
  if (titulo.length > 0) {
    chaves.push({
      tipo: "titulo_norm",
      valor: `${e.sourceId}:${titulo}`,
      forca: FORCA_IDENTIDADE.titulo_norm,
    });
  }

  return chaves.sort((a, b) => b.forca - a.forca);
}

export type ResolucaoIdentidade =
  | { readonly tipo: "novo"; readonly chaves: readonly ChaveIdentidade[] }
  | {
      readonly tipo: "existente";
      readonly fundId: string;
      /** Keys not yet recorded for this fund; inserting them strengthens future matches. */
      readonly chavesEmFalta: readonly ChaveIdentidade[];
    }
  | {
      readonly tipo: "conflito";
      /** Best guess, by key strength — attached but never merged automatically. */
      readonly fundId: string;
      readonly fundIdsEmConflito: readonly string[];
      readonly chaves: readonly ChaveIdentidade[];
    };

/**
 * Decide whether a set of keys names an existing fund, a new one, or a conflict.
 *
 * `existentes` maps key value -> fund id, as looked up in `fund_identities`.
 *
 * The rule that matters: when keys point at *different* funds we never merge. A
 * wrong merge is far worse than a duplicate, because the surviving fund inherits
 * the other's filled dedup ledger and its users then silently stop receiving
 * alerts — a failure with no visible symptom.
 */
export function resolverIdentidade(
  chaves: readonly ChaveIdentidade[],
  existentes: ReadonlyMap<string, string>,
): ResolucaoIdentidade {
  const encontrados = new Map<string, ChaveIdentidade[]>();
  const emFalta: ChaveIdentidade[] = [];

  for (const chave of chaves) {
    const fundId = existentes.get(chave.valor);
    if (fundId === undefined) {
      emFalta.push(chave);
    } else {
      const lista = encontrados.get(fundId) ?? [];
      lista.push(chave);
      encontrados.set(fundId, lista);
    }
  }

  if (encontrados.size === 0) return { tipo: "novo", chaves };

  if (encontrados.size === 1) {
    const [fundId] = [...encontrados.keys()];
    return { tipo: "existente", fundId: fundId!, chavesEmFalta: emFalta };
  }

  // Several funds claimed. Attach to whichever holds the strongest key, but flag it.
  let melhorFundo = "";
  let melhorForca = -1;
  for (const [fundId, lista] of encontrados) {
    const forca = Math.max(...lista.map((c) => c.forca));
    if (forca > melhorForca) {
      melhorForca = forca;
      melhorFundo = fundId;
    }
  }

  return {
    tipo: "conflito",
    fundId: melhorFundo,
    fundIdsEmConflito: [...encontrados.keys()],
    chaves,
  };
}

/**
 * Trigram similarity, used only to decide whether a title-only match is even
 * worth proposing to a human. Never sufficient to merge on its own.
 */
export function semelhancaTrigramas(a: string, b: string): number {
  const tri = (s: string): Set<string> => {
    const p = `  ${s} `;
    const out = new Set<string>();
    for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
    return out;
  };
  const ta = tri(a);
  const tb = tri(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let comuns = 0;
  for (const t of ta) if (tb.has(t)) comuns++;
  return comuns / (ta.size + tb.size - comuns);
}

export const LIMIAR_SEMELHANCA_TITULO = 0.85;
