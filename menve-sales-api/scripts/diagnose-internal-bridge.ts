import "./load-api-env";

/**
 * Diagnóstico ponta-a-ponta: API pública (Railway) + chave interna + usuário.
 *
 * Uso (na sua máquina, com variáveis de produção ou .env da API):
 *   DIAGNOSTIC_USER_ID=<uuid do usuário> npx tsx menve-sales-api/scripts/diagnose-internal-bridge.ts
 *
 * Opcional: INTERNAL_API_URL e INTERNAL_API_KEY no ambiente (senão usa menve-sales-api/.env).
 */
function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Defina ${name} no ambiente ou em menve-sales-api/.env`);
  return v;
}

async function main() {
  const base = need("INTERNAL_API_URL").replace(/\/$/, "");
  const key = need("INTERNAL_API_KEY");
  const userId = process.env.DIAGNOSTIC_USER_ID?.trim();

  console.log("--- Menve: diagnóstico API (bridge interno) ---\n");
  console.log(`INTERNAL_API_URL: ${base}`);

  const healthUrls = [`${base}/health`, `${base}/api/health`];
  let healthOk = false;
  for (const url of healthUrls) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      console.log(`GET ${url} → HTTP ${r.status}`);
      if (r.ok) {
        healthOk = true;
        break;
      }
    } catch (e) {
      console.log(`GET ${url} → erro:`, e instanceof Error ? e.message : e);
    }
  }
  if (!healthOk) {
    console.log(
      "\n[FALHA] API não respondeu 200 em /health. Confirme URL Railway, serviço ligado e domínio público.",
    );
    process.exit(1);
  }

  if (!userId) {
    console.log(
      "\n[OK] Health. Para validar INTERNAL_API_KEY + usuário, rode de novo com:\n" +
        "  DIAGNOSTIC_USER_ID=<uuid> npx tsx menve-sales-api/scripts/diagnose-internal-bridge.ts\n" +
        "(UUID = coluna id de User no Postgres, mesmo usuário que loga no CRM.)",
    );
    return;
  }

  const profileUrl = `${base}/auth/profile`;
  const pr = await fetch(profileUrl, {
    headers: {
      "x-api-key": key,
      "x-user-id": userId,
    },
    cache: "no-store",
  });
  const body = await pr.text();
  console.log(`\nGET ${profileUrl} (x-api-key + x-user-id) → HTTP ${pr.status}`);
  console.log(body.slice(0, 800));

  if (!pr.ok) {
    console.log(
      "\n[FALHA] Chave interna ou user id inválidos. Na Vercel, INTERNAL_API_KEY deve ser idêntico ao da Railway.",
    );
    process.exit(1);
  }

  let parsed: { tenantId?: string | null; role?: string } = {};
  try {
    parsed = JSON.parse(body) as typeof parsed;
  } catch {
    /* ignore */
  }
  console.log(
    "\n[OK] Bridge interno autenticou. O Next envia x-tenant-id = tenant da sessão ou slug do host.",
  );
  console.log(
    `    tenantId do usuário (referência): ${parsed.tenantId ?? "(null — workspace / onboarding)"}`,
  );
  console.log(
    "\nPróximo passo no CRM: abra DevTools → Network ao clicar em Conectar WhatsApp. POST /api/whatsapp/pair deve ser 200; se 403/500, leia o JSON { error }.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
