import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";

export default function SettingsLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DashboardPageSkeleton variant="compact" className="min-h-[min(400px,60dvh)] flex-1" />
    </div>
  );
}
