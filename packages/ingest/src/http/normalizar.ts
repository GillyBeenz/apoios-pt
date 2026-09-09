import { createHash } from "node:crypto";

/**
 * Hidden fields that ASP.NET WebForms regenerates on every single request.
 *
 * On fundoambiental.pt these routinely run to 100 KB or more of base64 and rotate
 * per response even when the page content is byte-identical. Hashing them would
 * make every fetch look changed, defeating the change gate that the entire cost
 * model rests on: every notice would be re-extracted on every run, turning a ~$30
 * month into a ~$600 one while producing no new information whatsoever.
 */
const CAMPOS_VOLATEIS = [
  "__VIEWSTATE",
  "__VIEWSTATEGENERATOR",
  "__VIEWSTATEENCRYPTED",
  "__EVENTVALIDATION",
  "__PREVIOUSPAGE",
  "__REQUESTDIGEST",
];

/**
 * Strip everything that changes between two fetches of an unchanged page.
 *
 * Applied before hashing, and also before writing fixtures — which is what makes
 * committing real government HTML viable at all, since the viewstate is usually
 * the largest thing on the page.
 */
export function normalizarConteudo(html: string): string {
  let t = html;

  for (const campo of CAMPOS_VOLATEIS) {
    // Match the whole input element regardless of attribute order.
    const re = new RegExp(
      `<input[^>]*\\bname\\s*=\\s*["']?${campo}["']?[^>]*>`,
      "gi",
    );
    t = t.replace(re, `<input name="${campo}" value="[removido]" />`);
  }

  // Anti-forgery and session tokens under any common spelling.
  t = t.replace(
    /(<input[^>]*\bname\s*=\s*["']?(?:__RequestVerificationToken|csrf[-_]?token|authenticity_token)["']?[^>]*\bvalue\s*=\s*["'])[^"']*(["'])/gi,
    "$1[removido]$2",
  );
  t = t.replace(
    /\b(jsessionid|phpsessid|aspsessionid[a-z]*)=[^&"';\s]+/gi,
    "$1=[removido]",
  );

  // Cache-busting query strings on assets: ?v=1724... changes on every deploy.
  t = t.replace(/([?&](?:v|ver|version|_|cb|t)=)\d{6,}/gi, "$1[removido]");

  // Server-rendered timestamps ("Última atualização: 27-08-2026 14:31").
  t = t.replace(
    /(ltim[ao]\s+(?:atualiza|actualiza)[^<:]*[:\s]+)[^<]{4,40}/gi,
    "$1[removido]",
  );

  // Nonces and inline script integrity attributes.
  t = t.replace(/\bnonce\s*=\s*["'][^"']*["']/gi, 'nonce="[removido]"');

  // Script and style bodies, wholesale.
  //
  // The list above was a list of *known* volatile fields, and it was beaten by an
  // unknown one: fundoambiental.pt emits `var mlkSessMLKID = 'dqfcufoq…'` — a
  // 24-character per-request session id — inside an inline script. Fixed length,
  // new value on every fetch, so the page hashed differently every run while being
  // otherwise byte-identical. Seven captures of each notice on 2026-09-08, seven
  // distinct hashes, seven times the extraction bill. Exactly the failure the
  // comment on CAMPOS_VOLATEIS says must not happen, arriving through a door that
  // list does not cover.
  //
  // Naming this one token would leave the door open for the next one. Dropping the
  // bodies entirely closes the class, and costs nothing that matters: `textoVisivel`
  // already strips script and style before the model sees the page, so a change
  // confined to one cannot change an extraction. Markup, attributes and links stay
  // in the hash — a moved link on a listing page is still a change.
  t = t.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "<script>[removido]</script>");
  t = t.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "<style>[removido]</style>");

  // Generated element ids, and the labels that point at them.
  //
  // The second instance of the same class, on a different source. portugal2030.pt
  // runs a WordPress search-filter widget that mints a fresh 32-hex id for every
  // checkbox on every request:
  //
  //   id="sf-input-b2873f8a21f440a53b0b612f1b42a0a5"   06:45
  //   id="sf-input-7c2cea91106dd7001ec185163858b8fb"   08:10
  //
  // Dozens of them per page, each paired with a `for=` on its label, in a sidebar
  // that has nothing to do with the notice. Run #26 skipped all 25 Fundo Ambiental
  // documents and re-extracted all 6 from Portugal 2030 because of it.
  //
  // Blanking `id` and `for` outright, rather than matching this vendor's prefix,
  // because the rule is checkable and general: nothing in this pipeline reads
  // either one. The adapters select on tags, classes and `href` (see the
  // `querySelectorAll` calls in `sources/*/extract.ts`), and the model never sees
  // attributes at all — `textoVisivel` strips every tag before the page reaches it.
  //
  // Deliberately not going further and hashing only "visible text plus href plus
  // class". It would close the class for good, but the failure modes are not
  // symmetric: a gate that re-reads too much wastes money, while a gate blinded to
  // a change it should have seen misses an extended deadline, which is the entire
  // point of the product. A third instance in some other attribute would be the
  // signal to take that risk; two is not.
  t = t.replace(/\b(id|for)\s*=\s*["'][^"']*["']/gi, '$1="[removido]"');

  // Whitespace-only differences must not register as change.
  return t.replace(/\s+/g, " ").trim();
}

