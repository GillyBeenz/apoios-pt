import Link from "next/link";
import { repositorio } from "@/lib/dados/index.ts";
import { FILTROS_PREDEFINIDOS } from "@/lib/dados/filtros.ts";
import { CartaoApoio } from "@/components/CartaoApoio.tsx";

export default async function Inicio() {
  const abertos = (await repositorio().listar(FILTROS_PREDEFINIDOS)).slice(0, 3);

  return (
    <div className="space-y-12">
      <section className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          Financiamento ambiental para a sua casa, sem andar à procura
        </h1>
        <p className="mt-4 text-[--color-suave] leading-relaxed">
          Os apoios do Fundo Ambiental, do PT2030 e do PRR abrem e fecham sem aviso,
          espalhados por uma dúzia de sites. O Apoios acompanha-os por si e avisa-o
          quando abre financiamento{" "}
          <strong className="text-[--color-tinta] font-medium">
            a que se pode mesmo candidatar
          </strong>{" "}
          para as melhorias que escolheu seguir.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/apoios"
            className="rounded-md bg-[--color-marca] px-4 py-2 text-sm font-medium text-white"
          >
            Ver apoios abertos
          </Link>
          <Link
            href="/conta/preferencias"
            className="rounded-md border border-[--color-linha] px-4 py-2 text-sm font-medium"
          >
            Escolher o que seguir
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3 text-sm">
        <div className="rounded-lg border border-[--color-linha] p-4">
          <h2 className="font-medium">Só o que lhe serve</h2>
          <p className="mt-2 text-[--color-suave]">
            Muitos programas excluem pessoas singulares. Filtramos por elegibilidade
            real, e na dúvida não lhe enviamos nada.
          </p>
        </div>
        <div className="rounded-lg border border-[--color-linha] p-4">
          <h2 className="font-medium">A tempo</h2>
          <p className="mt-2 text-[--color-suave]">
            Avisamos quando abre, quando faltam poucos dias e quando a dotação se
            esgota — que fecha a janela mais cedo.
          </p>
        </div>
        <div className="rounded-lg border border-[--color-linha] p-4">
          <h2 className="font-medium">Sempre com a fonte</h2>
          <p className="mt-2 text-[--color-suave]">
            Cada apoio liga ao aviso oficial. O que lá está escrito prevalece sobre
            o que lê aqui.
          </p>
        </div>
      </section>

      {abertos.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold tracking-tight">Abertos agora</h2>
            <Link href="/apoios" className="text-sm underline underline-offset-2">
              Ver todos
            </Link>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {abertos.map((a) => (
              <CartaoApoio key={a.id} apoio={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
