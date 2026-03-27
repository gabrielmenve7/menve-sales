import { auth } from "@/auth";
import { Sidebar } from "@/components/dashboard/sidebar";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isSuperAdmin = session.user.role === UserRole.SUPER_ADMIN;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        isSuperAdmin={isSuperAdmin}
        userName={session.user.name ?? session.user.email}
      />
      <main className="min-h-screen flex-1 overflow-auto bg-muted/30 dark:bg-muted/15">
        {children}
      </main>
    </div>
  );
}
