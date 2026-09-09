import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ALIASES,
  assinaturaValida,
  carimboRecente,
  destinatarioConhecido,
  escaparHtml,
  TOLERANCIA_SEGUNDOS,
  variaveisEmFalta,
} from "./entrada.ts";

const SEGREDO = `whsec_${Buffer.from("segredo-de-teste-com-tamanho").toString("base64")}`;

function assinar(id: string, carimbo: string, corpo: string, segredo = SEGREDO): string {
  const bytes = Buffer.from(segredo.replace(/^whsec_/, ""), "base64");
  const mac = createHmac("sha256", bytes)
    .update(`${id}.${carimbo}.${corpo}`)
    .digest("base64");
  return `v1,${mac}`;
}

describe("assinaturaValida", () => {
  const id = "msg_2abc";
  const carimbo = "1757443200";
  const corpo = '{"type":"email.received"}';

  it("aceita uma assinatura correcta", () => {
    expect(
      assinaturaValida(id, carimbo, corpo, assinar(id, carimbo, corpo), SEGREDO),
    ).toBe(true);
  });

  it("rejeita um corpo alterado", () => {
    const assinatura = assinar(id, carimbo, corpo);
    expect(
      assinaturaValida(id, carimbo, '{"type":"email.spoofed"}', assinatura, SEGREDO),
    ).toBe(false);
  });

  it("rejeita quando o carimbo assinado não é o enviado", () => {
    // O carimbo entra no conteúdo assinado precisamente para que reenviar um
    // pedido antigo com um carimbo novo não passe.
    const assinatura = assinar(id, carimbo, corpo);
    expect(assinaturaValida(id, "1757529600", corpo, assinatura, SEGREDO)).toBe(false);
  });

  it("rejeita um segredo errado", () => {
    const outro = `whsec_${Buffer.from("outro-segredo-qualquer-aqui").toString("base64")}`;
    expect(
      assinaturaValida(id, carimbo, corpo, assinar(id, carimbo, corpo, outro), SEGREDO),
    ).toBe(false);
  });

  it("aceita quando uma de várias assinaturas serve, como durante uma rotação", () => {
    const cabecalho = `v1,QUJD v1,REVG ${assinar(id, carimbo, corpo)}`;
    expect(assinaturaValida(id, carimbo, corpo, cabecalho, SEGREDO)).toBe(true);
  });

  it("não estoira num cabeçalho de tamanho diferente", () => {
    // timingSafeEqual atira se os comprimentos diferirem; a guarda tem de estar lá.
    expect(() => assinaturaValida(id, carimbo, corpo, "v1,curto", SEGREDO)).not.toThrow();
    expect(assinaturaValida(id, carimbo, corpo, "v1,curto", SEGREDO)).toBe(false);
  });

  it("rejeita um cabeçalho sem qualquer assinatura", () => {
    expect(assinaturaValida(id, carimbo, corpo, "", SEGREDO)).toBe(false);
    expect(assinaturaValida(id, carimbo, corpo, "v1", SEGREDO)).toBe(false);
  });
});

describe("carimboRecente", () => {
  const agora = 1_757_443_200_000;

  it("aceita um carimbo de agora", () => {
    expect(carimboRecente("1757443200", agora)).toBe(true);
  });

  it("rejeita um carimbo fora da janela, dos dois lados", () => {
    const fora = TOLERANCIA_SEGUNDOS + 60;
    expect(carimboRecente(String(1_757_443_200 - fora), agora)).toBe(false);
    expect(carimboRecente(String(1_757_443_200 + fora), agora)).toBe(false);
  });

  it("rejeita lixo em vez de o tratar como zero", () => {
    // Number("") é 0, que fica a 55 anos de distância e portanto fora da janela,
    // mas Number("abc") é NaN e as comparações com NaN são todas falsas — sem o
    // isFinite explícito o `Math.abs(...) > tolerancia` deixaria isto passar.
    expect(carimboRecente("abc", agora)).toBe(false);
    expect(carimboRecente("", agora)).toBe(false);
  });
});

