/**
 * Mints the JWT the ingestion workflow authenticates with.
 *
 *   SUPABASE_JWT_SECRET='…' node scripts/assinar-token-ingestao.mjs
 *
 * Run it on your own machine. The JWT secret is read from the environment and
 * never written anywhere — not to a file, not to the terminal, not into a chat
 * transcript. That is the whole reason this script exists rather than someone
 * pasting the secret into jwt.io, which uploads it to a third party.
 *
 * Where the secret lives: Supabase dashboard → Project Settings → API →
 * JWT Settings → JWT Secret. Treat it like a root password: anything signed with
 * it is trusted by the database, including a token claiming `service_role`.
 *
 * What comes out is a token whose `role` claim is `apoios_ingest`. PostgREST
 * reads that claim and SET ROLEs to it, so the database enforces the restriction
 * — nine tables, nothing touching subscribers. Paste the output into GitHub →
 * Settings → Secrets and variables → Actions → SUPABASE_INGEST_KEY.
 */
import { createHmac } from "node:crypto";

const segredo = process.env.SUPABASE_JWT_SECRET;
if (segredo === undefined || segredo.length === 0) {
  console.error(
    "Falta SUPABASE_JWT_SECRET.\n\n" +
      "  SUPABASE_JWT_SECRET='...' node scripts/assinar-token-ingestao.mjs\n\n" +
      "Obtém-se em Project Settings → API → JWT Settings → JWT Secret.",
  );
  process.exit(1);
}

const ANOS = Number(process.env.ANOS ?? 2);
const agora = Math.floor(Date.now() / 1000);

const base64url = (dados) =>
  Buffer.from(dados).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const cabecalho = { alg: "HS256", typ: "JWT" };
const corpo = {
  role: "apoios_ingest",
  iss: "supabase",
  iat: agora,
  exp: agora + ANOS * 365 * 24 * 60 * 60,
};

const assinavel = `${base64url(JSON.stringify(cabecalho))}.${base64url(JSON.stringify(corpo))}`;
const assinatura = createHmac("sha256", segredo).update(assinavel).digest("base64url");

process.stdout.write(`${assinavel}.${assinatura}\n`);

console.error(
  `\nPapel: apoios_ingest\n` +
    `Expira: ${new Date(corpo.exp * 1000).toISOString().slice(0, 10)} ` +
    `(ANOS=${ANOS} para mudar)\n` +
    `\nGuardar como o segredo SUPABASE_INGEST_KEY no GitHub.\n` +
    `Não o commitar: quem o tiver escreve no catálogo até àquela data.\n`,
);
