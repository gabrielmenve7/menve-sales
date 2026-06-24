"use client";

import { Bot, Loader2, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import {
  getLarissaConfig,
  syncLarissaSkills,
  updateLarissaConfig,
  type LarissaConfigResponse,
} from "@/actions/agents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AgentesClient({
  initial,
}: {
  initial: LarissaConfigResponse;
}) {
  const [data, setData] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [syncPending, setSyncPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    startTransition(async () => {
      try {
        setData(await getLarissaConfig());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao atualizar");
      }
    });
  }

  async function toggleEnabled(enabled: boolean) {
    setError(null);
    try {
      await updateLarissaConfig({ larissaEnabled: enabled });
      setData((d) => ({
        ...d,
        config: { ...d.config, larissaEnabled: enabled },
      }));
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar");
    }
  }

  async function saveModel() {
    setError(null);
    try {
      await updateLarissaConfig({
        larissaModel: data.config.larissaModel,
        larissaReplyDelayMs: data.config.larissaReplyDelayMs,
      });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar");
    }
  }

  async function onSync() {
    setSyncPending(true);
    setError(null);
    try {
      await syncLarissaSkills();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao sincronizar");
    } finally {
      setSyncPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Agentes IA</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure a Larissa para qualificar leads após o Disparo no Atendimento.
        </p>
      </div>

      <section className="rounded-xl border border-border/40 bg-card p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-violet-500/15 text-violet-700 dark:text-violet-300">
            <Bot className="size-6" />
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-medium">
                  {data.agent?.displayName ?? "Larissa"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {data.agent?.description ??
                    "SDR de qualificação pós-abordagem"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="larissa-enabled"
                  type="checkbox"
                  className="size-4 rounded border-border"
                  checked={data.config.larissaEnabled}
                  onChange={(e) => void toggleEnabled(e.target.checked)}
                />
                <Label htmlFor="larissa-enabled" className="text-sm">
                  Ativa
                </Label>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="larissa-model">Modelo LLM</Label>
                <Input
                  id="larissa-model"
                  value={data.config.larissaModel ?? ""}
                  placeholder="gpt-4o-mini"
                  onChange={(e) =>
                    setData((d) => ({
                      ...d,
                      config: {
                        ...d.config,
                        larissaModel: e.target.value || null,
                      },
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="larissa-delay">Delay resposta (ms)</Label>
                <Input
                  id="larissa-delay"
                  type="number"
                  min={0}
                  max={30000}
                  value={data.config.larissaReplyDelayMs}
                  onChange={(e) =>
                    setData((d) => ({
                      ...d,
                      config: {
                        ...d.config,
                        larissaReplyDelayMs: Number(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void saveModel()}
                disabled={pending}
              >
                Salvar configuração
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onSync()}
                disabled={syncPending}
              >
                {syncPending ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 size-3.5" />
                )}
                Sincronizar skills
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border/40 bg-card p-5">
        <h3 className="text-sm font-medium">Métricas (7 dias)</h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">IA ativa</dt>
            <dd className="text-lg font-semibold">
              {data.metrics.activeConversations}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Turnos OK</dt>
            <dd className="text-lg font-semibold">
              {data.metrics.runsCompleted}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Falhas</dt>
            <dd className="text-lg font-semibold">{data.metrics.runsFailed}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Meets</dt>
            <dd className="text-lg font-semibold">
              {data.metrics.meetingsHandoff}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-border/40 bg-card p-5">
        <h3 className="text-sm font-medium">Skills (runtime)</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Fonte versionada em{" "}
          <code className="rounded bg-muted px-1">.cursor/rules/agent-larissa.mdc</code>
          {" "}(novos agentes: <code className="rounded bg-muted px-1">agent-&#123;chave&#125;.mdc</code>)
        </p>
        <ul className="mt-3 space-y-2">
          {data.skills.length === 0 ? (
            <li className="text-sm text-muted-foreground">
              Nenhuma skill sincronizada. Ative a Larissa ou clique em Sincronizar.
            </li>
          ) : (
            data.skills.map((s) => (
              <li
                key={s.skillKey}
                className="flex items-center justify-between rounded-lg border border-border/30 px-3 py-2 text-sm"
              >
                <span className="font-medium">{s.skillKey}</span>
                <span className="text-xs text-muted-foreground">
                  v{s.version}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
