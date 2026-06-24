import type { LlmToolDefinition } from "../llm/llm-provider.interface";

export const LARISSA_TOOLS: LlmToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "send_whatsapp_message",
      description: "Envia mensagem de texto ao lead no WhatsApp",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texto da mensagem" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_google_meet",
      description:
        "Agenda reunião no Google Calendar com Google Meet e promove lead ao pipeline",
      parameters: {
        type: "object",
        properties: {
          attendeeEmail: { type: "string" },
          title: { type: "string" },
          dueAt: {
            type: "string",
            description: "ISO 8601 data/hora início",
          },
          durationMinutes: { type: "number" },
        },
        required: ["attendeeEmail", "dueAt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "handoff_to_human",
      description: "Passa a conversa para atendimento humano",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_qualification_notes",
      description: "Registra notas estruturadas de qualificação no contato",
      parameters: {
        type: "object",
        properties: {
          notes: { type: "string" },
        },
        required: ["notes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_opt_out",
      description: "Registra opt-out do lead (SAIR/PARAR)",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
      },
    },
  },
];
