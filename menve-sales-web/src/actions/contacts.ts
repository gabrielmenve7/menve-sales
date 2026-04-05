"use server";

import { apiServer, apiServerText } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  campaignSourceId: z.string().optional(),
});

export async function createContact(input: z.infer<typeof contactSchema>) {
  const data = contactSchema.parse(input);
  await apiServer("/contacts", {
    method: "POST",
    json: {
      name: data.name,
      phone: data.phone || undefined,
      email: data.email || undefined,
      company: data.company || undefined,
      jobTitle: data.jobTitle || undefined,
      utmSource: data.utmSource || undefined,
      utmMedium: data.utmMedium || undefined,
      utmCampaign: data.utmCampaign || undefined,
      campaignSourceId: data.campaignSourceId || undefined,
    },
  });
  revalidatePath("/contacts");
}

export async function deleteContact(id: string) {
  await apiServer(`/contacts/${id}`, { method: "DELETE" });
  revalidatePath("/contacts");
}

export async function exportContactsCsv(): Promise<string> {
  return apiServerText("/contacts/export/csv");
}

const patchContactSchema = z.object({
  contactId: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  campaignSourceId: z.union([z.string().cuid(), z.null()]).optional(),
});

export async function patchContact(
  input: z.infer<typeof patchContactSchema>,
) {
  const { contactId, ...body } = patchContactSchema.parse(input);
  const payload: Record<string, unknown> = {};
  if (body.name !== undefined) payload.name = body.name;
  if (body.email !== undefined) payload.email = body.email;
  if (body.phone !== undefined) payload.phone = body.phone;
  if (body.company !== undefined) payload.company = body.company;
  if (body.jobTitle !== undefined) payload.jobTitle = body.jobTitle;
  if (body.campaignSourceId !== undefined) {
    payload.campaignSourceId = body.campaignSourceId;
  }
  await apiServer(`/contacts/${contactId}`, {
    method: "PATCH",
    json: payload,
  });
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/pipeline");
}
