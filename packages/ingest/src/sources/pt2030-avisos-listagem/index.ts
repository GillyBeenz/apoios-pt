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
  // Está `true` outra vez, e por pouco tempo. Saber que existe um
  // `POST /wp-json/avisos/query` não chega para lá bater: falta o corpo que ele
  // espera e a forma do que devolve, e nada disso se adivinha de fora. A captura
  // passou a registar as duas coisas, por isso esta corrida serve para aprender o
  // contrato — e assim que ele estiver escrito num ficheiro, isto volta a `false`
  // e a fonte passa a falar directamente com o endpoint.
  //
  // O HTML de 3 MB que esta corrida produz não é para fundir. O que interessa é o
  // `.rede.json` ao lado dele.
  renderizarNoNavegador: true,
  extrair,
};
