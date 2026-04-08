/**
 * Verifica API e web em produção (URLs públicas HTTPS).
 *
 * Uso: npx tsx menve-sales-api/scripts/smoke-production-check.ts <API_BASE> <WEB_BASE>
 * Ex.: npx tsx ... https://api.vendas.menvedigital.com.br https://vendas.menvedigital.com.br
 */

const [, , apiBaseRaw, webBaseRaw] = process.argv;

function normalizeBase(u: string | undefined) {
  if (!u?.trim()) return "";
  return u.replace(/\/$/, "");
}

async function main() {
  const apiBase = normalizeBase(apiBaseRaw);
  const webBase = normalizeBase(webBaseRaw);
  if (!apiBase || !webBase) {
    console.error(
      "Uso: npx tsx menve-sales-api/scripts/smoke-production-check.ts <API_BASE> <WEB_BASE>",
    );
    process.exit(1);
  }

  let failed = false;

  const apiHealth = await fetch(`${apiBase}/health`, { cache: "no-store" });
  const apiJson = await apiHealth.json().catch(() => ({}));
  if (!apiHealth.ok || !(apiJson as { ok?: boolean }).ok) {
    console.error("Falha: GET", `${apiBase}/health`, apiHealth.status, apiJson);
    failed = true;
  } else {
    console.log("OK:", `${apiBase}/health`, apiJson);
  }

  const tenantSlug = "vendas";
  const tenantRes = await fetch(
    `${apiBase}/tenants/by-slug/${encodeURIComponent(tenantSlug)}`,
    { cache: "no-store" },
  );
  if (!tenantRes.ok) {
    console.error(
      "Falha: GET",
      `/tenants/by-slug/${tenantSlug}`,
      tenantRes.status,
      await tenantRes.text(),
    );
    failed = true;
  } else {
    console.log("OK: tenant slug", tenantSlug);
  }

  const webHealth = await fetch(`${webBase}/api/health`, { cache: "no-store" });
  const webText = await webHealth.text();
  if (!webHealth.ok) {
    console.error("Falha: GET", `${webBase}/api/health`, webHealth.status, webText);
    failed = true;
  } else {
    console.log("OK:", `${webBase}/api/health`, webText.slice(0, 200));
  }

  if (failed) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
