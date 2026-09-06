import Link from "next/link";

export const metadata = { title: "Sem ligação" };

export default function SemLigacao() {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-linha bg-superficie p-8 text-center shadow-cartao">
      <div
        aria-hidden
        className="mx-auto grid size-12 place-items-center rounded-full bg-marca-suave text-xl"
      >
        ⚡
      </div>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">Sem ligação</h1>
      <p className="mt-2 text-sm leading-relaxed text-suave">
        Não foi possível obter os dados mais recentes. Como os prazos mudam, não
        mostramos informação guardada que possa já estar errada — tente novamente
        quando tiver ligação.
      </p>
      <Link
        href="/apoios"
        className="mt-6 inline-block rounded-lg bg-marca px-4 py-2 text-sm font-medium text-white"
      >
        Tentar de novo
      </Link>
    </div>
  );
}
