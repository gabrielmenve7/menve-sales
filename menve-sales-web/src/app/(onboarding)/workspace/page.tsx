"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createFirstWorkspace } from "@/actions/workspace";
import { WorkspaceOnboardingSkeleton } from "@/components/onboarding/workspace-onboarding-skeleton";
import { Button } from "@/components/ui/button";
import { FormBusyOverlay } from "@/components/ui/form-busy-overlay";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function OnboardingWorkspacePage() {
  const router = useRouter();
  const { update, status } = useSession();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await createFirstWorkspace({
        name: name.trim(),
        slug: slug.trim() || undefined,
      });
      await update({
        accessToken: data.accessToken,
        tenantId: data.user.tenantId,
        workspaces: data.workspaces,
        needsOnboarding: data.needsOnboarding,
      });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar workspace.");
      setLoading(false);
    }
  }

  if (status === "loading") {
    return <WorkspaceOnboardingSkeleton />;
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 pt-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Criar seu workspace</CardTitle>
          <CardDescription className="text-[13px] leading-relaxed">
            O workspace agrupa pipeline, contatos e equipe. Você pode participar de
            vários depois.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ws-name">Nome do workspace</Label>
              <Input
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Minha empresa"
                required
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-slug">Slug (opcional)</Label>
              <Input
                id="ws-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="minha-empresa"
                className="h-10 font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Usado em URLs e identificação. Se vazio, geramos a partir do nome.
              </p>
            </div>
            {error ? (
              <p className="text-[13px] text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Criando…" : "Continuar"}
            </Button>
          </form>
          <FormBusyOverlay show={loading} label="Criando workspace…" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
