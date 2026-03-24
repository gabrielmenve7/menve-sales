import prisma from "@/lib/prisma";
import { getActiveTenantId } from "@/lib/session";
import { findContactCustomFieldDefinitions } from "@/lib/custom-fields-load";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ContactDetailClient } from "./contact-detail-client";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenantId = await getActiveTenantId();

  const contact = await prisma.contact.findFirst({
    where: { id, tenantId },
    include: {
      campaignSource: true,
      contactTags: { include: { tag: true } },
      deals: {
        include: { stage: true, pipeline: true, assignedTo: true },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!contact) notFound();

  const [allTags, customFields] = await Promise.all([
    prisma.tag.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    }),
    findContactCustomFieldDefinitions(tenantId),
  ]);

  const [activities, messages] = await Promise.all([
    prisma.activity.findMany({
      where: { tenantId, contactId: id },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
      take: 100,
    }),
    prisma.message.findMany({
      where: { tenantId, contactId: id },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
      take: 100,
    }),
  ]);

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Button variant="ghost" className="mb-2 h-8 px-0" asChild>
            <Link href="/contacts">← Contatos</Link>
          </Button>
          <h1 className="text-xl font-semibold">{contact.name}</h1>
          <p className="text-muted-foreground">
            {contact.phone ?? "Sem telefone"}
            {contact.email ? ` · ${contact.email}` : ""}
          </p>
        </div>
      </div>

      <ContactDetailClient
        contact={contact}
        activities={activities}
        messages={messages}
        allTags={allTags}
        customFields={customFields}
      />
    </div>
  );
}
