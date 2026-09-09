import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie on every matched request.
 *
 * Without this, an expired access token is only renewed when something explicitly
 * calls `getUser()`, which signs people out mid-session even though their refresh
 * token is still valid. Someone who set their measures a fortnight ago and comes
 * back to change them should not be asked to sign in again.
 */
export async function middleware(request: NextRequest) {
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
