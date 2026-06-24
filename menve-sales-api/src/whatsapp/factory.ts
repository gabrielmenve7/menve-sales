import type { WhatsAppConnection, WhatsAppProvider } from "@prisma/client";
import { EvolutionWhatsAppProvider } from "./evolution-provider";
import { InstagramProvider } from "./instagram-provider";
import { MetaWhatsAppProvider } from "./meta-provider";
import type { IWhatsAppProvider } from "./provider.interface";
import { ZappfyWhatsAppProvider } from "./zappfy-provider";

export function createWhatsAppProvider(
  connection: Pick<WhatsAppConnection, "provider" | "config">,
): IWhatsAppProvider {
  const cfg = connection.config as Record<string, unknown>;
  if (connection.provider === "ZAPPFY") {
    return new ZappfyWhatsAppProvider({
      baseUrl: String(cfg.baseUrl ?? "https://api.zappfy.io"),
      instanceToken: String(cfg.instanceToken ?? ""),
    });
  }
  if (connection.provider === "META") {
    return new MetaWhatsAppProvider({
      phoneNumberId: String(cfg.phoneNumberId ?? ""),
      accessToken: String(cfg.accessToken ?? ""),
      businessAccountId: cfg.businessAccountId
        ? String(cfg.businessAccountId)
        : undefined,
    });
  }
  if (connection.provider === "INSTAGRAM") {
    return new InstagramProvider({
      pageId: String(cfg.pageId ?? ""),
      accessToken: String(cfg.accessToken ?? ""),
      igUserId: String(cfg.igUserId ?? ""),
    });
  }
  return new EvolutionWhatsAppProvider({
    baseUrl: String(cfg.baseUrl ?? "http://localhost:8080"),
    instanceName: String(cfg.instanceName ?? "default"),
    apiKey: String(cfg.apiKey ?? ""),
  });
}

export function providerLabel(p: WhatsAppProvider) {
  if (p === "META") return "meta";
  if (p === "INSTAGRAM") return "instagram";
  if (p === "ZAPPFY") return "zappfy";
  return "evolution";
}
