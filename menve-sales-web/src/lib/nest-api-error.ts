/**
 * Corpo de erro do Nest (`{ message, statusCode, error }`) costuma vir como texto
 * após o prefixo `API <status>:` em `apiServer`. Extrai só a mensagem legível.
 */
export function nestExceptionJsonToMessage(body: string): string {
  const trimmed = body.trim();
  if (!trimmed.startsWith("{")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as {
      message?: string | string[];
    };
    if (Array.isArray(parsed.message)) {
      const joined = parsed.message
        .map((x) => String(x).trim())
        .filter(Boolean)
        .join(" ");
      if (joined) return joined;
    }
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {
    /* ignore */
  }
  return trimmed;
}
