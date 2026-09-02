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
  t = t.replace(/\b(jsessionid|phpsessid|aspsessionid[a-z]*)=[^&"';\s]+/gi, "$1=[removido]");

  // Cache-busting query strings on assets: ?v=1724... changes on every deploy.
  t = t.replace(/([?&](?:v|ver|version|_|cb|t)=)\d{6,}/gi, "$1[removido]");

  // Server-rendered timestamps ("Última atualização: 27-08-2026 14:31").
  t = t.replace(
    /(ltim[ao]\s+(?:atualiza|actualiza)[^<:]*[:\s]+)[^<]{4,40}/gi,
    "$1[removido]",
  );

  // Nonces and inline script integrity attributes.
  t = t.replace(/\bnonce\s*=\s*["'][^"']*["']/gi, 'nonce="[removido]"');

  // Whitespace-only differences must not register as change.
  return t.replace(/\s+/g, " ").trim();
}

/** Content hash used by the change gate. Always over the normalised form. */
export function hashConteudo(html: string): string {
  return createHash("sha256").update(normalizarConteudo(html), "utf8").digest("hex");
}

/** Hash raw bytes (PDFs), where there is nothing volatile to strip. */
export function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
