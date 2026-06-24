"use client";

import { Bot, Loader2 } from "lucide-react";
import { useState } from "react";
import { takeoverConversation } from "@/actions/agents";
import { Button } from "@/components/ui/button";
import type { InboxConversation } from "./inbox-types";

export function QualificationBanner({
  conversation,
  onTakeover,
}: {
  conversation: InboxConversation;
  onTakeover: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mode = conversation.qualificationMode ?? "NONE";

  if (mode !== "AI_ACTIVE" && mode !== "AI_PAUSED") return null;

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

  return (
    <div className="relative flex shrink-0 items-center justify-between gap-3 border-b border-violet-500/25 bg-violet-500/10 px-4 py-2.5 text-sm dark:border-violet-400/20 dark:bg-violet-500/15">
      <div className="flex min-w-0 items-center gap-2 text-violet-950 dark:text-violet-100">
        <Bot className="size-4 shrink-0" aria-hidden />
        <p className="min-w-0">
          <span className="font-medium">Larissa</span> está qualificando este
          lead. Modo somente leitura.
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
