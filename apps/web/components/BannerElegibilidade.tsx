import type { Apoio } from "@apoios/core";
import { elegibilidade } from "@/lib/elegibilidade.ts";

const ESTILOS = {
  aberto: "border-green-600/30 bg-green-50 text-green-900",
  fechado: "border-red-600/30 bg-red-50 text-red-900",
  por_confirmar: "border-amber-600/30 bg-amber-50 text-amber-900",
} as const;

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
