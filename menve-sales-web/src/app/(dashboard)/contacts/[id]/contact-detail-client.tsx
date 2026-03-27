"use client";

import type {
  Activity,
  CampaignSource,
  Contact,
  ContactTag,
  CustomField,
  Deal,
  Message,
  MessageDirection,
  Pipeline,
  Stage,
  Tag,
  User,
} from "@prisma/client";
import { ActivityType } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { updateContactCustomData } from "@/actions/custom-fields";
import { createActivity } from "@/actions/activities";
import {
  addTagToContact,
  createTag,
  removeTagFromContact,
} from "@/actions/tags";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";

type ActivityRow = Activity & {
  user: Pick<User, "name" | "email">;
};

type MessageRow = Message & {
  user: Pick<User, "name" | "email"> | null;
};

type DealRow = Deal & {
  stage: Stage;
  pipeline: Pipeline;
  assignedTo: Pick<User, "name" | "email"> | null;
};

type ContactRow = Contact & {
  campaignSource: CampaignSource | null;
  contactTags: (ContactTag & { tag: Tag })[];
  deals: DealRow[];
};

type TimelineEntry =
  | {
      key: string;
      at: Date;
      kind: "activity";
      title: string;
      subtitle: string;
      badge: string;
    }
  | {
      key: string;
      at: Date;
      kind: "message";
      title: string;
      subtitle: string;
      badge: string;
      direction: MessageDirection;
    }
  | {
      key: string;
      at: Date;
      kind: "deal";
      title: string;
      subtitle: string;
      badge: string;
    };

function customDataToStringMap(
  fields: CustomField[],
  customData: unknown,
): Record<string, string> {
  const base =
    customData && typeof customData === "object" && !Array.isArray(customData)
      ? (customData as Record<string, unknown>)
      : {};
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = base[f.key];
    if (v === undefined || v === null) out[f.key] = "";
    else if (typeof v === "number") out[f.key] = String(v);
    else {
      const s = String(v);
      out[f.key] =
        f.fieldType === "DATE" && s.includes("T") ? s.slice(0, 10) : s;
    }
  }
  return out;
}

function ContactCustomFieldsForm({
  contactId,
  fields,
  customData,
}: {
  contactId: string;
  fields: CustomField[];
  customData: unknown;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    customDataToStringMap(fields, customData),
  );

  useEffect(() => {
    setValues(customDataToStringMap(fields, customData));
  }, [contactId, fields, customData]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of fields) {
        payload[f.key] = values[f.key] ?? "";
      }
      await updateContactCustomData({ contactId, values: payload });
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
      {err ? <p className="text-sm text-destructive">{err}</p> : null}
      {fields.map((f) => {
        const val = values[f.key] ?? "";
        const label = (
          <Label htmlFor={`cf-${f.id}`}>
            {f.name}
            {f.required ? <span className="text-destructive"> *</span> : null}
          </Label>
        );
        if (f.fieldType === "SELECT") {
          const opts = Array.isArray(f.options)
            ? (f.options as unknown[]).map(String)
            : [];
          return (
            <div key={f.id} className="grid gap-1">
              {label}
              <select
                id={`cf-${f.id}`}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                required={f.required}
                value={val}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
              >
                <option value="">
                  {f.required ? "Selecione…" : "—"}
                </option>
                {opts.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          );
        }
        const inputType =
          f.fieldType === "NUMBER"
            ? "number"
            : f.fieldType === "DATE"
              ? "date"
              : "text";
        return (
          <div key={f.id} className="grid gap-1">
            {label}
            <Input
              id={`cf-${f.id}`}
              type={inputType}
              required={f.required}
              value={val}
              onChange={(e) =>
                setValues((prev) => ({ ...prev, [f.key]: e.target.value }))
              }
            />
          </div>
        );
      })}
      <Button type="submit" disabled={loading} size="sm">
        {loading ? "Salvando…" : "Salvar campos extras"}
      </Button>
    </form>
  );
}

