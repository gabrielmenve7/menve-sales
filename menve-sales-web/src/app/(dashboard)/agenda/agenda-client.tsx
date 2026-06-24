"use client";

import { useCallback, useMemo, useState } from "react";
import {
  createMeetingWithGoogle,
  getGoogleConnectUrl,
  listAgendaActivities,
  type AgendaActivity,
} from "@/actions/agenda";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, Link2, Loader2, Plus } from "lucide-react";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8);

export function AgendaClient({
  initialActivities,
  initialWeekStart,
  googleConnected,
  initialContact = null,
}: {
  initialActivities: AgendaActivity[];
  initialWeekStart: string;
  googleConnected: boolean;
  initialContact?: { id: string; name: string } | null;
}) {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(parseISO(initialWeekStart), { weekStartsOn: 1 }),
  );
  const [activities, setActivities] = useState(initialActivities);
  const [googleOk, setGoogleOk] = useState(googleConnected);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [duration, setDuration] = useState(30);
  const [description, setDescription] = useState("");
  const [contactId, setContactId] = useState(initialContact?.id ?? "");
  const [contactName, setContactName] = useState(initialContact?.name ?? "");

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const loadWeek = useCallback(async (start: Date) => {
    setLoading(true);
    try {
      const end = addDays(start, 7);
      const rows = await listAgendaActivities({
        from: start.toISOString(),
        to: end.toISOString(),
      });
      setActivities(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  function shiftWeek(delta: number) {
    const next = addDays(weekStart, delta * 7);
    setWeekStart(next);
    void loadWeek(next);
  }

  function activitiesForDay(day: Date) {
    const key = format(day, "yyyy-MM-dd");
    return activities.filter((a) => {
      if (!a.dueAt) return false;
      return format(parseISO(a.dueAt), "yyyy-MM-dd") === key;
    });
  }

  async function onConnectGoogle() {
    setConnecting(true);
    try {
      const { url } = await getGoogleConnectUrl();
      window.location.href = url;
    } catch (e) {
      alert(e instanceof Error ? e.message : "Falha ao conectar Google");
      setConnecting(false);
    }
  }

  async function onCreateMeeting(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createMeetingWithGoogle({
        title,
        description: description || undefined,
        dueAt: new Date(dueAt).toISOString(),
        durationMinutes: duration,
        createGoogleMeet: googleOk,
        contactId: contactId.trim() || undefined,
      });
      setModalOpen(false);
      setTitle("");
      setDueAt("");
      setDescription("");
      await loadWeek(weekStart);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar reunião");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground">
            Atividades e reuniões da semana
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!googleOk ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={connecting}
              onClick={() => void onConnectGoogle()}
            >
              {connecting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Link2 className="size-4" />
              )}
              <span className="ml-2">Conectar Google</span>
            </Button>
          ) : (
            <Badge variant="secondary" className="h-9 px-3">
              Google conectado
            </Badge>
          )}
          <Button type="button" size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="size-4" />
            <span className="ml-2">Agendar reunião</span>
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => shiftWeek(-1)}>
          ← Semana anterior
        </Button>
        <p className="text-sm font-medium">
          {format(weekStart, "d MMM", { locale: ptBR })} –{" "}
          {format(addDays(weekStart, 6), "d MMM yyyy", { locale: ptBR })}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={() => shiftWeek(1)}>
          Próxima semana →
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <div className="grid min-w-[720px] grid-cols-8 border-b bg-muted/30 text-xs font-medium">
            <div className="p-2 text-muted-foreground">Hora</div>
            {days.map((d) => (
              <div key={d.toISOString()} className="border-l p-2 text-center">
                <div>{format(d, "EEE", { locale: ptBR })}</div>
                <div className="text-muted-foreground">
                  {format(d, "d/M", { locale: ptBR })}
                </div>
              </div>
            ))}
          </div>
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="grid min-w-[720px] grid-cols-8 border-b last:border-b-0"
            >
              <div className="p-2 text-xs text-muted-foreground">
                {String(hour).padStart(2, "0")}:00
              </div>
              {days.map((day) => {
                const dayActs = activitiesForDay(day).filter((a) => {
                  if (!a.dueAt) return false;
                  const h = parseISO(a.dueAt).getHours();
                  return h === hour;
                });
                return (
                  <div
                    key={day.toISOString() + hour}
                    className="min-h-[52px] border-l p-1"
                  >
                    {dayActs.map((a) => (
                      <div
                        key={a.id}
                        className={cn(
                          "mb-1 rounded px-1.5 py-1 text-[10px] leading-tight",
                          a.type === "MEETING"
                            ? "bg-primary/15 text-primary"
                            : "bg-muted",
                        )}
                        title={a.title}
                      >
                        <div className="truncate font-medium">{a.title}</div>
                        {a.meetLink ? (
                          <a
                            href={a.meetLink}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-0.5 text-[9px] underline"
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <Calendar className="size-2.5" />
                            Meet
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar reunião</DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(e) => void onCreateMeeting(e)}>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {contactId ? (
              <p className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                Contato: <strong className="text-foreground">{contactName || contactId}</strong>
                {googleOk ? (
                  <span className="block text-xs">
                    Ao salvar com Meet, o lead entra na Gestão de leads.
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Para levar o lead à Gestão de leads, abra a Agenda a partir do
                Atendimento ou informe o ID do contato na URL (?contact=…).
              </p>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="meet-title">Título</Label>
              <Input
                id="meet-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="meet-when">Data e hora</Label>
              <Input
                id="meet-when"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="meet-dur">Duração (min)</Label>
              <Input
                id="meet-dur"
                type="number"
                min={15}
                max={480}
                step={15}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="meet-desc">Descrição (opcional)</Label>
              <textarea
                id="meet-desc"
                className="min-h-[80px] w-full rounded-md border border-border bg-background p-2 text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {googleOk ? (
              <p className="text-xs text-muted-foreground">
                Um link do Google Meet será criado automaticamente.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Conecte o Google para gerar link do Meet.
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                <span className={saving ? "ml-2" : ""}>Criar reunião</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
