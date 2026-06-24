export type LlmToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type LlmMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: LlmToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type LlmToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type LlmCompletionResult = {
  content: string | null;
  toolCalls: LlmToolCall[];
  promptTokens?: number;
  completionTokens?: number;
};

export interface LlmProvider {
  complete(args: {
    model: string;
    messages: LlmMessage[];
    tools?: LlmToolDefinition[];
  }): Promise<LlmCompletionResult>;
}
