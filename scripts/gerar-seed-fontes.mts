/**
 * Regenerates supabase/migrations/0003_semear_fontes.sql from the source registry.
 *
 *   node --experimental-strip-types scripts/gerar-seed-fontes.mts > \
 *     supabase/migrations/0003_semear_fontes.sql
 *
 * The generating function lives in the ingest package, next to the registry it
 * reads; this is only the command-line wrapper.
 */
import { seedDeFontes } from "../packages/ingest/src/sources/seed-sql.ts";

process.stdout.write(seedDeFontes());
