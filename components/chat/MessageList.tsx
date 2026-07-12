import type { UIMessage } from "ai";
import { MessageBubble } from "./MessageBubble";

export function MessageList({ messages }: { messages: UIMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Ask anything to get started.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-6">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
}
