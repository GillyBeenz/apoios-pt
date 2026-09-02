import type { Apoio, EstadoApoio, Medida, TipoBeneficiario } from "@apoios/core";

export interface FiltrosApoio {
  readonly medidas: readonly Medida[];
  readonly estados: readonly EstadoApoio[];
  readonly beneficiarios: readonly TipoBeneficiario[];
  readonly concelho: string | null;
  /** Include funds whose extraction is still under review. Off by default. */
  readonly incluirPorRever: boolean;
}

/**
 * The catalogue defaults to a homeowner's view.
 *
 * This product exists for people who own the house they live in, so showing them
 * municipality-only programmes by default would bury the funds they can actually
 * use. They remain reachable by clearing the filter, never hidden outright.
 */
export const FILTROS_PREDEFINIDOS: FiltrosApoio = {
  medidas: [],
  estados: ["aberto", "previsto"],
  beneficiarios: ["particular", "condominio"],
  concelho: null,
  incluirPorRever: false,
};

function intersecta<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.some((x) => b.includes(x));
}

/**
 * Pure predicate, so the catalogue's behaviour is unit-testable without rendering
 * anything. Empty arrays mean "no constraint" rather than "match nothing" — an
 * unset filter must never silently empty the page.
 */
export function correspondeAosFiltros(apoio: Apoio, f: FiltrosApoio): boolean {
  if (!apoio.publicado) return false;
  if (!f.incluirPorRever && apoio.needsReview) return false;
  if (f.medidas.length > 0 && !intersecta(apoio.medidas, f.medidas)) return false;
  if (f.estados.length > 0 && !f.estados.includes(apoio.estado)) return false;
  if (f.beneficiarios.length > 0 && !intersecta(apoio.beneficiarios, f.beneficiarios)) {
    return false;
  }

  if (f.concelho !== null) {
    const nacional = apoio.ambito === "nacional" || apoio.ambito === "continente";
    if (!nacional && !apoio.municipios.includes(f.concelho)) return false;
  }

  return true;
}

/**
 * Sort so the things a user can act on soonest come first: open before announced
 * before closed, then by how close the deadline is. Funds with no usable deadline
 * sort last rather than pretending to be urgent.
 */
export function ordenarApoios(apoios: readonly Apoio[]): Apoio[] {
  const peso: Record<EstadoApoio, number> = {
    aberto: 0,
    previsto: 1,
    suspenso: 2,
    desconhecido: 3,
    encerrado: 4,
  };

  return [...apoios].sort((a, b) => {
    const porEstado = peso[a.estado] - peso[b.estado];
    if (porEstado !== 0) return porEstado;

    const fa = a.fechaEm.iso;
    const fb = b.fechaEm.iso;
    if (fa !== null && fb !== null) return fa.localeCompare(fb);
    if (fa !== null) return -1;
    if (fb !== null) return 1;
    return a.titulo.localeCompare(b.titulo, "pt-PT");
  });
}

const LISTA = (v: string | undefined): string[] =>
  (v ?? "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);

/**
 * Read filters from the URL query string.
 *
 * Filters live in the URL so a search is shareable, bookmarkable and indexable —
 * search visibility is a meaningful acquisition channel for a product like this.
 */
export function filtrosDaQuery(
  params: Record<string, string | string[] | undefined>,
): FiltrosApoio {
  const um = (k: string): string | undefined => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const medidas = LISTA(um("medida")) as Medida[];
  const estados = LISTA(um("estado")) as EstadoApoio[];
  const beneficiarios = LISTA(um("beneficiario")) as TipoBeneficiario[];
  const concelho = um("concelho") ?? null;

  return {
    medidas,
    estados: estados.length > 0 ? estados : FILTROS_PREDEFINIDOS.estados,
    // An explicit `beneficiario=` (empty) clears the default rather than
    // re-applying it, so "show me everything" is actually reachable.
    beneficiarios:
      um("beneficiario") === undefined ? FILTROS_PREDEFINIDOS.beneficiarios : beneficiarios,
    concelho: concelho !== null && concelho.length > 0 ? concelho : null,
    incluirPorRever: um("rever") === "1",
  };
}

export function queryDosFiltros(f: FiltrosApoio): string {
  const p = new URLSearchParams();
  if (f.medidas.length > 0) p.set("medida", f.medidas.join(","));
  if (f.estados.length > 0) p.set("estado", f.estados.join(","));
  p.set("beneficiario", f.beneficiarios.join(","));
  if (f.concelho) p.set("concelho", f.concelho);
  if (f.incluirPorRever) p.set("rever", "1");
  return p.toString();
}
