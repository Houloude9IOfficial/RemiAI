import { NextRequest, NextResponse } from "next/server";

const PUBLIC_AUTH_PATHS = new Set([
  "/api/auth/status",
  "/api/auth/signup",
  "/api/auth/login",
  "/api/auth/logout",
]);

export async function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (origin && host) {
      try {
        if (new URL(origin).host !== host) return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
      } catch {
        return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
      }
    }
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
    }
  }
  if (PUBLIC_AUTH_PATHS.has(request.nextUrl.pathname)) return NextResponse.next();
  if (!request.cookies.has("remiai_session")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  // Proxy runs before route handlers, so validate the opaque session through
  // the public status handler. The handler performs the database lookup and
  // checks expiry/revocation; the proxy only supplies the early auth wall.
  try {
    const status = await fetch(new URL("/api/auth/status", request.url), {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    });
    const data = await status.json() as { authenticated?: boolean };
    if (!data.authenticated) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Authentication service unavailable." }, { status: 503 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
