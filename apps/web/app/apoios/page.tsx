import type { Metadata } from "next";
import { repositorio } from "@/lib/dados/index.ts";
import { filtrosDaQuery } from "@/lib/dados/filtros.ts";
import { CartaoApoio } from "@/components/CartaoApoio.tsx";
import { FiltrosApoios } from "@/components/FiltrosApoios.tsx";

export const metadata: Metadata = {
  title: "Apoios disponíveis",
  description: "Apoios ambientais e energéticos para habitação em Portugal.",
};

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
    <div className="grid gap-8 md:grid-cols-[13rem_1fr]">
      <FiltrosApoios filtros={filtros} contagem={contagem} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Apoios</h1>
        <p className="mt-1 text-sm text-[--color-suave]">
          {apoios.length === 0
            ? "Nenhum apoio corresponde aos filtros."
            : `${apoios.length} ${apoios.length === 1 ? "apoio" : "apoios"}.`}{" "}
          Por predefinição mostramos apenas o que está aberto a particulares e a
          condomínios.
        </p>

        {apoios.length === 0 ? (
          <p className="mt-8 rounded-lg border border-dashed border-[--color-linha] p-8 text-center text-sm text-[--color-suave]">
            Experimente alargar os filtros — por exemplo incluindo avisos previstos
            ou outros tipos de beneficiário.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {apoios.map((a) => (
              <CartaoApoio key={a.id} apoio={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
