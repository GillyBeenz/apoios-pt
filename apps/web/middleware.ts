import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Where the app actually lives. */
const CANONICO = "appoios.guru";

/** The defensive registration. Redirected, and counted before it is. */
const DEFENSIVOS = new Set(["apoios.guru", "www.apoios.guru"]);

const CONTADOS = new Set([
  "appoios.guru",
  "www.appoios.guru",
  "apoios.guru",
  "www.apoios.guru",
]);

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
  if (!url || !chave || !CONTADOS.has(host)) return;

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
  const host = (request.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");

  contar(host);

  if (DEFENSIVOS.has(host)) {
    const destino = new URL(request.nextUrl);
    destino.host = CANONICO;
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
