import type { Fonte } from "../tipos.ts";
import { extrair } from "./extract.ts";

export const pt2030PlanoAnualAvisos: Fonte = {
  id: "pt2030-plano-anual-avisos",
  nome: "Portugal 2030 — Plano Anual de Avisos",
  entidade: "Agência para o Desenvolvimento e Coesão",
  urlBase: "https://portugal2030.pt",
  urlsEntrada: ["https://portugal2030.pt/plano-anual-de-avisos/"],
  tipo: "dataset",
  // The plan is revised a few times a year, not daily. Weekly is frequent enough to
  // catch a revision while it still describes something in the future.
  cadenciaHoras: 168,
  // Verified: the capture found the .xlsx on the first try, and folha.ts reads all
  // 211 planned notices out of it.
  estado: "activa",
  // Exactly one file is expected. There is no partial-break mode here — either the
  // download link is on the page or it is not — so 1 is a meaningful floor, unlike
  // on a listing where it would hide a collapse from forty entries to one.
  candidatosMin: 1,
  extrair,
};
