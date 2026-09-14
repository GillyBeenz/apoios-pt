import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FONTES } from "./registo.ts";

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");
const DOC = join(RAIZ, "docs", "como-funciona.html");

/**
 * `docs/como-funciona.html` é a página de orientação do projecto — como os dados
 * entram, por que caminhos, e quem decide o que aparece.
 *
 * Documentação apodrece em silêncio, e este repositório já tem a prova de como
 * isso corre mal: o pipeline levou meses a descartar o plano anual do PT2030 com
 * um comentário que dizia que as folhas «tinham o seu próprio leitor
 * determinista». O comentário estava certo sobre o leitor e errado sobre o
 * mundo, e ninguém reparou porque nada o obrigava a reparar.
 *
 * Por isso a página não fica a depender de alguém se lembrar. Isto é a mesma
 * salvaguarda que o `semear-fontes.test.ts` faz ao seed: acrescentar uma fonte
 * sem a documentar passa a ser uma build vermelha, não uma lacuna.
 *
 * O que está aqui verificado é só o que apodrece em silêncio — que fontes
 * existem e em que estado estão. As contagens do catálogo mudam todos os dias e
 * não se conseguem verificar sem rede, por isso vivem numa secção datada da
 * própria página, onde ficam obviamente velhas em vez de discretamente erradas.
 */
describe("documentação do fluxo", () => {
  const html = readFileSync(DOC, "utf8");

  it("nomeia todas as fontes do registo", () => {
    for (const f of FONTES) {
      expect(html, `${f.id} não aparece em docs/como-funciona.html`).toContain(
        f.id,
      );
    }
  });

  it("não nomeia fontes que já não existem", () => {
    // O reverso, e o mais fácil de esquecer: uma fonte arquivada deixa de estar
    // no registo e continua na página a dizer a quem lê que o sistema a lê.
    const ids = new Set(FONTES.map((f) => f.id));
    const nomeados = [...html.matchAll(/<td class="id">([a-z0-9-]+)<\/td>/g)]
      .map((m) => m[1])
      .filter((id): id is string => id !== undefined)
      // A tabela das tarefas `pg_cron` usa a mesma classe e não são fontes.
      .filter((id) => id.includes("-") && !id.startsWith("varrimento"));

    for (const id of nomeados) {
      if (/^(assinalar|vigia|emparelhar|enviar|confirmar)/.test(id)) continue;
      expect(ids.has(id), `${id} está documentado mas não está no registo`).toBe(
        true,
      );
    }
  });

  it("mostra o estado certo de cada fonte", () => {
    // Promover uma fonte a `activa` e deixar a página a dizer `em-captura` é a
    // forma mais provável de isto divergir, porque a promoção é uma linha só.
    //
    // A âncora é a célula da tabela, e não a primeira vez que o id aparece: os
    // ids também estão nos rótulos das figuras, e a primeira versão deste teste
    // apanhou-se a ler um `<text>` de um SVG à procura de um estado.
    const linhas = html.split("\n");
    for (const f of FONTES) {
      const i = linhas.findIndex((l) =>
        l.includes(`<td class="id">${f.id}</td>`),
      );
      expect(i, `${f.id} não está na tabela das fontes`).toBeGreaterThanOrEqual(
        0,
      );

      const bloco = linhas.slice(i, i + 4).join(" ");
      expect(bloco, `${f.id}: estado documentado não é ${f.estado}`).toContain(
        f.estado,
      );
    }
  });
});
