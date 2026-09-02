import type { Fonte } from "../tipos.ts";
import { extrair } from "./extract.ts";

export const fundoAmbientalAac: Fonte = {
  id: "fundo-ambiental-aac",
  nome: "Fundo Ambiental — Avisos de Abertura de Concurso",
  entidade: "Fundo Ambiental",
  urlBase: "https://www.fundoambiental.pt",
  urlsEntrada: [
    "https://www.fundoambiental.pt/avisos-2026.aspx",
    "https://www.fundoambiental.pt/apoios-prr.aspx",
  ],
  tipo: "listagem",
  cadenciaHoras: 24,
  // Deliberately conservative until real fixtures confirm the true listing size.
  // Raise this once we know what a healthy run looks like: the closer it sits to
  // the real figure, the sooner a partial selector break is caught.
  candidatosMin: 1,
  extrair,
};
