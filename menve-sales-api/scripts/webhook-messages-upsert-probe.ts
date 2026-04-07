import "./load-api-env";

/**
 * Simula um POST igual ao da Evolution (`messages.upsert`) na URL pública do webhook.
 * Serve para separar:
 * - Se aparecer no ngrok 4040 e a API responder OK → túnel + Menve OK; falta a Evolution enviar de verdade.
 * - Se não aparecer / 502 → ngrok, PUBLIC_APP_URL ou API.
 *
 * Uso:
 *   Defina PUBLIC_APP_URL com a URL HTTPS atual do ngrok (menve-sales-api/.env).
 *   npx tsx scripts/webhook-messages-upsert-probe.ts cmnlwm0lf0003ui5whcu748xj
 */

async function main() {
  const connectionId = process.argv[2]?.trim();
  const base =
    process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  if (!connectionId) {
    console.error(
      "Uso: npx tsx scripts/webhook-messages-upsert-probe.ts <connectionId>",
    );
    process.exit(1);
  }
  if (!base) {
    console.error(
      "Defina PUBLIC_APP_URL (URL https do ngrok) em menve-sales-api/.env",
    );
    process.exit(1);
  }

  const url = `${base}/webhooks/whatsapp/evolution/${connectionId}`;
  const externalId = `probe-upsert-${Date.now()}`;
  const body = {
    event: "messages.upsert",
    instance: "probe",
    data: {
      key: {
        id: externalId,
        remoteJid: "5511999999999@s.whatsapp.net",
        fromMe: false,
      },
      message: { conversation: "probe manual messages.upsert" },
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
    destination: url,
    date_time: new Date().toISOString(),
    server_url: "probe",
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET?.trim();
  if (secret) headers["x-webhook-secret"] = secret;

  console.log("POST", url);
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log("HTTP", res.status, text.slice(0, 500));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
