"use client";

import type {
  CustomField,
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
  tags: Tag[];
  contactCustomFields: CustomField[];
  dealCustomFields: CustomField[];
  members: Member[];
}) {
  const tab: SettingsTabId =
    defaultTab && (SETTINGS_TABS as readonly string[]).includes(defaultTab)
      ? defaultTab
      : "general";

  const triggerClass =
    "w-full justify-start gap-2.5 rounded-lg border-0 border-l-[3px] border-transparent py-2.5 pl-3 pr-2 text-left text-[15px] data-[state=active]:border-b-0 data-[state=active]:border-l-foreground data-[state=active]:bg-neutral-200/80 data-[state=active]:text-foreground dark:data-[state=active]:bg-white/[0.12]";

  return (
    <Tabs
      defaultValue={tab}
      orientation="vertical"
      className="flex min-h-0 flex-col gap-6 md:flex-row md:items-start md:gap-8"
    >
      <TabsList className="inline-flex h-auto w-full shrink-0 flex-col items-stretch gap-0.5 rounded-xl border border-border/60 border-b-0 bg-muted/25 p-1.5 md:sticky md:top-0 md:w-52 md:self-start dark:border-border/50 dark:bg-muted/20">
        <TabsTrigger value="general" className={triggerClass}>
          <Settings2 className="size-3.5 shrink-0 opacity-90" /> Geral
        </TabsTrigger>
        <TabsTrigger value="campos" className={triggerClass}>
          <ClipboardList className="size-3.5 shrink-0 opacity-90" /> Campos
        </TabsTrigger>
        <TabsTrigger value="channels" className={triggerClass}>
          <Radio className="size-3.5 shrink-0 opacity-90" /> Canais
        </TabsTrigger>
        <TabsTrigger value="members" className={triggerClass}>
          <Users className="size-3.5 shrink-0 opacity-90" /> Membros
        </TabsTrigger>
        <TabsTrigger value="tags" className={triggerClass}>
          <TagIcon className="size-3.5 shrink-0 opacity-90" /> Tags
        </TabsTrigger>
        <TabsTrigger value="notifications" className={triggerClass}>
          <Bell className="size-3.5 shrink-0 opacity-90" /> Notificações
        </TabsTrigger>
      </TabsList>

      <TabsContent value="general" className="mt-0 min-w-0 flex-1 md:pt-0.5">
        <SettingsGeneral tenant={tenant} canManageWorkspace={canManageWorkspace} />
      </TabsContent>

      <TabsContent value="campos" className="mt-0 min-w-0 flex-1 md:pt-0.5">
        <SettingsCampos
          contactCustomFields={contactCustomFields}
          dealCustomFields={dealCustomFields}
        />
      </TabsContent>

      <TabsContent value="channels" className="mt-0 min-w-0 flex-1 md:pt-0.5">
        <SettingsChannels
          connections={connections}
          quickReplyCategories={quickReplyCategories}
          webhookBaseUrl={webhookBaseUrl}
        />
      </TabsContent>

      <TabsContent value="members" className="mt-0 min-w-0 flex-1 md:pt-0.5">
        <SettingsMembers
          tenantId={tenant.id}
          members={members}
          canInvite={canManageWorkspace}
        />
      </TabsContent>

      <TabsContent value="tags" className="mt-0 min-w-0 flex-1 md:pt-0.5">
        <SettingsTagsCatalog tags={tags} />
      </TabsContent>

      <TabsContent value="notifications" className="mt-0 min-w-0 flex-1 md:pt-0.5">
        <SettingsNotifications />
      </TabsContent>
    </Tabs>
  );
}
