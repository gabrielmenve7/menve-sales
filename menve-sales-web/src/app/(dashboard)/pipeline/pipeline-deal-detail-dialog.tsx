"use client";

import {
  ActivityType,
  type CampaignSource,
  type Contact,
  type CustomField,
  type Deal,
  type Pipeline,
  type Stage,
  type Tag,
} from "@prisma/client";
import {
  Building2,
  Calendar,
  DollarSign,
  ExternalLink,
  Globe,
  Mail,
  Phone,
  Send,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  updateContactCustomData,
  updateDealCustomData,
} from "@/actions/custom-fields";
import {
  createDealActivity,
  getDealDetail,
  markDealLost,
  markDealWon,
} from "@/actions/deals";
import { CustomFieldsForm } from "@/components/custom-fields/custom-fields-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { DealRow } from "./pipeline-types";

type ActivityRow = {
  id: string;
  type: ActivityType;
  title: string;
  description: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string };
};

export type DealDetailPayload = {
  deal: Deal & {
    contact: Contact & {
      campaignSource: CampaignSource | null;
      contactTags: { tag: Tag }[];
    };
    stage: Stage;
    pipeline: Pipeline;
    dealTags: { tag: Tag }[];
    assignedTo: { id: string; name: string | null; email: string } | null;
  };
  activities: ActivityRow[];
  contactCustomFields?: CustomField[];
  dealCustomFields?: CustomField[];
};

function readCustom(contact: Contact) {
  const c = contact.customData;
  if (!c || typeof c !== "object" || Array.isArray(c)) return {};
  const o = c as Record<string, unknown>;
  const website =
    typeof o.website === "string"
      ? o.website
      : typeof o.site === "string"
        ? o.site
        : undefined;
  return { website };
}

function probLabel(p: number | null | undefined) {
  if (p == null) return null;
  if (p >= 70) return { text: "Alta", className: "text-amber-600" };
  if (p >= 40) return { text: "Média", className: "text-amber-500" };
  return { text: "Baixa", className: "text-muted-foreground" };
}

function activityTypeLabel(t: ActivityType) {
  const m: Record<ActivityType, string> = {
    NOTE: "Nota",
    CALL: "Ligação",
    EMAIL: "Email",
    MEETING: "Reunião",
    TASK: "Tarefa",
    WHATSAPP: "WhatsApp",
  };
  return m[t] ?? t;
}

function startOfDayMs(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function groupLabelForDate(iso: string) {
  const d = new Date(iso);
  const today = startOfDayMs(new Date());
  const day = startOfDayMs(d);
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return "HOJE";
  if (diff === 1) return "ONTEM";
  return `${diff} DIAS ATRÁS`;
}

const TAB_TYPES: { id: string; type: ActivityType; label: string }[] = [
  { id: "note", type: ActivityType.NOTE, label: "Nota" },
  { id: "call", type: ActivityType.CALL, label: "Ligação" },
  { id: "email", type: ActivityType.EMAIL, label: "Email" },
  { id: "meeting", type: ActivityType.MEETING, label: "Reunião" },
  { id: "task", type: ActivityType.TASK, label: "Tarefa" },
];

function tagStyle(hex: string | null | undefined) {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    return "border-border/60 bg-muted/50 text-foreground";
  }
  return "border-transparent text-foreground";
}

