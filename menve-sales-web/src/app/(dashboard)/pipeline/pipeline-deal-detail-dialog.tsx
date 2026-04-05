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
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  DollarSign,
  ExternalLink,
  FilePlus,
  Globe,
  List,
  Mail,
  MessageSquare,
  Phone,
  Send,
  User,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { updateCustomField, updateDealCustomData } from "@/actions/custom-fields";
import {
  createDealActivity,
  getDealDetail,
  markDealLost,
  markDealWon,
  moveDealStage,
  patchDeal,
} from "@/actions/deals";
import { CreateCustomFieldTrigger } from "@/components/custom-fields/create-custom-field-dialog";
import { CustomFieldsInlineTable } from "@/components/custom-fields/custom-fields-inline-table";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { CUSTOM_FIELD_ENTITY } from "@/lib/custom-field-entity";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import { parseMenveActivityMeta } from "@/lib/deal-activity-meta";
import { cn } from "@/lib/utils";
import type { DealRow } from "./pipeline-types";

export type DealActivityRow = {
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
    pipeline: Pipeline & { stages: Stage[] };
    dealTags: { tag: Tag }[];
    assignedTo: { id: string; name: string | null; email: string } | null;
  };
  activities: DealActivityRow[];
  contactCustomFields?: CustomField[];
  dealCustomFields?: CustomField[];
};

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

function startOfCalendarDayMs(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** Cabeçalho de grupo tipo HOJE / ONTEM / N DIAS ATRÁS */
function groupLabelForDay(now: Date, activityDate: Date) {
  const diffDays = Math.round(
    (startOfCalendarDayMs(now) - startOfCalendarDayMs(activityDate)) /
      (24 * 60 * 60 * 1000),
  );
  if (diffDays <= 0) return "HOJE";
  if (diffDays === 1) return "ONTEM";
  return `${diffDays} DIAS ATRÁS`;
}

function stagePillDotColor(color: string | null) {
  if (color && /^#[0-9A-Fa-f]{6}$/.test(color)) return color;
  return "hsl(262 83% 58%)";
}

function StagePill({
  name,
  color,
}: {
  name: string;
  color: string | null;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: stagePillDotColor(color) }}
      />
      {name}
    </span>
  );
}

