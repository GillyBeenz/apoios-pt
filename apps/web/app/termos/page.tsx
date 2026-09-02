import type { Metadata } from "next";
export const metadata: Metadata = { title: "Termos de utilização" };

export default function Termos() {
  return (
    <div className="max-w-2xl space-y-4 leading-relaxed">
      <h1 className="text-2xl font-semibold tracking-tight">Termos de utilização</h1>

      <div className="rounded-lg border border-amber-600/30 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Documento por completar antes do lançamento público.
      </div>

      <p>
        O Apoios disponibiliza informação agregada sobre programas públicos de apoio,
        a título informativo. O serviço é prestado tal como está, sem garantia de
        exaustividade, exatidão ou atualidade.
      </p>
      <p>
        Compromete-se a confirmar toda a informação junto da entidade responsável
        antes de tomar decisões. A responsabilidade do Apoios é limitada na medida
        permitida pela lei portuguesa, notando que a lei de defesa do consumidor
        restringe o alcance de cláusulas de exclusão.
      </p>
      <p>
        Pode cancelar os alertas a qualquer momento, através da ligação presente em
        cada email ou nas preferências da conta.
      </p>
    </div>
  );
}
