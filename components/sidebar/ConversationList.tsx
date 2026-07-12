"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { conversationsApi } from "@/lib/api/conversations";

export function ConversationList() {
  const pathname = usePathname();
  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: conversationsApi.list,
  });

  if (conversations.length === 0) {
    return (
      <p className="px-2 py-1 text-xs text-muted-foreground/70">No conversations yet</p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {conversations.map((conversation) => (
        <Link
          key={conversation.id}
          href={`/chat/${conversation.id}`}
          className={cn(
            "truncate rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
            pathname === `/chat/${conversation.id}` && "bg-muted text-foreground",
          )}
        >
          {conversation.title}
        </Link>
      ))}
    </div>
  );
}
