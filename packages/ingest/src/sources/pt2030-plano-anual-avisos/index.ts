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
  // The link-finding rule keys on the href extension, so it does not depend on the
  // page's markup — but nothing here is verified until a capture proves the file is
  // reachable and the sheet's columns are what they are assumed to be.
  estado: "em-captura",
  candidatosMin: 0,
  extrair,
};
