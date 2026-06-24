import { apiServer } from "@/lib/api-server";
import { assertCanConfigureTenant } from "@/lib/session";
import { getTenantFromRequest } from "@/lib/tenant";
import { SettingsChannels } from "../settings/settings-channels";
import { redirect } from "next/navigation";
import type { QuickReplyCategoryDTO } from "@/lib/quick-reply-types";
import type { WhatsAppConnection } from "@prisma/client";

function normalizePublicUrl(raw: string | undefined | null) {
  return raw?.trim().replace(/\/$/, "") || "";
}

function isTemporaryUrl(raw: string) {
  const u = raw.toLowerCase();
  return (
    u.includes("localhost") ||
    u.includes("127.0.0.1") ||
    u.includes(".ngrok-free.") ||
    u.includes(".ngrok.") ||
    u.includes("trycloudflare.com")
  );
}

function resolveWebhookBaseUrl(apiWebhookUrl?: string) {
  const fromApi = normalizePublicUrl(apiWebhookUrl);
  if (fromApi) return fromApi;

  const candidates = [
    normalizePublicUrl(process.env.WEBHOOK_PUBLIC_URL),
    normalizePublicUrl(process.env.INTERNAL_API_URL),
  ].filter(Boolean);

  const stable = candidates.find((url) => !isTemporaryUrl(url));
  if (stable) return stable;

  return candidates[0] || "http://localhost:4000";
}

export default async function WhatsAppsPage() {
  await assertCanConfigureTenant();
  const tenant = await getTenantFromRequest();
  if (!tenant) redirect("/setup");

  const data = await apiServer<{
    whatsAppConnections: WhatsAppConnection[];
    quickReplyCategories: QuickReplyCategoryDTO[];
    webhookPublicUrl?: string;
  }>("/settings");

  const webhookBaseUrl = resolveWebhookBaseUrl(data.webhookPublicUrl);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4 md:px-6 md:py-6">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">WhatsApps</h1>
          <p className="text-sm text-muted-foreground">
            Conexões WhatsApp, pareamento e respostas rápidas
          </p>
        </div>
        <SettingsChannels
          connections={(data.whatsAppConnections ?? []) as WhatsAppConnection[]}
          quickReplyCategories={(data.quickReplyCategories ?? []) as QuickReplyCategoryDTO[]}
          webhookBaseUrl={webhookBaseUrl}
        />
      </div>
    </div>
  );
}
