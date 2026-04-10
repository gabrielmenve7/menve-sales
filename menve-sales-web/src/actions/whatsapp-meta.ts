"use server";

import { apiServer } from "@/lib/api-server";
import { assertCanConfigureTenant } from "@/lib/session";

export type MetaOnboardingInfo = {
  callbackUrl: string;
  verifyToken: string;
  verifyTokenConfigured: boolean;
  metaAppSecretConfigured: boolean;
  publicAppUrlConfigured: boolean;
  subscribedFieldsSuggestion: string[];
};

export async function fetchMetaOnboardingInfo(): Promise<MetaOnboardingInfo> {
  await assertCanConfigureTenant();
  return apiServer<MetaOnboardingInfo>("/whatsapp-connections/meta-onboarding-info");
}

export type MetaEmbeddedSignupInfo =
  | {
      enabled: false;
      docsUrl: string;
      message: string;
    }
  | {
      enabled: true;
      docsUrl: string;
      oauthAuthorizationUrl: string;
      redirectUri: string;
    };

export async function fetchMetaEmbeddedSignupInfo(): Promise<MetaEmbeddedSignupInfo> {
  await assertCanConfigureTenant();
  return apiServer<MetaEmbeddedSignupInfo>(
    "/whatsapp-connections/meta-embedded-signup-info",
  );
}

export async function patchMetaWhatsAppConnection(input: {
  connectionId: string;
  name?: string;
  phoneNumberId?: string;
  accessToken?: string;
  businessAccountId?: string;
}) {
  await assertCanConfigureTenant();
  await apiServer(`/whatsapp-connections/${input.connectionId}/meta`, {
    method: "PATCH",
    json: {
      name: input.name,
      phoneNumberId: input.phoneNumberId,
      accessToken: input.accessToken,
      businessAccountId: input.businessAccountId,
    },
  });
}

export async function testMetaWhatsAppConnection(connectionId: string) {
  await assertCanConfigureTenant();
  return apiServer<{ connected: boolean; detail?: string }>(
    `/whatsapp-connections/${connectionId}/meta-test`,
    { method: "POST" },
  );
}

export type MetaTemplateRow = {
  name: string;
  status: string;
  language?: string;
  category?: string;
};

export async function listMetaTemplates(connectionId: string) {
  await assertCanConfigureTenant();
  return apiServer<{ ok: true; templates: MetaTemplateRow[] }>(
    `/whatsapp-connections/${connectionId}/meta-templates`,
  );
}
