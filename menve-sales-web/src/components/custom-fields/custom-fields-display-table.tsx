"use client";

import type { ReactNode } from "react";
import type { CustomField } from "@prisma/client";
import {
  Calendar,
  DollarSign,
  Globe,
  Hash,
  ListOrdered,
  Mail,
  Phone,
  Type,
  User,
} from "lucide-react";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import { cn } from "@/lib/utils";

export function CustomFieldTypeIcon({ fieldType }: { fieldType: string }) {
  const cls = "size-4 shrink-0 text-muted-foreground";
  switch (fieldType) {
    case "SELECT":
      return <ListOrdered className={cls} strokeWidth={1.75} />;
    case "MONEY_BRL":
      return <DollarSign className={cls} strokeWidth={1.75} />;
    case "DATE":
      return <Calendar className={cls} strokeWidth={1.75} />;
    case "NUMBER":
      return <Hash className={cls} strokeWidth={1.75} />;
    case "URL":
      return <Globe className={cls} strokeWidth={1.75} />;
    case "PHONE":
      return <Phone className={cls} strokeWidth={1.75} />;
    case "EMAIL":
      return <Mail className={cls} strokeWidth={1.75} />;
    case "USER":
      return <User className={cls} strokeWidth={1.75} />;
    default:
      return <Type className={cls} strokeWidth={1.75} />;
  }
}

function readValue(
  customData: unknown,
  key: string,
): string | number | null | undefined {
  if (!customData || typeof customData !== "object" || Array.isArray(customData)) {
    return undefined;
  }
  const v = (customData as Record<string, unknown>)[key];
  if (v === undefined || v === null || v === "") return undefined;
  return v as string | number;
}

export function formatCustomFieldCell(
  field: CustomField,
  customData: unknown,
  members: TenantMemberOption[],
): ReactNode {
  const raw = readValue(customData, field.key);
  if (raw === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  switch (field.fieldType) {
    case "MONEY_BRL": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) return String(raw);
      return n.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
    }
    case "DATE": {
      const s = String(raw);
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return s;
      return d.toLocaleDateString("pt-BR");
    }
    case "URL": {
      const href = String(raw).startsWith("http")
        ? String(raw)
        : `https://${String(raw)}`;
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-primary-solid underline-offset-2 hover:underline"
        >
          {String(raw)}
        </a>
      );
    }
    case "USER": {
      const id = String(raw);
      const m = members.find((x) => x.id === id);
      return m ? (m.name?.trim() || m.email) : id;
    }
    default:
      return String(raw);
  }
}

export function CustomFieldsDisplayTable({
  title,
  fields,
  customData,
  members,
  className,
}: {
  title: string;
  fields: CustomField[];
  customData: unknown;
  members: TenantMemberOption[];
  className?: string;
}) {
  if (fields.length === 0) return null;

  return (
    <div className={cn(className)}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-border/60 bg-card/30">
        {fields.map((f, idx) => (
          <div
            key={f.id}
            className={cn(
              "flex min-h-[44px] items-center gap-3 px-3 py-2.5 sm:px-4",
              idx > 0 && "border-t border-border/50",
            )}
          >
            <CustomFieldTypeIcon fieldType={f.fieldType} />
            <span className="min-w-0 flex-1 text-sm text-muted-foreground">
              {f.name}
            </span>
            <span className="max-w-[55%] shrink-0 text-right text-sm font-medium text-foreground sm:max-w-[60%]">
              {formatCustomFieldCell(f, customData, members)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
