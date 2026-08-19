import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import {
  listConversationClaims,
  listConversationSources,
} from "@/lib/research/source-storage";

function parseConversationId(value: string): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function messageText(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter(
      (part): part is { type: "text"; text: string } =>
        Boolean(part) &&
        typeof part === "object" &&
        (part as Record<string, unknown>).type === "text" &&
        typeof (part as Record<string, unknown>).text === "string",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function escapeTable(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const conversationId = parseConversationId(rawId);
  if (conversationId === null) {
    return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  }

  const conversation = await db
    .select({ id: conversations.id, title: conversations.title })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .get();
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const rows = await db
    .select({ role: messages.role, parts: messages.parts })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.orderIndex));
  const latestAssistant = rows
    .filter((row) => row.role === "assistant")
    .map((row) => messageText(row.parts))
    .filter(Boolean)
    .at(-1) ?? "No assistant research answer has been recorded yet.";
  const [sources, claims] = await Promise.all([
    listConversationSources(conversationId),
    listConversationClaims(conversationId),
  ]);

  const lines = [
    `# ${conversation.title || "Research report"}`,
    "",
    `Generated from conversation ${conversationId} on ${new Date().toISOString()}.`,
    "",
    "## Answer",
    "",
    latestAssistant,
    "",
    "## Sources",
    "",
    "| Source | Publisher | Status | Freshness | Quality |",
    "| --- | --- | --- | --- | --- |",
    ...sources.map(
      (source) =>
        `| [${escapeTable(source.title)}](${source.url}) | ${escapeTable(source.publisher || "Unknown")} | ${source.status} | ${source.freshnessStatus} | ${source.qualityScore}/100 |`,
    ),
    ...(sources.length === 0 ? ["No source records were captured."] : []),
    "",
    "## Claim support",
    "",
    ...claims.map(
      (claim) =>
        `- **${claim.supportStatus}** — ${claim.claimText}${claim.sourceIds.length > 0 ? ` _(source IDs: ${claim.sourceIds.join(", ")})_` : ""}`,
    ),
    ...(claims.length === 0 ? ["No claim/source associations were captured."] : []),
    "",
    "_Source page bodies are not embedded in this export; URLs and content hashes remain in the conversation provenance records._",
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="remi-research-${conversationId}.md"`,
      "Cache-Control": "no-store",
    },
  });
}
