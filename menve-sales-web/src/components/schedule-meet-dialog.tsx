"use client";

import { useEffect, useState } from "react";
import {
  createMeetingWithGoogle,
  getGoogleCalendarStatus,
  getGoogleConnectUrl,
} from "@/actions/agenda";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export function ScheduleMeetDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
  defaultTitle,
  onScheduled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  contactName: string;
  defaultTitle?: string;
  onScheduled?: (result: { enteredPipeline: boolean }) => void;
}) {
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [duration, setDuration] = useState(30);
  const [description, setDescription] = useState("");
  const [googleOk, setGoogleOk] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle?.trim() || `Reunião: ${contactName}`);
    setError(null);
    setSuccess(null);
    setLoadingStatus(true);
    void getGoogleCalendarStatus()
      .then((s) => setGoogleOk(s.connected))
      .catch(() => setGoogleOk(false))
      .finally(() => setLoadingStatus(false));
  }, [open, contactName, defaultTitle]);

  async function onConnectGoogle() {
    setConnecting(true);
    try {
      const { url } = await getGoogleConnectUrl();
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao conectar Google");
      setConnecting(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dueAt) {
      setError("Informe data e hora da reunião");
      return;
    }
    if (!googleOk) {
      setError("Conecte o Google Calendar para gerar link do Meet");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createMeetingWithGoogle({
        title: title.trim() || `Reunião: ${contactName}`,
        description: description.trim() || undefined,
        dueAt: new Date(dueAt).toISOString(),
        durationMinutes: duration,
        contactId,
        createGoogleMeet: true,
      });
      setSuccess("Lead entrou na Gestão de leads com reunião agendada.");
      onScheduled?.({ enteredPipeline: true });
      setTimeout(() => {
        onOpenChange(false);
        setSuccess(null);
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao agendar reunião");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => void onSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Agendar reunião com Google Meet</DialogTitle>
            <DialogDescription>
              Contato: <strong>{contactName}</strong>. Ao confirmar, o lead
              entra na Gestão de leads na etapa Reunião agendada.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {loadingStatus ? (
              <p className="text-sm text-muted-foreground">Verificando Google…</p>
            ) : !googleOk ? (
              <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 p-3 text-sm text-muted-foreground">
                <p className="mb-3">
                  Conecte o Google Calendar para criar o link do Meet.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={connecting}
                  onClick={() => void onConnectGoogle()}
                >
                  {connecting ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
                  Conectar Google
                </Button>
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="meet-title">Título</Label>
              <Input
                id="meet-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="meet-due">Data e hora</Label>
              <Input
                id="meet-due"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="meet-duration">Duração (min)</Label>
              <Input
                id="meet-duration"
                type="number"
                min={15}
                max={480}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) || 30)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="meet-desc">Descrição (opcional)</Label>
              <Input
                id="meet-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
            {success ? (
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                {success}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !googleOk}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Agendar Meet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
