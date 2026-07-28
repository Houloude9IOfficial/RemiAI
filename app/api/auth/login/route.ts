import { NextRequest, NextResponse } from "next/server";
import { authenticate, createSession, SESSION_COOKIE } from "@/lib/auth/service";

export async function POST(req: NextRequest) {
  const body = await req.json() as Record<string, unknown>;
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const remember = body.remember === true;
  const account = authenticate(email, password);
  if (!account) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  const session = createSession(remember);
  const response = NextResponse.json({ account });
  response.cookies.set(SESSION_COOKIE, session.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", ...(remember ? { maxAge: 30 * 86400 } : {}) });
  return response;
}
