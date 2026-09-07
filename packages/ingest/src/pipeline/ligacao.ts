/**
 * Catch the two ways this goes wrong before the first query, not after.
 *
 * Both were paid for the hard way on the PostgREST path this replaces: a
 * credential that authenticates as the wrong principal fails deep inside the
 * first source, with an error naming neither the variable nor the cause.
 */
export function problemaComLigacao(url: string): string | null {
  let ligacao: URL;
  try {
    ligacao = new URL(url);
  } catch {
    return (
      "DATABASE_URL não é um URL válido. Esperava algo como " +
      "`postgresql://apoios_ingest.<ref>:<palavra-passe>@<host>:5432/postgres`."
    );
  }

  if (ligacao.protocol !== "postgres:" && ligacao.protocol !== "postgresql:") {
    return `DATABASE_URL começa por \`${ligacao.protocol}\`, esperava \`postgresql://\`.`;
  }

  // The pooler takes `<papel>.<ref>`; a direct connection takes just `<papel>`.
  const papel = decodeURIComponent(ligacao.username).split(".")[0];

  if (papel === "postgres") {
    return (
      "DATABASE_URL liga-se como `postgres`. Esse papel é dono do esquema e lê " +
      "as tabelas de subscritores, num workflow cujos logs são públicos. Use " +
      "`apoios_ingest`, cujos grants tornam esse acesso impossível em vez de " +
      "improvável."
    );
  }

  if (papel !== "apoios_ingest") {
    return (
      `DATABASE_URL liga-se como \`${papel}\`, esperava \`apoios_ingest\`. ` +
      "É o papel restrito que a migração cria; a restrição é imposta pela base " +
      "de dados, não por este código."
    );
  }

  return null;
}
