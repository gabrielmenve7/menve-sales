"use client";

import { ArrowLeft, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const NEUTRAL_PREVIEW = "#a3a3a3";
const DEFAULT_CUSTOM = "#0091FF";

/** Presets alinhados ao grid estilo ClickUp (2 linhas + “+”). */
const PRESET_HEX = [
  "#7C3AED",
  "#2563EB",
  "#0091FF",
  "#14B8A6",
  "#22C55E",
  "#EAB308",
  "#F97316",
  "#EF4444",
  "#EC4899",
  "#D946EF",
  "#92400E",
  "#737373",
] as const;

function parseHexToRgb(s: string): { r: number; g: number; b: number } | null {
  const t = s.trim();
  if (!t) return null;
  let h = t.startsWith("#") ? t.slice(1) : t;
  if (h.length === 3) {
    h = [...h].map((c) => c + c).join("");
  }
  if (!/^[0-9A-Fa-f]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) =>
    Math.max(0, Math.min(255, Math.round(Number(n)) || 0));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function normalizeHexKey(s: string): string | null {
  const p = parseHexToRgb(s);
  return p ? rgbToHex(p.r, p.g, p.b).toLowerCase() : null;
}

function toDisplayHex(s: string): string {
  const k = normalizeHexKey(s);
  return k ? `#${k.slice(1).toUpperCase()}` : DEFAULT_CUSTOM;
}

export function HexColorField({
  id,
  value,
  onChange,
  disabled,
  placeholder = "#525252",
  className,
  inputClassName,
}: {
  id?: string;
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"presets" | "custom">("presets");
  const [draftHex, setDraftHex] = useState(DEFAULT_CUSTOM);

  const validHex = useMemo(() => parseHexToRgb(value), [value]);
  const previewBg = validHex
    ? rgbToHex(validHex.r, validHex.g, validHex.b)
    : NEUTRAL_PREVIEW;

  const valueKey = normalizeHexKey(value);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setView("presets");
  }

  function openCustomPanel() {
    setDraftHex(toDisplayHex(value));
    setView("custom");
  }

  function pickPreset(hex: string) {
    onChange(hex);
    onOpenChange(false);
  }

  function saveCustom() {
    const k = normalizeHexKey(draftHex);
    if (k) {
      onChange(`#${k.slice(1).toUpperCase()}`);
      onOpenChange(false);
    }
  }

  const pickerSafe = normalizeHexKey(draftHex) ?? normalizeHexKey(DEFAULT_CUSTOM)!;
  const pickerColor = pickerSafe;

  const swatchHit =
    "size-6 rounded-full border-2 border-transparent transition-transform hover:scale-105";
  const swatchFocus =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-popover";
  const swatchSelected =
    "ring-2 ring-sky-400 ring-offset-2 ring-offset-popover";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            className={cn(
              "size-9 shrink-0 rounded-md border-2 shadow-none hover:opacity-90",
              !validHex && "border-dashed",
            )}
            style={{ backgroundColor: previewBg }}
            aria-label="Escolher cor"
          />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto border-border bg-popover p-4 text-popover-foreground shadow-md"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {view === "presets" ? (
            <div className="w-[min(calc(100vw-2rem),252px)] space-y-4">
              <p className="text-xs font-medium text-muted-foreground">Cor</p>
              <div className="grid grid-cols-7 gap-x-3 gap-y-3">
                {PRESET_HEX.slice(0, 7).map((hex) => {
                  const selected = valueKey === hex.toLowerCase();
                  return (
                    <button
                      key={hex}
                      type="button"
                      disabled={disabled}
                      className={cn(
                        swatchHit,
                        swatchFocus,
                        selected && swatchSelected,
                      )}
                      style={{ backgroundColor: hex }}
                      onClick={() => pickPreset(hex)}
                      aria-label={`Cor ${hex}`}
                      aria-pressed={selected}
                    />
                  );
                })}
              </div>
              <div className="grid grid-cols-7 gap-x-3 gap-y-3">
                {PRESET_HEX.slice(7).map((hex) => {
                  const selected = valueKey === hex.toLowerCase();
                  return (
                    <button
                      key={hex}
                      type="button"
                      disabled={disabled}
                      className={cn(
                        swatchHit,
                        swatchFocus,
                        selected && swatchSelected,
                      )}
                      style={{ backgroundColor: hex }}
                      onClick={() => pickPreset(hex)}
                      aria-label={`Cor ${hex}`}
                      aria-pressed={selected}
                    />
                  );
                })}
                <button
                  type="button"
                  disabled={disabled}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground",
                    "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
                  )}
                  onClick={openCustomPanel}
                  aria-label="Cor personalizada (RGB)"
                >
                  <Plus className="size-3.5" strokeWidth={2} />
                </button>
              </div>
            </div>
          ) : (
            <div className="w-[min(calc(100vw-2rem),288px)] space-y-4">
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  className="size-8 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setView("presets")}
                  aria-label="Voltar às cores padrão"
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <p className="text-xs font-medium text-muted-foreground">
                  Cor personalizada
                </p>
              </div>
              <div
                className={cn(
                  "w-full overflow-hidden rounded-lg border border-border",
                  "[&_.react-colorful]:h-40 [&_.react-colorful]:w-full",
                  "[&_.react-colorful__saturation]:rounded-t-lg [&_.react-colorful__hue]:h-3 [&_.react-colorful__hue]:rounded-full",
                )}
              >
                <HexColorPicker
                  color={pickerColor}
                  onChange={(c) => {
                    const k = normalizeHexKey(c);
                    setDraftHex(k ? `#${k.slice(1).toUpperCase()}` : c);
                  }}
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="shrink-0 rounded-md border border-border bg-muted px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  HEX
                </span>
                <Input
                  value={draftHex}
                  disabled={disabled}
                  onChange={(e) => setDraftHex(e.target.value)}
                  className="h-9 flex-1 font-mono text-xs"
                  spellCheck={false}
                />
                <span
                  className="size-6 shrink-0 rounded-full border border-border shadow-inner"
                  style={{
                    backgroundColor: normalizeHexKey(draftHex) ?? pickerColor,
                  }}
                  aria-hidden
                />
              </div>
              <Button
                type="button"
                disabled={disabled || !normalizeHexKey(draftHex)}
                className="h-10 w-full rounded-lg"
                onClick={() => saveCustom()}
              >
                Salvar
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn("min-w-0 flex-1 font-mono text-xs", inputClassName)}
        spellCheck={false}
      />
    </div>
  );
}
