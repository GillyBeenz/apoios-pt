import { normalizarEspacos, removerAcentos } from "./texto.ts";

/**
 * Parse the euro amounts Portuguese notices use.
 *
 * Portuguese formatting is the inverse of English — "." groups thousands and ","
 * is the decimal separator — so "1.500.000,00 €" is one and a half million, not
 * one point five. Reading that wrong by three orders of magnitude would put an
 * absurd figure in an alert email, so the ambiguous cases are resolved explicitly
 * rather than by a permissive `parseFloat`.
 *
 * Handles: "1.500.000,00 €", "€ 15.000", "15 000 EUR", "15000", "1,5 M€",
 * "2 milhões de euros", "até 15.000,00€".
 */
export function analisarMontanteEur(bruto: string | null | undefined): number | null {
  if (!bruto) return null;

  const t = removerAcentos(normalizarEspacos(bruto)).toLowerCase();
  if (t.length === 0) return null;

  // Multiplier words and suffixes, checked before the digits are read.
  let multiplicador = 1;
  if (/\bm(i(l)?)?lh(o|oe)es?\b/.test(t) || /\bm€/.test(t) || /\d\s*m\b/.test(t)) {
    multiplicador = 1_000_000;
  } else if (/\bmil\b(?!\s*h)/.test(t) || /\d\s*k\b/.test(t)) {
    multiplicador = 1_000;
  }

  const numMatch = t.match(/\d[\d.,\s ]*/);
  if (!numMatch) return null;

  let n = numMatch[0].replace(/[\s ]/g, "").replace(/[.,]$/, "");
  if (n.length === 0) return null;

  const temPonto = n.includes(".");
  const temVirgula = n.includes(",");

  if (temPonto && temVirgula) {
    // Both present: the rightmost is the decimal separator.
    if (n.lastIndexOf(",") > n.lastIndexOf(".")) {
      n = n.replace(/\./g, "").replace(",", ".");
    } else {
      n = n.replace(/,/g, "");
    }
  } else if (temVirgula) {
    // "1,5" is decimal; "1,500" is ambiguous but in pt-PT means one and a half
    // thousand only when a multiplier word follows — otherwise treat exactly two
    // trailing digits as cents and three as a thousands group.
    const depois = n.length - n.lastIndexOf(",") - 1;
    n = depois === 3 && multiplicador === 1 ? n.replace(/,/g, "") : n.replace(",", ".");
  } else if (temPonto) {
    const depois = n.length - n.lastIndexOf(".") - 1;
    // "15.000" is fifteen thousand; "15.00" is fifteen. Three digits after the
    // final dot means a thousands group in pt-PT formatting.
    if (depois === 3) n = n.replace(/\./g, "");
  }

  const valor = Number(n);
  if (!Number.isFinite(valor)) return null;

  return Math.round(valor * multiplicador * 100) / 100;
}

/**
 * Parse a support percentage: "85%", "até 85 %", "comparticipação de 85 por cento".
 * Returns null rather than guessing when no percentage is present.
 */
export function analisarPercentagem(bruto: string | null | undefined): number | null {
  if (!bruto) return null;
  const t = removerAcentos(normalizarEspacos(bruto)).toLowerCase();
  const m = t.match(/(\d{1,3}(?:[.,]\d+)?)\s*(?:%|por\s*cento)/);
  if (!m) return null;
  const v = Number(m[1]!.replace(",", "."));
  if (!Number.isFinite(v) || v < 0 || v > 100) return null;
  return v;
}
