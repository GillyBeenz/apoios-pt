import type { RepositorioApoios } from "./repositorio.ts";
import { RepositorioSeed } from "./seed.ts";

let instancia: RepositorioApoios | undefined;

/**
 * Pick the backing store.
 *
 * Defaults to the seed so the app runs with no account and no credentials — which
 * is the whole point of the seam while there is no Supabase project yet. Once one
 * exists, this is where `RepositorioSupabase` gets wired in; no page changes.
 */
export function repositorio(): RepositorioApoios {
  instancia ??= new RepositorioSeed();
  return instancia;
}

export type { RepositorioApoios };
