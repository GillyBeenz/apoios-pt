import { describe, expect, it } from "vitest";
import {
  CANONICO,
  CONTADOS,
  NAO_CANONICOS,
  destinoCanonico,
  ehContado,
  normalizarHost,
} from "./dominios.ts";

describe("destinoCanonico", () => {
  it("deixa passar o canónico", () => {
    expect(destinoCanonico("appoios.guru")).toBe(null);
  });

  it("manda o defensivo para o canónico", () => {
    expect(destinoCanonico("apoios.guru")).toBe(CANONICO);
    expect(destinoCanonico("www.apoios.guru")).toBe(CANONICO);
  });

  it("manda o www para o canónico", () => {
    // Sem isto, o www serve a mesma página no seu próprio hostname: conteúdo
    // duplicado para um motor de busca e, pior, um cookie de sessão posto num
    // dos hosts é invisível ao outro — entrar no www e voltar mais tarde ao
    // canónico parece ficar sem sessão sem razão nenhuma.
    expect(destinoCanonico("www.appoios.guru")).toBe(CANONICO);
  });

  it("nunca manda o canónico para si próprio", () => {
    // O ciclo infinito que esta função existe para tornar impossível de escrever
    // por acidente.
    expect(NAO_CANONICOS.has(CANONICO)).toBe(false);
    expect(destinoCanonico(CANONICO)).toBe(null);
  });

  it("não toca num host que não é nosso", () => {
    // Um pedido com um Host: forjado não é redirigido para o nosso domínio, o
    // que faria de nós um redirector aberto.
    expect(destinoCanonico("exemplo.pt")).toBe(null);
    expect(destinoCanonico("appoios.guru.evil.com")).toBe(null);
    expect(destinoCanonico("")).toBe(null);
  });

  it("é indiferente a maiúsculas e à porta", () => {
    expect(destinoCanonico("WWW.Appoios.Guru")).toBe(CANONICO);
    expect(destinoCanonico("apoios.guru:443")).toBe(CANONICO);
    expect(destinoCanonico("appoios.guru:3000")).toBe(null);
  });
});

describe("normalizarHost", () => {
  it("tira a porta e baixa a caixa", () => {
    expect(normalizarHost("Appoios.Guru:3000")).toBe("appoios.guru");
  });

  it("não confunde uma porta com um sufixo qualquer", () => {
    expect(normalizarHost("appoios.guru:8080")).toBe("appoios.guru");
    expect(normalizarHost("appoios.guru")).toBe("appoios.guru");
  });
});

describe("ehContado", () => {
  it("conta os quatro hosts nossos", () => {
    for (const h of ["appoios.guru", "www.appoios.guru", "apoios.guru", "www.apoios.guru"]) {
      expect(ehContado(h)).toBe(true);
    }
  });

  it("conta o canónico, que é o denominador", () => {
    // Sem o canónico não há denominador, e «vale a pena renovar o defensivo?»
    // não tem resposta.
    expect(CONTADOS.has(CANONICO)).toBe(true);
  });

  it("ignora um host desconhecido", () => {
    // `registar_acesso_dominio` tem a sua própria lista fechada (migração 0006),
    // mas não vale a pena fazer o pedido para o descobrir.
    expect(ehContado("exemplo.pt")).toBe(false);
  });
});
