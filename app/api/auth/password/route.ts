import { NextResponse } from "next/server";
import { changePassword, requireAuth } from "@/lib/auth/service";
import { rateLimit, validateMutationOrigin } from "@/lib/security/request";

export async function POST(req: Request) {
  const originError = validateMutationOrigin(req);
  if (originError) return originError;
  const limited = rateLimit(req, "auth-password", 5);
  if (limited) return limited;
  try {
    await requireAuth();
    const body = await req.json() as Record<string, unknown>;
    const current = String(body.currentPassword ?? "");
    const next = String(body.newPassword ?? "");
    if (next.length < 8 || next.length > 256) return NextResponse.json({ error: "New password must be between 8 and 256 characters." }, { status: 400 });
    changePassword(current, next);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Password change failed." }, { status: 400 });
  }
}
