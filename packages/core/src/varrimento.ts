import type { Apoio, EventoApoio, Relogio } from "./tipos.ts";
import { LIMIARES_FECHA_EM_BREVE } from "./taxonomia.ts";
import { diasAte, podeContarRegressiva } from "./normalizar/data.ts";
import { impressaoEvento } from "./diferencas.ts";

const LIMIARES_ASCENDENTES = [...LIMIARES_FECHA_EM_BREVE].sort((a, b) => a - b);

/**
 * Clock-driven events.
 *
 * "Closes in 7 days" is a function of the calendar, not of anything changing on a
 * page. If this lived in the scraper it would only ever fire on days a notice
 * happened to be edited — that is, almost never, and least likely of all in the
 * final quiet week before a deadline, which is exactly when it matters. So it runs
 * on its own daily schedule over every known fund, scraped or not.
 */
export function varrerEventosTemporais(apoios: readonly Apoio[], relogio: Relogio): EventoApoio[] {
  const agora = relogio.agora();
  const ocorreuEm = agora.toISOString();
  const eventos: EventoApoio[] = [];

  for (const apoio of apoios) {
    if (!apoio.publicado) continue;

    // --- fecha_em_breve -------------------------------------------------------
    const contavel =
      apoio.estado === "aberto" &&
      apoio.alertavel &&
      // An exhausted budget means the window is already shut in practice. Counting
      // down to a deadline nobody can still meet is actively misleading.
      !apoio.dotacaoEsgotada &&
      podeContarRegressiva(apoio.fechaEm);

    if (contavel) {
      const dias = diasAte(apoio.fechaEm, agora);
      if (dias !== null && dias >= 0) {
        // Ascending, so the *tightest* threshold still ahead of the deadline wins.
        // Checking 14 first would match every day inside the fortnight and the
        // urgent 3- and 1-day warnings would never fire at all.
        for (const limiar of LIMIARES_ASCENDENTES) {
          if (dias <= limiar) {
            eventos.push({
              fundId: apoio.id,
              tipo: "fecha_em_breve",
              ocorreuEm,
              payload: { limiarDias: limiar, diasRestantes: dias, fechaEm: apoio.fechaEm.iso },
              // The threshold is part of the fingerprint, so each of 14/7/3/1 fires
              // exactly once per fund and never again, across any number of re-runs.
              impressao: impressaoEvento(apoio.id, "fecha_em_breve", { limiarDias: limiar }),
              alertavel: true,
            });
            // Only the tightest threshold crossed is worth sending today.
            break;
          }
        }
      }
    }

    // --- abriu, by the clock --------------------------------------------------
    // Announced programmes routinely slip their stated opening date, so this is
    // reported as an expectation, never as fact. The copy must say "está previsto
    // abrir hoje", and `confirmado: false` is what tells the template to do that.
    if (apoio.estado === "previsto" && podeContarRegressiva(apoio.abreEm)) {
      const dias = diasAte(apoio.abreEm, agora);
      if (dias !== null && dias <= 0) {
        eventos.push({
          fundId: apoio.id,
          tipo: "abriu",
          ocorreuEm,
          payload: { confirmado: false, abreEm: apoio.abreEm.iso },
          impressao: impressaoEvento(apoio.id, "abriu", { de: "previsto" }),
          alertavel: apoio.alertavel,
        });
      }
    }

    // --- encerrou, by the clock ----------------------------------------------
    // Flips the catalogue to the truth and stops the countdown, but sends nothing.
    // Nobody wants an email telling them they missed it.
    if (apoio.estado === "aberto" && podeContarRegressiva(apoio.fechaEm)) {
      const dias = diasAte(apoio.fechaEm, agora);
      if (dias !== null && dias < 0) {
        eventos.push({
          fundId: apoio.id,
          tipo: "encerrou",
          ocorreuEm,
          payload: { porRelogio: true, fechaEm: apoio.fechaEm.iso },
          impressao: impressaoEvento(apoio.id, "encerrou", { de: "aberto" }),
          alertavel: false,
        });
      }
    }
  }

  return eventos;
}
