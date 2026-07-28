import { NextRequest, NextResponse } from "next/server";
import { createSession, ensureBootstrapCode, hasAccount, signup, SESSION_COOKIE } from "@/lib/auth/service";

export async function POST(req: NextRequest) {
  try {
    ensureBootstrapCode();
    const body = await req.json() as Record<string, unknown>;
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const displayName = String(body.displayName ?? "").trim();
    const code = String(body.code ?? "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    if (!displayName) return NextResponse.json({ error: "Enter a display name." }, { status: 400 });
    if (!code) return NextResponse.json({ error: "Enter the signup code printed in the server console." }, { status: 400 });
    if (hasAccount()) return NextResponse.json({ error: "An account already exists." }, { status: 409 });
    const account = signup(email, password, displayName, code);
    const session = createSession(true);
    const response = NextResponse.json({ account });
    response.cookies.set(SESSION_COOKIE, session.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Signup failed." }, { status: 400 });
  }
}
