"use client";

import type { Pipeline, Stage } from "@prisma/client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  SettingsPipelineStages,
  type SettingsPipelineStagesHandle,
} from "../../settings/settings-pipeline-stages";
import { Button } from "@/components/ui/button";

export function FunnelConfigureClient({
  pipelines,
  backHref,
}: {
  pipelines: (Pipeline & { stages: Stage[] })[];
  backHref: string;
}) {
  const stagesRef = useRef<SettingsPipelineStagesHandle>(null);
  const [meta, setMeta] = useState({ dirty: false, busy: false });

  const saveDisabled = useMemo(
    () => meta.busy || !meta.dirty,
    [meta.busy, meta.dirty],
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1 px-2"
            asChild
          >
            <Link href={backHref}>
              <ArrowLeft className="size-4" aria-hidden />
              Voltar
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
              Configuração do funil
            </h1>
            <p className="max-w-xl text-pretty text-xs text-muted-foreground sm:text-sm">
              Etapas do Kanban e status de ganho/perda para as métricas.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={saveDisabled}
          className="shrink-0 bg-black text-white hover:bg-black/90 dark:bg-black dark:text-white dark:hover:bg-black/90"
          onClick={() => {
            stagesRef.current?.save();
          }}
        >
          Salvar
        </Button>
      </header>

      <div className="min-w-0 pb-2">
        <SettingsPipelineStages
          ref={stagesRef}
          pipelines={pipelines}
          bare
          onEditorMetaChange={setMeta}
        />
      </div>
    </div>
  );
}
