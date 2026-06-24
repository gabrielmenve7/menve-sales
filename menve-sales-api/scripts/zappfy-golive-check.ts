import "./load-api-env";

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

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
  const u = appUrl.replace(/\/$/, "");
  const candidates = [`${u}/health`, `${u}/api/health`];
  let lastErr = "unreachable";
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return { name: "health", ok: true, detail: `ok (${url})` };
      }
      lastErr = `HTTP ${res.status} (${url})`;
    } catch (error) {
      lastErr = error instanceof Error ? error.message : String(error);
    }
  }
  return { name: "health", ok: false, detail: lastErr };
}

async function checkWebhookAuth(args: {
  appUrl: string;
  connectionId: string;
  webhookSecret: string;
}): Promise<CheckResult> {
  const webhookUrl = `${args.appUrl.replace(/\/$/, "")}/webhooks/whatsapp/zappfy/${args.connectionId}`;
  const payload = {
    event: "messages",
    data: {
      messageId: `probe-${Date.now()}`,
      from: "5511999999999",
      text: "probe",
      fromMe: false,
      timestamp: Date.now(),
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
  const connectionIdArg = process.argv[2]?.trim();
  const appUrl = (
    optionalEnv("PUBLIC_APP_URL") ||
    optionalEnv("INTERNAL_API_URL") ||
    optionalEnv("NEXT_PUBLIC_APP_URL") ||
    "http://127.0.0.1:4000"
  ).replace(/\/$/, "");
  requiredEnv("ZAPPFY_ADMIN_TOKEN");
  optionalEnv("ZAPPFY_BASE_URL");

  const results: CheckResult[] = [];
  results.push(await checkHealth(appUrl));

  const connectionId = connectionIdArg || optionalEnv("WHATSAPP_CONNECTION_ID");
  const webhookSecret = optionalEnv("ZAPPFY_WEBHOOK_SECRET");
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
        "skipped (pass connectionId arg or set WHATSAPP_CONNECTION_ID + ZAPPFY_WEBHOOK_SECRET)",
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
