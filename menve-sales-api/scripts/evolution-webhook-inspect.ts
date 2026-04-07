import "./load-api-env";

/**
 * Mostra o webhook configurado na Evolution para uma instância (eventos, URL, etc.).
 *
 * Uso (na pasta menve-sales-api ou na raiz do monorepo com tsx apontando para este arquivo):
 *   npx tsx menve-sales-api/scripts/evolution-webhook-inspect.ts menvecmnlwm0lf0003ui5whcu748xj
 *
 * Confira se a lista `events` contém MESSAGES_UPSERT ou messages.upsert.
 */

const base = process.env.EVOLUTION_BASE_URL?.replace(/\/$/, "");
const apiKey = process.env.EVOLUTION_API_KEY?.trim();
const instanceName = process.argv[2]?.trim();

if (!base || !apiKey) {
  console.error("Defina EVOLUTION_BASE_URL e EVOLUTION_API_KEY em menve-sales-api/.env");
  process.exit(1);
}
if (!instanceName) {
  console.error(
    "Uso: npx tsx scripts/evolution-webhook-inspect.ts <instanceName>\n" +
      "  (o instanceName aparece no JSON do webhook, ex.: menvecmnlwm0lf0003ui5whcu748xj)",
  );
  process.exit(1);
}

async function main() {
  const paths = [
    `/webhook/find/${encodeURIComponent(instanceName)}`,
    `/webhook/get/${encodeURIComponent(instanceName)}`,
  ];

  for (const path of paths) {
    const url = `${base}${path}`;
    const res = await fetch(url, { headers: { apikey: apiKey } });
    const text = await res.text();
    console.log(`\n--- GET ${path} → HTTP ${res.status} ---\n`);
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      console.log(text);
    }
    if (res.ok) break;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
