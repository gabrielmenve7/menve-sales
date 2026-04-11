import { WorkspaceOnboardingSkeleton } from "@/components/onboarding/workspace-onboarding-skeleton";

export default function OnboardingLoading() {
  return (
    <div className="min-h-screen bg-muted/25 px-4 py-10 dark:bg-muted/10">
      <WorkspaceOnboardingSkeleton />
    </div>
  );
}