export function PipelineDealDetailDialog({
  deal: initial,
  open,
  onOpenChange,
  pipelineName,
  contactCustomFieldDefs,
  dealCustomFieldDefs,
}: {
  deal: DealRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pipelineName: string;
  contactCustomFieldDefs: CustomField[];
  dealCustomFieldDefs: CustomField[];
}) {
  const router = useRouter();
  const [remote, setRemote] = useState<DealDetailPayload | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activityType, setActivityType] = useState<ActivityType>(
    ActivityType.NOTE,
  );
  const [noteBody, setNoteBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [outcomePending, setOutcomePending] = useState(false);
  const reload = useCallback(async () => {
    if (!initial?.id) return;
    setLoading(true);
    setLoadErr(null);
    try {
      const raw = await getDealDetail(initial.id);
      setRemote(raw as DealDetailPayload);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }, [initial?.id]);

  useEffect(() => {
    if (!open || !initial?.id) {
      setRemote(null);
      setLoadErr(null);
      setLostOpen(false);
      setLostReason("");
      return;
    }
    void reload();
  }, [open, initial?.id, reload]);

  const d = remote?.deal ?? initial;
  const activities = remote?.activities ?? [];

  const groupedActivities = useMemo(() => {
    const map = new Map<string, ActivityRow[]>();
    for (const a of activities) {
      const g = groupLabelForDate(a.createdAt);
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(a);
    }
    return map;
  }, [activities]);

  const custom = d ? readCustom(d.contact) : {};
  const prob = d ? probLabel(d.probability) : null;

  async function onWon() {
    if (!d) return;
    setOutcomePending(true);
    try {
      await markDealWon(d.id);
      onOpenChange(false);
      router.refresh();
    } finally {
      setOutcomePending(false);
    }
  }

  async function onLostSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!d) return;
    const r = lostReason.trim();
    if (r.length < 2) return;
    setOutcomePending(true);
    try {
      await markDealLost(d.id, r);
      setLostOpen(false);
      setLostReason("");
      onOpenChange(false);
      router.refresh();
    } finally {
      setOutcomePending(false);
    }
  }

  async function onSaveActivity() {
    if (!d) return;
    const text = noteBody.trim();
    if (text.length < 1) return;
    setSaving(true);
    try {
      await createDealActivity({
        dealId: d.id,
        contactId: d.contactId,
        type: activityType,
        title: text.slice(0, 500),
        description: text.length > 500 ? text.slice(500) : undefined,
      });
      setNoteBody("");
      await reload();
    } finally {
      setSaving(false);
    }
  }

  const placeholder =
    activityType === ActivityType.NOTE
      ? "Escreva uma nota…"
      : activityType === ActivityType.CALL
        ? "Resumo da ligação…"
        : activityType === ActivityType.EMAIL
          ? "Assunto ou resumo do email…"
          : activityType === ActivityType.MEETING
            ? "Notas da reunião…"
            : "Descreva a tarefa…";

  const allTags = useMemo(() => {
    if (!d) return [];
    const seen = new Set<string>();
    const out: { tag: Tag; source: "deal" | "contact" }[] = [];
    for (const dt of d.dealTags ?? []) {
      if (!seen.has(dt.tag.id)) {
        seen.add(dt.tag.id);
        out.push({ tag: dt.tag, source: "deal" });
      }
    }
    for (const ct of d.contact?.contactTags ?? []) {
      if (!seen.has(ct.tag.id)) {
        seen.add(ct.tag.id);
        out.push({ tag: ct.tag, source: "contact" });
      }
    }
    return out;
  }, [d]);

  if (!initial || !d) return null;

  const fmtMoney = (v: unknown) =>
    Number(v ?? 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

  const created = new Date(d.createdAt).toLocaleDateString("pt-BR");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            "flex max-h-[min(90vh,880px)] w-[min(100vw-1.5rem,56rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl",
          )}
        >
        <DialogHeader className="space-y-3 border-b border-border/60 px-6 pb-4 pt-6 text-left">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="min-w-0 space-y-2">
              <DialogTitle className="text-2xl font-semibold tracking-tight">
                {d.contact.name}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-normal">
                  {pipelineName}
                </Badge>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-2.5 py-0.5 text-xs font-medium">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: d.stage.color ?? "hsl(262 83% 58%)",
                    }}
                  />
                  {d.stage.name}
                </span>
                {prob ? (
                  <span
                    className={cn("text-xs font-medium", prob.className)}
                  >
                    {prob.text}
                  </span>
                ) : null}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              asChild
            >
              <Link href={`/contacts/${d.contactId}`}>
                <ExternalLink className="size-3.5" />
                Contato
              </Link>
            </Button>
          </div>
        </DialogHeader>

        {d.status === "OPEN" ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-6 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={outcomePending}
              onClick={() => void onWon()}
            >
              Marcar como ganho
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={outcomePending}
              onClick={() => setLostOpen(true)}
            >
              Marcar como perdido…
            </Button>
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-border/60 lg:grid-cols-[minmax(0,280px)_1fr] lg:divide-x lg:divide-y-0">
          <div className="max-h-[40vh] overflow-y-auto px-6 py-5 lg:max-h-none">
            {loadErr ? (
              <p className="text-sm text-destructive">{loadErr}</p>
            ) : null}
            {loading && !remote ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : null}

            <section className="space-y-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Contato
              </h4>
              <ul className="space-y-2.5 text-sm">
                <li className="flex items-start gap-2.5">
                  <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="break-all text-foreground">
                    {d.contact.email?.trim() || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>
                    {d.contact.phone?.trim() || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>
                    {d.contact.company?.trim() || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                </li>
              </ul>
            </section>

            <section className="mt-6 space-y-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Informações
              </h4>
              <ul className="space-y-2.5 text-sm">
                <li className="flex items-start gap-2.5">
                  <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>
                    {d.assignedTo?.name?.trim() ||
                      d.assignedTo?.email ||
                      "—"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <DollarSign className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="font-medium">
                    {d.value != null ? fmtMoney(d.value) : "—"}
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  {custom.website ? (
                    <a
                      href={
                        custom.website.startsWith("http")
                          ? custom.website
                          : `https://${custom.website}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {custom.website}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </li>
                <li className="flex items-start gap-2.5">
                  <Calendar className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">Criado: {created}</span>
                </li>
              </ul>
            </section>

            {allTags.length > 0 ? (
              <section className="mt-6 space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Tags
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map(({ tag }) => (
                    <span
                      key={`${tag.id}-${tag.name}`}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                        tagStyle(tag.color),
                      )}
                      style={
                        tag.color && /^#[0-9A-Fa-f]{6}$/.test(tag.color)
                          ? { backgroundColor: `${tag.color}33` }
                          : undefined
                      }
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {contactCustomFieldDefs.length > 0 ||
            dealCustomFieldDefs.length > 0 ? (
              <>
                {contactCustomFieldDefs.length > 0 ? (
                  <section className="mt-6 space-y-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Campos extras · contato
                    </h4>
                    <p className="text-[12px] leading-snug text-muted-foreground">
                      Definidos em Configurações. Valores vinculados ao contato.
                    </p>
                    <CustomFieldsForm
                      fields={contactCustomFieldDefs}
                      customData={d.contact.customData}
                      idPrefix={`pd-c-${d.contactId}`}
                      onSave={async (values) => {
                        await updateContactCustomData({
                          contactId: d.contactId,
                          values,
                        });
                        await reload();
                        router.refresh();
                      }}
                    />
                  </section>
                ) : null}
                {dealCustomFieldDefs.length > 0 ? (
                  <section className="mt-6 space-y-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Campos extras · oportunidade
                    </h4>
                    <p className="text-[12px] leading-snug text-muted-foreground">
                      Específicos deste deal. Definidos em Configurações.
                    </p>
                    <CustomFieldsForm
                      fields={dealCustomFieldDefs}
                      customData={d.customData}
                      idPrefix={`pd-d-${d.id}`}
                      onSave={async (values) => {
                        await updateDealCustomData({
                          dealId: d.id,
                          values,
                        });
                        await reload();
                        router.refresh();
                      }}
                    />
                  </section>
                ) : null}
              </>
            ) : (
              <section className="mt-6 space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Campos extras
                </h4>
                <p className="text-[12px] leading-snug text-muted-foreground">
                  Nenhum campo configurado para este tenant. Em{" "}
                  <Link
                    href="/settings"
                    className="font-medium text-foreground underline underline-offset-2"
                  >
                    Configurações → Geral
                  </Link>
                  , crie campos de contato e/ou de oportunidade; em seguida
                  atualize a página do pipeline (F5) para carregar as definições.
                </p>
              </section>
            )}

            {d.title ? (
              <p className="mt-4 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Oportunidade:</span>{" "}
                {d.title}
              </p>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-col bg-muted/15">
            <div className="border-b border-border/60 px-4 py-3">
              <Tabs
                value={TAB_TYPES.find((t) => t.type === activityType)?.id ?? "note"}
                onValueChange={(id) => {
                  const f = TAB_TYPES.find((t) => t.id === id);
                  if (f) setActivityType(f.type);
                }}
              >
                <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
                  {TAB_TYPES.map((t) => (
                    <TabsTrigger
                      key={t.id}
                      value={t.id}
                      className="rounded-lg border border-transparent px-3 py-1.5 text-xs data-[state=active]:border-border data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground"
                    >
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            <div className="border-b border-border/60 p-4">
              <textarea
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder={placeholder}
                rows={4}
                className="w-full resize-none rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="mt-2 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  disabled={saving || noteBody.trim().length < 1}
                  onClick={() => void onSaveActivity()}
                >
                  <Send className="size-3.5" />
                  {saving ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {activities.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma atividade registrada neste deal.
                </p>
              ) : (
                <div className="space-y-6">
                  {[...groupedActivities.entries()].map(([label, rows]) => (
                    <div key={label}>
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {label}
                      </p>
                      <ul className="space-y-4">
                        {rows.map((a) => (
                          <li
                            key={a.id}
                            className="flex gap-3 text-sm"
                          >
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                              {(a.user.name ?? a.user.email ?? "?")
                                .slice(0, 1)
                                .toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="font-medium">
                                  {a.user.name ?? a.user.email ?? "Usuário"}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  {new Date(a.createdAt).toLocaleString(
                                    "pt-BR",
                                    {
                                      day: "2-digit",
                                      month: "2-digit",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )}
                                </span>
                              </div>
                              <Badge variant="outline" className="mt-1 text-[10px]">
                                {activityTypeLabel(a.type)}
                              </Badge>
                              <p className="mt-1 whitespace-pre-wrap text-foreground/90">
                                {a.title}
                              </p>
                              {a.description ? (
                                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                                  {a.description}
                                </p>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        </DialogContent>
      </Dialog>

      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent
          onPointerDown={(e) => e.stopPropagation()}
          className="sm:max-w-md"
        >
          <form onSubmit={onLostSubmit}>
            <DialogHeader>
              <DialogTitle>Marcar como perdido</DialogTitle>
              <DialogDescription>
                Informe o motivo da perda (obrigatório para análise de campanha).
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-4">
              <Label htmlFor={`lost-deal-${d.id}`}>Motivo</Label>
              <textarea
                id={`lost-deal-${d.id}`}
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                className="min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                placeholder="Ex: preço, concorrente, sem resposta…"
                required
                minLength={2}
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={outcomePending || lostReason.trim().length < 2}
              >
                {outcomePending ? "Salvando…" : "Confirmar perda"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
