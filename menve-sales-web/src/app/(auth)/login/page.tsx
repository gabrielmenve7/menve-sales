import { Suspense } from "react";
import { AuthPageSkeleton } from "@/components/auth/auth-page-skeleton";
import { LoginPageClient } from "./login-client";

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthPageSkeleton />}>
      <LoginPageClient />
    </Suspense>
  );
}
