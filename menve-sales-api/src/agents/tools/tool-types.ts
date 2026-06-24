export type ToolContext = {
  tenantId: string;
  conversationId: string;
  contactId: string;
  agentRunId: string;
  actorUserId: string | null;
};

export type ToolHandler = (
  ctx: ToolContext,
  args: Record<string, unknown>,
) => Promise<string>;
