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
  extrair,
};
