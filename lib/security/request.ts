import { NextResponse } from "next/server";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 15 * 60 * 1000;
let lastCleanup = 0;

function clientKey(request: Request) {
  // Reverse proxies should overwrite these headers. They are only used as a
  // best-effort abuse throttle, never as an authentication signal.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export function rateLimit(request: Request, scope: string, limit: number) {
  const key = `${scope}:${clientKey(request)}`;
  const current = Date.now();
  if (current - lastCleanup > WINDOW_MS) {
    for (const [bucketKey, bucketValue] of buckets) {
      if (bucketValue.resetAt <= current) buckets.delete(bucketKey);
    }
    lastCleanup = current;
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= current) {
    buckets.set(key, { count: 1, resetAt: current + WINDOW_MS });
    return null;
  }
  bucket.count += 1;
  if (bucket.count <= limit) return null;
  return NextResponse.json(
    { error: "Too many attempts. Please wait and try again." },
    { status: 429, headers: { "Retry-After": String(Math.ceil((bucket.resetAt - current) / 1000)) } },
  );
}

export function validateMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  }
  return null;
}
