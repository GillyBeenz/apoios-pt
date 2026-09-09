/**
 * The one origin every absolute URL agrees on.
 *
 * Magic-link `emailRedirectTo` lives or dies on this: Supabase refuses to redirect
 * to an origin that is not on the project's allow list, and a link built against
 * `localhost` from a deployed build simply does not work for the person who clicked
 * it. Vercel's own domain is the fallback precisely so a forgotten env var degrades
 * to "the preview URL" rather than to "a link nobody can open".
 *
 * Order: NEXT_PUBLIC_APP_URL when it is a real public origin, then the Vercel
 * production domain, then localhost for development.
 */

const ORIGEM_LOCAL = "http://localhost:3000";

function semBarraFinal(url: string): string {
  return url.replace(/\/+$/, "");
}

function ehLocal(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(
    semBarraFinal(url),
  );
}

export function urlDoSitio(): string {
  const configurado = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configurado && !ehLocal(configurado)) {
    try {
      // Throws on a malformed value rather than emitting a broken redirect.
      return semBarraFinal(new URL(configurado).toString());
    } catch {
      console.error(`[sitio] NEXT_PUBLIC_APP_URL não é um URL válido: ${configurado}`);
    }
  }

  const dominioVercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;

  if (dominioVercel) {
    if (configurado && ehLocal(configurado)) {
      console.warn(
        "[sitio] NEXT_PUBLIC_APP_URL aponta para localhost num ambiente publicado; " +
          `a usar https://${dominioVercel}. Defina NEXT_PUBLIC_APP_URL no domínio próprio.`,
      );
    }
    return `https://${semBarraFinal(dominioVercel)}`;
  }

  return configurado ? semBarraFinal(configurado) : ORIGEM_LOCAL;
}

/** Absolute URL for a path, e.g. `urlAbsoluto("/conta/preferencias")`. */
export function urlAbsoluto(caminho: string): string {
  return `${urlDoSitio()}${caminho.startsWith("/") ? caminho : `/${caminho}`}`;
}
