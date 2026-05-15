import { apiServer } from "@/lib/api-server";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import { ContactPhotoAvatar } from "@/components/inbox/contact-photo-avatar";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ContactDetailClient } from "./contact-detail-client";

function getContactPhotoUrl(customData: unknown): string | null {
  if (!customData || typeof customData !== "object" || Array.isArray(customData)) {
    return null;
  }
  const raw = (customData as Record<string, unknown>).whatsappProfilePhotoUrl;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

type ContactBundle = {
  contact: {
    name: string;
    phone: string | null;
    email: string | null;
    customData: unknown;
  };
  allTags: unknown[];
  customFields: unknown[];
  activities: unknown[];
  messages: unknown[];
};

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let bundle: ContactBundle;
  let tenantMembers: TenantMemberOption[] = [];
  try {
    [bundle, tenantMembers] = await Promise.all([
      apiServer<ContactBundle>(`/contacts/${id}`),
      apiServer<TenantMemberOption[]>("/settings/members").catch(
        () => [] as TenantMemberOption[],
      ),
    ]);
  } catch {
    notFound();
  }

  const { contact, allTags, customFields, activities, messages } = bundle;
  const photoUrl = getContactPhotoUrl(contact.customData);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Button variant="ghost" className="mb-2 h-8 px-0" asChild>
            <Link href="/contacts">← Contatos</Link>
          </Button>
          <div className="flex items-center gap-3">
            <ContactPhotoAvatar
              photoUrl={photoUrl}
              name={contact.name}
              sizeClass="h-10 w-10"
            />
            <h1 className="text-xl font-semibold">{contact.name}</h1>
          </div>
          <p className="text-muted-foreground">
            {contact.phone ?? "Sem telefone"}
            {contact.email ? ` · ${contact.email}` : ""}
          </p>
        </div>
      </div>

      <ContactDetailClient
        contact={bundle.contact as never}
        activities={activities as never}
        messages={messages as never}
        allTags={allTags as never}
        customFields={customFields as never}
        tenantMembers={tenantMembers}
      />
    </div>
  );
}
