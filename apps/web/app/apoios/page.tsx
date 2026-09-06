import type { Metadata } from "next";
import Link from "next/link";
import { ETIQUETAS_ESTADO, ETIQUETAS_MEDIDAS } from "@apoios/core";
import { repositorio } from "@/lib/dados/index.ts";
import {
  FILTROS_PREDEFINIDOS,
  alternar,
  ehPredefinicao,
  filtrosDaQuery,
  urlDosFiltros,
  type FiltrosApoio,
} from "@/lib/dados/filtros.ts";
import { CartaoApoio } from "@/components/CartaoApoio.tsx";
import { FiltrosApoios } from "@/components/FiltrosApoios.tsx";

export const metadata: Metadata = {
  title: "Apoios disponíveis",
  description: "Apoios ambientais e energéticos para habitação em Portugal.",
};

/**
 * A removable chip for each active filter.
 *
 * With the panel collapsed on a phone, the only thing telling someone why the
 * list is short is the count — and "0 apoios" reads as "there is no funding"
 * rather than "you have three filters on". Each chip is also the way to undo it.
 */
function Activos({ filtros }: { filtros: FiltrosApoio }) {
  const chips: { chave: string; etiqueta: string; sem: FiltrosApoio }[] = [];

  for (const e of filtros.estados) {
    chips.push({
      chave: `estado-${e}`,
      etiqueta: ETIQUETAS_ESTADO[e],
      sem: { ...filtros, estados: alternar(filtros.estados, e) },
    });
  }
  for (const m of filtros.medidas) {
    chips.push({
      chave: `medida-${m}`,
      etiqueta: ETIQUETAS_MEDIDAS[m],
      sem: { ...filtros, medidas: alternar(filtros.medidas, m) },
    });
  }
  for (const b of filtros.beneficiarios) {
    chips.push({
      chave: `beneficiario-${b}`,
      etiqueta: b === "particular" ? "Particulares" : "Condomínios",
      sem: { ...filtros, beneficiarios: alternar(filtros.beneficiarios, b) },
    });
  }
  if (filtros.concelho !== null) {
    chips.push({
      chave: "concelho",
      etiqueta: `Concelho ${filtros.concelho}`,
      sem: { ...filtros, concelho: null },
    });
  }
  if (filtros.incluirPorRever) {
    chips.push({
      chave: "rever",
      etiqueta: "Inclui por rever",
      sem: { ...filtros, incluirPorRever: false },
    });
  }

  if (chips.length === 0) return null;

  return (
    <ul className="mt-3 flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <li key={c.chave}>
          <Link
            href={urlDosFiltros(c.sem)}
            className="inline-flex items-center gap-1.5 rounded-full border border-linha bg-superficie py-1 pl-3 pr-2 text-xs text-suave transition-colors hover:border-linha-forte hover:text-tinta"
          >
            {c.etiqueta}
            <span aria-hidden className="text-tenue">×</span>
            <span className="sr-only">(remover filtro)</span>
          </Link>
        </li>
      ))}
      {!ehPredefinicao(filtros) && (
        <li>
          <Link
            href={urlDosFiltros(FILTROS_PREDEFINIDOS)}
            className="ml-1 text-xs text-marca underline underline-offset-4"
          >
            Repor
          </Link>
        </li>
      )}
    </ul>
  );
}

export default async function Catalogo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filtros = filtrosDaQuery(params);

  const repo = repositorio();
  const [apoios, contagem] = await Promise.all([repo.listar(filtros), repo.contarPorMedida()]);

  return (
    <div className="grid gap-6 md:grid-cols-[16rem_1fr] md:gap-8">
      <FiltrosApoios filtros={filtros} contagem={contagem} />

      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Apoios</h1>

        <p className="mt-1.5 text-sm text-suave" role="status">
          <span className="font-medium text-tinta">
            {apoios.length} {apoios.length === 1 ? "apoio" : "apoios"}
          </span>{" "}
          {ehPredefinicao(filtros)
            ? "abertos ou previstos, para particulares e condomínios."
            : "correspondem aos filtros."}
        </p>

        <Activos filtros={filtros} />

        {apoios.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-linha-forte px-6 py-12 text-center">
            <p className="font-medium">Nenhum apoio corresponde aos filtros.</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-suave">
              Experimente alargar — incluir avisos previstos, limpar o concelho, ou
              desmarcar o tipo de beneficiário para ver também os apoios dirigidos a
              municípios e empresas.
            </p>
            {!ehPredefinicao(filtros) && (
              <Link
                href={urlDosFiltros(FILTROS_PREDEFINIDOS)}
                className="mt-5 inline-block rounded-lg bg-marca px-4 py-2 text-sm font-medium text-white"
              >
                Repor filtros
              </Link>
            )}
          </div>
        ) : (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
            {apoios.map((a) => (
              <li key={a.id} className="flex">
                <CartaoApoio apoio={a} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
