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
  // The extractor is written against the site's confirmed URL shape, but the news
  // listing template itself has not been captured yet — the notice pages already in
  // fixtures link to `listagem-noticias.aspx` and nowhere below it. Until a capture
  // confirms how many items that page actually carries, a health floor would be a
  // number invented rather than measured.
  estado: "em-captura",
  candidatosMin: 0,
  ehPaginaDeErro,
  extrair,
};
