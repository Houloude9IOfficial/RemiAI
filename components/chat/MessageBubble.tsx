import type { UIMessage } from "ai";
import { cn } from "@/lib/utils";

export function MessageBubble({ message }: { message: UIMessage }) {
  const text = message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");

  if (!text) return null;

  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}
      >
        {text}
      </div>
    </div>
  );
}
