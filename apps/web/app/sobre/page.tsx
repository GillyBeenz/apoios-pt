import type { Metadata } from "next";
export const metadata: Metadata = { title: "Sobre" };

export default function Sobre() {
  return (
    <div className="max-w-2xl space-y-4 leading-relaxed">
      <h1 className="text-2xl font-semibold tracking-tight">Sobre o Apoios</h1>
      <p>
        O Apoios acompanha automaticamente as fontes públicas portuguesas de
        financiamento ambiental e energético — Fundo Ambiental, Portugal 2030, PRR,
        ADENE e DGEG — e avisa proprietários quando abre financiamento para as
        melhorias que escolheram seguir.
      </p>
      <h2 className="text-lg font-medium pt-2">Como decidimos o que lhe mostrar</h2>
      <p>
        Muitos programas portugueses não admitem pessoas singulares. Quando não
        conseguimos determinar com segurança se um aviso está aberto a particulares,
        mostramo-lo assinalado como &laquo;por confirmar&raquo; e não enviamos
        alertas sobre ele. Preferimos falhar um aviso a mandá-lo atrás de dinheiro
        que não pode receber.
      </p>
      <h2 className="text-lg font-medium pt-2">De onde vem a informação</h2>
      <p>
        Recolhemos os avisos publicados pelas entidades responsáveis e extraímos a
        informação estruturada de cada um. Cada apoio mostra a data de recolha e liga
        ao aviso oficial, que prevalece sempre sobre o que consta aqui.
      </p>
      <p className="text-sm text-suave pt-2">
        Contacto: <em>a definir antes do lançamento público</em>.
      </p>
    </div>
  );
}
