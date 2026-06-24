"use server";

import { ActivityType } from "@/types/domain";
import { apiServer } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type AgendaActivity = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  completedAt: string | null;
  meetLink: string | null;
  contact: { id: string; name: string } | null;
  deal: { id: string; title: string } | null;
  user: { id: string; name: string | null; email: string | null };
};

export type GoogleCalendarStatus = {
  connected: boolean;
  calendarId: string | null;
  connectedAt: string | null;
};

const listSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  assigneeId: z.string().optional(),
});

const meetingSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  dueAt: z.string(),
  durationMinutes: z.number().int().min(15).max(480).default(30),
  contactId: z.string().optional(),
  dealId: z.string().optional(),
  createGoogleMeet: z.boolean().default(true),
});

export async function listAgendaActivities(
  input: z.infer<typeof listSchema> = {},
) {
  const q = listSchema.parse(input);
  const params = new URLSearchParams();
  if (q.from) params.set("from", q.from);
  if (q.to) params.set("to", q.to);
  if (q.assigneeId) params.set("assigneeId", q.assigneeId);
  const qs = params.toString();
  return apiServer<AgendaActivity[]>(
    `/activities${qs ? `?${qs}` : ""}`,
  );
}

export async function getGoogleCalendarStatus() {
  return apiServer<GoogleCalendarStatus>("/calendar/google/status");
}

export async function getGoogleConnectUrl() {
  return apiServer<{ url: string }>("/calendar/google/connect-url");
}

export async function createMeetingWithGoogle(
  input: z.infer<typeof meetingSchema>,
) {
  const data = meetingSchema.parse(input);
  const activity = await apiServer<AgendaActivity>("/calendar/events", {
    method: "POST",
    json: {
      title: data.title,
      description: data.description,
      type: ActivityType.MEETING,
      dueAt: data.dueAt,
      durationMinutes: data.durationMinutes,
      contactId: data.contactId,
      dealId: data.dealId,
      createGoogleMeet: data.createGoogleMeet,
    },
  });
  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  return activity;
}
