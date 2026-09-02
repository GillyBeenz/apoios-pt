import type { Apoio, Medida } from "@apoios/core";
import type { FiltrosApoio } from "./filtros.ts";

/**
 * Everything the UI needs from storage.
 *
 * Declared as an interface — the same seam used for `Buscador` and `Armazem` in the
 * ingestion package — so the whole app runs against seeded local data today and
 * switches to Supabase later by changing one factory, with no page touched.
 */
export interface RepositorioApoios {
  listar(filtros: FiltrosApoio): Promise<Apoio[]>;
  obterPorSlug(slug: string): Promise<Apoio | null>;
  contarPorMedida(): Promise<Partial<Record<Medida, number>>>;
}