/** Content hash used by the change gate. Always over the normalised form. */
export function hashConteudo(html: string): string {
  return createHash("sha256")
    .update(normalizarConteudo(html), "utf8")
    .digest("hex");
}

/** Hash raw bytes (PDFs), where there is nothing volatile to strip. */
export function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Named entities worth decoding, beyond the numeric ones.
 *
 * Deliberately short: these ASP.NET pages encode almost everything numerically
 * (`&#231;` for ç), and a long table would imply a completeness this does not
 * have. `&amp;` is last in application order for the usual reason — decoding it
 * first would turn `&amp;#231;` into `ç` instead of the literal `&#231;`.
 */
const ENTIDADES_NOMEADAS: ReadonlyArray<readonly [RegExp, string]> = [
  [/&nbsp;/gi, " "],
  [/&ordm;/gi, "º"],
  [/&ordf;/gi, "ª"],
  [/&aacute;/gi, "á"],
  [/&agrave;/gi, "à"],
  [/&atilde;/gi, "ã"],
  [/&acirc;/gi, "â"],
  [/&eacute;/gi, "é"],
  [/&ecirc;/gi, "ê"],
  [/&iacute;/gi, "í"],
  [/&oacute;/gi, "ó"],
  [/&otilde;/gi, "õ"],
  [/&ocirc;/gi, "ô"],
  [/&uacute;/gi, "ú"],
  [/&ccedil;/gi, "ç"],
  [/&euro;/gi, "€"],
  [/&hellip;/gi, "…"],
  [/&ndash;/gi, "–"],
  [/&mdash;/gi, "—"],
  [/&laquo;/gi, "«"],
  [/&raquo;/gi, "»"],
  [/&quot;/gi, '"'],
  [/&#39;|&apos;/gi, "'"],
  [/&lt;/gi, "<"],
  [/&gt;/gi, ">"],
  [/&amp;/gi, "&"],
];

/**
 * Decode HTML entities so the text we verify against is the text the model reads.
 *
 * This is why every evidence quote failed verification on the first successful
 * run. One Fundo Ambiental page carries **2746** numeric entities against six
 * `&nbsp;` — the whole Portuguese text is entity-encoded — and the old
 * `textoVisivel` decoded only `&nbsp;` and `&amp;`. So the model was handed
 * `Refor&#231;o da resili&#234;ncia`, read it, silently rendered it, and quoted
 * `Reforço da resiliência`. A literal substring check could never match, and
 * `verificarProvas` correctly reported that it could not find the quote.
 *
 * The model was right and our comparison text was wrong, which is the worst shape
 * for a hallucination gate to fail in: it discredits honest extractions and would
 * have kept every fund in the review queue permanently.
 */
export function decodificarEntidades(texto: string): string {
  const comNumericas = texto
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      codigoParaTexto(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      codigoParaTexto(Number.parseInt(dec, 10)),
    );

  return ENTIDADES_NOMEADAS.reduce(
    (s, [padrao, valor]) => s.replace(padrao, valor),
    comNumericas,
  );
}

/** Out-of-range code points are left as-is rather than throwing mid-page. */
function codigoParaTexto(codigo: number): string {
  if (!Number.isFinite(codigo) || codigo < 0 || codigo > 0x10ffff) return "";
  try {
    return String.fromCodePoint(codigo);
  } catch {
    return "";
  }
}
