"use client";

import { Bot, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import {
  activateGabrielOnConversation,
  takeoverConversation,
} from "@/actions/agents";
import { Button } from "@/components/ui/button";
import type { InboxConversation } from "./inbox-types";

export function QualificationBanner({
  conversation,
  gabrielEnabled = false,
  onTakeover,
}: {
  conversation: InboxConversation;
  gabrielEnabled?: boolean;
  onTakeover: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mode = conversation.qualificationMode ?? "NONE";

  async function handleTakeover() {
    setBusy(true);
    setError(null);
    try {
      await takeoverConversation(conversation.id);
      onTakeover();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao assumir conversa");
    } finally {
      setBusy(false);
    }
  }

  async function handleActivate() {
    setBusy(true);
    setError(null);
    try {
      await activateGabrielOnConversation(conversation.id);
      onTakeover();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível ativar o Gabriel",
      );
    } finally {
      setBusy(false);
    }
  }

  if (mode === "NONE" && gabrielEnabled && conversation.outreachRecipientId) {
    return (
      <div className="relative flex shrink-0 items-center justify-between gap-3 border-b border-violet-500/20 bg-violet-500/5 px-4 py-2.5 text-sm dark:bg-violet-500/10">
        <div className="flex min-w-0 items-center gap-2 text-violet-950 dark:text-violet-100">
          <Sparkles className="size-4 shrink-0" aria-hidden />
          <p className="min-w-0">
            Este lead respondeu ao <span className="font-medium">Disparo</span>.
            Ative o Gabriel para qualificar (texto e áudio).
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="shrink-0"
          disabled={busy}
          onClick={() => void handleActivate()}
        >
          {busy ? (
            <>
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              Ativando…
            </>
          ) : (
            "Ativar Gabriel"
          )}
        </Button>
        {error ? (
          <p className="absolute bottom-0 left-4 translate-y-full pt-1 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (mode !== "AI_ACTIVE" && mode !== "AI_PAUSED") return null;

  return (
    <div className="relative flex shrink-0 items-center justify-between gap-3 border-b border-violet-500/25 bg-violet-500/10 px-4 py-2.5 text-sm dark:border-violet-400/20 dark:bg-violet-500/15">
      <div className="flex min-w-0 items-center gap-2 text-violet-950 dark:text-violet-100">
        <Bot className="size-4 shrink-0" aria-hidden />
        <p className="min-w-0">
          <span className="font-medium">Gabriel</span> está qualificando este
          lead (lê texto e áudio). Modo somente leitura.
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="shrink-0"
        disabled={busy}
        onClick={() => void handleTakeover()}
      >
        {busy ? (
          <>
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            Assumindo…
          </>
        ) : (
          "Assumir conversa"
        )}
      </Button>
      {error ? (
        <p className="absolute bottom-0 left-4 translate-y-full pt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
