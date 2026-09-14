import type { Fonte } from "../tipos.ts";
import { extrair } from "./extract.ts";

export const prrCandidaturas: Fonte = {
  id: "prr-candidaturas",
  nome: "PRR — Candidaturas",
  entidade: "Estrutura de Missão Recuperar Portugal",
  urlBase: "https://recuperarportugal.gov.pt",
  urlsEntrada: [
    // The human page. Captured and confirmed useless for extraction: 1514 characters
    // of visible text, all navigation. The notices are rendered client-side.
    //
    // The WordPress REST representation of this page was tried next, and settles it:
    // `content.rendered` is ZERO bytes and `acf` is an empty array — the page has no
    // content in the CMS at all. The whole listing is assembled in the browser, so
    // there is no static representation to extract from, by any route.
    // Evidence kept at comum/fixtures-permanentes/prr-pagina-20182-vazia.json.
    //
    // Reaching it would need a headless browser, which this pipeline deliberately
    // does not have: every extractor here is pure and testable offline against a
    // committed fixture, and that property is worth more than this one listing.
    // The source therefore stays `em-captura`, and the PDF below carries its value.
    "https://recuperarportugal.gov.pt/candidaturas-prr/",
    // A stable, unversioned path — worth capturing on its own account, since it is
    // the forward plan rather than what is open today. This one already works, and
    // is the first real PDF any capture has brought back.
    "https://recuperarportugal.gov.pt/wp-content/uploads/ap/plano-de-avisos.pdf",
  ],
  tipo: "listagem",
  cadenciaHoras: 24,
  estado: "em-captura",
  candidatosMin: 0,
  // Esteve `true` durante uma captura, para responder a uma pergunta concreta:
  // se a página é montada no browser, o browser encontra os avisos?
  //
  // Encontra nada. A captura de 14/09/2026 correu a página num Chromium a sério e
  // trouxe **1568 caracteres visíveis** contra os 1514 de um `fetch` simples — 54
  // caracteres de diferença, todos do aviso de cookies. Os únicos pedidos de rede
  // que a página faz são telemetria (`analytics.google.com` e um endpoint de
  // eventos), registados em comum/fixtures-permanentes/prr-candidaturas-pedidos-de-dados.json.
  //
  // Não há aqui dados a montar: nem no `content.rendered` do WordPress (zero
  // bytes), nem no HTML do servidor, nem depois de o JavaScript correr, nem em
  // nenhum pedido que a página faça. Voltar a ligar o browser custa minutos de
  // captura e 3 MB de fixture por zero avisos, por isso fica desligado — e fica
  // escrito porquê, para a pergunta não voltar a ser feita às cegas.
  //
  // O valor desta fonte está no PDF do plano de avisos, que já é lido.
  renderizarNoNavegador: false,
  extrair,
};
