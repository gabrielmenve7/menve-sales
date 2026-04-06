import { apiServer } from "@/lib/api-server";
import type { TenantMemberOption } from "@/lib/custom-field-types";
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
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
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={contact.name}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                {initials(contact.name)}
              </span>
            )}
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
