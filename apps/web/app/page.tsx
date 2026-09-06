import Link from "next/link";
import { repositorio } from "@/lib/dados/index.ts";
import { FILTROS_PREDEFINIDOS, urlDosFiltros } from "@/lib/dados/filtros.ts";
import { CartaoApoio } from "@/components/CartaoApoio.tsx";

const ARGUMENTOS = [
  {
    titulo: "Só o que lhe serve",
    texto:
      "Muitos programas excluem pessoas singulares. Filtramos por elegibilidade " +
      "real, e na dúvida não lhe enviamos nada.",
  },
  {
    titulo: "A tempo",
    texto:
      "Avisamos quando abre, quando faltam poucos dias e quando a dotação se " +
      "esgota — que fecha a janela mais cedo.",
  },
  {
    titulo: "Sempre com a fonte",
    texto:
      "Cada apoio liga ao aviso oficial. O que lá está escrito prevalece sobre " +
      "o que lê aqui.",
  },
];

export default async function Inicio() {
  const abertos = (await repositorio().listar(FILTROS_PREDEFINIDOS)).slice(0, 3);

  return (
    <div className="space-y-16">
      <section className="relative overflow-hidden rounded-2xl border border-linha bg-superficie px-6 py-12 shadow-cartao sm:px-10 sm:py-16">
        {/* Decorative wash. aria-hidden and pointer-events-none so it is invisible
            to assistive tech and never intercepts a click on the buttons. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-marca-suave blur-3xl"
        />
        <div className="relative max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-marca">
            Fundo Ambiental · PT2030 · PRR
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl sm:leading-[1.15]">
            Financiamento ambiental para a sua casa, sem andar à procura
          </h1>
          <p className="mt-4 text-base leading-relaxed text-suave">
            Os apoios abrem e fecham sem aviso, espalhados por uma dúzia de sites. O
            Apoios acompanha-os por si e avisa-o quando abre financiamento{" "}
            <strong className="font-medium text-tinta">
              a que se pode mesmo candidatar
            </strong>{" "}
            para as melhorias que escolheu seguir.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={urlDosFiltros(FILTROS_PREDEFINIDOS)}
              className="rounded-lg bg-marca px-5 py-2.5 text-sm font-medium text-white shadow-cartao transition-colors hover:bg-marca-forte"
            >
              Ver apoios abertos
            </Link>
            <Link
              href="/conta/preferencias"
              className="rounded-lg border border-linha bg-superficie px-5 py-2.5 text-sm font-medium transition-colors hover:border-linha-forte"
            >
              Escolher o que seguir
            </Link>
          </div>
        </div>
      </section>

      <section>
        <ul className="grid gap-4 sm:grid-cols-3">
          {ARGUMENTOS.map((a) => (
            <li
              key={a.titulo}
              className="rounded-xl border border-linha bg-superficie p-5 shadow-cartao"
            >
              <h2 className="font-semibold tracking-tight">{a.titulo}</h2>
              <p className="mt-2 text-sm leading-relaxed text-suave">{a.texto}</p>
            </li>
          ))}
        </ul>
      </section>

      {abertos.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-semibold tracking-tight">Abertos agora</h2>
            <Link
              href="/apoios"
              className="text-sm text-marca underline underline-offset-4"
            >
              Ver todos
            </Link>
          </div>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {abertos.map((a) => (
              <li key={a.id} className="flex">
                <CartaoApoio apoio={a} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
