import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The local parts this domain actually answers to.
 *
 * The receiving MX is on the apex, so Resend catches mail for *every* address at
 * appoios.guru — including whatever a spammer invents. This list is what turns
 * "catch-all" back into "the four addresses we published", and everything else is
 * acknowledged and dropped. Without it a typo'd or harvested address at the domain
 * would relay straight into a real inbox.
 *
 * `contacto` is not optional: `USER_AGENT` in packages/ingest/src/http/tipos.ts
 * announces contacto@appoios.guru to every government site the crawler reads, so
 * that address has to receive mail for the crawler's self-identification to be
 * honest. `rgpd` is the RGPD contact point on /privacidade — a data subject who
 * writes there and gets a bounce has been denied a right, not inconvenienced.
 */
export const ALIASES = ["contacto", "rgpd", "alertas", "abuso"] as const;

/** Anything larger is not a message we forward; Resend's own cap is well under this. */
export const MAX_CORPO_BYTES = 256 * 1024;

/** Svix's recommended replay window. */
export const TOLERANCIA_SEGUNDOS = 5 * 60;

export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Which of the `to` addresses we recognise, if any.
 *
 * Returns the canonical lowercase address so the forwarded mail is tagged with a
 * stable string, whatever casing the sender used. A message addressed to both a
 * known and an unknown address is forwarded once, under the known one.
 */
export function destinatarioConhecido(
  para: readonly unknown[],
  dominio: string,
): string | null {
  const conhecidos = new Set(ALIASES.map((a) => `${a}@${dominio.toLowerCase()}`));
  for (const entrada of para) {
    if (typeof entrada !== "string") continue;
    // Resend may hand us "Nome <caixa@dominio>" as well as a bare address.
    const endereco = (entrada.match(/<([^>]+)>/)?.[1] ?? entrada)
      .trim()
      .toLowerCase();
    if (conhecidos.has(endereco)) return endereco;
  }
  return null;
}

/**
 * Verify a Svix-signed webhook by hand.
 *
 * Deliberately not adding the `svix` package: this repo already verifies HMACs in
 * exactly this shape (see the ingestion token in .github/workflows), and a webhook
 * receiver is precisely the place not to widen the dependency surface. The
 * signature header carries space-separated `v1,<base64>` entries — a secret being
 * rotated puts two there — so every candidate is checked and any match is enough.
 *
 * `timingSafeEqual` throws on a length mismatch, hence the guard before it.
 */
export function assinaturaValida(
  id: string,
  carimbo: string,
  corpo: string,
  cabecalhoAssinatura: string,
  segredo: string,
): boolean {
  const bytesSegredo = Buffer.from(segredo.replace(/^whsec_/, ""), "base64");
  const assinado = `${id}.${carimbo}.${corpo}`;
  const esperado = Buffer.from(
    createHmac("sha256", bytesSegredo).update(assinado).digest("base64"),
  );

  return cabecalhoAssinatura
    .split(" ")
    .map((entrada) => entrada.split(",")[1])
    .filter((s): s is string => Boolean(s))
    .some((candidato) => {
      const bytes = Buffer.from(candidato);
      return bytes.length === esperado.length && timingSafeEqual(bytes, esperado);
    });
}

/** True when the webhook's timestamp is inside the replay window. */
export function carimboRecente(carimbo: string, agoraMs = Date.now()): boolean {
  const segundos = Number(carimbo);
  return (
    Number.isFinite(segundos) &&
    Math.abs(agoraMs / 1000 - segundos) <= TOLERANCIA_SEGUNDOS
  );
}

/** The environment variables the inbound route cannot run without. */
export const VARIAVEIS_OBRIGATORIAS = [
  "RESEND_INBOUND_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "RESEND_RECEIVING_API_KEY",
  "CORREIO_OPERADOR",
] as const;

/**
 * Which required variables are absent or blank, by name.
 *
 * The first version of this check logged all four names whenever any one was
 * missing, which is exactly no help at the moment you are reading the log to
 * find out which one you forgot. Naming them individually turns a five-minute
 * hunt through the Vercel dashboard into one line.
 *
 * A variable set to whitespace counts as missing: an env var pasted with a
 * stray newline is indistinguishable from a forgotten one in its effect, and
 * far harder to spot by eye.
 *
 * Only ever written to the server log. The HTTP response stays a bare "not
 * configured" — telling an unauthenticated caller which secrets a deployment
 * is missing is a map of where to push.
 */
export function variaveisEmFalta(
  ambiente: Readonly<Record<string, string | undefined>>,
): readonly string[] {
  return VARIAVEIS_OBRIGATORIAS.filter(
    (nome) => (ambiente[nome] ?? "").trim() === "",
  );
}
