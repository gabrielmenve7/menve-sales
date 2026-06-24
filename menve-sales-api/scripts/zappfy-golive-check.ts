import "./load-api-env";
import { ZappfyWhatsAppProvider } from "../src/whatsapp/zappfy-provider";
import { fetchZappfyStatus } from "../src/whatsapp/zappfy-admin";

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

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

function checkLocalParse(): CheckResult {
  const provider = new ZappfyWhatsAppProvider({
    baseUrl: "https://api.zappfy.io",
    instanceToken: "probe",
  });
  const text = provider.parseWebhook({
    event: "messages",
    data: {
      messageId: "probe-text",
      from: "5511999999999",
      text: "probe",
      fromMe: false,
      timestamp: Date.now(),
    },
  });
  const audio = provider.parseWebhook({
    type: "NEW-MESSAGE",
    data: {
      key: {
        remoteJid: "5511888888888@s.whatsapp.net",
        fromMe: false,
        id: "probe-audio",
      },
      message: {
        audioMessage: {
          url: "https://example.com/probe.m4a",
          mimetype: "audio/mp4",
        },
      },
      messageTimestamp: { low: Math.floor(Date.now() / 1000), high: 0 },
    },
  });
  if (text.length !== 1 || audio.length !== 1) {
    return {
      name: "parser-local",
      ok: false,
      detail: `text=${text.length} audio=${audio.length}`,
    };
  }
  return {
    name: "parser-local",
    ok: true,
    detail: "texto simples + NEW-MESSAGE áudio",
  };
}

async function checkZappfyStatus(instanceToken: string | null): Promise<CheckResult> {
  if (!instanceToken) {
    return {
      name: "zappfy-status",
      ok: true,
      detail: "skipped (set ZAPPFY_INSTANCE_TOKEN or pass token as 2nd arg)",
    };
  }
  const baseUrl = optionalEnv("ZAPPFY_BASE_URL") ?? "https://api.zappfy.io";
  const status = await fetchZappfyStatus({ baseUrl, instanceToken });
  return {
    name: "zappfy-status",
    ok: status.connected,
    detail: status.connected
      ? `conectado (${status.detail ?? "ok"})`
      : `desconectado (${status.detail ?? "sem detalhe"})`,
  };
}

async function checkWebhookAuth(args: {
  appUrl: string;
  connectionId: string;
  webhookSecret: string | null;
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
    if (args.webhookSecret) {
      const unauthorized = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (unauthorized.status !== 401) {
        return {
          name: "webhook-secret",
          ok: false,
          detail: `expected 401 without header, got ${unauthorized.status}`,
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
          name: "webhook-secret",
          ok: false,
          detail: `expected 2xx with secret, got ${authorized.status}`,
        };
      }
      return {
        name: "webhook-secret",
        ok: true,
        detail: "401 sem header e 2xx com secret",
      };
    }

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return {
        name: "webhook-reachable",
        ok: false,
        detail: `POST webhook HTTP ${res.status}`,
      };
    }
    return {
      name: "webhook-reachable",
      ok: true,
      detail: `POST webhook HTTP ${res.status} (sem secret configurado)`,
    };
  } catch (error) {
    return {
      name: args.webhookSecret ? "webhook-secret" : "webhook-reachable",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const connectionIdArg = process.argv[2]?.trim();
  const instanceTokenArg = process.argv[3]?.trim();
  const appUrl = (
    optionalEnv("PUBLIC_APP_URL") ||
    optionalEnv("INTERNAL_API_URL") ||
    optionalEnv("NEXT_PUBLIC_APP_URL") ||
    "http://127.0.0.1:4000"
  ).replace(/\/$/, "");

  const results: CheckResult[] = [];
  results.push(await checkHealth(appUrl));
  results.push(checkLocalParse());

  const instanceToken =
    instanceTokenArg || optionalEnv("ZAPPFY_INSTANCE_TOKEN");
  results.push(await checkZappfyStatus(instanceToken));

  const connectionId = connectionIdArg || optionalEnv("WHATSAPP_CONNECTION_ID");
  const webhookSecret = optionalEnv("ZAPPFY_WEBHOOK_SECRET");
  if (connectionId) {
    results.push(
      await checkWebhookAuth({
        appUrl,
        connectionId,
        webhookSecret,
      }),
    );
  } else {
    results.push({
      name: "webhook",
      ok: true,
      detail:
        "skipped (pass connectionId arg or set WHATSAPP_CONNECTION_ID)",
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
