/** Tipos de campo customizado — manter alinhado com web (`actions/custom-fields.ts`). */
export const CUSTOM_FIELD_TYPES = [
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

export type CustomFieldTypeId = (typeof CUSTOM_FIELD_TYPES)[number];

/** Tupla para `z.enum` (Zod exige pelo menos um elemento). */
export const CUSTOM_FIELD_TYPES_ENUM = [
  CUSTOM_FIELD_TYPES[0],
  ...CUSTOM_FIELD_TYPES.slice(1),
] as [CustomFieldTypeId, ...CustomFieldTypeId[]];
