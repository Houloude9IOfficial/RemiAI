"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MessageSquare } from "lucide-react";

type ChatTokenUsage = {
  id: number;
  title: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  updatedAt: string;
};

interface TokenUsageByChatProps {
  chatUsage: ChatTokenUsage[];
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function TokenBadge({ tokens, type }: { tokens: number; type: "input" | "output" }) {
  const color = type === "input" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300" : 
               "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300";

  return (
    <Badge className={color}>
      {formatNumber(tokens)} {type}
    </Badge>
  );
}

export function TokenUsageByChat({ chatUsage }: TokenUsageByChatProps) {
  if (chatUsage.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Chats by Token Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No token usage data available for chats yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Chats by Token Usage</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="min-w-150">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Chat</TableHead>
                <TableHead className="text-right">Input Tokens</TableHead>
                <TableHead className="text-right">Output Tokens</TableHead>
                <TableHead className="text-right">Total Tokens</TableHead>
                <TableHead>Last Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chatUsage.map((chat, index) => (
                <TableRow key={chat.id}>
                  <TableCell className="w-10">
<Badge
  variant="secondary"
  className={`font-medium ${
    index === 0
      ? "bg-yellow-500 text-black"
      : index === 1
      ? "bg-gray-300 text-black"
      : index === 2
      ? "bg-amber-700 text-white"
      : ""
  }`}
>
                      {index + 1}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-50 truncate">
                    <Link
                      href={`/chat/${chat.id}`}
                      className="flex items-center gap-2 hover:underline"
                    >
                      {/* <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" /> */}
                      <span className="font-medium truncate">{chat.title}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    <TokenBadge tokens={chat.inputTokens} type="input" />
                  </TableCell>
                  <TableCell className="text-right">
                    <TokenBadge tokens={chat.outputTokens} type="output" />
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatNumber(chat.totalTokens)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(chat.updatedAt)}
                  </TableCell>
                </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </CardContent>
    </Card>
  );
}
