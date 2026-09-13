import type { Apoio } from "@apoios/core";
import { elegibilidade, type EstadoElegibilidade } from "@/lib/elegibilidade.ts";

// `satisfies` for the same reason CartaoApoio has it: without it, adding a state
// to the union left this map short and `ESTILOS[e.estado]` rendered `undefined`
// — an unstyled banner, no error, no warning, on the single most important line
// of the page. It was already missing that guard when this state was added.
const ESTILOS = {
  aberto: "border-green-600/30 bg-green-50 text-green-900",
  via_condominio: "border-marca-linha bg-marca-suave text-marca-forte",
  fechado: "border-red-600/30 bg-red-50 text-red-900",
  por_confirmar: "border-amber-600/30 bg-amber-50 text-amber-900",
} as const satisfies Record<EstadoElegibilidade, string>;

/**
 * The single most valuable piece of information on a fund page.
 *
 * Rendered at the top, never below the fold, and never collapsed behind an
 * accordion: whether a homeowner can apply at all decides whether the rest of the
 * page is worth reading.
 */
export function BannerElegibilidade({ apoio }: { apoio: Apoio }) {
  const e = elegibilidade(apoio);

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${ESTILOS[e.estado]}`}
      role={e.estado === "fechado" ? "alert" : undefined}
      data-estado={e.estado}
    >
      <p className="font-semibold">{e.titulo}</p>
      {e.detalhe !== null && <p className="mt-1 text-sm">{e.detalhe}</p>}
    </div>
  );
}
