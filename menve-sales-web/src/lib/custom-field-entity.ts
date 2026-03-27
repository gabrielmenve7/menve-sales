/**
 * Valores do enum Prisma `CustomFieldEntity`.
 * Use estes em vez de `CustomFieldEntity` importado de `@prisma/client` no browser
 * ou em código partilhado — em alguns bundles o objeto enum fica undefined e causa
 * "Cannot read properties of undefined (reading 'CONTACT')".
 */
export const CUSTOM_FIELD_ENTITY = {
  CONTACT: "CONTACT",
  DEAL: "DEAL",
} as const;

export type CustomFieldEntityLiteral =
  (typeof CUSTOM_FIELD_ENTITY)[keyof typeof CUSTOM_FIELD_ENTITY];
