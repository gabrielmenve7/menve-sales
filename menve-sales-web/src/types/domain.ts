/** Mirrors `prisma/schema.prisma` enums — keep in sync when schema changes. */

export type UserRole =
  | "SUPER_ADMIN"
  | "OWNER"
  | "ADMIN"
  | "MANAGER"
  | "SELLER";

export type DealStatus = "OPEN" | "WON" | "LOST" | "ARCHIVED";

/** Runtime + type for activity kinds (replaces Prisma `ActivityType` enum in UI). */
export const ActivityType = {
  CALL: "CALL",
  EMAIL: "EMAIL",
  MEETING: "MEETING",
  TASK: "TASK",
  NOTE: "NOTE",
  WHATSAPP: "WHATSAPP",
} as const;

export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

export type WhatsAppProvider = "META" | "EVOLUTION" | "INSTAGRAM";

export type ConversationStatus = "WAITING" | "IN_PROGRESS" | "RESOLVED";

export type MessageDirection = "INBOUND" | "OUTBOUND";

export type CustomFieldEntity = "CONTACT" | "DEAL";
