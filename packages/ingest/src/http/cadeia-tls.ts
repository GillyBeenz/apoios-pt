import { X509Certificate } from "node:crypto";

/**
 * Repairing an incomplete TLS chain, the way a browser does.
 *
 * `recuperarportugal.gov.pt` presents its leaf certificate without the intermediate
 * that links it to a trusted root. Node rejects that outright —
 * `UNABLE_TO_VERIFY_LEAF_SIGNATURE` — while every browser loads the site fine,
 * because browsers quietly fetch the missing certificate from the URL the leaf
 * itself advertises (AIA chasing, RFC 5280 §4.2.2.1). It is a common
 * misconfiguration on government infrastructure and not something we can ask them
 * to fix.
 *
 * The tempting "fix" is `rejectUnauthorized: false`. That is not a fix: it accepts
 * ANY certificate, so a job running on shared CI infrastructure would happily
 * ingest whatever an interceptor served, and this pipeline's entire output is
 * information people act on with money. Instead we do what the browser does — fetch
 * the advertised issuer certificate and supply it — and keep verification ON for the
 * request that actually carries data. The intermediate has to chain to a real root
 * or the request still fails, which is the property that matters.
 */

/**
 * Pull the CA-issuer URLs out of a certificate's Authority Information Access
 * extension. Node renders it as loose text, one entry per line:
 *
 *   OCSP - URI:http://ocsp.example.gov.pt
 *   CA Issuers - URI:http://crt.example.gov.pt/intermediate.crt
 *
 * OCSP responders must not be followed here — they answer revocation queries, not
 * certificate downloads, and treating one as a certificate yields a confusing parse
 * error rather than a useful message.
 */
export function urlsDoEmissor(infoAccess: string | undefined): string[] {
  if (infoAccess === undefined) return [];
  const urls: string[] = [];
  for (const linha of infoAccess.split("\n")) {
    const m = /^CA\s*Issuers\s*-\s*URI:\s*(\S+)$/i.exec(linha.trim());
    if (m?.[1] !== undefined && /^https?:\/\//i.test(m[1])) urls.push(m[1]);
  }
  return urls;
}

/** DER is what AIA usually serves; PEM is what the TLS stack wants. */
export function derParaPem(der: Uint8Array): string {
  const b64 = Buffer.from(der).toString("base64");
  const linhas = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${linhas.join("\n")}\n-----END CERTIFICATE-----\n`;
}

/** Accepts whatever the AIA endpoint served, DER or PEM, and normalises to PEM. */
export function normalizarParaPem(bytes: Uint8Array): string {
  const texto = Buffer.from(bytes.slice(0, 64)).toString("latin1");
  if (texto.includes("-----BEGIN CERTIFICATE-----")) {
    return Buffer.from(bytes).toString("latin1");
  }
  return derParaPem(bytes);
}

/**
 * Is this the error that AIA chasing can repair?
 *
 * Deliberately narrow. An expired certificate, a wrong hostname or a self-signed
 * root are all real problems that fetching an intermediate cannot fix, and retrying
 * them under a repaired chain would only bury the reason.
 */
const CODIGOS_REPARAVEIS = new Set([
  // The server sent the leaf alone.
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  // We supplied one intermediate and it was not enough — the chain has another
  // link above it that is also missing. Real chains are routinely two deep.
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
]);

export function ehCadeiaIncompleta(erro: unknown): boolean {
  for (let e: unknown = erro, i = 0; e != null && i < 5; i += 1) {
    const codigo = (e as { code?: unknown }).code;
    if (typeof codigo === "string" && CODIGOS_REPARAVEIS.has(codigo)) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * A root certificate signs itself, and is where the walk up the chain stops. Going
 * past it would just fetch the same certificate over and over.
 */
export function ehAutoAssinado(cert: { subject: string; issuer: string }): boolean {
  return cert.subject === cert.issuer;
}

/** The certificate the host presented, read without trusting it. */
export async function certificadoApresentado(
  host: string,
  porta = 443,
): Promise<X509Certificate | null> {
  const { connect } = await import("node:tls");
  return new Promise((resolve) => {
    // `rejectUnauthorized: false` is confined to THIS connection, whose only purpose
    // is to read a public certificate. No request is sent and no response body is
    // read over it; the certificate it yields is then validated by having to chain
    // to a trusted root on the real, verified request.
    const socket = connect(
      { host, port: porta, servername: host, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerX509Certificate?.() ?? null;
        socket.destroy();
        resolve(cert ?? null);
      },
    );
    socket.setTimeout(20_000, () => {
      socket.destroy();
      resolve(null);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(null);
    });
  });
}