export function ContactDetailClient({
  contact,
  activities,
  messages,
  allTags,
  customFields,
}: {
  contact: ContactRow;
  activities: ActivityRow[];
  messages: MessageRow[];
  allTags: Tag[];
  customFields: CustomField[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [tagBusy, setTagBusy] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  const tagIdsOnContact = useMemo(
    () => new Set(contact.contactTags.map((ct) => ct.tagId)),
    [contact.contactTags],
  );

  const availableToAdd = allTags.filter((t) => !tagIdsOnContact.has(t.id));

  async function onAddTag(tagId: string) {
    setTagBusy(true);
    try {
      await addTagToContact(contact.id, tagId);
      router.refresh();
    } finally {
      setTagBusy(false);
    }
  }

  async function onRemoveTag(tagId: string) {
    setTagBusy(true);
    try {
      await removeTagFromContact(contact.id, tagId);
      router.refresh();
    } finally {
      setTagBusy(false);
    }
  }

  async function onCreateTag(e: React.FormEvent) {
    e.preventDefault();
    const name = newTagName.trim();
    if (!name) return;
    setTagBusy(true);
    try {
      await createTag({ name });
      setNewTagName("");
      router.refresh();
    } finally {
      setTagBusy(false);
    }
  }

  const timeline = useMemo(() => {
    const entries: TimelineEntry[] = [];

    for (const a of activities) {
      entries.push({
        key: `a-${a.id}`,
        at: a.createdAt,
        kind: "activity",
        title: a.title,
        subtitle: a.description ?? "",
        badge: a.type,
      });
    }

    for (const m of messages) {
      entries.push({
        key: `m-${m.id}`,
        at: m.createdAt,
        kind: "message",
        title: m.direction === "OUTBOUND" ? "Mensagem enviada" : "Mensagem recebida",
        subtitle: m.body,
        badge: m.direction,
        direction: m.direction,
      });
    }

    for (const d of contact.deals) {
      entries.push({
        key: `d-${d.id}`,
        at: d.createdAt,
        kind: "deal",
        title: d.title,
        subtitle: `${d.pipeline.name} · ${d.stage.name} · ${d.status}`,
        badge: d.status,
      });
    }

    entries.sort((x, y) => y.at.getTime() - x.at.getTime());
    return entries;
  }, [activities, messages, contact.deals]);

  async function onActivity(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    await createActivity({
      title: String(fd.get("title") ?? ""),
      type: fd.get("type") as ActivityType,
      contactId: contact.id,
      dueAt: String(fd.get("dueAt") ?? "") || undefined,
      description: String(fd.get("description") ?? "") || undefined,
    });
    setLoading(false);
    e.currentTarget.reset();
    router.refresh();
  }

  const types: ActivityType[] = [
    ActivityType.CALL,
    ActivityType.EMAIL,
    ActivityType.MEETING,
    ActivityType.TASK,
    ActivityType.NOTE,
    ActivityType.WHATSAPP,
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Resumo</CardTitle>
            <CardDescription>Dados e origem</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {contact.company ? (
              <p>
                <span className="text-muted-foreground">Empresa:</span>{" "}
                {contact.company}
              </p>
            ) : null}
            <p>
              <span className="text-muted-foreground">Campanha / UTM:</span>{" "}
              {contact.utmCampaign ??
                contact.campaignSource?.name ??
                "—"}{" "}
              {contact.utmSource ? `(${contact.utmSource})` : ""}
            </p>
          </CardContent>
        </Card>

        {customFields.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Campos extras</CardTitle>
              <CardDescription>
                Definidos em Configurações para este tenant.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ContactCustomFieldsForm
                contactId={contact.id}
                fields={customFields}
                customData={contact.customData}
              />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Tags</CardTitle>
            <CardDescription>Segmentação e campanhas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {contact.contactTags.length === 0 ? (
                <span className="text-sm text-muted-foreground">
                  Nenhuma tag.
                </span>
              ) : (
                contact.contactTags.map((ct) => (
                  <Badge
                    key={ct.tagId}
                    variant="secondary"
                    className="gap-1 pr-1"
                  >
                    {ct.tag.name}
                    <button
                      type="button"
                      className="ml-1 rounded-full px-1 hover:bg-background/80"
                      disabled={tagBusy}
                      aria-label={`Remover ${ct.tag.name}`}
                      onClick={() => onRemoveTag(ct.tagId)}
                    >
                      ×
                    </button>
                  </Badge>
                ))
              )}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1">
                <Label htmlFor="add-tag">Adicionar tag</Label>
                <select
                  id="add-tag"
                  className="flex h-9 min-w-[180px] rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  defaultValue=""
                  disabled={tagBusy || availableToAdd.length === 0}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) {
                      void onAddTag(v);
                      e.target.value = "";
                    }
                  }}
                >
                  <option value="">
                    {availableToAdd.length === 0
                      ? "Todas já aplicadas"
                      : "Selecione…"}
                  </option>
                  {availableToAdd.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <form onSubmit={onCreateTag} className="flex flex-wrap gap-2">
              <Input
                placeholder="Nova tag"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="max-w-xs"
              />
              <Button type="submit" size="sm" disabled={tagBusy || !newTagName.trim()}>
                Criar tag
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Oportunidades</CardTitle>
            <CardDescription>Deals vinculados a este contato</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {contact.deals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum deal ainda. Crie um no Pipeline.
              </p>
            ) : (
              <ul className="space-y-2">
                {contact.deals.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{d.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {d.stage.name} · {d.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div>
          <h2 className="mb-3 text-lg font-semibold">Timeline</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Atividades, mensagens WhatsApp e deals em ordem cronológica.
          </p>
          <div className="space-y-0">
            {timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum evento registrado ainda.
              </p>
            ) : (
              timeline.map((item, i) => (
                <div key={item.key}>
                  {i > 0 ? <Separator className="my-3" /> : null}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{item.title}</p>
                      {item.subtitle ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                          {item.subtitle}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.at.toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <Badge
                      variant={
                        item.kind === "message" &&
                        item.direction === "INBOUND"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {item.badge}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Card className="h-fit lg:sticky lg:top-6">
        <CardHeader>
          <CardTitle>Registrar atividade</CardTitle>
          <CardDescription>Ligação, tarefa ou nota neste contato</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onActivity} className="space-y-3">
            <div>
              <Label htmlFor="title">Título</Label>
              <Input id="title" name="title" required />
            </div>
            <div>
              <Label htmlFor="type">Tipo</Label>
              <select
                id="type"
                name="type"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                defaultValue={ActivityType.TASK}
              >
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="dueAt">Prazo (opcional)</Label>
              <Input id="dueAt" name="dueAt" type="datetime-local" />
            </div>
            <div>
              <Label htmlFor="description">Descrição</Label>
              <textarea
                id="description"
                name="description"
                className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Salvando…" : "Adicionar à timeline"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
