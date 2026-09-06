import { createClient, type SupabaseClient } from "@supabase/supabase-js";
// paraApoio and the column list live in core, not here. The ingestion pipeline
// writes these same rows and reads them back, so a second copy of the mapping
// would put the fail-closed rules in two places that could drift apart.
import { SELECT_APOIO, paraApoio, type Apoio, type Medida } from "@apoios/core";
import { correspondeAosFiltros, ordenarApoios, type FiltrosApoio } from "./filtros.ts";
import type { RepositorioApoios } from "./repositorio.ts";

/**
 * The catalogue, backed by Supabase.
 *
 * Reads with the ANON key and leans on row-level security rather than filtering in
 * application code: the `apoios_publicados` policy is `using (publicado = true)`, so an
 * unpublished fund is not merely hidden by a `.eq()` someone could forget — it does not
 * come back over the wire at all. A bug in this file cannot leak one.
 *
 * The rest of the filtering deliberately reuses `correspondeAosFiltros`, the same pure
 * predicate the seed uses. Pushing measure, region and beneficiary filters into SQL
 * would mean two definitions of "does this fund match?" — and the catalogue is small
 * enough that the honest, single-definition version costs nothing.
 */
export class RepositorioSupabase implements RepositorioApoios {
  readonly #cliente: SupabaseClient;

  constructor(url: string, chaveAnon: string) {
    this.#cliente = createClient(url, chaveAnon, {
      auth: { persistSession: false },
    });
  }

  async listar(filtros: FiltrosApoio): Promise<Apoio[]> {
    // `.returns` because COLUNAS is joined at runtime, so the client cannot infer the
    // row shape from it. `paraApoio` is where the shape is actually asserted.
    const { data, error } = await this.#cliente
      .from("funds")
      .select(SELECT_APOIO)
      .returns<Linha[]>();
    if (error !== null) throw new Error(`Supabase: ${error.message}`);

    const apoios = (data ?? []).map(paraApoio);
    return ordenarApoios(apoios.filter((a) => correspondeAosFiltros(a, filtros)));
  }

  async obterPorSlug(slug: string): Promise<Apoio | null> {
    const { data, error } = await this.#cliente
      .from("funds")
      .select(SELECT_APOIO)
      .eq("slug", slug)
      .returns<Linha[]>()
      .maybeSingle();
    if (error !== null) throw new Error(`Supabase: ${error.message}`);
    return data === null ? null : paraApoio(data);
  }

  async contarPorMedida(): Promise<Partial<Record<Medida, number>>> {
    const { data, error } = await this.#cliente
      .from("funds")
      .select("medidas, needs_review")
      .returns<{ medidas: Medida[] | null; needs_review: boolean }[]>();
    if (error !== null) throw new Error(`Supabase: ${error.message}`);

    const contagem: Partial<Record<Medida, number>> = {};
    for (const linha of data ?? []) {
      // Counts drive the filter chips. Including funds still under review would
      // promise results the default view then does not show.
      if (linha.needs_review === true) continue;
      for (const m of linha.medidas ?? []) {
        contagem[m] = (contagem[m] ?? 0) + 1;
      }
    }
    return contagem;
  }
}

/** A row as it comes back: keys unknown to the type system, asserted by `paraApoio`. */
type Linha = Record<string, unknown>;


/**
 * snake_case row to the domain type.
 *
 * Written out by hand rather than generated, because two fields carry meaning that a
 * mechanical mapping would flatten: a date and its precision belong together in one
 * `DataComPrecisao`, and `admite_particulares` is a tri-state where the absent value
 * must become `desconhecido` — never a falsy `nao` and never a silent `sim`.
 */

export { paraApoio };
