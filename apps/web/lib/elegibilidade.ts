import { ETIQUETAS_BENEFICIARIO, type Apoio } from "@apoios/core";

export type EstadoElegibilidade = "aberto" | "fechado" | "por_confirmar";

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
