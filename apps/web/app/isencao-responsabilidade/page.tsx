import type { Metadata } from "next";
export const metadata: Metadata = { title: "Isenção de responsabilidade" };

export default function Isencao() {
  return (
    <div className="max-w-2xl space-y-4 leading-relaxed">
      <h1 className="text-2xl font-semibold tracking-tight">Isenção de responsabilidade</h1>
      <p>
        O Apoios é um agregador independente e{" "}
        <strong>não está associado ao Fundo Ambiental, ao Portugal 2030, ao PRR, à
        ADENE, à DGEG nem a qualquer outra entidade pública</strong>.
      </p>
      <p>
        A informação apresentada é recolhida e interpretada automaticamente a partir
        de documentos públicos. Pode estar incompleta, desatualizada ou conter erros
        de leitura. <strong>Os termos do aviso oficial prevalecem sempre.</strong>
      </p>
      <p>
        Antes de tomar qualquer decisão — nomeadamente adjudicar obra, adquirir
        equipamento ou submeter uma candidatura — confirme as condições, os prazos e
        a elegibilidade junto da entidade responsável, através da ligação ao aviso
        oficial presente em cada página.
      </p>
      <p>
        O Apoios não presta aconselhamento jurídico, financeiro nem técnico, e não se
        responsabiliza por decisões tomadas com base na informação aqui apresentada,
        na medida permitida pela lei portuguesa.
      </p>
    </div>
  );
}
