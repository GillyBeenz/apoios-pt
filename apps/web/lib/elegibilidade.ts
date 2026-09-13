import { ETIQUETAS_BENEFICIARIO, type Apoio } from "@apoios/core";

export type EstadoElegibilidade =
  | "aberto"
  | "via_condominio"
  | "fechado"
  | "por_confirmar";

export interface Elegibilidade {
  readonly estado: EstadoElegibilidade;
  readonly titulo: string;
  readonly detalhe: string | null;
}

/**
 * Decide what the eligibility banner says.
 *
 * Kept as a pure function so the three cases are unit-testable without rendering.
 * The amber case is the delicate one: it must not read as a soft yes. A user who
 * skims "por confirmar" as "probably fine" and spends a weekend on an application
 * they were never eligible for is exactly the harm this product exists to avoid,
 * so the copy says plainly that we do not know and points at the official notice.
 */
export function elegibilidade(apoio: Apoio): Elegibilidade {
  const listaBeneficiarios = apoio.beneficiarios
    .map((b) => ETIQUETAS_BENEFICIARIO[b])
    .join(", ");

  switch (apoio.admiteParticulares) {
    case "sim":
      return {
        estado: "aberto",
        titulo: "Aberto a particulares",
        detalhe: apoio.restricoesBeneficiario,
      };

    case "nao":
      // A notice closed to pessoas singulares but open to condomínios is not a
      // dead end for a homeowner — it is the normal route for anything that
      // touches the building rather than the flat: roof, façade, lifts,
      // collective solar. Calling that "NÃO aberto a particulares" and colouring
      // it red steers people away from the one door that is actually open to
      // them, which is the same harm as a false yes, pointing the other way.
      if (apoio.beneficiarios.includes("condominio")) {
        return {
          estado: "via_condominio",
          titulo: "Aberto ao seu condomínio",
          detalhe:
            "Não admite candidaturas individuais, mas admite condomínios. " +
            "Obras na cobertura, na fachada, nos elevadores ou em solar colectivo " +
            "candidatam-se por esta via — leve-o à assembleia de condóminos." +
            (apoio.restricoesBeneficiario
              ? ` ${apoio.restricoesBeneficiario}`
              : ""),
        };
      }
      return {
        estado: "fechado",
        titulo: "NÃO aberto a particulares",
        detalhe:
          listaBeneficiarios.length > 0
            ? `Destina-se a: ${listaBeneficiarios}.`
            : "Este aviso não admite pessoas singulares.",
      };

    default:
      return {
        estado: "por_confirmar",
        titulo: "Elegibilidade por confirmar",
        detalhe:
          "Não conseguimos determinar com segurança se este aviso admite pessoas " +
          "singulares. Consulte o aviso oficial antes de tomar qualquer decisão.",
      };
  }
}
