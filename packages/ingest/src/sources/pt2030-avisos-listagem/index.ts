import type { Fonte } from "../tipos.ts";
import { extrair } from "./extract.ts";

export const pt2030AvisosListagem: Fonte = {
  id: "pt2030-avisos-listagem",
  nome: "Portugal 2030 — Listagem de avisos",
  entidade: "Agência para o Desenvolvimento e Coesão",
  urlBase: "https://portugal2030.pt",
  urlsEntrada: ["https://portugal2030.pt/avisos/"],
  tipo: "listagem",
  cadenciaHoras: 24,
  // Nada neste repositório viu ainda o que esta página serve — o sandbox não
  // chega ao portugal2030.pt. Fica `em-captura` até uma captura trazer o markup
  // verdadeiro, que é exactamente para isso que o estado existe.
  estado: "em-captura",
  // Zero candidatos numa fonte por verificar é o resultado esperado e não quer
  // dizer nada. Pôr aqui um piso agora era inventar um alarme sem saber o normal.
  candidatosMin: 0,
  // A captura de 14/09/2026 resolveu a dúvida: 2,87 MB em bruto, 33 KB depois de
  // limpo, 69 ligações — todas navegação — e zero avisos. O texto visível é o
  // menu e o aviso de cookies. Esta página é montada no browser, tal como a do
  // PRR, e nenhum extractor que leia o HTML do servidor vai encontrar ali nada.
  //
  // A captura seguinte correu-a num Chromium e aí sim: 4417 caracteres visíveis,
  // os avisos lá estão. Mas o ficheiro que isso produz são 3 MB numa linha só,
  // quase tudo JavaScript, para 4417 caracteres úteis — uma fixture que ninguém
  // consegue rever num diff e que muda de hash a cada `deploy` do sítio.
  //
  // O browser mostrou também de onde vêm os avisos, e é muito melhor do que a
  // página: `POST https://portugal2030.pt/wp-json/avisos/query` devolve-os em
  // JSON. Os pedidos observados estão em
  // comum/fixtures-permanentes/pt2030-avisos-pedidos-de-dados.json.
  //
  // Por isso o browser fica desligado: a rota certa é o endpoint, não o HTML
  // renderizado, e é essa que a ronda seguinte vai seguir.
  //
  // A corrida que faltava já foi: o contrato está escrito, e o browser não tem
  // mais nada a ensinar aqui.
  //
  //   POST https://portugal2030.pt/wp-json/avisos/query
  //   Content-Type: application/x-www-form-urlencoded
  //   estadoAvisoId=7 & programaId[]×23 & order_by_field=publicacao
  //                                     & order_by_direction=desc
  //
  // devolve `{ status, avisos: [{ aviso, estrutura, calendario, documentos }] }`,
  // com código, designação, datas de publicação/início/fim e os PDFs de cada
  // aviso. É melhor do que a página em todos os sentidos: 27 KB de JSON estruturado
  // contra 3 MB de HTML de onde tudo teria de ser raspado.
  //
  // O pedido e a resposta reais estão em comum/fixtures-permanentes/
  // pt2030-avisos-query-contrato.json e ...-resposta.json — não são uma
  // reconstrução, são o que a página enviou e recebeu a 14/09/2026.
  renderizarNoNavegador: false,
  extrair,
};
