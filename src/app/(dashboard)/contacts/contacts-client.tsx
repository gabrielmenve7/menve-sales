"use client";

import type {
  CampaignSource,
  Contact,
  ContactTag,
  Tag,
} from "@prisma/client";
import Link from "next/link";
import { useState } from "react";
import { createContact, deleteContact, exportContactsCsv } from "@/actions/contacts";
import { importContactsCsv } from "@/actions/import-csv";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Row = Contact & {
  campaignSource: CampaignSource | null;
  contactTags: (ContactTag & { tag: Tag })[];
};

export function ContactsClient({ contacts }: { contacts: Row[] }) {
  const [loading, setLoading] = useState(false);
  const [csvText, setCsvText] = useState("");

  async function onExport() {
    setLoading(true);
    try {
      const csv = await exportContactsCsv();
      const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contatos-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    await createContact({
      name: String(fd.get("name") ?? ""),
      phone: String(fd.get("phone") ?? "") || undefined,
      email: String(fd.get("email") ?? "") || undefined,
      company: String(fd.get("company") ?? "") || undefined,
      utmSource: String(fd.get("utmSource") ?? "") || undefined,
      utmMedium: String(fd.get("utmMedium") ?? "") || undefined,
      utmCampaign: String(fd.get("utmCampaign") ?? "") || undefined,
    });
    setLoading(false);
    e.currentTarget.reset();
  }

  async function onImport() {
    setLoading(true);
    await importContactsCsv(csvText);
    setCsvText("");
    setLoading(false);
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Novo contato</CardTitle>
            <CardDescription>Cadastro manual</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onCreate} className="space-y-3">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
                <div>
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" name="phone" placeholder="+5511..." />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company">Empresa</Label>
                <Input id="company" name="company" />
              </div>
              <div className="grid gap-2 sm:grid-cols-3 sm:gap-2">
                <div>
                  <Label htmlFor="utmSource">utm_source</Label>
                  <Input id="utmSource" name="utmSource" />
                </div>
                <div>
                  <Label htmlFor="utmMedium">utm_medium</Label>
                  <Input id="utmMedium" name="utmMedium" />
                </div>
                <div>
                  <Label htmlFor="utmCampaign">utm_campaign</Label>
                  <Input id="utmCampaign" name="utmCampaign" />
                </div>
              </div>
              <Button type="submit" disabled={loading}>
                Salvar
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Importar CSV</CardTitle>
            <CardDescription>
              Cabeçalho: name,nome,phone,telefone,email,company,empresa
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              className="min-h-[160px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              placeholder="cole o CSV aqui..."
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
            <Button type="button" onClick={onImport} disabled={loading || !csvText}>
              Importar
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle>Lista</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || contacts.length === 0}
            onClick={onExport}
          >
            Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="p-2">Nome</th>
                  <th className="p-2">Telefone</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Campanha</th>
                  <th className="p-2">Tags</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} className="border-b border-border/60">
                    <td className="p-2 font-medium">
                      <Link
                        href={`/contacts/${c.id}`}
                        className="text-primary hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="p-2">{c.phone ?? "—"}</td>
                    <td className="p-2">{c.email ?? "—"}</td>
                    <td className="p-2 text-xs">
                      {c.utmCampaign ?? c.campaignSource?.name ?? "—"}
                    </td>
                    <td className="p-2">
                      <div className="flex max-w-[140px] flex-wrap gap-1">
                        {c.contactTags.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          c.contactTags.map((ct) => (
                            <Badge
                              key={ct.tagId}
                              variant="outline"
                              className="text-[10px] font-normal"
                            >
                              {ct.tag.name}
                            </Badge>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="p-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteContact(c.id)}
                      >
                        Excluir
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
