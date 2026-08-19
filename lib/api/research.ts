export type ConversationClaim = {
  id: number;
  conversationId: number;
  sourceRunId: string | null;
  claimText: string;
  sourceIds: number[];
  supportStatus: "supported" | "partial" | "unsupported" | "disputed" | "inference";
  createdAt: string;
};

export type ConversationSource = {
  id: number;
  conversationId: number;
  sourceRunId: string | null;
  toolName: string;
  sourceType: "web" | "news" | "local" | "other";
  url: string;
  title: string;
  publisher: string;
  retrievedAt: string;
  contentHash: string;
  publishedAt: string | null;
  qualityScore: number;
  freshnessStatus: "fresh" | "stale" | "unknown";
  extractionStatus: "complete" | "partial" | "failed" | "unavailable";
  status: "available" | "partial" | "failed";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export async function listConversationSources(
  conversationId: number,
): Promise<{
  conversationId: number;
  sources: ConversationSource[];
  claims: ConversationClaim[];
}> {
  const response = await fetch(`/api/conversations/${conversationId}/sources`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error ?? "Could not load conversation sources");
  }
  return body as {
    conversationId: number;
    sources: ConversationSource[];
    claims: ConversationClaim[];
  };
}
