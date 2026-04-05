"use client";

import type {
  CustomField,
  Pipeline,
  QuickReply,
  Stage,
  Tag,
  WhatsAppConnection,
} from "@prisma/client";
import { Settings2, Radio, Users, Tag as TagIcon, Bell } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SettingsGeneral } from "./settings-general";
import { SettingsChannels } from "./settings-channels";
import { SettingsMembers } from "./settings-members";
import { SettingsTagsCatalog } from "./settings-tags-catalog";
import { SettingsNotifications } from "./settings-notifications";

type TenantInfo = { id: string; name: string; slug: string; plan: string };
type Member = { id: string; name: string | null; email: string; role: string };

export function SettingsClient({
  tenant,
  connections,
  quickReplies,
  webhookBaseUrl,
  pipelines,
  tags,
  contactCustomFields,
  dealCustomFields,
  members,
}: {
  tenant: TenantInfo;
  connections: WhatsAppConnection[];
  quickReplies: QuickReply[];
  webhookBaseUrl: string;
  pipelines: (Pipeline & { stages: Stage[] })[];
  tags: Tag[];
  contactCustomFields: CustomField[];
  dealCustomFields: CustomField[];
  members: Member[];
}) {
  return (
    <Tabs defaultValue="general">
      <TabsList>
        <TabsTrigger value="general">
          <Settings2 className="size-3.5" /> Geral
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
          pipelines={pipelines}
          contactCustomFields={contactCustomFields}
          dealCustomFields={dealCustomFields}
        />
      </TabsContent>

      <TabsContent value="channels">
        <SettingsChannels
          connections={connections}
          quickReplies={quickReplies}
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
