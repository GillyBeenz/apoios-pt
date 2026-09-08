import * as z from "zod/v4";

import { EsquemaExtraccao } from "./esquema.ts";

/**
 * The output contract, stated in the prompt instead of enforced by the decoder.
 *
 * `output_config.format` compiles the schema into a decoding grammar, and this
 * schema is too big for it: execução #22 returned *"The compiled grammar is too
 * large"* even after the union count was fixed and every dead field removed. The
 * only remaining cuts were `confianca` and `evidencia` — the hallucination gate —
 * so the grammar was the thing to give up, not the evidence.
 *
 * What actually changes: the model *can* now emit something invalid. What does
 * not change: whether we would ever store it. `EsquemaExtraccao` still validates
 * every response, and `verificarProvas` still checks each quote against the source
 * text. Constrained decoding was a convenience on top of those two, never a
 * replacement for them — a syntactically perfect extraction with an invented quote
 * was always possible and was always caught downstream, not by the grammar.
 *
 * Generated from the schema rather than written by hand, so the instruction and
 * the validator cannot drift apart.
 */
const ESQUEMA_JSON = JSON.stringify(z.toJSONSchema(EsquemaExtraccao), null, 1);

export const CONTRATO_JSON = `## Formato da resposta

Responde **exclusivamente** com um objecto JSON válido que satisfaça o esquema
abaixo. Sem texto antes, sem texto depois, sem blocos de código, sem comentários.
A primeira letra da tua resposta é \`{\` e a última é \`}\`.

Regras que o esquema não consegue exprimir sozinho:

- Todos os campos são obrigatórios. Não omitas nenhum.
- Ausência de **texto** escreve-se \`""\`, nunca \`null\`.
- Ausência de **número** ou de **booleano** escreve-se \`null\`, nunca \`0\` nem
  \`false\`. Não sabermos quanto é uma coisa diferente de sabermos que é zero.
- Onde a descrição de um campo indicar \`{enum: [...]}\`, usa **exactamente** um
  desses valores.

\`\`\`json
${ESQUEMA_JSON}
\`\`\``;

/**
 * Pull the JSON object out of a response, tolerantly.
 *
 * The instruction above asks for bare JSON, and the model usually obliges — but
 * "usually" is not a contract any more, so this accepts the two things it might
 * do anyway: wrap the object in a ```json fence, or put a sentence before it.
 * It deliberately does **not** try to repair malformed JSON: a truncated or
 * mangled object should fail loudly and land in `extraccoesFalhadas`, where the
 * error names the cause, rather than be silently patched into something that
 * parses but says the wrong thing.
 */
export function extrairJson(texto: string): unknown {
  const semCerca = texto.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "");
  const inicio = semCerca.indexOf("{");
  const fim = semCerca.lastIndexOf("}");
  if (inicio === -1 || fim === -1 || fim <= inicio) return null;

  try {
    return JSON.parse(semCerca.slice(inicio, fim + 1));
  } catch {
    return null;
  }
}
