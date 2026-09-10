import { NextResponse, type NextRequest } from "next/server";
import {
  assinaturaValida,
  carimboRecente,
  destinatarioConhecido,
  escaparHtml,
  MAX_CORPO_BYTES,
  resumoDeErro,
  variaveisEmFalta,
} from "@/lib/correio/entrada.ts";

/**
 * Where mail to the published addresses actually lands.
 *
 * An environment variable rather than a constant because this repository is
 * public: committing the operator's personal inbox would publish it to anyone
 * who reads the source, and to every address harvester that crawls GitHub.
 * Missing means the route refuses to run — quietly dropping mail addressed to
 * rgpd@ would be worse than a loud 500 in the logs.
 */
function caixaDoOperador(): string | undefined {
  return process.env.CORREIO_OPERADOR?.trim() || undefined;
}

/** The domain whose mail we accept. Verified in Resend; the apex holds the MX. */
const DOMINIO = "appoios.guru";

export const runtime = "nodejs";

/**
 * Resend inbound webhook.
 *
 * Fires for every message Resend receives at appoios.guru, forwards the ones
 * addressed to a published alias, and acknowledges the rest. Everything that
 * decides *whether* to forward lives in lib/correio/entrada.ts, under test; this
 * file is the plumbing around it.
 */
export async function POST(request: NextRequest) {
  try {
    const segredoWebhook = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
    const chaveEnvio = process.env.RESEND_API_KEY;
    // Reading a received message needs a full_access key. Resend's sending key
    // tier answers the receiving API with `401 restricted_api_key`, confirmed
    // against a real delivery on another site — so the two keys are genuinely
    // two keys, not the same one under different names.
    const chaveRecepcao = process.env.RESEND_RECEIVING_API_KEY;
    const paraOnde = caixaDoOperador();

    const emFalta = variaveisEmFalta(process.env);
    if (emFalta.length > 0) {
      // Named individually, and only in the log. The response stays a bare
      // "not configured": telling an unauthenticated caller which secrets a
      // deployment lacks is a map of where to push.
      console.error(`[correio] Variáveis em falta: ${emFalta.join(", ")}`);
      return NextResponse.json({ erro: "Não configurado" }, { status: 500 });
    }
    if (!segredoWebhook || !chaveEnvio || !chaveRecepcao || !paraOnde) {
      // Unreachable given the check above; narrows the types for TypeScript.
      return NextResponse.json({ erro: "Não configurado" }, { status: 500 });
    }

    const bruto = await request.text();
    if (Buffer.byteLength(bruto, "utf8") > MAX_CORPO_BYTES) {
      return NextResponse.json({ erro: "Corpo demasiado grande" }, { status: 413 });
    }

    const svixId = request.headers.get("svix-id");
    const svixCarimbo = request.headers.get("svix-timestamp");
    const svixAssinatura = request.headers.get("svix-signature");
    if (!svixId || !svixCarimbo || !svixAssinatura) {
      return NextResponse.json({ erro: "Sem cabeçalhos de assinatura" }, { status: 400 });
    }
    if (!carimboRecente(svixCarimbo)) {
      return NextResponse.json({ erro: "Pedido fora de prazo" }, { status: 400 });
    }
    if (!assinaturaValida(svixId, svixCarimbo, bruto, svixAssinatura, segredoWebhook)) {
      return NextResponse.json({ erro: "Assinatura inválida" }, { status: 401 });
    }

    let carga: unknown;
    try {
      carga = JSON.parse(bruto);
    } catch {
      return NextResponse.json({ erro: "JSON inválido" }, { status: 400 });
    }
    if (typeof carga !== "object" || carga === null) {
      return NextResponse.json({ erro: "Carga malformada" }, { status: 400 });
    }

    const evento = carga as Record<string, unknown>;
    if (evento.type !== "email.received") {
      // Another subscribed event type. Acknowledged so Resend stops retrying.
      return NextResponse.json({ ok: true });
    }

    const dados = evento.data as Record<string, unknown> | undefined;
    const idMensagem = dados?.email_id;
    const para = dados?.to;
    if (typeof idMensagem !== "string" || !Array.isArray(para)) {
      return NextResponse.json({ erro: "Carga malformada" }, { status: 400 });
    }

    const destinatario = destinatarioConhecido(para, DOMINIO);
    if (!destinatario) {
      // Not an address we publish. A 200 on purpose: this is a successful
      // decision to drop, not a failure Resend should retry.
      return NextResponse.json({ ok: true });
    }

    const resposta = await fetch(
      `https://api.resend.com/emails/receiving/${idMensagem}`,
      { headers: { Authorization: `Bearer ${chaveRecepcao}` } },
    );
    if (!resposta.ok) {
      // The body, not just the status: Resend answers a sending-tier key with
      // `restricted_api_key` and a mistyped one with `invalid_api_key`, and
      // those are different fixes. Safe to log — it describes our own
      // credential's problem, never the credential.
      console.error(
        "[correio] Não consegui ler a mensagem recebida: " +
          resumoDeErro(resposta.status, await resposta.text()),
      );
      return NextResponse.json({ erro: "Falha a ler" }, { status: 502 });
    }
    const recebida = (await resposta.json()) as {
      from: string;
      subject: string;
      html: string | null;
      text: string | null;
    };

    const corpo = recebida.html
      ? recebida.html
      : `<pre style="white-space:pre-wrap;font-family:inherit;">${escaparHtml(
          recebida.text ?? "(sem conteúdo)",
        )}</pre>`;

    const envio = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${chaveEnvio}`,
      },
      body: JSON.stringify({
        // From must stay on the verified domain — putting the sender's address
        // here would fail SPF/DKIM and land the forward in spam. Their address
        // goes in reply_to, so a reply reaches them and not us.
        from: `Appoios <${destinatario}>`,
        to: paraOnde,
        reply_to: recebida.from,
        subject: `[${destinatario}] ${recebida.subject}`,
        html:
          `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">` +
          `<p style="display:inline-block;margin:0 0 14px;padding:4px 10px;background:#E6F4EC;` +
          `color:#1C5C3F;border-radius:100px;font-size:12px;font-weight:600;">` +
          `Reencaminhado de ${escaparHtml(destinatario)}</p>` +
          `<p style="margin:0 0 14px;font-size:13px;color:#666;">Enviado originalmente por ` +
          `${escaparHtml(recebida.from)}.</p>` +
          `<hr style="border:none;border-top:1px solid #E6F4EC;margin:0 0 18px;"/>${corpo}</div>`,
      }),
    });
    if (!envio.ok) {
      console.error(
        "[correio] Não consegui reencaminhar: " +
          resumoDeErro(envio.status, await envio.text()),
      );
      return NextResponse.json({ erro: "Falha a reencaminhar" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (erro) {
    console.error("[correio] Erro inesperado:", erro);
    return NextResponse.json({ erro: "Erro interno" }, { status: 500 });
  }
}
