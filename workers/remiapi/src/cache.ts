export type CacheTtl = number;

export function cacheKey(request: Request, params: Record<string, string | number | undefined>): string {
  const url = new URL(request.url);
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k] ?? "")}`)
    .join("&");
  return `${url.pathname}?${sorted}`;
}

export async function cachedFetch(
  cache: Cache,
  keyRequest: Request,
  upstreamUrl: string,
  init: RequestInit,
  ttlSeconds: number
): Promise<Response> {
  const cached = await cache.match(keyRequest);
  if (cached) return cached;

  const res = await fetch(upstreamUrl, init);
  if (!res.ok) return res;

  // Clone before consuming; set Cache-Control for edge reuse.
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", `public, max-age=${ttlSeconds}`);
  headers.set("CDN-Cache-Control", `public, max-age=${ttlSeconds}`);
  const toCache = new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
  // waitUntil is caller-managed; best-effort here via put (no throw on put failure).
  try {
    await cache.put(keyRequest, toCache.clone());
  } catch {
    // ignore cache put errors (e.g. body already used)
  }
  return toCache;
}

export function ttlForCard(card: string, env: Record<string, string | undefined>): number {
  const map: Record<string, { envKey: string; def: number }> = {
    weather: { envKey: "CACHE_TTL_WEATHER", def: 600 },
    timezone: { envKey: "CACHE_TTL_TIMEZONE", def: 300 },
    currency: { envKey: "CACHE_TTL_CURRENCY", def: 3600 },
    map: { envKey: "CACHE_TTL_MAP", def: 86400 },
    crypto: { envKey: "CACHE_TTL_CRYPTO", def: 60 },
    news: { envKey: "CACHE_TTL_NEWS", def: 300 },
    stock: { envKey: "CACHE_TTL_STOCK", def: 60 },
  };
  const entry = map[card];
  if (!entry) return 300;
  const raw = env[entry.envKey];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : entry.def;
}
