import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { criarClienteServidor } from "@/lib/supabase/servidor.ts";
import { urlAbsoluto } from "@/lib/sitio.ts";

/**
 * Magic-link landing point. `token_hash` + `verifyOtp`, deliberately not PKCE.
 *
 * PKCE (`?code=` + `exchangeCodeForSession`) requires the browser that opens the
 * link to hold a `code_verifier` cookie written by the browser that *requested* it.
 * On a phone those are not the same browser: tapping a link inside Gmail opens an
 * in-app webview with its own cookie jar, the verifier is not there, and the
 * exchange fails every single time. Same account, same link, works on a laptop.
 * That failure was found the hard way on another site and there is no reason to
 * rediscover it here.
 *
 * `verifyOtp` carries everything needed to establish the session in whichever
 * browser opens the link, which is Supabase's documented pattern for email links
 * specifically. It requires the Magic Link template in the Supabase dashboard to
 * point here with `{{ .TokenHash }}` — the default `{{ .ConfirmationURL }}` sends
 * people through Supabase's own /verify and back into the PKCE flow.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const tipo = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const seguinte =
    request.nextUrl.searchParams.get("next") || "/conta/preferencias";

  if (tokenHash && tipo) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: tipo,
    });
    if (!error) {
      // Only ever a path from our own links; never reflect an absolute URL from
      // the query string, which would make this an open redirect.
      const destino = seguinte.startsWith("/") ? seguinte : "/conta/preferencias";
      return NextResponse.redirect(urlAbsoluto(destino));
    }
  }

  return NextResponse.redirect(urlAbsoluto("/entrar?erro=1"));
}
