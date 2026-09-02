import type { Fonte } from "../tipos.ts";
import { extrair } from "./extract.ts";

export const prrCandidaturas: Fonte = {
  id: "prr-candidaturas",
  nome: "PRR — Candidaturas",
  entidade: "Estrutura de Missão Recuperar Portugal",
  urlBase: "https://recuperarportugal.gov.pt",
  urlsEntrada: [
    "https://recuperarportugal.gov.pt/candidaturas-prr/",
    // A stable, unversioned path — worth capturing on its own account, since it is
    // the forward plan rather than what is open today.
    "https://recuperarportugal.gov.pt/wp-content/uploads/ap/plano-de-avisos.pdf",
  ],
  tipo: "listagem",
  cadenciaHoras: 24,
  estado: "em-captura",
  candidatosMin: 0,
  extrair,
};
