import prisma from "@/lib/prisma";
import { getActiveTenantId } from "@/lib/session";
import { ContactsClient } from "./contacts-client";

export default async function ContactsPage() {
  const tenantId = await getActiveTenantId();
  const contacts = await prisma.contact.findMany({
    where: { tenantId },
    orderBy: { updatedAt: "desc" },
    include: {
      campaignSource: true,
      contactTags: { include: { tag: true } },
    },
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Contatos</h1>
        <p className="text-muted-foreground">
          Leads e contatos com origem de campanha (UTM).
        </p>
      </div>
      <ContactsClient contacts={contacts} />
    </div>
  );
}
