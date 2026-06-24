import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";

export default function ListaLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DashboardPageSkeleton variant="table" className="min-h-[min(480px,70dvh)] flex-1" />
    </div>
  );
}
