import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

function loadDotEnvIfAvailable() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    const value = raw.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function optionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

async function checkHealth(appUrl: string): Promise<CheckResult> {
  try {
    const res = await fetch(`${appUrl.replace(/\/$/, "")}/api/health`);
    if (!res.ok) {
      return {
        name: "health",
        ok: false,
        detail: `HTTP ${res.status}`,
      };
    }
    return { name: "health", ok: true, detail: "ok" };
  } catch (error) {
    return {
      name: "health",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkWebhookAuth(args: {
  appUrl: string;
  connectionId: string;
  webhookSecret: string;
}): Promise<CheckResult> {
  const webhookUrl = `${args.appUrl.replace(/\/$/, "")}/api/webhooks/whatsapp/evolution/${args.connectionId}`;
  const payload = {
    data: {
      messages: [
        {
          key: {
            id: `probe-${Date.now()}`,
            remoteJid: "5511999999999@s.whatsapp.net",
            fromMe: false,
          },
          message: { conversation: "probe" },
          messageTimestamp: Math.floor(Date.now() / 1000),
        },
      ],
    },
  };

  try {
    const unauthorized = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (unauthorized.status !== 401) {
      return {
        name: "webhook-secret-unauthorized",
        ok: false,
        detail: `expected 401, got ${unauthorized.status}`,
      };
    }

    const authorized = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": args.webhookSecret,
      },
      body: JSON.stringify(payload),
    });
    if (!authorized.ok) {
      return {
        name: "webhook-secret-authorized",
        ok: false,
        detail: `expected 2xx, got ${authorized.status}`,
      };
    }

    return {
      name: "webhook-secret",
      ok: true,
      detail: "401 without header and 2xx with correct secret",
    };
  } catch (error) {
    return {
      name: "webhook-secret",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  loadDotEnvIfAvailable();

  const appUrl = requiredEnv("NEXT_PUBLIC_APP_URL");
  requiredEnv("EVOLUTION_BASE_URL");
  requiredEnv("EVOLUTION_API_KEY");

  const results: CheckResult[] = [];
  results.push(await checkHealth(appUrl));

  const connectionId = optionalEnv("WHATSAPP_CONNECTION_ID");
  const webhookSecret = optionalEnv("EVOLUTION_WEBHOOK_SECRET");
  if (connectionId && webhookSecret) {
    results.push(
      await checkWebhookAuth({
        appUrl,
        connectionId,
        webhookSecret,
      }),
    );
  } else {
    results.push({
      name: "webhook-secret",
      ok: true,
      detail:
        "skipped (set WHATSAPP_CONNECTION_ID and EVOLUTION_WEBHOOK_SECRET to validate)",
    });
  }

  const failures = results.filter((x) => !x.ok);
  for (const result of results) {
    const icon = result.ok ? "PASS" : "FAIL";
    console.log(`[${icon}] ${result.name}: ${result.detail}`);
  }

  if (failures.length > 0) {
    process.exit(1);
  }
}

void main();
