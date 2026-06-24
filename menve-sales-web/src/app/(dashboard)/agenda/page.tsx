import {
  getGoogleCalendarStatus,
  listAgendaActivities,
  type AgendaActivity,
} from "@/actions/agenda";
import { AgendaClient } from "./agenda-client";
import { addDays, startOfWeek } from "date-fns";

export default async function AgendaPage() {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 7);

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
      />
    </div>
  );
}
