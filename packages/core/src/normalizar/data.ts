import type { DataComPrecisao } from "../tipos.ts";
import type { PrecisaoData } from "../taxonomia.ts";
import { normalizarEspacos, removerAcentos } from "./texto.ts";

const FUSO_PT = "Europe/Lisbon";

const MESES: Record<string, number> = {
  janeiro: 1, jan: 1,
  fevereiro: 2, fev: 2,
  marco: 3, mar: 3,
  abril: 4, abr: 4,
  maio: 5, mai: 5,
  junho: 6, jun: 6,
  julho: 7, jul: 7,
  agosto: 8, ago: 8,
  setembro: 9, set: 9, sept: 9,
  outubro: 10, out: 10,
  novembro: 11, nov: 11,
  dezembro: 12, dez: 12,
};

/**
 * Offset of `tz` from UTC at a given instant, in milliseconds.
 * Derived from Intl rather than hard-coded, so WET/WEST transitions are handled.
 */
function desvioFuso(ts: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const partes: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(ts))) partes[p.type] = p.value;
  const comoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour) % 24,
    Number(partes.minute),
    Number(partes.second),
  );
  return comoUtc - ts;
}

/**
 * Convert a civil (wall-clock) date-time in Europe/Lisbon to a UTC instant.
 *
 * Two passes: guess with the offset at the naive instant, then re-check with the
 * offset at the corrected instant. That second pass is what makes deadlines land
 * correctly across the March and October DST boundaries.
 */
export function civilLisboaParaUtc(
  ano: number,
  mes: number,
  dia: number,
  hora = 0,
  minuto = 0,
  segundo = 0,
): Date {
  const ingenuo = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo);
  const desvio1 = desvioFuso(ingenuo, FUSO_PT);
  let ts = ingenuo - desvio1;
  const desvio2 = desvioFuso(ts, FUSO_PT);
  if (desvio2 !== desvio1) ts = ingenuo - desvio2;
  return new Date(ts);
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export interface ContextoData {
  /** Used when a notice writes "até 30 de junho" with no year. */
  readonly anoPredefinido?: number | null;
  /**
   * Whether this is an opening or a closing date.
   *
   * A date-only closing deadline means end of that day; a date-only opening means
   * the start of it. Month-only precision anchors to the end or start of the month
   * the same way. Getting this backwards would silently shift every deadline by a
   * day and every month-precision deadline by a month.
   */
  readonly papel: "abertura" | "encerramento";
}

const VAZIO: DataComPrecisao = { iso: null, precisao: "desconhecida", textoFonte: null };

/**
 * Parse the date expressions Portuguese funding notices actually use.
 *
 * Returns the instant *and* how precisely it is known — never a bare Date — because
 * the alerting layer must be able to refuse to count down against a vague deadline.
 * An unparseable string yields precision `desconhecida` with the source text kept,
 * which is a usable answer: the fund is published but flagged, not silently wrong.
 */
