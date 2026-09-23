import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAccount } from "@/lib/auth/service";
import { setConversationGenerationVisibility } from "@/lib/chat/generation-presence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const inputSchema = z.object({ visible: z.boolean() });

/** Records whether this conversation is currently visible to its user. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await getCurrentAccount()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const conversationId = Number((await params).id);
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    return NextResponse.json({ error: "Invalid conversation id" }, { status: 400 });
  }
  try {
    const { visible } = inputSchema.parse(await req.json());
    return NextResponse.json({ active: setConversationGenerationVisibility(conversationId, visible) });
  } catch {
    return NextResponse.json({ error: "Invalid visibility state" }, { status: 400 });
  }
}
