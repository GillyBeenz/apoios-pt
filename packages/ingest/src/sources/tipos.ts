import type { ApoioNovo, Candidato } from "@apoios/core";

export interface ContextoExtraccao {
  /** Base URL for resolving relative links. */
  readonly urlBase: string;
  /** Injected so extractors never read the wall clock and stay deterministic. */
  readonly agora: Date;
}

export interface Fonte {
  readonly id: string;
  readonly nome: string;
  readonly entidade: string;
  readonly urlBase: string;
  readonly urlsEntrada: readonly string[];
  /**
   * Entry points that are not a plain `GET`.
   *
   * `urlsEntrada` assumed the only way to ask a site for its notices was to
   * request a page. The Portugal 2030 listing is not built that way: its avisos
   * come from `POST /wp-json/avisos/query` with a form-encoded body, and no URL on
   * its own will ever return them.
   *
   * Declarative rather than a function, deliberately. Both the pipeline and the
   * capture script read this, and the capture script is a standalone `.mjs` that
   * imports the registry — a field it can serialise and print is worth more than a
   * callback it would have to call.
   *
   * The body is committed as written evidence, not composed here: the exact
   * request is in `comum/fixtures-permanentes/pt2030-avisos-query-contrato.json`,
   * recorded from what the site's own page sent.
   *
   * One request per URL. The snapshot ledger is keyed by URL, so two entries
   * sharing one would overwrite each other's change gate and each look
   * permanently changed to the other.
   *
   * A paginated endpoint does not get an exception from that rule; it gets
   * `varredura`, which keeps it true. The pages are walked behind one entry and
   * joined into one document, so the ledger still sees a single URL with a single
   * body and a single hash.
   */
  readonly pedidosEntrada?: readonly PedidoDeEntrada[];
  readonly tipo: "listagem" | "noticias" | "legal" | "dataset";
  /**
   * Has this source's extractor been verified against markup captured from the
   * live site? `activa` yes, `em-captura` not yet.
   *
   * The pipeline ingests only `activa` sources; the fixture-capture workflow visits
   * both, since capture is precisely how a source stops being `em-captura`.
   *
   * The distinction earns its place because of what a zero-candidate run means. For
   * a verified source, zero means the selectors broke and the health floor must
   * fire. For an unverified one, zero is the expected first result and means
   * nothing. Collapsing the two would either bury real breakage in noise or fill
   * the run log with alarms nobody can act on — and an alarm people learn to
   * ignore is worse than no alarm.
   */
  readonly estado: "activa" | "em-captura";
  /** Hours between fetches. */
  readonly cadenciaHoras: number;
  /**
   * Health floor. A run returning fewer candidates than this is treated as a
   * broken selector rather than a quiet week — the failure mode where a site
   * redesign silently stops all alerts while every run still reports success.
   */
  readonly candidatosMin: number;
  /**
   * Detect a page the server returned with HTTP 200 that is actually an error.
   *
   * fundoambiental.pt does exactly this: a missing page lands on `Erro.aspx` with
   * status 200 and stable content, so neither the status check nor the content-hash
   * change gate would ever notice. Without this the source looks permanently healthy
   * while producing nothing. Optional — sources that fail honestly can omit it.
   */
  ehPaginaDeErro?(html: string, urlFinal: string): boolean;

  /**
   * Render this source's entry pages in a browser before capturing them.
   *
   * Only the **capture** uses this, never the pipeline. The distinction matters
   * and this repository had it wrong: the note on `prr-candidaturas` rejected a
   * headless browser because «every extractor here is pure and testable offline
   * against a committed fixture, and that property is worth more than this one
   * listing».
   *
   * The property is real and worth keeping — but a browser in the capture does
   * not cost it. The fixture that lands is still a static file, and the extractor
   * that reads it is still pure and still runs offline with no network at all.
   * What changes is only how the bytes got into the file: `fetch` for a page the
   * server renders, a browser for one the server leaves empty.
   *
   * Costs real time and a Chromium download, so it stays opt-in per source.
   */
  readonly renderizarNoNavegador?: boolean;

