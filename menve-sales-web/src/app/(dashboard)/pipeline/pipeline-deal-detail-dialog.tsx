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
  Briefcase,
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
  Tag as TagIcon,
  User,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { patchContact } from "@/actions/contacts";
import { updateCustomField, updateDealCustomData } from "@/actions/custom-fields";
import {
  createDealActivity,
  getDealDetail,
  markDealLost,
  markDealWon,
  moveDealStage,
  patchDeal,
} from "@/actions/deals";
import {
  addTagToContact,
  createTag,
  listTags,
  removeTagFromContact,
} from "@/actions/tags";
import { CreateCustomFieldTrigger } from "@/components/custom-fields/create-custom-field-dialog";
import { CustomFieldsInlineTable } from "@/components/custom-fields/custom-fields-inline-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { CUSTOM_FIELD_ENTITY } from "@/lib/custom-field-entity";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import { parseMenveActivityMeta } from "@/lib/deal-activity-meta";
import { parseMoneyBrlFromInput } from "@/lib/custom-field-value-helpers";
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
  allTags?: Tag[];
  campaignSources?: CampaignSource[];
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

const sectionLabelClass =
  "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

const contactInputClass =
  "w-full min-w-0 border-0 bg-transparent p-0 text-sm text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground/80 placeholder:italic focus-visible:ring-0 disabled:opacity-50";

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
  const [contactFieldBusy, setContactFieldBusy] = useState(false);
  const [emailLocal, setEmailLocal] = useState("");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [companyLocal, setCompanyLocal] = useState("");
  const [jobTitleLocal, setJobTitleLocal] = useState("");
  const [dealValueLocal, setDealValueLocal] = useState("");
  const [tagAddOpen, setTagAddOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [tagBusy, setTagBusy] = useState(false);

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
      setTagAddOpen(false);
      setNewTagName("");
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

  const catalogTags = useMemo((): Tag[] => {
    const raw = remote?.allTags;
    if (!Array.isArray(raw)) return [];
    return raw as Tag[];
  }, [remote?.allTags]);

  const campaignSources = useMemo((): CampaignSource[] => {
    const raw = remote?.campaignSources;
    if (!Array.isArray(raw)) return [];
    return raw as CampaignSource[];
  }, [remote?.campaignSources]);

  const contactJobTitle =
    d?.contact && "jobTitle" in d.contact
      ? (d.contact as Contact & { jobTitle?: string | null }).jobTitle ?? ""
      : "";

  useEffect(() => {
    if (!d) return;
    setEmailLocal(d.contact.email?.trim() ?? "");
    setPhoneLocal(d.contact.phone?.trim() ?? "");
    setCompanyLocal(d.contact.company?.trim() ?? "");
    setJobTitleLocal((contactJobTitle ?? "").trim());
    if (d.value != null && Number.isFinite(Number(d.value))) {
      setDealValueLocal(
        Number(d.value).toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      );
    } else {
      setDealValueLocal("");
    }
  }, [d?.id, d?.contact.email, d?.contact.phone, d?.contact.company, d?.value, contactJobTitle]);

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

  const contactTagIdSet = useMemo(() => {
    if (!d) return new Set<string>();
    return new Set((d.contact.contactTags ?? []).map((x) => x.tag.id));
  }, [d]);

  async function flushContactField(patch: {
    email?: string;
    phone?: string | null;
    company?: string | null;
    jobTitle?: string | null;
    campaignSourceId?: string | null;
  }) {
    if (!d) return;
    setContactFieldBusy(true);
    try {
      await patchContact({ contactId: d.contactId, ...patch });
      await reload();
      router.refresh();
    } finally {
      setContactFieldBusy(false);
    }
  }

  async function commitDealValue() {
    if (!d) return;
    const raw = dealValueLocal.trim();
    const prev = d.value != null ? Number(d.value) : null;
    if (raw === "") {
      if (prev == null) return;
      setHeaderBusy(true);
      try {
        await patchDeal(d.id, { value: null });
        await reload();
        router.refresh();
      } finally {
        setHeaderBusy(false);
      }
      return;
    }
    const n = parseMoneyBrlFromInput(raw);
    if (!Number.isFinite(n)) {
      if (d.value != null && Number.isFinite(Number(d.value))) {
        setDealValueLocal(
          Number(d.value).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
        );
      } else setDealValueLocal("");
      return;
    }
    if (prev != null && Math.abs(prev - n) < 0.005) return;
    setHeaderBusy(true);
    try {
      await patchDeal(d.id, { value: n });
      await reload();
      router.refresh();
    } finally {
      setHeaderBusy(false);
    }
  }

  async function onAddTagFromCatalog(tagId: string) {
    if (!d) return;
    setTagBusy(true);
    try {
      await addTagToContact(d.contactId, tagId);
      setTagAddOpen(false);
      await reload();
      router.refresh();
    } finally {
      setTagBusy(false);
    }
  }

  async function onCreateTagAndAdd() {
    if (!d) return;
    const n = newTagName.trim();
    if (n.length < 1) return;
    setTagBusy(true);
    try {
      await createTag({ name: n });
      const list = await listTags();
      const t = list.find(
        (x) => x.name.trim().toLowerCase() === n.toLowerCase(),
      );
      if (t) await addTagToContact(d.contactId, t.id);
      setNewTagName("");
      setTagAddOpen(false);
      await reload();
      router.refresh();
    } finally {
      setTagBusy(false);
    }
  }

  async function onRemoveContactTag(tagId: string) {
    if (!d) return;
    setTagBusy(true);
    try {
      await removeTagFromContact(d.contactId, tagId);
      await reload();
      router.refresh();
    } finally {
      setTagBusy(false);
    }
  }

  if (!initial || !d) return null;

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
            <div className="min-w-0 space-y-10 lg:pr-1">
            <section className="space-y-1">
              <h4 className={sectionLabelClass}>Contato</h4>
              <div className="flex items-center gap-3 rounded-lg py-3 transition-colors hover:bg-muted/35">
                <Mail className="size-4 shrink-0 stroke-[1.5] text-muted-foreground" />
                <input
                  type="email"
                  autoComplete="email"
                  disabled={contactFieldBusy}
                  placeholder="Adicionar email"
                  className={contactInputClass}
                  value={emailLocal}
                  onChange={(e) => setEmailLocal(e.target.value)}
                  onBlur={() => {
                    const t = emailLocal.trim();
                    const cur = d.contact.email?.trim() ?? "";
                    if (t === cur) return;
                    if (t === "") {
                      void flushContactField({ email: "" });
                      return;
                    }
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) {
                      setEmailLocal(cur);
                      return;
                    }
                    void flushContactField({ email: t });
                  }}
                />
              </div>
              <div className="flex items-center gap-3 rounded-lg py-3 transition-colors hover:bg-muted/35">
                <Phone className="size-4 shrink-0 stroke-[1.5] text-muted-foreground" />
                <input
                  type="tel"
                  autoComplete="tel"
                  disabled={contactFieldBusy}
                  placeholder="Adicionar telefone"
                  className={contactInputClass}
                  value={phoneLocal}
                  onChange={(e) => setPhoneLocal(e.target.value)}
                  onBlur={() => {
                    const t = phoneLocal.trim();
                    const cur = d.contact.phone?.trim() ?? "";
                    if (t === cur) return;
                    void flushContactField({
                      phone: t === "" ? null : t,
                    });
                  }}
                />
              </div>
              <div className="flex items-center gap-3 rounded-lg py-3 transition-colors hover:bg-muted/35">
                <Building2 className="size-4 shrink-0 stroke-[1.5] text-muted-foreground" />
                <input
                  type="text"
                  disabled={contactFieldBusy}
                  placeholder="Adicionar empresa"
                  className={contactInputClass}
                  value={companyLocal}
                  onChange={(e) => setCompanyLocal(e.target.value)}
                  onBlur={() => {
                    const t = companyLocal.trim();
                    const cur = d.contact.company?.trim() ?? "";
                    if (t === cur) return;
                    void flushContactField({
                      company: t === "" ? null : t,
                    });
                  }}
                />
              </div>
              <div className="flex items-center gap-3 rounded-lg py-3 transition-colors hover:bg-muted/35">
                <Briefcase className="size-4 shrink-0 stroke-[1.5] text-muted-foreground" />
                <input
                  type="text"
                  disabled={contactFieldBusy}
                  placeholder="Adicionar cargo"
                  className={contactInputClass}
                  value={jobTitleLocal}
                  onChange={(e) => setJobTitleLocal(e.target.value)}
                  onBlur={() => {
                    const t = jobTitleLocal.trim();
                    const cur = (contactJobTitle ?? "").trim();
                    if (t === cur) return;
                    void flushContactField({
                      jobTitle: t === "" ? null : t,
                    });
                  }}
                />
              </div>
            </section>

            <section
              className="space-y-1 lg:min-w-0"
              aria-label="Campos da oportunidade e do lead"
            >
              <div className="flex justify-end pb-1">
                <CreateCustomFieldTrigger
                  defaultEntity={CUSTOM_FIELD_ENTITY.DEAL}
                  idPrefix={`pd-new-${d.id}`}
                  onCreated={onCustomFieldCreated}
                />
              </div>
              <div className="flex items-center gap-3 rounded-lg py-3 transition-colors hover:bg-muted/35">
                <User className="size-4 shrink-0 stroke-[1.5] text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  {d.status === "OPEN" && tenantMembers.length > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          disabled={headerBusy}
                          className={cn(
                            "flex w-full min-w-0 items-center gap-2.5 py-0.5 text-left text-sm outline-none",
                            !d.assignedTo && "italic text-muted-foreground",
                          )}
                        >
                          {d.assignedTo ? (
                            <>
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-medium text-white">
                                {(
                                  assigneePickLabel(d.assignedTo).slice(0, 1) ||
                                  "?"
                                ).toUpperCase()}
                              </span>
                              <span className="truncate text-foreground">
                                {assigneePickLabel(d.assignedTo)}
                              </span>
                            </>
                          ) : (
                            <span>Atribuir responsável</span>
                          )}
                          <ChevronDown className="ml-auto size-3.5 shrink-0 opacity-40" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        className="max-h-64 w-[min(100vw-2rem,16rem)] overflow-y-auto"
                      >
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
                            className="gap-2"
                          >
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground">
                              {(
                                assigneePickLabel(m).slice(0, 1) || "?"
                              ).toUpperCase()}
                            </span>
                            <span className="truncate">
                              {assigneePickLabel(m) || m.email}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <span className="text-sm">
                      {assigneePickLabel(d.assignedTo) || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg py-3 transition-colors hover:bg-muted/35">
                <DollarSign className="size-4 shrink-0 stroke-[1.5] text-muted-foreground" />
                <Input
                  inputMode="decimal"
                  disabled={headerBusy}
                  placeholder="R$ 0,00"
                  className="h-9 border-border/50 bg-transparent text-sm font-medium shadow-none focus-visible:ring-1"
                  value={dealValueLocal}
                  onChange={(e) => setDealValueLocal(e.target.value)}
                  onBlur={() => void commitDealValue()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                />
              </div>

              <div className="flex items-center gap-3 rounded-lg py-3 transition-colors hover:bg-muted/35">
                <Globe className="size-4 shrink-0 stroke-[1.5] text-muted-foreground" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={contactFieldBusy}
                      className={cn(
                        "flex w-full min-w-0 items-center gap-2 py-0.5 text-left text-sm outline-none",
                        !d.contact.campaignSource &&
                          "italic text-muted-foreground",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {d.contact.campaignSource?.name ?? "Adicionar origem"}
                      </span>
                      <ChevronDown className="size-3.5 shrink-0 opacity-40" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="max-h-64 w-[min(100vw-2rem,14rem)] overflow-y-auto"
                  >
                    <DropdownMenuItem
                      disabled={contactFieldBusy}
                      onClick={() =>
                        void flushContactField({ campaignSourceId: null })
                      }
                    >
                      Nenhuma
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {campaignSources.map((s) => (
                      <DropdownMenuItem
                        key={s.id}
                        disabled={contactFieldBusy}
                        onClick={() =>
                          void flushContactField({
                            campaignSourceId: s.id,
                          })
                        }
                      >
                        {s.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-lg py-3 transition-colors hover:bg-muted/35">
                <TagIcon className="size-4 shrink-0 stroke-[1.5] text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  {allTags.map(({ tag }) => (
                    <span
                      key={tag.id}
                      className={cn(
                        "inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                        tagStyle(tag.color),
                      )}
                      style={
                        tag.color && /^#[0-9A-Fa-f]{6}$/.test(tag.color)
                          ? { backgroundColor: `${tag.color}33` }
                          : undefined
                      }
                    >
                      {tag.name}
                      {contactTagIdSet.has(tag.id) ? (
                        <button
                          type="button"
                          disabled={tagBusy}
                          className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-black/10 hover:text-foreground"
                          aria-label={`Remover tag ${tag.name}`}
                          onClick={() => void onRemoveContactTag(tag.id)}
                        >
                          ×
                        </button>
                      ) : null}
                    </span>
                  ))}
                  <Popover open={tagAddOpen} onOpenChange={setTagAddOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        disabled={tagBusy}
                        className="inline-flex items-center gap-1 rounded-full border border-dashed border-border/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground"
                      >
                        + Tag
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" align="start">
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Adicionar tag
                      </p>
                      <div className="max-h-40 space-y-0.5 overflow-y-auto">
                        {catalogTags
                          .filter((t) => !contactTagIdSet.has(t.id))
                          .map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              disabled={tagBusy}
                              className="flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                              onClick={() => void onAddTagFromCatalog(t.id)}
                            >
                              {t.name}
                            </button>
                          ))}
                      </div>
                      <div className="mt-3 border-t border-border/50 pt-3">
                        <input
                          type="text"
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                          placeholder="Nova tag…"
                          className="mb-2 w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-sm"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void onCreateTagAndAdd();
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="w-full"
                          disabled={tagBusy || newTagName.trim().length < 1}
                          onClick={() => void onCreateTagAndAdd()}
                        >
                          Criar e aplicar
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg py-3 text-sm">
                <Calendar className="size-4 shrink-0 stroke-[1.5] text-muted-foreground" />
                <span>
                  <span className="text-muted-foreground">Criado: </span>
                  <span className="text-foreground">{created}</span>
                </span>
              </div>

              {dealCustomFieldDefs.length > 0 ? (
                <CustomFieldsInlineTable
                  embedded
                  variant="minimal"
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
                <p className="py-2 text-[12px] text-muted-foreground">
                  Nenhum campo extra nesta oportunidade. Use «Criar campo» acima
                  ou Configurações.
                </p>
              )}
            </section>

            {d.title ? (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Título:</span>{" "}
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
                <Label htmlFor={`pd-note-${d.id}`} className="sr-only">
                  Nova nota
                </Label>
                <textarea
                  id={`pd-note-${d.id}`}
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Escreva uma nota..."
                  rows={5}
                  className="min-h-[128px] w-full resize-none border-0 bg-transparent px-4 pt-4 pb-14 pr-28 text-left align-top text-sm leading-normal outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-0"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="absolute bottom-4 right-4 z-10 gap-1.5 shadow-sm"
                  disabled={noteSaving || noteBody.trim().length < 1}
                  onClick={() => void onSaveNote()}
                >
                  <Send className="size-3.5" />
                  {noteSaving ? "Salvando…" : "Salvar"}
                </Button>
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
