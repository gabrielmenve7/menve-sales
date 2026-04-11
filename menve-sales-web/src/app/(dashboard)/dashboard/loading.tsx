import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";

export default function DashboardHomeLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DashboardPageSkeleton className="min-h-[min(520px,72dvh)] flex-1" />
    </div>
  );
}
