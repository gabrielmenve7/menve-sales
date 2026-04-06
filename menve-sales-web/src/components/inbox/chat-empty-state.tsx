import { MessageSquare } from "lucide-react";

export function ChatEmptyState() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden p-8 text-center">
      <MessageSquare className="size-12 text-muted-foreground/40" strokeWidth={1.25} />
      <div>
        <p className="text-base font-semibold">Chat Menve</p>
        <p className="text-sm text-muted-foreground">
          Selecione uma conversa para começar
        </p>
      </div>
    </div>
  );
}
