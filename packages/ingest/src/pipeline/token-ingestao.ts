/**
 * Sanity-check the ingestion token before the first request.
 *
 * Without this the failure surfaces as a PostgREST error deep inside the first
 * source — "Expected 3 parts in JWT; got 1" — which names neither the variable
 * nor the likely cause. That cost a whole workflow run to diagnose. The token's
 * shape is checkable locally, in microseconds, so check it locally.
 *
 * This is a shape check, not an authentication check: the signature cannot be
 * verified here (that needs the project's JWT secret, which deliberately never
 * leaves Supabase). A token that passes here can still be rejected as forged.
 */
export function problemaComToken(token: string): string | null {
  const partes = token.split(".");

  if (partes.length !== 3) {
    const pista = token.startsWith("sb_publishable_")
      ? " Isto parece a chave publicável — essa vai em SUPABASE_PUBLISHABLE_KEY."
      : token.startsWith("sb_secret_")
        ? " Isto parece uma chave secreta do projecto, que ignora o RLS. Não a use aqui."
        : "";

    return (
      `SUPABASE_INGEST_KEY não é um JWT: esperava 3 partes separadas por ponto, ` +
      `tem ${partes.length}.${pista} Gere o token com ` +
      `\`SUPABASE_JWT_SECRET='...' node scripts/assinar-token-ingestao.mjs\`.`
    );
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = JSON.parse(Buffer.from(partes[1]!, "base64url").toString()) as Record<
      string,
      unknown
    >;
  } catch {
    return "SUPABASE_INGEST_KEY tem três partes mas o corpo não é JSON válido em base64url.";
  }

  const papel = corpo["role"];

  // The whole design rests on this token being the restricted role. A
  // service_role token would work — and would hand a public Actions log a
  // credential that reads every subscriber's email. Refuse it outright.
  if (papel === "service_role") {
    return (
      "SUPABASE_INGEST_KEY tem `role: service_role`. Essa chave ignora o RLS e lê " +
      "as tabelas de dados pessoais, num workflow cujos logs são públicos. " +
      "Use um token com `role: apoios_ingest`."
    );
  }

  if (papel !== "apoios_ingest") {
    return (
      `SUPABASE_INGEST_KEY tem \`role: ${JSON.stringify(papel)}\`, esperava ` +
      `"apoios_ingest". O PostgREST assume o papel desta claim, por isso um papel ` +
      "errado escreve com permissões erradas — ou nenhumas."
    );
  }

  const exp = corpo["exp"];
  if (typeof exp === "number" && exp * 1000 < Date.now()) {
    return `SUPABASE_INGEST_KEY expirou em ${new Date(exp * 1000).toISOString().slice(0, 10)}.`;
  }

  return null;
}
