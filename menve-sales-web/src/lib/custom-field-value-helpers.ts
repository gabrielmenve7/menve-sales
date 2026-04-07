import type { CustomField } from "@prisma/client";

export function formatMoneyBrlForInput(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function parseMoneyBrlFromInput(s: string): number {
  const t = s
    .trim()
    .replace(/R\$\s?/gi, "")
    .replace(/\s/g, "");
  if (!t) return Number.NaN;
  let normalized = t;
  if (/,/.test(t) && /\d,\d{1,2}$/.test(t)) {
    normalized = t.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = t.replace(/,/g, "");
  }
  return Number(normalized);
}

/** Mapa string para inputs — alinhado ao `CustomFieldsForm`. */
export function customDataToStringMap(
  fields: CustomField[],
  customData: unknown,
): Record<string, string> {
  const base =
    customData && typeof customData === "object" && !Array.isArray(customData)
      ? (customData as Record<string, unknown>)
      : {};
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = base[f.key];
    if (v === undefined || v === null) out[f.key] = "";
    else if (f.fieldType === "MONEY_BRL" && typeof v === "number") {
      out[f.key] = formatMoneyBrlForInput(v);
    } else if (typeof v === "number") out[f.key] = String(v);
    else {
      const s = String(v);
      out[f.key] =
        f.fieldType === "DATE" && s.includes("T") ? s.slice(0, 10) : s;
    }
  }
  return out;
}

/** Converte string do input local para payload da API (um campo). */
export function stringToApiValue(fieldType: string, s: string): unknown {
  const t = s.trim();
  switch (fieldType) {
    case "NUMBER":
      return t === "" ? "" : Number(t);
    case "MONEY_BRL": {
      if (t === "") return "";
      const n = parseMoneyBrlFromInput(s);
      return Number.isFinite(n) ? n : s;
    }
    default:
      return t === "" ? "" : t;
  }
}

/** Valor atual em customData como string comparável ao draft. */
export function storedFieldAsDraftString(
  field: CustomField,
  customData: unknown,
): string {
  if (!customData || typeof customData !== "object" || Array.isArray(customData)) {
    return "";
  }
  const v = (customData as Record<string, unknown>)[field.key];
  if (v === undefined || v === null || v === "") return "";
  if (field.fieldType === "MONEY_BRL" && typeof v === "number") {
    return formatMoneyBrlForInput(v);
  }
  if (typeof v === "number") return String(v);
  const s = String(v);
  return field.fieldType === "DATE" && s.includes("T") ? s.slice(0, 10) : s;
}
