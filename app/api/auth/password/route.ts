import { NextResponse } from "next/server";
import { changePassword, requireAuth } from "@/lib/auth/service";

export async function POST(req: Request) {
  try {
    await requireAuth();
    const body = await req.json() as Record<string, unknown>;
    const current = String(body.currentPassword ?? "");
    const next = String(body.newPassword ?? "");
    if (next.length < 8) return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
    changePassword(current, next);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Password change failed." }, { status: 400 });
  }
}
