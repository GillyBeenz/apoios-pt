import type { Fonte } from "../tipos.ts";
import { extrair } from "./extract.ts";

export const pt2030Avisos: Fonte = {
  id: "pt2030-avisos",
  nome: "Portugal 2030 — Avisos",
  entidade: "Agência para o Desenvolvimento e Coesão",
  urlBase: "https://portugal2030.pt",
  urlsEntrada: ["https://portugal2030.pt/category/avisos/"],
  tipo: "listagem",
  cadenciaHoras: 24,
  // Verified against the captured archive page.
  estado: "activa",
  // Six posts per archive page. A floor of 3 catches a total break and a
  // better-than-half collapse; the archive paginates at /page/N/, so a quiet week
  // still fills page one.
  candidatosMin: 3,
  extrair,
};
