import type { Fonte } from "../tipos.ts";
import { ehPaginaDeErro, extrair } from "./extract.ts";

export const fundoAmbientalNoticias: Fonte = {
  id: "fundo-ambiental-noticias",
  nome: "Fundo Ambiental — Notícias",
  entidade: "Fundo Ambiental",
  urlBase: "https://www.fundoambiental.pt",
  urlsEntrada: ["https://www.fundoambiental.pt/listagem-noticias.aspx"],
  tipo: "noticias",
  // Faster than the notice listings: this source exists to catch a republication or
  // a budget reinforcement on the day it is announced, which is exactly when the
  // remaining application window is shortest.
  cadenciaHoras: 12,
  // Verified against the captured listing.
  estado: "activa",
  // The captured page carries ten notice-shaped links: four real notices, five
  // monthly payment reports, one pagination control. A floor of 2 is deliberately
  // low, because news volume genuinely varies — a quiet fortnight is normal here in
  // a way it is not for the notice listings. It still catches a total break, which
  // is the failure that silently stops every alert.
  candidatosMin: 2,
  ehPaginaDeErro,
  extrair,
};
