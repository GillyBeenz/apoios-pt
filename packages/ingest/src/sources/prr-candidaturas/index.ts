import type { Fonte } from "../tipos.ts";
import { extrair } from "./extract.ts";

export const prrCandidaturas: Fonte = {
  id: "prr-candidaturas",
  nome: "PRR — Candidaturas",
  entidade: "Estrutura de Missão Recuperar Portugal",
  urlBase: "https://recuperarportugal.gov.pt",
  urlsEntrada: [
    // The human page. Captured and confirmed to be useless for extraction: it serves
    // 1514 characters of visible text, all of it navigation. The notices are rendered
    // client-side through admin-ajax, so no pure extract(html) can ever see them.
    "https://recuperarportugal.gov.pt/candidaturas-prr/",
    // Which is why this is here: the WordPress REST representation of that same page
    // (ID 20182). If the notices live in the page content rather than in a separate
    // AJAX call, they are here — as JSON, which beats scraping outright.
    "https://recuperarportugal.gov.pt/wp-json/wp/v2/pages/20182",
    // A stable, unversioned path — worth capturing on its own account, since it is
    // the forward plan rather than what is open today. This one already works, and
    // is the first real PDF any capture has brought back.
    "https://recuperarportugal.gov.pt/wp-content/uploads/ap/plano-de-avisos.pdf",
  ],
  tipo: "listagem",
  cadenciaHoras: 24,
  estado: "em-captura",
  candidatosMin: 0,
  extrair,
};
