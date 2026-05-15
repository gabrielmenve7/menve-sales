"use client";

import { CalendarDays, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  DASHBOARD_DATE_PRESET_LABELS,
  formatYmdToBr,
  parseDdMmYyyyToYmd,
  resolveAppliedGlobalDateRange,
  triggerLabelForDashboardDateRange,
  type AppliedGlobalDateRange,
  type DashboardDatePresetId,
  type DashboardDateRangeState,
} from "@/lib/dashboard-global-date-range";

const PRESETS_ORDER: DashboardDatePresetId[] = [
  "TODAY",
  "YESTERDAY",
  "LAST_7",
  "LAST_14",
  "LAST_30",
  "THIS_MONTH",
  "PREV_MONTH",
  "LAST_90",
  "LAST_180",
  "LAST_12_MONTHS",
];

type Props = {
  value: DashboardDateRangeState;
  onChange: (next: DashboardDateRangeState) => void;
  className?: string;
};

export function DashboardGlobalDateRangePicker({
  value,
  onChange,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  const applied = useMemo(
    () => resolveAppliedGlobalDateRange(value),
    [value],
  );

  useEffect(() => {
    if (!open) return;
    if (value.mode === "custom") {
      setDraftFrom(formatYmdToBr(value.from));
      setDraftTo(formatYmdToBr(value.to));
    } else {
      setDraftFrom("");
      setDraftTo("");
    }
    setCustomError(null);
  }, [open, value]);

  function applyCustom() {
    const a = parseDdMmYyyyToYmd(draftFrom);
    const b = parseDdMmYyyyToYmd(draftTo);
    if (!a || !b) {
      setCustomError("Use o formato DD/MM/AAAA nas duas datas.");
      return;
    }
    setCustomError(null);
    onChange({ mode: "custom", from: a, to: b });
    setOpen(false);
  }

  function selectPreset(p: DashboardDatePresetId) {
    onChange({ mode: "preset", preset: p });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("min-w-[10.5rem] justify-between gap-2", className)}
        >
          <span className="flex items-center gap-2 truncate">
            <CalendarDays className="size-4 shrink-0 opacity-70" />
            <span className="truncate">
              {triggerLabelForDashboardDateRange(value, applied)}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(100vw-1.5rem,22rem)] space-y-3 p-3"
      >
        <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
          {PRESETS_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              className={cn(
                "flex w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                value.mode === "preset" && value.preset === id && "bg-muted",
              )}
              onClick={() => selectPreset(id)}
            >
              {DASHBOARD_DATE_PRESET_LABELS[id]}
            </button>
          ))}
        </div>

        <div className="border-t pt-3">
          <Label className="text-xs text-muted-foreground">Personalizado</Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="relative">
              <Input
                placeholder="DD/MM/AAAA"
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
                className="pr-8"
              />
              <CalendarDays className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 opacity-40" />
            </div>
            <div className="relative">
              <Input
                placeholder="DD/MM/AAAA"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
                className="pr-8"
              />
              <CalendarDays className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 opacity-40" />
            </div>
          </div>
          {customError ? (
            <p className="mt-1 text-xs text-destructive">{customError}</p>
          ) : null}
          <Button
            type="button"
            className="mt-3 w-full"
            onClick={() => applyCustom()}
          >
            Aplicar
          </Button>
        </div>

        <FooterRange applied={applied} />
      </PopoverContent>
    </Popover>
  );
}

function FooterRange({ applied }: { applied: AppliedGlobalDateRange }) {
  return (
    <div className="border-t pt-2 text-center text-xs text-muted-foreground">
      {formatYmdToBr(applied.from)} - {formatYmdToBr(applied.to)}
    </div>
  );
}
