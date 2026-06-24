import type {
  Contact,
  Conversation,
  InternalNote,
  Message,
  User,
  WhatsAppConnection,
} from "@prisma/client";

/** Deals abertos incluídos em `GET /inbox` para a lateral de pipeline. */
export type InboxOpenDeal = {
  id: string;
  title: string;
  value: unknown;
  pipeline: { id: string; name: string };
  stage: { id: string; name: string; color: string | null };
};

export type InboxContact = Contact & {
  deals: InboxOpenDeal[];
  campaignSource?: { id: string; name: string; code: string } | null;
  /** Nome da campanha de disparo, quando o contato veio de outreach */
  outreachCampaignName?: string | null;
};

export type NoteRow = InternalNote & {
  user: Pick<User, "name" | "email">;
};

/** ACK de envio (Prisma `MessageAckStatus`); opcional até `prisma generate` alinhar o client. */
export type InboxMessage = Message & {
  ackStatus?: "SENT" | "DELIVERED" | "READ" | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
};

export type InboxConversation = Conversation & {
  contact: InboxContact;
  whatsappConnection: WhatsAppConnection;
  messages: InboxMessage[];
  internalNotes: NoteRow[];
  /** Há mais mensagens anteriores às carregadas (paginação). */
  hasOlderMessages?: boolean;
};
