import Link from "next/link";
import {
  ETIQUETAS_ESTADO,
  ETIQUETAS_MEDIDAS,
  TAXONOMIA_MEDIDAS,
  type Medida,
} from "@apoios/core";
import type { FiltrosApoio } from "@/lib/dados/filtros.ts";

function alternar<T extends string>(actuais: readonly T[], valor: T): T[] {
  return actuais.includes(valor)
    ? actuais.filter((v) => v !== valor)
    : [...actuais, valor];
}

function href(base: FiltrosApoio, alteracao: Partial<FiltrosApoio>): string {
  const f = { ...base, ...alteracao };
  const p = new URLSearchParams();
  if (f.medidas.length > 0) p.set("medida", f.medidas.join(","));
  if (f.estados.length > 0) p.set("estado", f.estados.join(","));
  p.set("beneficiario", f.beneficiarios.join(","));
  if (f.concelho) p.set("concelho", f.concelho);
  if (f.incluirPorRever) p.set("rever", "1");
  return `/apoios?${p.toString()}`;
}

/**
 * Filters render as plain links, so the catalogue works without client JavaScript
 * and every filtered view has a real, shareable URL.
 *
 * The measure list is derived from TAXONOMIA_MEDIDAS rather than re-typed. That
 * constant has exactly two consumers — this UI and the extraction enum — and if
 * they drift, matching silently fails for the drifted measure: a user subscribed
 * to it would simply never hear about that funding, with no error anywhere.
 */
export function FiltrosApoios({
  filtros,
  contagem,
}: {
  filtros: FiltrosApoio;
  contagem: Partial<Record<Medida, number>>;
}) {
  const comApoios = TAXONOMIA_MEDIDAS.filter((m) => (contagem[m] ?? 0) > 0);

  return (
    <aside className="space-y-6 text-sm">
      <div>
        <h2 className="font-medium">Estado</h2>
        <ul className="mt-2 space-y-1">
          {(["aberto", "previsto", "encerrado"] as const).map((e) => {
            const activo = filtros.estados.includes(e);
            return (
              <li key={e}>
                <Link
                  href={href(filtros, { estados: alternar(filtros.estados, e) })}
                  className={activo ? "font-medium" : "text-[--color-suave]"}
                >
                  {activo ? "✓ " : ""}
                  {ETIQUETAS_ESTADO[e]}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h2 className="font-medium">Quem se candidata</h2>
        <ul className="mt-2 space-y-1">
          {(["particular", "condominio"] as const).map((b) => {
            const activo = filtros.beneficiarios.includes(b);
            return (
              <li key={b}>
                <Link
                  href={href(filtros, { beneficiarios: alternar(filtros.beneficiarios, b) })}
                  className={activo ? "font-medium" : "text-[--color-suave]"}
                >
                  {activo ? "✓ " : ""}
                  {b === "particular" ? "Particulares" : "Condomínios"}
                </Link>
              </li>
            );
          })}
          <li className="pt-1">
            {/* Reachable, not hidden: a user can always widen to everything. */}
            <Link href="/apoios?beneficiario=" className="text-[--color-suave] underline underline-offset-2">
              Mostrar todos os beneficiários
            </Link>
          </li>
        </ul>
      </div>

      {comApoios.length > 0 && (
        <div>
          <h2 className="font-medium">Medida</h2>
          <ul className="mt-2 space-y-1">
            {comApoios.map((m) => {
              const activo = filtros.medidas.includes(m);
              return (
                <li key={m}>
                  <Link
                    href={href(filtros, { medidas: alternar(filtros.medidas, m) })}
                    className={activo ? "font-medium" : "text-[--color-suave]"}
                  >
                    {activo ? "✓ " : ""}
                    {ETIQUETAS_MEDIDAS[m]}{" "}
                    <span className="text-xs">({contagem[m]})</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <Link
          href={href(filtros, { incluirPorRever: !filtros.incluirPorRever })}
          className={filtros.incluirPorRever ? "font-medium" : "text-[--color-suave]"}
        >
          {filtros.incluirPorRever ? "✓ " : ""}Incluir avisos por rever
        </Link>
      </div>
    </aside>
  );
}
