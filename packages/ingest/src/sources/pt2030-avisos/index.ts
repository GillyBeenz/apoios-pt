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
  estado: "em-captura",
  candidatosMin: 0,
  extrair,
};
