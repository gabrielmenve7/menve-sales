"use client";

import type { CustomField, Pipeline, Stage } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  updateTenantName,
  updateTenantResearchEnabled,
} from "@/actions/tenant";
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
import { CUSTOM_FIELD_ENTITY } from "@/lib/custom-field-entity";
import { SettingsPipelineStages } from "./settings-pipeline-stages";
import { SettingsCustomFields } from "./settings-custom-fields";

type TenantInfo = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  researchEnabled?: boolean;
};

export function SettingsGeneral({
  tenant,
  canManageWorkspace,
  pipelines,
  contactCustomFields,
  dealCustomFields,
}: {
  tenant: TenantInfo;
  canManageWorkspace: boolean;
  pipelines: (Pipeline & { stages: Stage[] })[];
  contactCustomFields: CustomField[];
  dealCustomFields: CustomField[];
}) {
  const router = useRouter();
  const [name, setName] = useState(tenant.name);
  const [saving, setSaving] = useState(false);
  const [savingResearch, setSavingResearch] = useState(false);

  const researchOn = tenant.researchEnabled !== false;

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

      <SettingsPipelineStages pipelines={pipelines} />
      <SettingsCustomFields
        fields={contactCustomFields}
        entity={CUSTOM_FIELD_ENTITY.CONTACT}
        title="Campos customizados (contatos)"
        description="Definições por tenant. Valores ficam em cada contato (ficha) e no card da oportunidade. Chave técnica única por tenant (slug)."
        listLabel="Campos de contato"
        newFieldTitle="Novo campo (contato)"
        idPrefix="cf-contact"
      />
      <SettingsCustomFields
        fields={dealCustomFields}
        entity={CUSTOM_FIELD_ENTITY.DEAL}
        title="Campos customizados (oportunidades)"
        description="Valores ficam só nesta oportunidade (modal do pipeline). Mesma regra de chave única por tenant."
        listLabel="Campos de oportunidade"
        newFieldTitle="Novo campo (oportunidade)"
        idPrefix="cf-deal"
      />
    </div>
  );
}
