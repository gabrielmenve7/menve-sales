export type JourneySnippet = {
  name: string | null;
  company: string | null;
  phone: string | null;
  website: string | null;
};

export type SkillBlock = {
  skillKey: string;
  content: string;
  sortOrder: number;
};

export function buildGabrielSystemPrompt(args: {
  skills: SkillBlock[];
  journey: JourneySnippet;
  tenantName?: string;
}): string {
  const ordered = [...args.skills].sort((a, b) => a.sortOrder - b.sortOrder);
  const skillBlocks = ordered
    .map((s) => `## Skill: ${s.skillKey}\n\n${s.content}`)
    .join("\n\n---\n\n");

  const ctx = [
    args.tenantName ? `Empresa (workspace): ${args.tenantName}` : null,
    args.journey.name ? `Nome do lead: ${args.journey.name}` : null,
    args.journey.company ? `Empresa do lead: ${args.journey.company}` : null,
    args.journey.phone ? `Telefone: ${args.journey.phone}` : null,
    args.journey.website ? `Site: ${args.journey.website}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    "Você é Gabriel, agente de qualificação comercial no WhatsApp.",
    "Siga rigorosamente as skills abaixo.",
    "Use as tools disponíveis para agir; não invente ações já cobertas por tools.",
    "",
    "### Contexto do lead",
    ctx || "(sem dados adicionais)",
    "",
    skillBlocks,
  ].join("\n");
}

export function buildChatHistory(
  messages: {
    direction: string;
    body: string;
    senderType?: string;
    audioTranscript?: string | null;
  }[],
  maxMessages: number,
): { role: "user" | "assistant"; content: string }[] {
  const slice = messages.slice(-maxMessages);
  return slice.map((m) => {
    const isLead =
      m.direction === "INBOUND" || m.senderType === "LEAD";
    const content =
      isLead && m.audioTranscript?.trim()
        ? `[Áudio do lead]: ${m.audioTranscript.trim()}`
        : m.body === "[Áudio]" && isLead
          ? "[Áudio do lead] (transcrição indisponível)"
          : m.body;
    return {
      role: isLead ? ("user" as const) : ("assistant" as const),
      content,
    };
  });
}
