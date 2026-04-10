/**
 * Catálogo de tipos — manter alinhado com API (`custom-field-types.ts` no Nest).
 */
export const CUSTOM_FIELD_TYPE_CODES = [
  "TEXT",
  "NUMBER",
  "DATE",
  "SELECT",
  "MONEY_BRL",
  "URL",
  "PHONE",
  "EMAIL",
  "USER",
] as const;

export type CustomFieldTypeCode = (typeof CUSTOM_FIELD_TYPE_CODES)[number];

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldTypeCode, string> = {
  TEXT: "Texto",
  NUMBER: "Número",
  DATE: "Data",
  SELECT: "Lista suspensa",
  MONEY_BRL: "Dinheiro (R$)",
  URL: "Site",
  PHONE: "Telefone",
  EMAIL: "E-mail",
  USER: "Pessoa (usuários)",
};

/** Tupla para `z.enum` no Zod. */
export const CUSTOM_FIELD_TYPE_ZOD_ENUM = [
  CUSTOM_FIELD_TYPE_CODES[0],
  ...CUSTOM_FIELD_TYPE_CODES.slice(1),
] as [CustomFieldTypeCode, ...CustomFieldTypeCode[]];

export type TenantMemberOption = {
  id: string;
  name: string | null;
  email: string;
  /** Foto de perfil (URL ou data URL), quando existir. */
  image?: string | null;
};
