import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { problemaComToken } from "./token-ingestao.ts";

/** Mints a token the same way scripts/assinar-token-ingestao.mjs does. */
function token(corpo: Record<string, unknown>): string {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const assinavel = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(corpo)}`;
  return `${assinavel}.${createHmac("sha256", "irrelevante").update(assinavel).digest("base64url")}`;
}

const agora = Math.floor(Date.now() / 1000);
const valido = { role: "apoios_ingest", iss: "supabase", iat: agora, exp: agora + 86400 };

/**
 * Run #6 failed with "Expected 3 parts in JWT; got 1", raised by PostgREST on the
 * first request of the first source. The message names neither the variable nor
 * the cause, and diagnosing it cost a full workflow run. The shape is knowable
 * locally — so it is checked locally.
 */
describe("problemaComToken", () => {
  it("aceita um token bem formado para o papel certo", () => {
    expect(problemaComToken(token(valido))).toBeNull();
  });

  it("apanha o que a execução #6 apanhou, e diz o que fazer", () => {
    const p = problemaComToken("sb_publishable_semPontosNenhuns");
    expect(p).toContain("3 partes");
    expect(p).toContain("SUPABASE_PUBLISHABLE_KEY");
    expect(p).toContain("assinar-token-ingestao");
  });

  it("reconhece uma chave secreta do projecto", () => {
    expect(problemaComToken("sb_secret_qualquercoisa")).toContain("ignora o RLS");
  });

  /**
   * The one that matters most: a service_role token would work perfectly and
   * hand a public Actions log a credential that reads every subscriber's email.
   */
  it("recusa a service_role, mesmo sendo um JWT válido", () => {
    const p = problemaComToken(token({ ...valido, role: "service_role" }));
    expect(p).toContain("service_role");
    expect(p).toContain("dados pessoais");
  });

  it("recusa qualquer outro papel", () => {
    expect(problemaComToken(token({ ...valido, role: "anon" }))).toContain("apoios_ingest");
  });

  it("apanha um token expirado", () => {
    const p = problemaComToken(token({ ...valido, exp: agora - 10 }));
    expect(p).toContain("expirou");
  });

  it("apanha um corpo que não é JSON", () => {
    expect(problemaComToken("aaa.nao-e-json.ccc")).toContain("não é JSON");
  });
});
