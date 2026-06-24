import {
  getGoogleCalendarStatus,
  listAgendaActivities,
  type AgendaActivity,
} from "@/actions/agenda";
import { apiServer } from "@/lib/api-server";
import { AgendaClient } from "./agenda-client";
import { addDays, startOfWeek } from "date-fns";

type AgendaPageProps = {
  searchParams: Promise<{ contact?: string }>;
};

export default async function AgendaPage({ searchParams }: AgendaPageProps) {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 7);
  const sp = await searchParams;

  let initialContact: { id: string; name: string } | null = null;
  if (sp.contact?.trim()) {
    try {
      const c = await apiServer<{ id: string; name: string }>(
        `/contacts/${encodeURIComponent(sp.contact.trim())}`,
      );
      initialContact = { id: c.id, name: c.name };
    } catch {
      initialContact = null;
    }
  }

  const [activities, googleStatus] = await Promise.all([
    listAgendaActivities({
      from: weekStart.toISOString(),
      to: weekEnd.toISOString(),
    }).catch(() => [] as AgendaActivity[]),
    getGoogleCalendarStatus().catch(() => ({
      connected: false,
      calendarId: null,
      connectedAt: null,
    })),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-3">
      <AgendaClient
        initialActivities={activities}
        initialWeekStart={weekStart.toISOString()}
        googleConnected={googleStatus.connected}
        initialContact={initialContact}
      />
    </div>
  );
}
