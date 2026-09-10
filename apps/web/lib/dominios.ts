/**
 * Which host the app answers on, and what to do with the others.
 *
 * Extracted from the middleware so the rule can be tested without dragging in
 * `@supabase/ssr` and a fake `NextRequest`. The middleware is then only the
 * plumbing: read the host, ask here, act.
 */

/** Where the app actually lives. */
export const CANONICO = "appoios.guru";

/**
 * Every host that is not the canonical one, and therefore redirected.
 *
 * `www.appoios.guru` belongs here for a different reason than the other two.
 * Those are the defensive registration, bought so nobody else could have it. The
 * `www` is the same domain wearing a hat: Vercel serves it because it is listed
 * on the project, and left alone it answers on its own hostname. That means two
 * URLs for the same page — duplicate content to a search engine, and worse, a
 * session cookie set on one host is invisible to the other, so signing in at
 * `www.appoios.guru` and later arriving at `appoios.guru` looks like being
 * signed out for no reason.
 *
 * If Vercel is ever configured to redirect the apex *to* the www, this set must
 * lose `www.appoios.guru` in the same change: Vercel's redirect runs at the edge
 * before the middleware, and two rules pointing at each other is an infinite
 * loop. There is a test below holding that pair of facts together.
 */
export const NAO_CANONICOS: ReadonlySet<string> = new Set([
  "apoios.guru",
  "www.apoios.guru",
  "www.appoios.guru",
]);

/**
 * Hosts whose visits are counted, one row per day per host.
 *
 * The canonical one included: the question "is the defensive domain worth
 * renewing?" is only answerable against a denominator.
 */
export const CONTADOS: ReadonlySet<string> = new Set([
  CANONICO,
  ...NAO_CANONICOS,
]);

/** Strip the port and lowercase, so `Host:` header quirks do not matter. */
export function normalizarHost(host: string): string {
  return host.toLowerCase().replace(/:\d+$/, "").trim();
}

/**
 * The canonical host to redirect this one to, or null to serve it as-is.
 *
 * Returns null for the canonical host itself — redirecting it to itself is the
 * loop this function exists to make impossible to write by accident.
 */
export function destinoCanonico(host: string): string | null {
  const limpo = normalizarHost(host);
  if (limpo === CANONICO) return null;
  return NAO_CANONICOS.has(limpo) ? CANONICO : null;
}

/** Whether a visit to this host is counted. */
export function ehContado(host: string): boolean {
  return CONTADOS.has(normalizarHost(host));
}
