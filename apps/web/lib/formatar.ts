import type { DataComPrecisao } from "@apoios/core";

const FUSO = "Europe/Lisbon";

/**
 * Render a deadline honestly.
 *
 * The precision travels with the date for a reason: a notice that says only
 * "durante setembro" must never be shown as "30/09/2026", because a user reading
 * an exact date will plan around it. Every branch here is about not overstating
 * what the source document actually said.
 */
export function formatarPrazo(d: DataComPrecisao): string {
  if (d.iso === null) {
    return d.textoFonte ? `${d.textoFonte} (por confirmar)` : "Data por confirmar";
  }

  const data = new Date(d.iso);

  switch (d.precisao) {
    case "minuto":
      return new Intl.DateTimeFormat("pt-PT", {
        timeZone: FUSO,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(data);

    case "dia":
      return new Intl.DateTimeFormat("pt-PT", {
        timeZone: FUSO,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(data);

    case "mes": {
      // Deliberately no day. "durante outubro de 2026", never "31/10/2026".
      const mes = new Intl.DateTimeFormat("pt-PT", {
        timeZone: FUSO,
        month: "long",
        year: "numeric",
      }).format(data);
      return `durante ${mes}`;
    }

    default:
      return d.textoFonte ?? "Data por confirmar";
  }
}

/** Short label for the precision, shown next to a date so the reader knows its footing. */
export function etiquetaPrecisao(d: DataComPrecisao): string | null {
  switch (d.precisao) {
    case "mes":
      return "data aproximada";
    case "desconhecida":
      return "por confirmar";
    default:
      return null;
  }
}

export function formatarEuros(valor: number | null): string | null {
  if (valor === null) return null;
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: valor % 1 === 0 ? 0 : 2,
  }).format(valor);
}

export function formatarData(iso: string): string {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

/** Whole days until the deadline, or null when it cannot be counted honestly. */
export function diasRestantes(d: DataComPrecisao, agora = new Date()): number | null {
  if (d.iso === null || d.precisao === "mes" || d.precisao === "desconhecida") return null;
  return Math.floor((new Date(d.iso).getTime() - agora.getTime()) / 86_400_000);
}
