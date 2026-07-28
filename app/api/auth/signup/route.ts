import { NextRequest, NextResponse } from "next/server";
import { createSession, ensureBootstrapCode, hasAccount, signup } from "@/lib/auth/service";
import { setSessionCookie } from "@/lib/auth/cookie";
import { rateLimit, validateMutationOrigin } from "@/lib/security/request";

export async function POST(req: NextRequest) {
  const originError = validateMutationOrigin(req);
  if (originError) return originError;
  const limited = rateLimit(req, "auth-signup", 5);
  if (limited) return limited;
  try {
    ensureBootstrapCode();
    const body = await req.json() as Record<string, unknown>;
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const displayName = String(body.displayName ?? "").trim();
    const code = String(body.code ?? "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (email.length > 254 || password.length < 8 || password.length > 256) return NextResponse.json({ error: "Use a password between 8 and 256 characters." }, { status: 400 });
    if (!displayName || displayName.length > 100) return NextResponse.json({ error: "Enter a display name of 1–100 characters." }, { status: 400 });
    if (!code || code.length > 64) return NextResponse.json({ error: "Enter the signup code printed in the server console." }, { status: 400 });
    if (hasAccount()) return NextResponse.json({ error: "An account already exists." }, { status: 409 });
    const account = signup(email, password, displayName, code);
    const session = createSession(true);
    const response = NextResponse.json({ account });
    setSessionCookie(response, session.token, true);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Signup failed." }, { status: 400 });
  }
}
