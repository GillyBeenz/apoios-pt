import { describe, expect, it } from "vitest";
import {
  derParaPem,
  ehCadeiaIncompleta,
  normalizarParaPem,
  urlsDoEmissor,
} from "./cadeia-tls.ts";

/**
 * The network half of AIA chasing cannot be exercised here — this sandbox reaches no
 * government domain — but every decision it makes is pure and is pinned below.
 */
describe("urlsDoEmissor", () => {
  const INFO_ACCESS = [
    "OCSP - URI:http://ocsp.example.gov.pt",
    "CA Issuers - URI:http://crt.example.gov.pt/intermediate.crt",
    "CA Issuers - URI:https://backup.example.gov.pt/ca.der",
  ].join("\n");

  it("segue apenas os emissores, nunca o OCSP", () => {
    // An OCSP responder answers revocation queries; downloading one as if it were a
    // certificate gives a parse error instead of a usable message.
    expect(urlsDoEmissor(INFO_ACCESS)).toEqual([
      "http://crt.example.gov.pt/intermediate.crt",
      "https://backup.example.gov.pt/ca.der",
    ]);
  });

  it("aguenta certificados sem a extensão", () => {
    expect(urlsDoEmissor(undefined)).toEqual([]);
    expect(urlsDoEmissor("")).toEqual([]);
    expect(urlsDoEmissor("OCSP - URI:http://so-ocsp.example.pt")).toEqual([]);
  });

  it("ignora esquemas que não são http", () => {
    expect(urlsDoEmissor("CA Issuers - URI:ldap://directory.example.pt/cn=CA")).toEqual([]);
  });
});

describe("ehCadeiaIncompleta", () => {
  const comCodigo = (code: string): Error =>
    Object.assign(new Error("fetch failed"), {
      cause: Object.assign(new Error("tls"), { code }),
    });

  it("reconhece a cadeia incompleta, mesmo aninhada", () => {
    expect(ehCadeiaIncompleta(comCodigo("UNABLE_TO_VERIFY_LEAF_SIGNATURE"))).toBe(true);
  });

  it("não trata outros problemas de TLS como reparáveis", () => {
    // Fetching an intermediate cannot fix an expired certificate or a wrong host,
    // and retrying under a repaired chain would only hide the real reason.
    for (const c of [
      "CERT_HAS_EXPIRED",
      "ERR_TLS_CERT_ALTNAME_INVALID",
      "DEPTH_ZERO_SELF_SIGNED_CERT",
      "ENOTFOUND",
    ]) {
      expect(ehCadeiaIncompleta(comCodigo(c)), c).toBe(false);
    }
    expect(ehCadeiaIncompleta(new Error("qualquer coisa"))).toBe(false);
    expect(ehCadeiaIncompleta(null)).toBe(false);
  });
});

describe("normalizarParaPem", () => {
  it("embrulha DER em PEM com linhas de 64 caracteres", () => {
    const der = new Uint8Array(140).fill(0x41);
    const pem = normalizarParaPem(der);
    expect(pem.startsWith("-----BEGIN CERTIFICATE-----\n")).toBe(true);
    expect(pem.trimEnd().endsWith("-----END CERTIFICATE-----")).toBe(true);
    const corpo = pem.split("\n").slice(1, -2);
    expect(corpo.every((l) => l.length <= 64)).toBe(true);
  });

  it("deixa PEM em paz", () => {
    const pem = derParaPem(new Uint8Array(32).fill(7));
    expect(normalizarParaPem(new Uint8Array(Buffer.from(pem, "latin1")))).toBe(pem);
  });
});