  /**
   * Pure. No fetch, no fs, no Date.now — everything time-dependent arrives via
   * `ctx`. This is what makes every extractor unit-testable against a committed
   * fixture in an environment with no network at all.
   */
  extrair(html: string, ctx: ContextoExtraccao): Candidato[];

  /**
   * Read a spreadsheet candidate into funds directly, with no model call.
   *
   * A `dataset` source publishes a structured file — the annual notice plan is a
   * table of dates, dotações and programmes. Sending that to the model would be
   * paying to make a deterministic table less certain, so `executar` routes
   * `folha` candidates here instead.
   *
   * Optional, and its absence is meaningful: a `folha` candidate from a source
   * without this is dropped, because decoding a .xlsx as if it were text and
   * sending the mojibake to the model is a paid call whose output could only be
   * nonsense.
   */
  lerDataset?(bytes: Uint8Array, ctx: ContextoDataset): ApoioNovo[];

  /**
   * Does this page of a sweep still carry items?
   *
   * Pure, and the sweep's only stopping rule. The PT2030 endpoint ends a walk with
   * HTTP 200 and a body saying `{code: 404, info: "No data found"}` — a status code
   * in the envelope, not in the response — so «the end» is something only the
   * source can recognise. Required by any source that declares `varredura`.
   */
  paginaTemItens?(corpo: string): boolean;

  /**
   * Join a sweep's pages into the one document `lerDataset` will read.
   *
   * Pure. The result is what gets hashed and stored, so it must not carry a
   * timestamp or anything else that changes when the data does not — the change
   * gate is the hash, and a clock inside the document would make every run look
   * like a change.
   */
  juntarPaginas?(corpos: readonly string[]): string;

  /**
   * The entry response **is** the dataset. No listing, no second fetch.
   *
   * The spreadsheet path gets here in two hops: a listing page is parsed, it
   * yields a `folha` candidate, and the file behind it is fetched and read. That
   * shape assumes the data lives at the end of a link.
   *
   * An API answers in one hop. `POST /wp-json/avisos/query` returns the avisos
   * themselves, so there is no listing to parse and nothing further to fetch —
   * and asking for it twice would mean posting the same body again to get the
   * same bytes.
   *
   * A source that sets this needs `lerDataset` and gets no `extrair` call: there
   * is no markup to extract from.
   */
  readonly entradaEDataset?: boolean;
}

/** A non-`GET` entry request, declared by a source and issued verbatim. */
export interface PedidoDeEntrada {
  readonly url: string;
  readonly metodo: "POST";
  readonly corpo: string;
  readonly tipoConteudo: string;
  /** Present when this entry is a paginated sweep rather than a single request. */
  readonly varredura?: Varredura;
}

/**
 * How to walk a paginated entry to its end.
 *
 * Declarative, for the same reason `pedidosEntrada` is: the capture script prints
 * it. The page body is the entry's `corpo` with `parametro=<n>` appended, which is
 * what the PT2030 endpoint was observed to accept.
 *
 * **The indexing is written down, not assumed.** `page` on the PT2030 endpoint is
 * 0-indexed — `page=0` returns byte for byte what the request without `page`
 * returns — and reading it as 1-indexed silently skips the second page of the set.
 * That already happened once here, and it cost a session: the sweep came back with
 * four notices missing and looked complete. A number nobody has to infer is the
 * cheapest guard there is.
 */
export interface Varredura {
  /** The query parameter that selects the page. */
  readonly parametro: string;
  /** The first page's number. `0` and `1` are both real conventions. */
  readonly primeiraPagina: number;
  /**
   * Refuse to walk past this many pages.
   *
   * Not a limit on how much is read — it is a circuit breaker. An endpoint that
   * stops signalling the end would otherwise be walked forever, one polite request
   * at a time. Hitting it is an error and fails the source, deliberately: a sweep
   * that stopped early must never be mistaken for a complete one.
   */
  readonly maxPaginas: number;
}

export interface ContextoDataset {
  /** The page the file was linked from — the authoritative source to link back to. */
  readonly urlOrigem: string;
  readonly entidade: string;
}
