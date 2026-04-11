import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";

export default function ContactDetailLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DashboardPageSkeleton variant="compact" className="flex-1" />
    </div>
  );
}
