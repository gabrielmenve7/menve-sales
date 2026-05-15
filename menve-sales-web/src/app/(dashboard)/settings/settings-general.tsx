"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  updateTenantName,
  updateTenantResearchEnabled,
  updateTenantWorkspaceImage,
} from "@/actions/tenant";
import { fileToResizedJpegDataUrl } from "@/lib/resize-image-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TenantInfo = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  researchEnabled?: boolean;
  image?: string | null;
};

function workspaceInitial(name: string) {
  const t = name.trim();
  if (!t) return "W";
  return t.slice(0, 1).toUpperCase();
}

export function SettingsGeneral({
  tenant,
  canManageWorkspace,
}: {
  tenant: TenantInfo;
  canManageWorkspace: boolean;
}) {
  const router = useRouter();
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(tenant.name);
  const [saving, setSaving] = useState(false);
  const [savingResearch, setSavingResearch] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(
    tenant.image ?? null,
  );
  const [logoUrl, setLogoUrl] = useState("");
  const [logoSaving, setLogoSaving] = useState(false);
  const [logoErr, setLogoErr] = useState<string | null>(null);

  const researchOn = tenant.researchEnabled !== false;

  useEffect(() => {
    setLogoPreview(tenant.image ?? null);
  }, [tenant.image]);

  async function onSaveTenant(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await updateTenantName(name.trim());
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function onToggleResearch() {
    setSavingResearch(true);
    try {
      await updateTenantResearchEnabled(!researchOn);
      router.refresh();
    } finally {
      setSavingResearch(false);
    }
  }

  async function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 8 * 1024 * 1024) {
      setLogoErr("Imagem muito grande (máx. 8 MB).");
      return;
    }
    setLogoErr(null);
    try {
      const dataUrl = await fileToResizedJpegDataUrl(file);
      if (dataUrl.length > 400_000) {
        setLogoErr("Imagem ainda grande demais após redimensionar.");
        return;
      }
      setLogoPreview(dataUrl);
      setLogoUrl("");
    } catch {
      setLogoErr("Não foi possível carregar a imagem.");
    }
  }

  async function onSaveLogo() {
    const url = logoUrl.trim();
    let payload: string;
    if (logoPreview?.startsWith("data:")) {
      payload = logoPreview;
    } else if (url) {
      payload = url;
    } else if (logoPreview && /^https?:\/\//i.test(logoPreview)) {
      payload = logoPreview;
    } else {
      setLogoErr("Escolha um arquivo ou informe uma URL https.");
      return;
    }
    setLogoSaving(true);
    setLogoErr(null);
    try {
      await updateTenantWorkspaceImage(payload);
      setLogoUrl("");
      router.refresh();
    } catch (e) {
      setLogoErr(e instanceof Error ? e.message : "Erro ao salvar imagem.");
    } finally {
      setLogoSaving(false);
    }
  }

  async function onRemoveLogo() {
    setLogoSaving(true);
    setLogoErr(null);
    try {
      await updateTenantWorkspaceImage(null);
      setLogoPreview(null);
      setLogoUrl("");
      router.refresh();
    } catch (e) {
      setLogoErr(e instanceof Error ? e.message : "Erro ao remover imagem.");
    } finally {
      setLogoSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>Nome e identificação do workspace</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSaveTenant} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="tenant-name">Nome</Label>
                <Input
                  id="tenant-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!canManageWorkspace}
                />
              </div>
              <div className="grid gap-2">
                <Label>Slug</Label>
                <Input value={tenant.slug} disabled className="text-muted-foreground" />
              </div>
            </div>

            <div className="rounded-lg border border-border/60 p-4">
              <p className="mb-3 text-sm font-medium">Imagem do workspace</p>
              <p className="mb-4 text-xs text-muted-foreground">
                Aparece no seletor de workspace na barra lateral. Mesmos formatos do perfil
                (arquivo ou URL https).
              </p>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div
                  className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/50 text-2xl font-semibold text-foreground dark:border-border/50"
                  aria-hidden={!!logoPreview}
                >
                  {logoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoPreview}
                      alt=""
                      className="size-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>{workspaceInitial(name || tenant.name)}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  {canManageWorkspace ? (
                    <>
                      <input
                        ref={logoFileRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="sr-only"
                        onChange={(e) => void onPickLogo(e)}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => logoFileRef.current?.click()}
                          disabled={logoSaving}
                        >
                          Escolher imagem
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={logoSaving || !logoPreview}
                          onClick={() => void onSaveLogo()}
                        >
                          {logoSaving ? "Salvando…" : "Salvar imagem"}
                        </Button>
                        {logoPreview ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground"
                            disabled={logoSaving}
                            onClick={() => void onRemoveLogo()}
                          >
                            Remover
                          </Button>
                        ) : null}
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="tenant-logo-url">URL da imagem (https)</Label>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <Input
                            id="tenant-logo-url"
                            value={logoUrl}
                            onChange={(e) => {
                              setLogoUrl(e.target.value);
                              const v = e.target.value.trim();
                              if (/^https?:\/\//i.test(v)) {
                                setLogoPreview(v);
                              }
                            }}
                            placeholder="https://…"
                            type="url"
                            disabled={logoSaving}
                            className="sm:min-w-0 sm:flex-1"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="shrink-0"
                            disabled={
                              logoSaving || !/^https?:\/\//i.test(logoUrl.trim())
                            }
                            onClick={() => void onSaveLogo()}
                          >
                            Usar URL
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Apenas proprietário ou administrador pode alterar a imagem do
                      workspace.
                    </p>
                  )}
                  {logoErr ? (
                    <p className="text-sm text-destructive" role="alert">
                      {logoErr}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {canManageWorkspace ? (
                <Button type="submit" disabled={saving || !name.trim()}>
                  {saving ? "Salvando…" : "Salvar"}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Apenas proprietário ou administrador pode alterar o nome do workspace.
                </p>
              )}
              <span className="rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">
                Plano: {tenant.plan}
              </span>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Funcionalidades</CardTitle>
          <CardDescription>
            Ative ou desative módulos do workspace. Demais áreas permanecem disponíveis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">Pesquisa (prospecção ativa)</p>
              <p className="text-xs text-muted-foreground">
                Busca em rede e Maps para gerar oportunidades. Desative se o workspace não
                faz prospecção ativa.
              </p>
            </div>
            {canManageWorkspace ? (
              <Button
                type="button"
                variant={researchOn ? "outline" : "default"}
                disabled={savingResearch}
                onClick={() => void onToggleResearch()}
                className="shrink-0"
              >
                {savingResearch
                  ? "Salvando…"
                  : researchOn
                    ? "Desativar Pesquisa"
                    : "Ativar Pesquisa"}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                {researchOn ? "Ativada" : "Desativada"} (somente Owner/Admin altera)
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
