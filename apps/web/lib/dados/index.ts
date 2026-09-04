import type { RepositorioApoios } from "./repositorio.ts";
import { RepositorioSeed } from "./seed.ts";
import { RepositorioSupabase } from "./supabase.ts";

let instancia: RepositorioApoios | undefined;

/**
 * Pick the backing store.
 *
 * Supabase when both variables are present, the seed otherwise. The fallback is not a
 * convenience: it is what keeps `pnpm test` and `pnpm dev` working with no account and
 * no credentials, which is the property the whole seam was built for.
 *
 * Deliberately requires BOTH the URL and the key. Having one without the other is a
 * half-configured deployment, and falling back silently there would serve seven
 * invented funds from a production URL — the exact harm this product exists to
 * prevent. So that case throws instead.
 */
export function repositorio(): RepositorioApoios {
  instancia ??= construir();
  return instancia;
}

function construir(): RepositorioApoios {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url === undefined && chave === undefined) return new RepositorioSeed();

  if (url === undefined || chave === undefined) {
    throw new Error(
      "Configuração do Supabase incompleta: são precisas NEXT_PUBLIC_SUPABASE_URL e " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY. Recorrer aos dados de exemplo aqui serviria " +
        "apoios inventados a partir de um URL de produção.",
    );
  }

  return new RepositorioSupabase(url, chave);
}

/** Exposed for tests, which need a fresh decision per case. */
export function reiniciarRepositorio(): void {
  instancia = undefined;
}

export type { RepositorioApoios };
