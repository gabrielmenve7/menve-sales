import { auth } from "@/auth";
import { fetchAuthMeForWebSession } from "@/lib/fetch-user-workspaces";
import { redirect } from "next/navigation";
import { SettingsProfile } from "../settings/settings-profile";

export default async function PerfilPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const me = session.user.accessToken?.trim()
    ? await fetchAuthMeForWebSession(session.user.accessToken)
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4 md:px-6 md:py-6">
      <div className="mx-auto w-full max-w-5xl rounded-2xl border border-border/60 bg-card/95 p-5 shadow-lg dark:border-border/50 dark:bg-card/90 md:p-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Seu perfil</h1>
          <p className="text-sm text-muted-foreground">
            Nome e foto usados na barra lateral e no app
          </p>
        </div>
        <SettingsProfile
          initialName={me?.name ?? session.user.name ?? null}
          initialEmail={me?.email ?? session.user.email ?? ""}
          initialImage={me?.image ?? session.user.image ?? null}
        />
      </div>
    </div>
  );
}