export function analisarDataPt(
  bruto: string | null | undefined,
  ctx: ContextoData,
): DataComPrecisao {
  if (!bruto) return VAZIO;

  const original = normalizarEspacos(bruto);
  if (original.length === 0) return VAZIO;

  const t = removerAcentos(original).toLowerCase();
  const fimDeDia = ctx.papel === "encerramento";

  const construir = (
    ano: number,
    mes: number,
    dia: number,
    precisao: PrecisaoData,
    hora?: number,
    minuto?: number,
  ): DataComPrecisao => {
    const temHora = hora !== undefined;
    const h = temHora ? hora : fimDeDia ? 23 : 0;
    const mi = temHora ? (minuto ?? 0) : fimDeDia ? 59 : 0;
    const s = temHora ? 0 : fimDeDia ? 59 : 0;
    // An explicit clock time in the notice ("até às 18:00") is strictly more
    // precise than the day it sits in, so it upgrades day-precision to minute.
    // Month-precision is never upgraded: a stray time in "outubro de 2026" tells
    // us nothing about which day the deadline falls on.
    const precisaoFinal: PrecisaoData =
      temHora && precisao === "dia" ? "minuto" : precisao;
    return {
      iso: civilLisboaParaUtc(ano, mes, dia, h, mi, s).toISOString(),
      precisao: precisaoFinal,
      textoFonte: original,
    };
  };

  // An explicit time anywhere in the string upgrades precision to the minute:
  // "até às 18:00 do dia 30 de setembro de 2026", "18h00", "18h".
  const horaMatch = t.match(/(?:as\s*)?(\d{1,2})\s*(?:[:h])\s*(\d{2})?\b/);
  let hora: number | undefined;
  let minuto: number | undefined;
  if (horaMatch) {
    const h = Number(horaMatch[1]);
    // Guard against matching a day/month pair like "30/09" as a time.
    if (h <= 23 && !/\d\s*[/-]\s*\d/.test(horaMatch[0])) {
      hora = h;
      minuto = horaMatch[2] ? Number(horaMatch[2]) : 0;
    }
  }

  // ISO first: 2026-09-30
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    return construir(Number(iso[1]), Number(iso[2]), Number(iso[3]), "dia", hora, minuto);
  }

  // Numeric: 30/09/2026, 30-09-2026, 30.09.2026, and two-digit years
  const num = t.match(/\b(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2,4})\b/);
  if (num) {
    const dia = Number(num[1]);
    const mes = Number(num[2]);
    let ano = Number(num[3]);
    if (ano < 100) ano += 2000;
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) {
      return construir(ano, mes, dia, "dia", hora, minuto);
    }
  }

  // Written day + month (+ optional year): "30 de setembro de 2026", "30 set. 2026"
  const escrita = t.match(
    /\b(\d{1,2})\s*(?:de\s+)?([a-z]{3,10})\.?\s*(?:de\s+)?(\d{4})?\b/,
  );
  if (escrita) {
    const mes = MESES[escrita[2]!];
    if (mes) {
      const dia = Number(escrita[1]);
      const ano = escrita[3] ? Number(escrita[3]) : ctx.anoPredefinido;
      if (ano && dia >= 1 && dia <= 31) {
        return construir(ano, mes, dia, "dia", hora, minuto);
      }
    }
  }

  // Month only: "durante o mes de outubro de 2026", "outubro de 2026", "10/2026"
  const mesEscrito = t.match(/\b([a-z]{3,10})\.?\s+de\s+(\d{4})\b/);
  if (mesEscrito) {
    const mes = MESES[mesEscrito[1]!];
    if (mes) {
      const ano = Number(mesEscrito[2]);
      const dia = fimDeDia ? ultimoDiaDoMes(ano, mes) : 1;
      return construir(ano, mes, dia, "mes");
    }
  }

  const mesNumerico = t.match(/\b(\d{1,2})\s*[/-]\s*(\d{4})\b/);
  if (mesNumerico) {
    const mes = Number(mesNumerico[1]);
    const ano = Number(mesNumerico[2]);
    if (mes >= 1 && mes <= 12) {
      const dia = fimDeDia ? ultimoDiaDoMes(ano, mes) : 1;
      return construir(ano, mes, dia, "mes");
    }
  }

  // Quarter / period wording used by the Plano Anual de Avisos: "1.º trimestre de 2026"
  const trimestre = t.match(/\b([1-4])\s*[.ºao]*\s*(?:trimestre|quadrimestre)\s+de\s+(\d{4})\b/);
  if (trimestre) {
    const n = Number(trimestre[1]);
    const ano = Number(trimestre[2]);
    const ehQuadrimestre = /quadrimestre/.test(trimestre[0]);
    const duracao = ehQuadrimestre ? 4 : 3;
    const mesInicio = (n - 1) * duracao + 1;
    if (mesInicio <= 12) {
      const mes = fimDeDia ? Math.min(mesInicio + duracao - 1, 12) : mesInicio;
      const dia = fimDeDia ? ultimoDiaDoMes(ano, mes) : 1;
      return construir(ano, mes, dia, "mes");
    }
  }

  // Recognisably a date we could not read: keep the text, admit we do not know.
  return { iso: null, precisao: "desconhecida", textoFonte: original };
}

/** Whether a date is precise enough to drive a countdown. */
export function podeContarRegressiva(d: DataComPrecisao): boolean {
  return d.iso !== null && (d.precisao === "minuto" || d.precisao === "dia");
}

/** Whole days from `agora` until `d`, or null when the date is unusable. */
export function diasAte(d: DataComPrecisao, agora: Date): number | null {
  if (!d.iso) return null;
  const ms = new Date(d.iso).getTime() - agora.getTime();
  return Math.floor(ms / 86_400_000);
}
