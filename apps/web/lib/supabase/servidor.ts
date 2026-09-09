import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client bound to the caller's session cookies.
 *
 * Everything personal in this app is reached through it and therefore through RLS:
 * `perfil_proprio` and `subscricoes_proprias` are `using (id = auth.uid())`, so a
 * mistake in a query here returns nobody else's row — it returns nothing. That is
 * deliberate and worth keeping: the service-role key is never imported into the web
 * app at all, so there is no code path that could bypass those policies.
 */
export async function criarClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(paraDefinir) {
          try {
            paraDefinir.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // A Server Component cannot set cookies. The middleware refreshes the
            // session on every request, so losing the write here is harmless.
          }
        },
      },
    },
  );
}
