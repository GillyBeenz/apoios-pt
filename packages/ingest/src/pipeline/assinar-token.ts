import { createHmac } from "node:crypto";

/**
 * Mint the ingestion token from the project's legacy JWT secret.
 *
 * Three runs failed in a row because the token was produced by hand and pasted
 * into a GitHub secret: once it was the JWT secret itself, once a
 * `sb_secret_…` project key, once a value with no dots at all. None of those
 * are a JWT, and none of them could be, because the step that turns the secret
 * into a token was being done by a person instead of by a program.
 *
 * So the program does it. Given the secret, the token is derived — it cannot be
 * the wrong kind of value, cannot carry the wrong role, and cannot be stale.
 *
 * The trade-off is real and belongs in the open: this asks the workflow to hold
 * the *signing* secret rather than one token signed with it. The secret signs
 * anything, `service_role` included, so it is the more powerful credential. What
 * it buys is that the token minted here lives fifteen minutes instead of two
 * years, and that a leaked token expires on its own. Which risk is worse depends
 * on whether you trust GitHub's secret store more than you trust a two-year
 * credential you can no longer recall the whereabouts of; both paths stay
 * supported so the choice stays yours.
 */
export function assinarTokenIngestao(segredo: string, segundosDeVida = 900): string {
  const agora = Math.floor(Date.now() / 1000);

  const cabecalho = { alg: "HS256", typ: "JWT" };
  const corpo = {
    role: "apoios_ingest",
    iss: "supabase",
    iat: agora,
    exp: agora + segundosDeVida,
  };

  const parte = (v: unknown): string =>
    Buffer.from(JSON.stringify(v)).toString("base64url");

  const assinavel = `${parte(cabecalho)}.${parte(corpo)}`;
  const assinatura = createHmac("sha256", segredo).update(assinavel).digest("base64url");

  return `${assinavel}.${assinatura}`;
}
