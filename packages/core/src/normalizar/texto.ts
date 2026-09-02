/** Strip combining diacritics: "março" -> "marco", "Município" -> "Municipio". */
export function removerAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Collapse all whitespace runs (including NBSP) to single spaces and trim. */
export function normalizarEspacos(texto: string): string {
  return texto.replace(/[\s\u00a0\u200b]+/g, " ").trim();
}

/**
 * The comparison form used for evidence verification and title identity:
 * accent-free, lower-case, single-spaced.
 */
export function formaComparavel(texto: string): string {
  return normalizarEspacos(removerAcentos(texto)).toLowerCase();
}

const PALAVRAS_VAZIAS = new Set([
  "de", "da", "do", "das", "dos", "e", "a", "o", "as", "os", "em", "no", "na",
  "nos", "nas", "para", "por", "com", "ao", "aos", "um", "uma", "que", "the",
]);

/**
 * Title-based identity key.
 *
 * The weakest of the three keys (force 30) and never sufficient to merge on its
 * own — the Fundo Ambiental republishes notices under amended titles routinely
 * ("Segunda Republicação"), so titles drift while the notice stays the same.
 * Republication markers are stripped so they do not fork an identity.
 */
export function normalizarTitulo(titulo: string, anoAbertura?: number | null): string {
  const semRepublicacao = formaComparavel(titulo)
    .replace(/\b(primeira|segunda|terceira|quarta|quinta)?\s*republicacao\b/g, " ")
    .replace(/\b(1|2|3|4|5)\s*[.ª°ao]*\s*republicacao\b/g, " ")
    .replace(/\bretificacao\b/g, " ")
    .replace(/\balteracao\b/g, " ");

  const palavras = semRepublicacao
    .replace(/[^a-z0-9\s/-]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 0 && !PALAVRAS_VAZIAS.has(p));

  const base = palavras.join("-");
  return anoAbertura ? `${base}:${anoAbertura}` : base;
}

/**
 * Canonicalise an official notice reference so the same notice always produces
 * the same string.
 *
 * Portuguese notices spell the same reference many ways — "Aviso n.º 03/C13-i01/2024",
 * "AVISO No 03/C13-I01/2024", "aviso nº 03/c13-i01/2024" — and this is the strongest
 * identity key we have, so the variants must collapse.
 *
 * Returns null when no recognisable reference is present, which is a meaningful
 * answer: the caller then falls back to a weaker key rather than inventing one.
 */
export function canonicalizarReferenciaLegal(bruto: string | null | undefined): string | null {
  if (!bruto) return null;

  let t = normalizarEspacos(removerAcentos(bruto)).toUpperCase();

  // Normalise every spelling of "n.º" to a single marker, then drop it entirely:
  // the prefix carries no information and is the most variable part.
  t = t.replace(/\bN\s*[.ºO°]*\s*/g, " ");
  t = t.replace(/\bNUMERO\b/g, " ");
  t = normalizarEspacos(t);

  // Keep the document-kind word when present; it distinguishes an "AVISO 1/2026"
  // from a "DESPACHO 1/2026" issued by the same body in the same year.
  const tipoMatch = t.match(
    /\b(AVISO[- ]CONVITE|AVISO|AAC|DESPACHO|PORTARIA|EDITAL|CONCURSO|REGULAMENTO)\b/,
  );
  const tipo = tipoMatch ? tipoMatch[1]!.replace(/[- ]/g, "-") : null;

  // The reference body: digits and letters separated by / and -, e.g. 03/C13-I01/2024
  const corpoMatch = t.match(/\b\d[\dA-Z]*(?:[/-][\dA-Z.]+)+\b/);
  if (!corpoMatch) return null;

  const corpo = corpoMatch[0]
    .replace(/\.+$/, "")
    // Zero-pad the leading sequence number so "3/2026" and "03/2026" agree.
    .replace(/^(\d+)/, (d) => d.padStart(2, "0"));

  return tipo ? `${tipo === "AAC" ? "AVISO" : tipo} ${corpo}` : corpo;
}
