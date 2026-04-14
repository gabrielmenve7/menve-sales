export const inboxQueryKeys = {
  list: ["inbox"] as const,
  conversation: (id: string) => ["inbox", "conversation", id] as const,
};
