"use client";

import type { CustomField, Pipeline, Stage } from "@prisma/client";
import {
  ClipboardList,
  GitBranch,
  Tag as TagIcon,
  Trash2,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { updateDealCustomData } from "@/actions/custom-fields";
import { deleteDeal, moveDealStage, patchDeal } from "@/actions/deals";
import { addTagToContact } from "@/actions/tags";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import {
  CUSTOM_FIELD_TYPE_LABELS,
  type CustomFieldTypeCode,
} from "@/lib/custom-field-types";
import { cn } from "@/lib/utils";
import type { DealRow } from "./pipeline-types";

type BulkDialog = null | "stage" | "assignee" | "tags" | "custom" | "delete";

function selectOptionsFromField(f: CustomField): string[] {
  const o = f.options;
  if (!Array.isArray(o)) return [];
  return o.filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0,
  );
}

export function PipelineListBulkToolbar({
  selectedDeals,
  pipeline,
  sortedStages,
  tenantMembers,
  tenantTags,
  dealCustomFieldDefs,
  onClearSelection,
  dock = "fixed",
}: {
  selectedDeals: DealRow[];
  pipeline: Pipeline & { stages: Stage[] };
  sortedStages: Stage[];
  tenantMembers: TenantMemberOption[];
  tenantTags: { id: string; name: string }[];
  dealCustomFieldDefs: CustomField[];
  onClearSelection: () => void;
  /** `inline`: barra presa ao rodapé do container (ex.: modal); `fixed`: viewport. */
  dock?: "fixed" | "inline";
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<BulkDialog>(null);
  const [busy, setBusy] = useState(false);

  const [stageIdPick, setStageIdPick] = useState("");
  const [assigneeIdPick, setAssigneeIdPick] = useState<string>("");
  const [tagIdPick, setTagIdPick] = useState("");
  const [customFieldId, setCustomFieldId] = useState("");
  const [customValueDraft, setCustomValueDraft] = useState("");

  const n = selectedDeals.length;
  const dealFields = useMemo(
    () =>
      [...dealCustomFieldDefs].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [dealCustomFieldDefs],
  );

  const selectedCustomField = useMemo(
    () => dealFields.find((f) => f.id === customFieldId) ?? null,
    [dealFields, customFieldId],
  );

  const membersSorted = useMemo(
    () =>
      [...tenantMembers].sort((a, b) =>
        (a.name ?? a.email).localeCompare(b.name ?? b.email, "pt-BR"),
      ),
    [tenantMembers],
  );

  function open(d: BulkDialog) {
    if (d === "stage") {
      const first = sortedStages[0];
      setStageIdPick(first?.id ?? "");
    }
    if (d === "assignee") setAssigneeIdPick("");
    if (d === "tags") setTagIdPick(tenantTags[0]?.id ?? "");
    if (d === "custom") {
      const f0 = dealFields[0];
      setCustomFieldId(f0?.id ?? "");
      setCustomValueDraft("");
    }
    setDialog(d);
  }

  async function runBulk(
    fn: (deal: DealRow) => Promise<void>,
    successLabel: string,
  ) {
    if (selectedDeals.length === 0) return;
    setBusy(true);
    let ok = 0;
    let fail = 0;
    for (const deal of selectedDeals) {
      try {
        await fn(deal);
        ok++;
      } catch {
        fail++;
      }
    }
    setBusy(false);
    setDialog(null);
    onClearSelection();
    router.refresh();
    if (fail > 0) {
      window.alert(
        `${successLabel}: ${ok} ok, ${fail} falha(s). Verifique permissões ou duplicatas.`,
      );
    }
  }

  function buildCustomValuesPayload(
    field: CustomField,
    draft: string,
  ): Record<string, unknown> {
    const key = field.key;
    const t = field.fieldType as CustomFieldTypeCode;
    const trim = draft.trim();
    switch (t) {
      case "NUMBER": {
        const n = Number(trim.replace(",", "."));
        return { [key]: Number.isFinite(n) ? n : trim };
      }
      case "MONEY_BRL": {
        const n = Number(trim.replace(/\./g, "").replace(",", "."));
        return { [key]: Number.isFinite(n) ? n : trim };
      }
      case "DATE":
        return { [key]: trim };
      case "USER":
        return { [key]: trim };
      default:
        return { [key]: trim };
    }
  }

  return (
    <>
      <div
        className={cn(
          "pointer-events-none flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
          dock === "fixed"
            ? "fixed inset-x-0 bottom-0 z-40"
            : "absolute inset-x-0 bottom-0 z-20",
        )}
        aria-live="polite"
      >
        <div
          className={cn(
            "pointer-events-auto flex max-w-[min(100vw-1.5rem,56rem)] flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-card/95 px-2 py-2 shadow-lg backdrop-blur-sm",
          )}
        >
          <span className="px-2 text-[13px] text-muted-foreground">
            <span className="font-medium text-foreground">{n}</span> lead
            {n === 1 ? "" : "s"} selecionado{n === 1 ? "" : "s"}
          </span>
          <div className="mx-1 h-6 w-px bg-border/60" aria-hidden />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 px-2 text-[13px]"
            disabled={busy}
            onClick={() => open("stage")}
          >
            <GitBranch className="size-4 shrink-0" strokeWidth={2} />
            Etapa
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 px-2 text-[13px]"
            disabled={busy}
            onClick={() => open("assignee")}
          >
            <Users className="size-4 shrink-0" strokeWidth={2} />
            Responsável
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 px-2 text-[13px]"
            disabled={busy || tenantTags.length === 0}
            onClick={() => open("tags")}
          >
            <TagIcon className="size-4 shrink-0" strokeWidth={2} />
            Tags
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 px-2 text-[13px]"
            disabled={busy || dealFields.length === 0}
            onClick={() => open("custom")}
          >
            <ClipboardList className="size-4 shrink-0" strokeWidth={2} />
            Campos
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 px-2 text-[13px] text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy}
            onClick={() => open("delete")}
          >
            <Trash2 className="size-4 shrink-0" strokeWidth={2} />
            Excluir
          </Button>
          <div className="mx-1 h-6 w-px bg-border/60" aria-hidden />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 px-2 text-[13px] text-muted-foreground"
            disabled={busy}
            onClick={onClearSelection}
          >
            Limpar
          </Button>
        </div>
      </div>

      <Dialog open={dialog === "stage"} onOpenChange={() => setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mover para etapa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="bulk-stage">Nova etapa no funil {pipeline.name}</Label>
            <select
              id="bulk-stage"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={stageIdPick}
              onChange={(e) => setStageIdPick(e.target.value)}
            >
              {sortedStages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={busy || !stageIdPick}
              onClick={() =>
                void runBulk(
                  (d) => moveDealStage(d.id, stageIdPick),
                  "Mover etapa",
                )
              }
            >
              Aplicar a {n} lead{n === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "assignee"} onOpenChange={() => setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Responsável</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="bulk-assignee">Atribuir a</Label>
            <select
              id="bulk-assignee"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={assigneeIdPick}
              onChange={(e) => setAssigneeIdPick(e.target.value)}
            >
              <option value="">Sem responsável</option>
              {membersSorted.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name?.trim() || m.email}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                void runBulk(
                  (d) =>
                    patchDeal(d.id, {
                      assignedToId:
                        assigneeIdPick === "" ? null : assigneeIdPick,
                    }),
                  "Atribuir responsável",
                )
              }
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "tags"} onOpenChange={() => setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar tag ao contato</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground">
            A tag é associada ao contato de cada lead (igual ao detalhe da
            oportunidade).
          </p>
          <div className="grid gap-2">
            <Label htmlFor="bulk-tag">Tag</Label>
            <select
              id="bulk-tag"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={tagIdPick}
              onChange={(e) => setTagIdPick(e.target.value)}
            >
              {tenantTags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={busy || !tagIdPick}
              onClick={() =>
                void runBulk(
                  async (d) => {
                    await addTagToContact(d.contactId, tagIdPick);
                  },
                  "Adicionar tag",
                )
              }
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "custom"} onOpenChange={() => setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Campo personalizado (oportunidade)</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="bulk-cf-field">Campo</Label>
              <select
                id="bulk-cf-field"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={customFieldId}
                onChange={(e) => {
                  setCustomFieldId(e.target.value);
                  setCustomValueDraft("");
                }}
              >
                {dealFields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} (
                    {CUSTOM_FIELD_TYPE_LABELS[
                      f.fieldType as CustomFieldTypeCode
                    ] ?? f.fieldType}
                    )
                  </option>
                ))}
              </select>
            </div>
            {selectedCustomField ? (
              <BulkCustomValueInput
                field={selectedCustomField}
                value={customValueDraft}
                onChange={setCustomValueDraft}
                membersSorted={membersSorted}
              />
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={busy || !selectedCustomField}
              onClick={() => {
                if (!selectedCustomField) return;
                const t = selectedCustomField.fieldType as CustomFieldTypeCode;
                const key = selectedCustomField.key;
                if (t === "SELECT") {
                  if (!customValueDraft.trim()) {
                    window.alert("Escolha uma opção.");
                    return;
                  }
                  const opts = selectOptionsFromField(selectedCustomField);
                  if (!opts.includes(customValueDraft)) {
                    window.alert("Escolha uma opção da lista.");
                    return;
                  }
                } else if (t !== "USER" && !customValueDraft.trim()) {
                  window.alert("Informe um valor.");
                  return;
                }

                const values: Record<string, unknown> =
                  t === "USER" && customValueDraft === ""
                    ? { [key]: null }
                    : buildCustomValuesPayload(
                        selectedCustomField,
                        customValueDraft,
                      );

                void runBulk(
                  (d) => updateDealCustomData({ dealId: d.id, values }),
                  "Campos personalizados",
                );
              }}
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={() => setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir oportunidades</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground">
            Excluir permanentemente {n} oportunidade{n === 1 ? "" : "s"}? Esta
            ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void runBulk((d) => deleteDeal(d.id), "Excluir")}
            >
              Excluir {n}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BulkCustomValueInput({
  field,
  value,
  onChange,
  membersSorted,
}: {
  field: CustomField;
  value: string;
  onChange: (v: string) => void;
  membersSorted: TenantMemberOption[];
}) {
  const t = field.fieldType as CustomFieldTypeCode;
  const id = "bulk-cf-value";

  if (t === "SELECT") {
    const opts = selectOptionsFromField(field);
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={id}>Valor</Label>
        <select
          id={id}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Selecionar…</option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (t === "USER") {
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={id}>Usuário</Label>
        <select
          id={id}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— limpar —</option>
          {membersSorted.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name?.trim() || m.email}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (t === "DATE") {
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={id}>Data</Label>
        <Input
          id={id}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  const placeholder =
    t === "MONEY_BRL"
      ? "0,00"
      : t === "NUMBER"
        ? "0"
        : t === "EMAIL"
          ? "email@exemplo.com"
          : t === "URL"
            ? "https://"
            : "Texto";

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Valor</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={t === "NUMBER" || t === "MONEY_BRL" ? "text" : "text"}
      />
    </div>
  );
}
