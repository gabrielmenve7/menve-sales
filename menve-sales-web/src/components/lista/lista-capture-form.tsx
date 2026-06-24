"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { BRAZIL_STATES } from "@/lib/brazil-states";
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

export type CaptureEngines = ("maps" | "search")[];

export type CaptureFormPayload = {
  segment: string;
  state: string;
  city: string;
  engines: CaptureEngines;
};

export function ListaCaptureForm({
  pending,
  error,
  onSubmit,
}: {
  pending: boolean;
  error?: string | null;
  onSubmit: (payload: CaptureFormPayload) => void;
}) {
  const [segment, setSegment] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [useMaps, setUseMaps] = useState(true);
  const [useSearch, setUseSearch] = useState(true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const engines: CaptureEngines = [];
    if (useMaps) engines.push("maps");
    if (useSearch) engines.push("search");
    if (engines.length === 0) return;
    onSubmit({
      segment: segment.trim(),
      state: state.trim(),
      city: city.trim(),
      engines,
    });
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Nova captura</CardTitle>
        <CardDescription>
          Quanto mais específico o segmento, melhor a qualidade da lista. O
          Menve busca no Google Maps e na rede de pesquisa; sites da rede são
          enriquecidos com WhatsApp e telefone quando disponíveis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="segment">Segmento</Label>
            <Input
              id="segment"
              placeholder="Ex: clínicas odontológicas, escritórios de advocacia..."
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              minLength={3}
              maxLength={200}
              required
              disabled={pending}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="state">Estado</Label>
              <select
                id="state"
                className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={state}
                onChange={(e) => setState(e.target.value)}
                required
                disabled={pending}
              >
                <option value="">Selecione...</option>
                {BRAZIL_STATES.map((s) => (
                  <option key={s.uf} value={s.uf}>
                    {s.name} ({s.uf})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Cidade</Label>
              <Input
                id="city"
                placeholder="Ex: Curitiba"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                minLength={2}
                maxLength={120}
                required
                disabled={pending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Fontes de busca</Label>
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={useMaps}
                  onChange={(e) => setUseMaps(e.target.checked)}
                  className="size-4"
                  disabled={pending}
                />
                Google Maps (dados ricos: telefone, endereço)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={useSearch}
                  onChange={(e) => setUseSearch(e.target.checked)}
                  className="size-4"
                  disabled={pending}
                />
                Rede de pesquisa (sites de empresas)
              </label>
            </div>
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          <Button
            type="submit"
            disabled={pending || (!useMaps && !useSearch)}
            className="w-full sm:w-auto"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            <span className="ml-2">Iniciar captura</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
