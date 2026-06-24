"use client";

import { useMemo, useState } from "react";
import {
  recalculateLeadScores,
  updateLeadScoringRules,
  type LeadScoringField,
  type LeadScoringRule,
} from "@/actions/lead-scoring";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, Save } from "lucide-react";

const FIELD_LABELS: Record<LeadScoringField, string> = {
  has_whatsapp: "Tem WhatsApp",
  has_email: "Tem e-mail",
  has_website: "Tem site",
  replied: "Respondeu campanha",
  rating_gte: "Avaliação Google ≥",
};

export function LeadScoringClient({
  initialRules,
}: {
  initialRules: LeadScoringRule[];
}) {
  const [rules, setRules] = useState(initialRules);
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewScore = useMemo(
    () =>
      rules
        .filter((r) => r.enabled)
        .reduce((sum, r) => sum + r.points, 0),
    [rules],
  );

  function updateRule(id: string, patch: Partial<LeadScoringRule>) {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await updateLeadScoringRules({ rules });
      setNotice("Regras salvas.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function onRecalculate() {
    setRecalculating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await recalculateLeadScores();
      setNotice(`${res.updated} contato(s) atualizado(s).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao recalcular");
    } finally {
      setRecalculating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Lead scoring</h1>
        <p className="text-sm text-muted-foreground">
          Pontuação automática de contatos com base em sinais de qualificação
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prévia</CardTitle>
          <CardDescription>
            Score máximo possível com as regras ativas:{" "}
            <strong>{previewScore}</strong> pontos
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regras</CardTitle>
          <CardDescription>
            Ajuste pontos por critério. Desative regras que não se aplicam ao
            seu funil.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
            >
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) =>
                    updateRule(rule.id, { enabled: e.target.checked })
                  }
                />
                {FIELD_LABELS[rule.field]}
              </label>
              {rule.field === "rating_gte" ? (
                <Input
                  type="number"
                  min={1}
                  max={5}
                  step={0.5}
                  className="h-8 w-20"
                  value={typeof rule.value === "number" ? rule.value : 4}
                  onChange={(e) =>
                    updateRule(rule.id, { value: Number(e.target.value) })
                  }
                  disabled={!rule.enabled}
                />
              ) : null}
              <div className="ml-auto flex items-center gap-2">
                <Label htmlFor={`pts-${rule.id}`} className="text-xs">
                  Pontos
                </Label>
                <Input
                  id={`pts-${rule.id}`}
                  type="number"
                  min={-100}
                  max={100}
                  className="h-8 w-20"
                  value={rule.points}
                  onChange={(e) =>
                    updateRule(rule.id, { points: Number(e.target.value) })
                  }
                  disabled={!rule.enabled}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void onSave()} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          <span className="ml-2">Salvar regras</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void onRecalculate()}
          disabled={recalculating}
        >
          {recalculating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          <span className="ml-2">Recalcular scores</span>
        </Button>
      </div>
    </div>
  );
}
