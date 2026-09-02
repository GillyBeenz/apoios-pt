import type { Fonte } from "../tipos.ts";
import { ehPaginaDeErro, extrair } from "./extract.ts";

export const fundoAmbientalAac: Fonte = {
  id: "fundo-ambiental-aac",
  nome: "Fundo Ambiental — Avisos e Apoios",
  entidade: "Fundo Ambiental",
  urlBase: "https://www.fundoambiental.pt",
  // Corrected against the live site: `avisos-2026.aspx` does not exist and silently
  // serves the error page with HTTP 200. The real entry points are these.
  urlsEntrada: [
    "https://www.fundoambiental.pt/apoios-2026.aspx",
    "https://www.fundoambiental.pt/apoios-prr.aspx",
  ],
  tipo: "listagem",
  cadenciaHoras: 24,
  // Verified against markup captured from the live site.
  estado: "activa",
  // The captured page yields 47 notices. A floor of 20 catches a total break and a
  // better-than-half collapse without tripping when a few notices are retired.
  // Placeholder 1 would have caught neither.
  candidatosMin: 20,
  ehPaginaDeErro,
  extrair,
};
