import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { urlAbsoluto } from "@/lib/sitio.ts";

/**
 * Magic-link landing point. `token_hash` + `verifyOtp`, deliberately not PKCE.
 *
 * PKCE (`?code=` + `exchangeCodeForSession`) requires the browser that opens the
 * link to hold a `code_verifier` cookie written by the browser that *requested* it.
 * On a phone those are not the same browser: tapping a link inside Gmail opens an
 * in-app webview with its own cookie jar, the verifier is not there, and the
 * exchange fails every single time. Same account, same link, works on a laptop.
 *
 * `verifyOtp` carries everything needed to establish the session in whichever
 * browser opens the link. It requires the Magic Link and Confirm signup templates
 * in the Supabase dashboard to point here with `{{ .TokenHash }}` — the default
 * `{{ .ConfirmationURL }}` sends people through Supabase's own /verify and back
 * into the PKCE flow.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const tipo = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const seguinte =
    request.nextUrl.searchParams.get("next") || "/conta/preferencias";

  // Only ever a path from our own links; never reflect an absolute URL from the
  // query string, which would make this an open redirect.
  const destino = seguinte.startsWith("/") ? seguinte : "/conta/preferencias";

  if (!tokenHash || !tipo) {
    return NextResponse.redirect(urlAbsoluto("/entrar?erro=1"));
  }

  /**
   * The response is built BEFORE the client, and the client writes its cookies
   * onto it.
   *
   * This is the whole fix, and it is not cosmetic. The previous version bound the
   * client to `cookies()` from `next/headers` and then returned a redirect it had
   * constructed separately. `verifyOtp` succeeded, Supabase created a real session
   * — `auth.sessions` had the row, `last_sign_in_at` was set — and the `Set-Cookie`
   * headers never rode the 302. The browser was never told, so the very next
   * request looked signed out and `/conta/preferencias` bounced back to `/entrar`,
   * forever, on every device.
   *
   * The worst part was how healthy it looked: sign-in "worked", the email arrived,
   * the click was accepted, the database agreed a session existed. Only the one
   * header that mattered was missing. The middleware already does it this way for
   * exactly this reason; this route was the odd one out.
   */
  const resposta = NextResponse.redirect(urlAbsoluto(destino));

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

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: tipo,
  });

  if (error) {
    // Logged, never shown: the message distinguishes "expired" from "already used"
    // from "wrong type", which is useful to us and an oracle to anyone else.
    console.error(`[auth] verifyOtp falhou (${tipo}): ${error.message}`);
    return NextResponse.redirect(urlAbsoluto("/entrar?erro=1"));
  }

  return resposta;
}