describe("destinatarioConhecido", () => {
  const dominio = "appoios.guru";

  it("reconhece um endereço da lista", () => {
    expect(destinatarioConhecido(["contacto@appoios.guru"], dominio)).toBe(
      "contacto@appoios.guru",
    );
  });

  it("é indiferente a maiúsculas e devolve a forma canónica", () => {
    expect(destinatarioConhecido(["RGPD@Appoios.Guru"], dominio)).toBe(
      "rgpd@appoios.guru",
    );
  });

  it("aceita a forma com nome, que o Resend também usa", () => {
    expect(destinatarioConhecido(['"Apoios" <contacto@appoios.guru>'], dominio)).toBe(
      "contacto@appoios.guru",
    );
  });

  it("ignora um endereço desconhecido no mesmo domínio", () => {
    // É este o ponto da lista: o MX apanha o domínio inteiro, e sem isto qualquer
    // endereço inventado por um spammer seria reencaminhado para uma caixa real.
    expect(destinatarioConhecido(["vendas@appoios.guru"], dominio)).toBe(null);
  });

  it("ignora outro domínio, mesmo com um alias conhecido", () => {
    expect(destinatarioConhecido(["contacto@outrodominio.pt"], dominio)).toBe(null);
  });

  it("escolhe o conhecido quando vem misturado com desconhecidos", () => {
    expect(
      destinatarioConhecido(
        ["lixo@appoios.guru", "rgpd@appoios.guru"],
        dominio,
      ),
    ).toBe("rgpd@appoios.guru");
  });

  it("aguenta entradas que não são strings", () => {
    expect(destinatarioConhecido([null, 42, { a: 1 }], dominio)).toBe(null);
  });

  it("inclui o contacto que o recolector anuncia", () => {
    // packages/ingest/src/http/tipos.ts promete contacto@appoios.guru no
    // User-Agent a todos os sites do Estado. Tirar este alias da lista torna essa
    // promessa falsa, e é por isso que existe um teste a prendê-los.
    expect(ALIASES).toContain("contacto");
  });
});

describe("escaparHtml", () => {
  it("neutraliza marcação vinda do remetente", () => {
    expect(escaparHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("escapa o & primeiro, para não desfazer o próprio escape", () => {
    expect(escaparHtml("<&>")).toBe("&lt;&amp;&gt;");
  });
});

describe("variaveisEmFalta", () => {
  const completo = {
    RESEND_INBOUND_WEBHOOK_SECRET: "whsec_abc",
    RESEND_API_KEY: "re_envio",
    RESEND_RECEIVING_API_KEY: "re_recepcao",
    CORREIO_OPERADOR: "alguem@exemplo.pt",
  };

  it("não devolve nada quando está tudo lá", () => {
    expect(variaveisEmFalta(completo)).toEqual([]);
  });

  it("nomeia a que falta, e só essa", () => {
    // O ponto todo desta função. A primeira versão registava os quatro nomes
    // sempre que faltava um, que é precisamente nenhuma ajuda no momento em que
    // se está a ler o log para descobrir qual se esqueceu.
    const { RESEND_RECEIVING_API_KEY: _, ...semRecepcao } = completo;
    expect(variaveisEmFalta(semRecepcao)).toEqual(["RESEND_RECEIVING_API_KEY"]);
  });

  it("nomeia várias, pela ordem declarada", () => {
    expect(variaveisEmFalta({ RESEND_API_KEY: "re_envio" })).toEqual([
      "RESEND_INBOUND_WEBHOOK_SECRET",
      "RESEND_RECEIVING_API_KEY",
      "CORREIO_OPERADOR",
    ]);
  });

  it("conta como em falta uma variável só com espaços", () => {
    // Uma variável colada com um \n a mais é indistinguível de uma esquecida no
    // efeito, e muito mais difícil de ver a olho no painel da Vercel.
    expect(variaveisEmFalta({ ...completo, CORREIO_OPERADOR: "  \n " })).toEqual([
      "CORREIO_OPERADOR",
    ]);
  });

  it("ignora variáveis alheias", () => {
    expect(variaveisEmFalta({ ...completo, OUTRA_QUALQUER: "" })).toEqual([]);
  });
});