function timelineIconWrap(children: ReactNode, className?: string) {
  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

function DealHistoryRow({
  a,
  isLast,
}: {
  a: DealActivityRow;
  isLast: boolean;
}) {
  const meta = parseMenveActivityMeta(a.description);
  const timeStr = new Date(a.createdAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const userName = a.user.name?.trim() || a.user.email;

  let icon: ReactNode = timelineIconWrap(
    <MessageSquare className="size-3.5" />,
  );
  let body: ReactNode;

  if (meta?.k === "stage_change") {
    icon = timelineIconWrap(<ArrowRight className="size-3.5" />);
    body = (
      <>
        <p className="text-sm text-foreground/90">{a.title}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StagePill name={meta.from.name} color={meta.from.color} />
          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
          <StagePill name={meta.to.name} color={meta.to.color} />
        </div>
      </>
    );
  } else if (meta?.k === "assignee") {
    icon = timelineIconWrap(<User className="size-3.5" />);
    body = <p className="text-sm text-foreground/90">{a.title}</p>;
  } else if (meta?.k === "deal_outcome") {
    icon =
      meta.outcome === "WON"
        ? timelineIconWrap(
            <CheckCircle2 className="size-3.5 text-emerald-600" />,
            "border-emerald-200/70 text-emerald-700",
          )
        : timelineIconWrap(
            <XCircle className="size-3.5 text-rose-600" />,
            "border-rose-200/70 text-rose-700",
          );
    body = (
      <>
        <p className="text-sm text-foreground/90">{a.title}</p>
        {meta.outcome === "LOST" && meta.reason ? (
          <p className="mt-1.5 rounded-lg border border-border/50 bg-muted/35 px-3 py-2 text-sm text-foreground/90 whitespace-pre-wrap">
            {meta.reason}
          </p>
        ) : null}
      </>
    );
  } else if (meta?.k === "deal_created") {
    icon = timelineIconWrap(<FilePlus className="size-3.5" />);
    body = <p className="text-sm text-foreground/90">{a.title}</p>;
  } else if (meta?.k === "deal_custom") {
    icon = timelineIconWrap(<List className="size-3.5" />);
    body = (
      <>
        <p className="text-sm text-foreground/90">{a.title}</p>
        {meta.fields.length > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {meta.fields.join(" · ")}
          </p>
        ) : null}
      </>
    );
  } else if (meta) {
    body = <p className="text-sm text-foreground/90">{a.title}</p>;
  } else if (a.type === ActivityType.NOTE) {
    const combined =
      a.description && !a.description.startsWith("__MENVE_META__:")
        ? `${a.title}${a.description}`
        : a.title;
    body = (
      <>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Nota
        </p>
        <div className="mt-1.5 rounded-lg border border-border/50 bg-muted/35 px-3 py-2.5 text-sm text-foreground/90 whitespace-pre-wrap">
          {combined}
        </div>
      </>
    );
  } else {
    body = (
      <>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {activityTypeLabel(a.type)}
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">{a.title}</p>
        {a.description ? (
          <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
            {a.description}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="flex w-10 flex-col items-center">
        {icon}
        {!isLast ? (
          <div className="mt-1 min-h-[28px] w-px flex-1 bg-border/70" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1 pb-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-foreground">
            {userName}
          </span>
          <time
            className="text-[11px] tabular-nums text-muted-foreground"
            dateTime={a.createdAt}
          >
            {timeStr}
          </time>
        </div>
        <div className="mt-1">{body}</div>
      </div>
    </div>
  );
}

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

function tagStyle(hex: string | null | undefined) {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    return "border-border/60 bg-muted/50 text-foreground";
  }
  return "border-transparent text-foreground";
}

function assigneePickLabel(user: TenantMemberOption | DealRow["assignedTo"]) {
  if (!user) return "";
  const n = user.name?.trim();
  if (n) return n;
  return user.email?.trim() ?? "";
}

export function PipelineDealDetailDialog({
  deal: initial,
  open,
  onOpenChange,
  pipelineName,
  stages,
  dealCustomFieldDefs,
  tenantMembers = [],
}: {
  deal: DealRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pipelineName: string;
  stages: Stage[];
  dealCustomFieldDefs: CustomField[];
  tenantMembers?: TenantMemberOption[];
}) {
  const router = useRouter();
  const [remote, setRemote] = useState<DealDetailPayload | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [outcomePending, setOutcomePending] = useState(false);
  const [headerBusy, setHeaderBusy] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
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
      setNoteBody("");
      return;
    }
    void reload();
  }, [open, initial?.id, reload]);

  const onReorderSelectOptions = useCallback(
    async (fieldId: string, options: string[]) => {
      await updateCustomField({ id: fieldId, options });
      await reload();
      router.refresh();
    },
    [reload, router],
  );

  const onAppendSelectOption = useCallback(
    async (fieldId: string, label: string) => {
      const def = dealCustomFieldDefs.find((x) => x.id === fieldId);
      const cur = Array.isArray(def?.options)
        ? (def!.options as unknown[]).map(String)
        : [];
      const t = label.trim();
      if (!t) return;
      await updateCustomField({ id: fieldId, options: [...cur, t] });
      await reload();
      router.refresh();
    },
    [dealCustomFieldDefs, reload, router],
  );

  const onCustomFieldCreated = useCallback(() => {
    void reload();
    router.refresh();
  }, [reload, router]);

  const d = remote?.deal ?? initial;

  const activities = useMemo((): DealActivityRow[] => {
    const raw = remote?.activities;
    if (!Array.isArray(raw)) return [];
    return raw.filter((a): a is DealActivityRow => {
      if (!a || typeof a !== "object") return false;
      const o = a as Record<string, unknown>;
      const u = o.user;
      return (
        typeof o.id === "string" &&
        typeof o.title === "string" &&
        typeof o.createdAt === "string" &&
        typeof u === "object" &&
        u !== null
      );
    });
  }, [remote?.activities]);

  const activityTimeline = useMemo(() => {
    const now = new Date();
    const rows: {
      key: string;
      showHeader: boolean;
      header: string;
      activity: DealActivityRow;
    }[] = [];
    let prevHeader = "";
    for (const a of activities) {
      const header = groupLabelForDay(now, new Date(a.createdAt));
      rows.push({
        key: a.id,
        showHeader: header !== prevHeader,
        header,
        activity: a,
      });
      prevHeader = header;
    }
    return rows;
  }, [activities]);

  const custom = d ? readCustom(d.contact) : {};

  const stageList = useMemo(() => {
    const fromApi = remote?.deal?.pipeline?.stages;
    if (fromApi?.length) return fromApi;
    return [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [remote?.deal?.pipeline?.stages, stages]);

  async function onStagePick(stageId: string) {
    if (!d || d.status !== "OPEN" || stageId === d.stageId) return;
    setHeaderBusy(true);
    try {
      await moveDealStage(d.id, stageId);
      await reload();
      router.refresh();
    } finally {
      setHeaderBusy(false);
    }
  }

  async function onAssigneePick(userId: string | null) {
    if (!d) return;
    if (userId === d.assignedTo?.id || (!userId && !d.assignedTo)) return;
    setHeaderBusy(true);
    try {
      await patchDeal(d.id, { assignedToId: userId });
      await reload();
      router.refresh();
    } finally {
      setHeaderBusy(false);
    }
  }

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

  async function onSaveNote() {
    if (!d) return;
    const text = noteBody.trim();
    if (text.length < 1) return;
    setNoteSaving(true);
    try {
      await createDealActivity({
        dealId: d.id,
        contactId: d.contactId,
        type: ActivityType.NOTE,
        title: text.slice(0, 500),
        description: text.length > 500 ? text.slice(500) : undefined,
      });
      setNoteBody("");
      await reload();
      router.refresh();
    } finally {
      setNoteSaving(false);
    }
  }

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
            "flex max-h-[min(94vh,920px)] w-[min(100vw-1rem,80rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl",
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
                {d.status === "OPEN" && stageList.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={headerBusy}
                        className="h-7 gap-1.5 rounded-full border-border/60 px-2.5 text-xs font-medium shadow-none"
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              d.stage.color && /^#[0-9A-Fa-f]{6}$/.test(d.stage.color)
                                ? d.stage.color
                                : "hsl(262 83% 58%)",
                          }}
                        />
                        <span className="max-w-[10rem] truncate">
                          {d.stage.name}
                        </span>
                        <ChevronDown className="size-3.5 shrink-0 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                      {stageList.map((s) => (
                        <DropdownMenuItem
                          key={s.id}
                          disabled={s.id === d.stageId || headerBusy}
                          onClick={() => void onStagePick(s.id)}
                        >
                          <span
                            className="mr-2 size-2 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                s.color && /^#[0-9A-Fa-f]{6}$/.test(s.color)
                                  ? s.color
                                  : "hsl(262 83% 58%)",
                            }}
                          />
                          {s.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-2.5 py-0.5 text-xs font-medium">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          d.stage.color && /^#[0-9A-Fa-f]{6}$/.test(d.stage.color)
                            ? d.stage.color
                            : "hsl(262 83% 58%)",
                      }}
                    />
                    {d.status === "OPEN"
                      ? d.stage.name
                      : d.status === "WON"
                        ? "Ganho"
                        : "Perdido"}
                  </span>
                )}
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

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-10 sm:pb-8">
            {loadErr ? (
              <p className="text-sm text-destructive">{loadErr}</p>
            ) : null}
            {loading && !remote ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : null}

            <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-x-8">
            <div className="min-w-0 space-y-8 lg:pr-1">
            <div className="grid gap-8 border-b border-border/50 pb-8 lg:grid-cols-2 lg:gap-12 lg:border-b-0 lg:pb-0">
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

            <section className="space-y-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Informações
              </h4>
              <ul className="space-y-2.5 text-sm">
                <li className="flex items-start gap-2.5">
                  <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  {d.status === "OPEN" && tenantMembers.length > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={headerBusy}
                          className="h-auto min-h-0 justify-start px-0 py-0 text-left text-sm font-normal hover:bg-transparent"
                        >
                          <span className="text-foreground">
                            {assigneePickLabel(d.assignedTo) || (
                              <span className="text-muted-foreground">
                                Escolher responsável…
                              </span>
                            )}
                          </span>
                          <ChevronDown className="ml-1 size-3.5 shrink-0 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                        {d.assignedTo ? (
                          <>
                            <DropdownMenuItem
                              disabled={headerBusy}
                              onClick={() => void onAssigneePick(null)}
                            >
                              Remover responsável
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        ) : null}
                        {tenantMembers.map((m) => (
                          <DropdownMenuItem
                            key={m.id}
                            disabled={headerBusy || m.id === d.assignedTo?.id}
                            onClick={() => void onAssigneePick(m.id)}
                          >
                            {assigneePickLabel(m) || m.email}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span>
                      {assigneePickLabel(d.assignedTo) || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                  )}
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
                  <span className="text-muted-foreground">
                    Criado em {created}
                  </span>
                </li>
              </ul>
            </section>
            </div>

            {allTags.length > 0 ? (
              <section className="space-y-2">
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

            <section className="space-y-4 lg:min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Campos
                </h4>
                <CreateCustomFieldTrigger
                  defaultEntity={CUSTOM_FIELD_ENTITY.DEAL}
                  idPrefix={`pd-new-${d.id}`}
                  onCreated={onCustomFieldCreated}
                />
              </div>
              <p className="text-[12px] leading-snug text-muted-foreground">
                Passe o mouse e edite na linha — listas e pessoas salvam ao
                selecionar; demais tipos ao sair do campo (Enter também salva).
              </p>

              <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
                <div className="border-b border-border/50 bg-muted/25 px-3 py-2 sm:px-4">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Oportunidade
                  </span>
                </div>
                <div className="min-h-0">
                  {dealCustomFieldDefs.length > 0 ? (
                    <CustomFieldsInlineTable
                      embedded
                      variant="board"
                      fields={dealCustomFieldDefs}
                      customData={d.customData}
                      idPrefix={`pd-d-${d.id}`}
                      members={tenantMembers}
                      onSaveField={async (key, value) => {
                        await updateDealCustomData({
                          dealId: d.id,
                          values: { [key]: value },
                        });
                        await reload();
                        router.refresh();
                      }}
                      onReorderSelectOptions={onReorderSelectOptions}
                      onAppendSelectOption={onAppendSelectOption}
                    />
                  ) : (
                    <p className="px-3 py-4 text-[12px] text-muted-foreground sm:px-4">
                      Nenhum campo de oportunidade. Use «Criar campo» ou
                      Configurações.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {d.title ? (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Oportunidade:</span>{" "}
                {d.title}
              </p>
            ) : null}
            </div>

            <div className="min-w-0 space-y-8 max-lg:mt-8 max-lg:border-t max-lg:border-border/50 max-lg:pt-8 lg:border-l lg:border-border/60 lg:pl-8">
            <section className="space-y-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Notas
              </h4>
              <p className="text-[12px] leading-snug text-muted-foreground">
                Escreva observações livres; elas entram no histórico abaixo.
              </p>
              <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="absolute right-4 top-4 z-10 gap-1.5 shadow-sm"
                  disabled={noteSaving || noteBody.trim().length < 1}
                  onClick={() => void onSaveNote()}
                >
                  <Send className="size-3.5" />
                  {noteSaving ? "Salvando…" : "Salvar"}
                </Button>
                <Label htmlFor={`pd-note-${d.id}`} className="sr-only">
                  Nova nota
                </Label>
                <textarea
                  id={`pd-note-${d.id}`}
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Escreva uma nota..."
                  rows={5}
                  className="min-h-[120px] w-full resize-none border-0 bg-transparent px-4 pb-4 pr-28 pt-14 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-0"
                />
              </div>
            </section>

            <section className="space-y-4">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Histórico
              </h4>
              <p className="text-[12px] leading-snug text-muted-foreground">
                Etapas, responsável, campos da oportunidade, ganho/perda, criação
                e notas — tudo registrado aqui, do mais recente ao mais antigo.
              </p>

              {activities.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum registro ainda. Altere a oportunidade ou adicione uma
                  nota para ver o histórico.
                </p>
              ) : (
                <div className="rounded-xl border border-border/40 bg-muted/10 px-4 py-6 sm:px-6">
                  {activityTimeline.map((row, idx) => (
                    <div key={row.key}>
                      {row.showHeader ? (
                        <p
                          className={cn(
                            "mb-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
                            idx > 0 ? "mt-8 border-t border-border/40 pt-8" : "",
                          )}
                        >
                          {row.header}
                        </p>
                      ) : null}
                      <DealHistoryRow
                        a={row.activity}
                        isLast={idx === activityTimeline.length - 1}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
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
