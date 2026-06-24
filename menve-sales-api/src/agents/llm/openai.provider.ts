import { Injectable } from "@nestjs/common";
import type {
  LlmCompletionResult,
  LlmMessage,
  LlmProvider,
  LlmToolDefinition,
} from "./llm-provider.interface";

type OpenAiResponse = {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

@Injectable()
export class OpenAiLlmProvider implements LlmProvider {
  async complete(args: {
    model: string;
    messages: LlmMessage[];
    tools?: LlmToolDefinition[];
  }): Promise<LlmCompletionResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY não configurada");
    }

    const body: Record<string, unknown> = {
      model: args.model,
      messages: args.messages,
    };
    if (args.tools?.length) {
      body.tools = args.tools;
      body.tool_choice = "auto";
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`OpenAI API error: ${res.status} ${t}`);
    }

    const data = (await res.json()) as OpenAiResponse;
    const msg = data.choices?.[0]?.message;
    return {
      content: msg?.content ?? null,
      toolCalls: msg?.tool_calls ?? [],
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    };
  }
}
