"use client";

import type {
  CustomField,
  Pipeline,
  Stage,
  Tag,
  WhatsAppConnection,
} from "@prisma/client";
import {
  Settings2,
  Radio,
  Users,
  Tag as TagIcon,
  Bell,
  ClipboardList,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SettingsCampos } from "./settings-campos";
import { SettingsGeneral } from "./settings-general";
import { SettingsChannels } from "./settings-channels";
import { SettingsMembers } from "./settings-members";
import { SettingsTagsCatalog } from "./settings-tags-catalog";
import { SettingsNotifications } from "./settings-notifications";
import type { QuickReplyCategoryDTO } from "@/lib/quick-reply-types";

type TenantInfo = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  researchEnabled?: boolean;
};
type Member = { id: string; name: string | null; email: string; role: string };

const SETTINGS_TABS = [
  "general",
  "campos",
  "channels",
  "members",
  "tags",
  "notifications",
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number];

export function SettingsClient({
  tenant,
  canManageWorkspace,
  defaultTab = "general",
  connections,
  quickReplyCategories,
  webhookBaseUrl,
  pipelines,
  tags,
  contactCustomFields,
  dealCustomFields,
  members,
}: {
  tenant: TenantInfo;
  canManageWorkspace: boolean;
  defaultTab?: SettingsTabId;
  connections: WhatsAppConnection[];
  quickReplyCategories: QuickReplyCategoryDTO[];
  webhookBaseUrl: string;
  pipelines: (Pipeline & { stages: Stage[] })[];
  tags: Tag[];
  contactCustomFields: CustomField[];
  dealCustomFields: CustomField[];
  members: Member[];
}) {
  const tab: SettingsTabId =
    defaultTab && (SETTINGS_TABS as readonly string[]).includes(defaultTab)
      ? defaultTab
      : "general";

  return (
    <Tabs defaultValue={tab}>
      <TabsList>
        <TabsTrigger value="general">
          <Settings2 className="size-3.5" /> Configurações
        </TabsTrigger>
        <TabsTrigger value="campos">
          <ClipboardList className="size-3.5" /> Campos
        </TabsTrigger>
        <TabsTrigger value="channels">
          <Radio className="size-3.5" /> Canais
        </TabsTrigger>
        <TabsTrigger value="members">
          <Users className="size-3.5" /> Membros
        </TabsTrigger>
        <TabsTrigger value="tags">
          <TagIcon className="size-3.5" /> Tags
        </TabsTrigger>
        <TabsTrigger value="notifications">
          <Bell className="size-3.5" /> Notificações
        </TabsTrigger>
      </TabsList>

      <TabsContent value="general">
        <SettingsGeneral
          tenant={tenant}
          canManageWorkspace={canManageWorkspace}
          pipelines={pipelines}
        />
      </TabsContent>

      <TabsContent value="campos">
        <SettingsCampos
          contactCustomFields={contactCustomFields}
          dealCustomFields={dealCustomFields}
        />
      </TabsContent>

      <TabsContent value="channels">
        <SettingsChannels
          connections={connections}
          quickReplyCategories={quickReplyCategories}
          webhookBaseUrl={webhookBaseUrl}
        />
      </TabsContent>

      <TabsContent value="members">
        <SettingsMembers members={members} />
      </TabsContent>

      <TabsContent value="tags">
        <SettingsTagsCatalog tags={tags} />
      </TabsContent>

      <TabsContent value="notifications">
        <SettingsNotifications />
      </TabsContent>
    </Tabs>
  );
}
