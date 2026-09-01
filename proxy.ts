import { NextRequest, NextResponse } from "next/server";
import { isDemoMode } from "@/lib/demo-policy";

const PUBLIC_AUTH_PATHS = new Set([
  "/api/auth/status",
  "/api/auth/signup",
  "/api/auth/login",
  "/api/auth/logout",
  // Update check — reads the public GitHub releases API and leaks no user
  // data, so it can run before authentication (e.g. on the login screen).
  "/api/updates",
]);

// Webhook delivery (POST /api/webhooks/:id) and verification ping
// (GET /api/webhooks/:id, incl. the Meta-style hub.challenge echo) are
// authenticated by the per-webhook secret — NOT the session cookie — and are
// called by external services, which are cross-site by nature. Bypass the
// session wall AND the cross-site checks for exactly these two shapes; the
// admin routes (/api/webhooks, /api/webhooks/:id/events, /api/webhooks/:id/test)
// stay behind authentication.
const WEBHOOK_DELIVERY_PATH_RE = /^\/api\/webhooks\/\d+$/;

function isWebhookDeliveryOrVerification(pathname: string, method: string): boolean {
  return (
    (method === "POST" || method === "GET") &&
    WEBHOOK_DELIVERY_PATH_RE.test(pathname)
  );
}

const DEMO_BLOCKED_PAGE_PREFIXES = [
  "/settings",
  "/games",
  "/talk",
  "/research",
  "/news",
  "/coding",
  "/files",
  "/runs",
  "/artifacts",
];

export async function proxy(request: NextRequest) {
  if (isDemoMode() && DEMO_BLOCKED_PAGE_PREFIXES.some((prefix) =>
    request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(`${prefix}/`),
  )) {
    return NextResponse.redirect(new URL("/chat", request.url));
  }
  if (!request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  if (isWebhookDeliveryOrVerification(request.nextUrl.pathname, request.method)) {
    return NextResponse.next();
  }
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
  if (isDemoMode() && request.nextUrl.pathname.startsWith("/api/auth/")) {
    // The public demo uses the host-created shared account. Account mutation
    // endpoints remain unreachable even for an authenticated visitor.
    if (["/api/auth/password", "/api/auth/signup"].includes(request.nextUrl.pathname)) {
      return NextResponse.json({ error: "This feature is unavailable in the public demo." }, { status: 403 });
    }
  }
  if (!request.cookies.has("remiai_session")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  // Proxy runs before route handlers, so validate the opaque session through
  // the public status handler. The handler performs the database lookup and
  // checks expiry/revocation; the proxy only supplies the early auth wall.
  // Use localhost for the internal fetch instead of the public request URL.
  // The public URL may not be reachable from inside the Docker container
  // (DNS resolution, TLS termination, or reverse proxy routing issues).
  try {
    // In a container, PORT is the internal Next.js port. Do not use the
    // host-published port here; that can point back at the reverse proxy and
    // produce intermittent 502s during authenticated API requests.
    const port = process.env.PORT || "3000";
    const status = await fetch(`http://127.0.0.1:${port}/api/auth/status`, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    });
    const data = await status.json() as { authenticated?: boolean };
    if (!data.authenticated) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  } catch (e) {
    console.error("[proxy] Auth status check failed:", e);
    return NextResponse.json({ error: "Authentication service unavailable." }, { status: 503 });
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
