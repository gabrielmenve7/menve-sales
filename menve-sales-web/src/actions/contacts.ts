"use server";

import prisma from "@/lib/prisma";
import { getActiveTenantId } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  company: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
});

export async function createContact(input: z.infer<typeof contactSchema>) {
  const tenantId = await getActiveTenantId();
  const data = contactSchema.parse(input);
  await prisma.contact.create({
    data: {
      tenantId,
      name: data.name,
      phone: data.phone || null,
      email: data.email || null,
      company: data.company || null,
      utmSource: data.utmSource || null,
      utmMedium: data.utmMedium || null,
      utmCampaign: data.utmCampaign || null,
    },
  });
  revalidatePath("/contacts");
}

export async function deleteContact(id: string) {
  const tenantId = await getActiveTenantId();
  await prisma.contact.deleteMany({ where: { id, tenantId } });
  revalidatePath("/contacts");
}

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** CSV UTF-8 com cabeçalho (use BOM no cliente se quiser Excel). */
export async function exportContactsCsv(): Promise<string> {
  const tenantId = await getActiveTenantId();
  const rows = await prisma.contact.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
    include: {
      campaignSource: true,
      contactTags: { include: { tag: true } },
    },
  });

  const header = [
    "name",
    "phone",
    "email",
    "company",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "campaign",
    "tags",
  ];

  const lines = rows.map((r) =>
    [
      csvEscape(r.name),
      csvEscape(r.phone ?? ""),
      csvEscape(r.email ?? ""),
      csvEscape(r.company ?? ""),
      csvEscape(r.utmSource ?? ""),
      csvEscape(r.utmMedium ?? ""),
      csvEscape(r.utmCampaign ?? ""),
      csvEscape(r.campaignSource?.name ?? ""),
      csvEscape(r.contactTags.map((ct) => ct.tag.name).join("; ")),
    ].join(","),
  );

  return [header.join(","), ...lines].join("\n");
}
