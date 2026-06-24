"use client";

import Link from "next/link";
import type { PrimaryProspectListDetail } from "@/actions/prospect-lists";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ExternalLink,
  Globe,
  MapPin,
  Phone,
  Send,
  Star,
} from "lucide-react";

const OUTREACH_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  SENT: "Enviado",
  DELIVERED: "Entregue",
  REPLIED: "Respondeu",
  FAILED: "Falhou",
  OPT_OUT: "Opt-out",
};

const OUTREACH_STATUS_CLASS: Record<string, string> = {
  PENDING: "text-muted-foreground",
  SENT: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  DELIVERED: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  REPLIED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  FAILED: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  OPT_OUT: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
};

export function ListaPrincipalPanel({
  list,
  loading,
}: {
  list: PrimaryProspectListDetail | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Carregando lista principal…</p>
    );
  }

  if (!list) {
    return (
      <p className="text-sm text-muted-foreground">
        Faça uma captura para começar a alimentar sua lista principal.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{list.name}</h2>
          <p className="text-sm text-muted-foreground">
            {list.itemCount} empresa(s) · alimentada automaticamente a cada captura
          </p>
        </div>
        <Button type="button" size="sm" asChild>
          <Link href="/disparo">
            <Send className="size-4" />
            <span className="ml-2">Ir para disparo</span>
          </Link>
        </Button>
      </div>

      {list.items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma empresa na lista ainda. Inicie uma captura no Google Maps.
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Empresa</th>
                  <th className="px-3 py-2 font-medium">Contato</th>
                  <th className="px-3 py-2 font-medium">Captura</th>
                  <th className="px-3 py-2 font-medium">Disparo</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((item) => {
                  const r = item.prospectResult;
                  if (!r) return null;
                  const status = item.outreachStatus;
                  const statusLabel = status
                    ? (OUTREACH_STATUS_LABELS[status] ?? status)
                    : "Não disparado";
                  const statusClass = status
                    ? (OUTREACH_STATUS_CLASS[status] ?? "")
                    : "text-muted-foreground";
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-3 py-3">
                        <div className="font-medium">{r.name}</div>
                        {r.snippet ? (
                          <div className="line-clamp-1 text-xs text-muted-foreground">
                            {r.snippet}
                          </div>
                        ) : null}
                        {r.address ? (
                          <div className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                            <MapPin className="mt-0.5 size-3 shrink-0" />
                            <span>{r.address}</span>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          {(r.phone || r.whatsapp) && (
                            <div className="flex items-center gap-1">
                              <Phone className="size-3 text-muted-foreground" />
                              {r.whatsapp || r.phone}
                            </div>
                          )}
                          {r.website ? (
                            <a
                              href={
                                r.website.startsWith("http")
                                  ? r.website
                                  : `https://${r.website}`
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              <Globe className="size-3" />
                              Site
                              <ExternalLink className="size-3" />
                            </a>
                          ) : null}
                          {r.rating != null ? (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Star className="size-3 fill-amber-400 text-amber-400" />
                              {r.rating} ({r.reviewCount ?? 0})
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {r.capture?.segment ?? r.capture?.query ?? "—"}
                        {r.capture?.city && r.capture?.state ? (
                          <div>
                            {r.capture.city} - {r.capture.state}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="secondary" className={statusClass}>
                          {statusLabel}
                        </Badge>
                        {item.outreachCampaignName ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {item.outreachCampaignName}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
