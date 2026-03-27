import type { WhatsAppConnection, WhatsAppProvider } from "@prisma/client";
import { EvolutionWhatsAppProvider } from "./evolution-provider";
import { MetaWhatsAppProvider } from "./meta-provider";
import type { IWhatsAppProvider } from "./provider.interface";

export function createWhatsAppProvider(
  connection: Pick<WhatsAppConnection, "provider" | "config">,
): IWhatsAppProvider {
  const cfg = connection.config as Record<string, unknown>;
  if (connection.provider === "META") {
    return new MetaWhatsAppProvider({
      phoneNumberId: String(cfg.phoneNumberId ?? ""),
      accessToken: String(cfg.accessToken ?? ""),
      businessAccountId: cfg.businessAccountId
        ? String(cfg.businessAccountId)
        : undefined,
    });
  }
  return new EvolutionWhatsAppProvider({
    baseUrl: String(cfg.baseUrl ?? "http://localhost:8080"),
    instanceName: String(cfg.instanceName ?? "default"),
    apiKey: String(cfg.apiKey ?? ""),
  });
}

export function providerLabel(p: WhatsAppProvider) {
  return p === "META" ? "meta" : "evolution";
}
