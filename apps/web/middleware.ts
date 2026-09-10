import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { destinoCanonico, ehContado, normalizarHost } from "@/lib/dominios.ts";

/**
 * Count one visit against a domain.
 *
 * Fire and forget, and deliberately not awaited: this exists to answer "is the
 * defensive domain worth renewing?", and no answer to that is worth making a page
 * slower or failing a request. A dropped count is a rounding error; a page that
 * hangs because Supabase is slow is a real problem.
 *
 * One row per day per host, no IP, no cookie, no path — see migration 0006. It is
 * not audience analytics and cannot become it without a schema change, which is
 * what keeps `/privacidade`'s claim honest.
 */
function contar(host: string): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave || !ehContado(host)) return;

  void fetch(`${url}/rest/v1/rpc/registar_acesso_dominio`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: chave,
      authorization: `Bearer ${chave}`,
    },
    body: JSON.stringify({ p_host: host }),
  }).catch(() => {
    // Swallowed on purpose. See above.
  });
}

/**
 * Canonical host, then session refresh.
 *
 * Without the refresh an expired access token is only renewed when something calls
 * `getUser()`, which signs people out mid-session even though their refresh token
 * is still valid. Someone who set their measures a fortnight ago and comes back to
 * change them should not be asked to sign in again.
 */
export async function middleware(request: NextRequest) {
  // Normalised once: `contar` sends this straight to a function whose allowlist
  // is exact (migration 0006), so a stray port or capital would silently miss.
  const host = normalizarHost(request.headers.get("host") ?? "");

  contar(host);

  const canonico = destinoCanonico(host);
  if (canonico !== null) {
    const destino = new URL(request.nextUrl);
    destino.host = canonico;
    destino.port = "";
    destino.protocol = "https:";
    // 308 rather than 302: permanent, and it preserves the method, so a form post
    // that lands on the old domain is not silently turned into a GET.
    return NextResponse.redirect(destino, 308);
  }

  const resposta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(paraDefinir) {
          paraDefinir.forEach(({ name, value, options }) =>
            resposta.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getUser();

  return resposta;
}

export const config = {
  matcher: [
    // `auth` is excluded on purpose: the magic-link landing route establishes the
    // session itself, and running the refresh in front of it would race the cookies
    // it is in the middle of writing.
    "/((?!auth|api|_next|_vercel|.*\\..*).*)",
  ],
};
