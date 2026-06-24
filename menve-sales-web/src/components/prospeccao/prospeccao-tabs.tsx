"use client";

import Link from "next/link";
import { Bot, List } from "lucide-react";
import { Button } from "@/components/ui/button";

type ProspeccaoTab = "capture" | "lists" | "agents";

export function ProspeccaoTabs({
  active,
  listItemCount = 0,
  showAgentsTab = true,
  onSelectCapture,
  onSelectLists,
}: {
  active: ProspeccaoTab;
  listItemCount?: number;
  showAgentsTab?: boolean;
  onSelectCapture?: () => void;
  onSelectLists?: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-border/60 pb-2">
      {onSelectCapture ? (
        <Button
          type="button"
          size="sm"
          variant={active === "capture" ? "secondary" : "ghost"}
          onClick={onSelectCapture}
        >
          Capturar
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant={active === "capture" ? "secondary" : "ghost"}
          asChild
        >
          <Link href="/lista">Capturar</Link>
        </Button>
      )}

      {onSelectLists ? (
        <Button
          type="button"
          size="sm"
          variant={active === "lists" ? "secondary" : "ghost"}
          onClick={onSelectLists}
        >
          <List className="size-4" />
          <span className="ml-2">Minha lista ({listItemCount})</span>
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant={active === "lists" ? "secondary" : "ghost"}
          asChild
        >
          <Link href="/lista" className="inline-flex items-center">
            <List className="size-4" />
            <span className="ml-2">Minha lista ({listItemCount})</span>
          </Link>
        </Button>
      )}

      {showAgentsTab ? (
        active === "agents" ? (
          <Button type="button" size="sm" variant="secondary">
            <Bot className="size-4" />
            <span className="ml-2">Agentes IA</span>
          </Button>
        ) : (
          <Button type="button" size="sm" variant="ghost" asChild>
            <Link href="/lista/agentes" className="inline-flex items-center">
              <Bot className="size-4" />
              <span className="ml-2">Agentes IA</span>
            </Link>
          </Button>
        )
      ) : null}
    </div>
  );
}
