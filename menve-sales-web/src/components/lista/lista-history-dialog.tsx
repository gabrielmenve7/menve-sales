"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProspectSearchHistory } from "@/actions/pesquisa";

const STATUS_LABELS: Record<
  ProspectSearchHistory["status"],
  { label: string; className: string }
> = {
  RUNNING: {
    label: "Capturando",
    className: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  },
  ENRICHING: {
    label: "Enriquecendo",
    className: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  },
  DONE: {
    label: "Concluída",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  ERROR: {
    label: "Erro",
    className: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  },
};

function formatCaptureDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displaySegment(s: ProspectSearchHistory): string {
  return s.segment?.trim() || s.query;
}

function displayLocal(s: ProspectSearchHistory): string {
  if (s.city && s.state) return `${s.city} - ${s.state}`;
  if (s.location) return s.location;
  return "—";
}

export function ListaHistoryDialog({
  open,
  onOpenChange,
  searches,
  onView,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searches: ProspectSearchHistory[];
  onView: (searchId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico de capturas</DialogTitle>
        </DialogHeader>
        {searches.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Você ainda não realizou nenhuma captura.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Segmento</th>
                  <th className="px-3 py-2 font-medium">Local</th>
                  <th className="px-3 py-2 font-medium">Total</th>
                  <th className="px-3 py-2 font-medium">Qualificadas</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {searches.map((s) => {
                  const status = STATUS_LABELS[s.status] ?? STATUS_LABELS.DONE;
                  return (
                    <tr
                      key={s.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-3 py-2.5 font-medium">
                        {displaySegment(s)}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {displayLocal(s)}
                      </td>
                      <td className="px-3 py-2.5">{s.totalCount}</td>
                      <td className="px-3 py-2.5 text-emerald-600 dark:text-emerald-400">
                        {s.qualifiedCount}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="secondary" className={status.className}>
                          {status.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {formatCaptureDate(s.createdAt)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            onView(s.id);
                            onOpenChange(false);
                          }}
                        >
                          Ver
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
