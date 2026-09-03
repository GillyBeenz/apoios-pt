/**
 * What kind of file did the server actually send, and what extension should it keep?
 *
 * The first version of this script asked only "is it a PDF?" and UTF-8 decoded
 * everything else. That is fine while every source serves HTML, and silently
 * destructive the moment one serves a spreadsheet: the Plano Anual de Avisos is an
 * .xlsx, and decoding a zip container as text produces a file that still looks
 * plausible in a diff and is unreadable by anything.
 */
export interface Classificacao {
  /** Write the bytes untouched; never decode as text. */
  readonly binario: boolean;
  /** Extension the fixture should keep, including the dot. */
  readonly extensao: string;
  /** Only HTML gets viewstate stripping; anything else it would corrupt. */
  readonly normalizar?: boolean;
}

export function classificar(
  url: string,
  contentType: string | null,
): Classificacao {
  const ct = (contentType ?? "").toLowerCase();
  const caminho = new URL(url).pathname.toLowerCase();
  const extensaoUrl = caminho.match(/\.([a-z0-9]{1,5})$/)?.[1] ?? null;

  if (ct.includes("pdf") || extensaoUrl === "pdf") {
    return { binario: true, extensao: ".pdf" };
  }
  // Spreadsheets: the annual notice plans, and the whole reason this matters.
  if (
    /spreadsheet|excel|opendocument\.spreadsheet|ms-excel/.test(ct) ||
    ["xlsx", "xls", "ods"].includes(extensaoUrl ?? "")
  ) {
    return { binario: true, extensao: `.${extensaoUrl ?? "xlsx"}` };
  }
  if (ct.includes("zip") || extensaoUrl === "zip") {
    return { binario: true, extensao: ".zip" };
  }
  // CSV is text, but it is not HTML — normalising it would mangle it.
  if (ct.includes("csv") || extensaoUrl === "csv") {
    return { binario: false, extensao: ".csv", normalizar: false };
  }
  // Same for JSON. Some sources are reached through an API rather than a page —
  // recuperarportugal.gov.pt renders its notices client-side, so its WordPress REST
  // endpoint is the only static representation there is. Saving that as `.html` and
  // running HTML normalisation over it would be wrong twice over.
  if (ct.includes("json") || extensaoUrl === "json") {
    return { binario: false, extensao: ".json", normalizar: false };
  }
  return { binario: false, extensao: ".html", normalizar: true };
}
