import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <div className="min-h-screen bg-muted/25 px-4 py-10 dark:bg-muted/10">
      {children}
    </div>
  );
}
