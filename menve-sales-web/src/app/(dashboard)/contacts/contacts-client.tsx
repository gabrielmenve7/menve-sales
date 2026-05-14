"use client";

import type {
  CampaignSource,
  Contact,
  ContactTag,
  Tag,
} from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createContact, deleteContact, exportContactsCsv } from "@/actions/contacts";
import { importContactsCsv } from "@/actions/import-csv";
import { Badge } from "@/components/ui/badge";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Row = Contact & {
  campaignSource: CampaignSource | null;
  contactTags: (ContactTag & { tag: Tag })[];
};

const textareaClass = cn(
  "min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm",
  "ring-offset-background placeholder:text-muted-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);

export function ContactsClient({ contacts }: { contacts: Row[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

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
    try {
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
      e.currentTarget.reset();
      setNewOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function onImport() {
    if (!csvText.trim()) return;
    setLoading(true);
    try {
      await importContactsCsv(csvText);
      setCsvText("");
      setImportOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(id: string) {
    setLoading(true);
    try {
      await deleteContact(id);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-border/40 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Contatos</h1>
          <p className="text-sm text-muted-foreground">
            Leads e contatos com origem de campanha (UTM).
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setImportOpen(true)}
          >
            Importar CSV
          </Button>
          <Button type="button" onClick={() => setNewOpen(true)}>
            + Novo contato
          </Button>
        </div>
      </div>

      <Card className="min-h-0 flex-1">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle>Lista</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || contacts.length === 0}
            onClick={() => void onExport()}
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
                        className="text-primary-solid hover:underline"
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
                        disabled={loading}
                        onClick={() => void onDelete(c.id)}
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

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo contato</DialogTitle>
            <DialogDescription>Cadastro manual</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void onCreate(e)} className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="contact-name">Nome</Label>
              <Input id="contact-name" name="name" required />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
              <div>
                <Label htmlFor="contact-phone">Telefone</Label>
                <Input id="contact-phone" name="phone" placeholder="+5511..." />
              </div>
              <div>
                <Label htmlFor="contact-email">Email</Label>
                <Input id="contact-email" name="email" type="email" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contact-company">Empresa</Label>
              <Input id="contact-company" name="company" />
            </div>
            <div className="grid gap-2 sm:grid-cols-3 sm:gap-2">
              <div>
                <Label htmlFor="contact-utmSource">utm_source</Label>
                <Input id="contact-utmSource" name="utmSource" />
              </div>
              <div>
                <Label htmlFor="contact-utmMedium">utm_medium</Label>
                <Input id="contact-utmMedium" name="utmMedium" />
              </div>
              <div>
                <Label htmlFor="contact-utmCampaign">utm_campaign</Label>
                <Input id="contact-utmCampaign" name="utmCampaign" />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewOpen(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar CSV</DialogTitle>
            <DialogDescription>
              Cabeçalho: name,nome,phone,telefone,email,company,empresa
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <textarea
              className={textareaClass}
              placeholder="cole o CSV aqui..."
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              aria-label="Conteúdo CSV"
            />
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setImportOpen(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => void onImport()}
                disabled={loading || !csvText.trim()}
              >
                Importar
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
