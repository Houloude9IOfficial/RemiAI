import { NextRequest, NextResponse } from "next/server";
import { revokeSession, SESSION_COOKIE } from "@/lib/auth/service";
import { clearSessionCookie } from "@/lib/auth/cookie";
import { validateMutationOrigin } from "@/lib/security/request";

export async function POST(req: NextRequest) {
  const originError = validateMutationOrigin(req);
  if (originError) return originError;
  revokeSession(req.cookies.get(SESSION_COOKIE)?.value);
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
