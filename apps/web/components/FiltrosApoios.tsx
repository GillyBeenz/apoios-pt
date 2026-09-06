import Link from "next/link";
import { FormularioFiltros } from "@/components/FormularioFiltros.tsx";
import { PainelFiltros } from "@/components/PainelFiltros.tsx";
import {
  ETIQUETAS_ESTADO,
  ETIQUETAS_MEDIDAS,
  TAXONOMIA_MEDIDAS,
  type Medida,
} from "@apoios/core";
import {
  FILTROS_PREDEFINIDOS,
  ehPredefinicao,
  queryDosFiltros,
  urlDosFiltros,
  type FiltrosApoio,
} from "@/lib/dados/filtros.ts";

/**
 * Real `<input type="checkbox">` inside a real GET form.
 *
 * The previous version drew a "✓ " in front of a link. It looked like a tick box
 * and behaved like one for a mouse user, but it announced itself to a screen
 * reader as a plain link with no checked state, and it could not be toggled with
 * the space bar. For a page whose entire purpose is narrowing a list, that made
 * the list unusable without a mouse.
 *
 * Progressive enhancement, both directions:
 *
 *   * With JavaScript, changing any box pushes the new URL immediately — same
 *     instant feel the links had, minus a full page load.
 *   * Without it, the form still submits to /apoios by GET. The submit button is
 *     inside `<noscript>` so it only appears when it is the only way through.
 *
 * Either way the result is a real, shareable URL, and the filter state lives
 * nowhere but there.
 */
function Caixa({
  nome,
  valor,
  activo,
  children,
  contagem,
}: {
  nome: string;
  valor: string;
  activo: boolean;
  children: React.ReactNode;
  contagem?: number;
}) {
  return (
    <label className="group flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 -mx-2 transition-colors hover:bg-marca-suave">
      <input
        type="checkbox"
        name={nome}
        value={valor}
        defaultChecked={activo}
        className="size-4 shrink-0 accent-marca"
      />
      <span className={activo ? "font-medium text-tinta" : "text-suave"}>{children}</span>
      {contagem !== undefined && (
        <span className="ml-auto text-xs tabular-nums text-tenue">{contagem}</span>
      )}
    </label>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-tenue">
        {titulo}
      </legend>
      <div className="space-y-0.5">{children}</div>
    </fieldset>
  );
}

export function FiltrosApoios({
  filtros,
  contagem,
}: {
  filtros: FiltrosApoio;
  contagem: Partial<Record<Medida, number>>;
}) {
  const comApoios = TAXONOMIA_MEDIDAS.filter((m) => (contagem[m] ?? 0) > 0);
  const limpo = ehPredefinicao(filtros);

  return (
    <PainelFiltros
      className="filtros group rounded-xl border border-linha bg-superficie shadow-cartao md:sticky md:top-20 md:self-start"
      resumo={
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-medium">
          <span>Filtros</span>
          <span
            className="text-xs text-tenue transition-transform group-open:rotate-180"
            aria-hidden
          >
            ▾
          </span>
        </summary>
      }
    >

      {/*
        The inputs are uncontrolled, so React leaves their DOM state alone once
        mounted — which is right while the user is ticking boxes, and wrong the
        moment the filters change from outside the form ("Limpar filtros", the
        back button, a shared link). Keying on the serialised filters remounts the
        form whenever that happens, so what is ticked always matches the URL.
      */}
      <FormularioFiltros
        key={queryDosFiltros(filtros)}
        className="space-y-5 border-t border-linha px-4 py-4 text-sm md:border-t-0 md:pt-4"
      >
        {/*
          Empty defaults so the key is always present in the query string. Without
          them, unticking every box drops the parameter entirely, which reads back
          as "never set" and restores the default — the box would appear to do
          nothing at all.
        */}
        <input type="hidden" name="estado" value="" />
        <input type="hidden" name="beneficiario" value="" />
        {/* Carried through so ticking a box does not drop a concelho that arrived
            in the URL from an alert link. */}
        {filtros.concelho !== null && (
          <input type="hidden" name="concelho" value={filtros.concelho} />
        )}

        <Grupo titulo="Estado">
          {(["aberto", "previsto", "encerrado"] as const).map((e) => (
            <Caixa key={e} nome="estado" valor={e} activo={filtros.estados.includes(e)}>
              {ETIQUETAS_ESTADO[e]}
            </Caixa>
          ))}
        </Grupo>

        <Grupo titulo="Quem se candidata">
          {(["particular", "condominio"] as const).map((b) => (
            <Caixa
              key={b}
              nome="beneficiario"
              valor={b}
              activo={filtros.beneficiarios.includes(b)}
            >
              {b === "particular" ? "Particulares" : "Condomínios"}
            </Caixa>
          ))}
          <p className="px-0 pt-1 text-xs text-tenue">
            Desmarcar ambos mostra também apoios só para municípios e empresas.
          </p>
        </Grupo>

        {comApoios.length > 0 && (
          <Grupo titulo="Medida">
            {comApoios.map((m) => (
              <Caixa
                key={m}
                nome="medida"
                valor={m}
                activo={filtros.medidas.includes(m)}
                contagem={contagem[m]}
              >
                {ETIQUETAS_MEDIDAS[m]}
              </Caixa>
            ))}
          </Grupo>
        )}

        {/*
          No concelho control, deliberately.

          `Apoio.municipios` holds DICOFRE codes ("1106"), not names, and there is
          no code-to-name table anywhere in this repository. A text box would
          therefore match nothing a person would ever type: someone in Braga would
          filter, see an empty catalogue, and conclude there is no funding for
          them — worse than not offering the filter at all.

          The `concelho` query parameter is still honoured, because the alerting
          path passes the code straight off the user profile. Bringing the control
          back needs a DICOFRE table in @apoios/core, taken from the INE
          publication rather than typed out from memory: a single wrong code
          silently hides every municipal notice from that municipality.
        */}

        <div className="border-t border-linha pt-4">
          <Caixa nome="rever" valor="1" activo={filtros.incluirPorRever}>
            Incluir avisos por rever
          </Caixa>
          <p className="px-0 pt-1 text-xs text-tenue">
            Extracções automáticas ainda não confirmadas por uma pessoa.
          </p>
        </div>

        <noscript>
          <button
            type="submit"
            className="w-full rounded-md bg-marca px-3 py-2 font-medium text-white"
          >
            Aplicar filtros
          </button>
        </noscript>

        {!limpo && (
          <Link
            href={urlDosFiltros(FILTROS_PREDEFINIDOS)}
            className="block rounded-md border border-linha px-3 py-2 text-center text-sm text-suave transition-colors hover:border-linha-forte hover:text-tinta"
          >
            Limpar filtros
          </Link>
        )}
      </FormularioFiltros>
    </PainelFiltros>
  );
}
