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
  //
  // O `(?=\d)` não é decoração. Sem ele, o `[.ºO°]*` — que existe para apanhar o
  // `O` de «N.o 3» — come o `O` de **NORTE**: `NORTE2030-2026-23` chegava ao
  // resto da função como ` RTE2030-2026-23`, com a região já destruída. Um
  // marcador de número só é marcador se um número se lhe seguir, e exigi-lo aqui
  // é o que separa o «N.º» do primeiro `N` de uma palavra qualquer.
  t = t.replace(/\bN\s*[.ºO°]*\s*(?=\d)/g, " ");
  t = t.replace(/\bNUMERO\b/g, " ");
  t = normalizarEspacos(t);

  // Keep the document-kind word when present; it distinguishes an "AVISO 1/2026"
  // from a "DESPACHO 1/2026" issued by the same body in the same year.
  const tipoMatch = t.match(
    /\b(AVISO[- ]CONVITE|AVISO|AAC|DESPACHO|PORTARIA|EDITAL|CONCURSO|REGULAMENTO)\b/,
  );
  const tipo = tipoMatch ? tipoMatch[1]!.replace(/[- ]/g, "-") : null;

  // The reference body: digits and letters separated by / and -, e.g. 03/C13-I01/2024
  //
  // O corpo **pode começar por letras**, e isso é o que distingue os códigos do
  // Portugal 2030. Neles o prefixo não é ruído: é a região, e é a única coisa que
  // separa `CENTRO2030-2026-23` de `NORTE2030-2026-23`. A versão anterior exigia
  // que o corpo começasse por dígito, e os dois colapsavam em `2026-23` com força
  // 100 — o que a 15/09/2026 fez o `CENTRO2030-2026-23` substituir o
  // `NORTE2030-2026-23`, que saiu do catálogo sem deixar rasto.
  //
  // A exigência que substitui «começa por dígito» é «contém um dígito», aplicada
  // à lista de candidatos em vez de ao primeiro. Sem isso, `AVISO-CONVITE
  // 02/C08-I05.02/2022` casaria em `AVISO-CONVITE` — letras separadas por um
  // hífen são um corpo válido para esta forma — e devolveria um tipo de documento
  // no lugar da referência. Com isso, o primeiro candidato que traz um dígito é o
  // corpo, e as palavras que só descrevem o documento ficam de fora.
  const candidatos = t.match(/\b[\dA-Z][\dA-Z.]*(?:[/-][\dA-Z.]+)+\b/g) ?? [];
  const corpoBruto = candidatos.find((c) => /\d/.test(c));
  if (corpoBruto === undefined) return null;

  const corpo = corpoBruto
    .replace(/\.+$/, "")
    // Zero-pad the leading sequence number so "3/2026" and "03/2026" agree.
    .replace(/^(\d+)/, (d) => d.padStart(2, "0"));

  return tipo ? `${tipo === "AAC" ? "AVISO" : tipo} ${corpo}` : corpo;
}

/**
 * O código completo que o documento escreve, quando a referência extraída é só a
 * cauda dele.
 *
 * ## Porque isto existe
 *
 * A `canonicalizarReferenciaLegal` já guarda o prefixo regional dos códigos do
 * PT2030 — mas só o guarda se ele lá chegar. Na fonte `pt2030-avisos` não chega:
 * a extracção é feita por modelo sobre o texto de artigos de notícias, e o que
 * ficou gravado foi `2024-47` para um aviso que o próprio artigo escreve como
 * `Centro2030-2024-47`.
 *
 * O prefixo perde-se **antes** da canonicalização, e por isso nenhuma correcção
 * àquela função o recupera. O que sobra na base são chaves de identidade de força
 * 100 que nomeiam um número sem região — e duas regiões com o mesmo número fundem
 * dois avisos num só, que é como este repositório já perdeu um apoio a 15/09/2026.
 *
 * ## O que isto faz, e o que deliberadamente não faz
 *
 * Responde a uma pergunta estreita e verificável: **o documento escreve um código
 * mais longo cuja cauda é exactamente isto?** Se sim, devolve-o; se não, devolve
 * `null`.
 *
 * Não repara nada. Quem chama decide, e a decisão certa — a que o #76 já tomou
 * para a listagem — é não construir chave de referência nenhuma: uma fusão que
 * não acontece é uma linha a mais no catálogo, e uma chave que colide é uma linha
 * a menos, em silêncio. Entre as duas, esta.
 *
 * ## Porque o prefixo tem de misturar letras e dígitos
 *
 * `NORTE2030`, `CENTRO2030`, `ACORES2030` são códigos de programa. Uma palavra
 * qualquer agarrada por um hífen — `pagina-2024-11` num URL — não é, e exigir
 * dígitos no prefixo é o que separa as duas sem ter de conhecer a lista de
 * programas do Estado. Nunca se inventa aqui um prefixo que o documento não
 * escreva: ele é lido do texto, literalmente, tal como a prova das citações.
 */
export function prefixoPerdidoNaReferencia(
  referencia: string | null | undefined,
  textoFonte: string,
): string | null {
  if (!referencia || textoFonte.length === 0) return null;

  // A cauda tal como se procura no documento: dígitos e separadores, sem a
  // palavra do tipo de documento. Tirada do valor **em bruto** e não do
  // canonicalizado, porque é o texto do documento que se vai procurar e o
  // canonicalizado já lhe mexeu (o zero à esquerda, por exemplo).
  const cauda = referencia.match(/\d[\dA-Za-z]*(?:[/-][\dA-Za-z.]+)+/);
  if (cauda === null) return null;

  const agulha = cauda[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const comPrefixo = new RegExp(
    `\\b([A-Za-z]{2,}\\d{2,}-)${agulha}\\b`,
    "i",
  ).exec(textoFonte);
  if (comPrefixo === null) return null;

  const completo = `${comPrefixo[1]}${cauda[0]}`;

  // Só conta se mudar mesmo a identidade. Um prefixo que a canonicalização
  // deitasse fora de qualquer maneira não é uma perda — é ruído, e tratá-lo como
  // perda punha esta guarda a disparar sem nada estar errado.
  return canonicalizarReferenciaLegal(completo) ===
    canonicalizarReferenciaLegal(referencia)
    ? null
    : completo;
}
