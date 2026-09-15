import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { corpoDoPedido } from "./pedido.ts";

/**
 * O contrato gravado a 14/09/2026: o pedido tal como a **própria página** o
 * enviou, capturado de um Chromium e não reconstruído.
 */
const CONTRATO = JSON.parse(
  readFileSync(
    new URL("../comum/fixtures-permanentes/pt2030-avisos-query-contrato.json", import.meta.url),
    "utf8",
  ),
);

describe("corpoDoPedido", () => {
  it("é byte a byte o corpo que a página envia", () => {
    // Não é pedantismo. Este corpo tinha quatro filtros vazios a menos do que o
    // observado — `NUTSIIId`, `fundoId`, `tipoAvisoId` e
    // `tipoModalidadeApresentacaoCandidaturaId` — durante todo o tempo em que a
    // fonte esteve activa, e ninguém reparou porque um filtro vazio parece não
    // fazer nada.
    //
    // Presente-e-vazio não é o mesmo que ausente para muitos servidores. Enquanto
    // não se souber qual dos dois este é, a única posição defensável é mandar o
    // que a página manda — e é isto que impede a diferença de voltar.
    expect(corpoDoPedido()).toBe(CONTRATO.pedido.corpo_bruto);
  });
});
