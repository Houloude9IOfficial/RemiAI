import { NextRequest, NextResponse } from "next/server";
import { authenticate, createSession } from "@/lib/auth/service";
import { setSessionCookie } from "@/lib/auth/cookie";
import { rateLimit, validateMutationOrigin } from "@/lib/security/request";
import { isDemoMode } from "@/lib/demo-policy";

export async function POST(req: NextRequest) {
  const originError = validateMutationOrigin(req);
  if (originError) return originError;
  const limited = rateLimit(req, "auth-login", 10);
  if (limited) return limited;
  if (Number(req.headers.get("content-length") ?? 0) > 32 * 1024) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (email.length > 254 || password.length > 256) {
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }
  const remember = isDemoMode() ? false : body.remember === true;
  const account = authenticate(email, password);
  if (!account) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  const session = createSession(remember);
  const response = NextResponse.json({ account });
  setSessionCookie(response, session.token, remember);
  return response;
}
