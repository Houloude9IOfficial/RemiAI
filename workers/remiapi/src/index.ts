// RemiAPI — caching proxy for the zero-cost card set.
// No private keys, tokens, or internal comments baked into responses.
// Upstreams (free tier, no auth): Open-Meteo/Nominatim (weather),
// WorldTimeAPI/TimeAPI (timezone), Frankfurter/ECB (currency),
// Nominatim + OSM (map/geocode), CoinGecko (crypto).
// Cached at the edge via Cache API; protected by Cloudflare rate limiting.

import { cachedFetch, ttlForCard } from "./cache";

type Env = {
  // Optional tuning vars (no secrets required for the 5 free card types)
  UPSTREAM_TIMEOUT_MS?: string;
  ALLOWED_ORIGINS?: string;
  CACHE_TTL_WEATHER?: string;
  CACHE_TTL_TIMEZONE?: string;
  CACHE_TTL_CURRENCY?: string;
  CACHE_TTL_MAP?: string;
  CACHE_TTL_CRYPTO?: string;
  CACHE_TTL_NEWS?: string;
  CACHE_TTL_STOCK?: string;
  // Optional keyed upstreams (only if you later enable news/stock via Worker)
  NEWS_API_KEY?: string;
  STOCKS_API_KEY?: string;
  // Rate limiting binding (optional; configure in wrangler.toml / dashboard)
  REMIAPI_LIMIT?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> };
};

const DEFAULT_TIMEOUT_MS = 8000;

function timeoutMs(env: Env): number {
  const n = env.UPSTREAM_TIMEOUT_MS ? Number(env.UPSTREAM_TIMEOUT_MS) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_TIMEOUT_MS;
}

function corsHeaders(origin: string | null, env: Env): Headers {
  const h = new Headers();
  const allow = env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  if (allow.length === 0) {
    if (origin) h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
  } else if (origin && allow.includes(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
  } else if (allow.includes("*")) {
    h.set("Access-Control-Allow-Origin", "*");
  }
  h.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function fetchWithTimeout(url: string, ms: number, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function checkRateLimit(
  request: Request,
  env: Env
): Promise<Response | null> {
  const limiter = (env as Record<string, unknown>).REMIAPI_LIMIT as
    | { limit: (o: { key: string }) => Promise<{ success: boolean }> }
    | undefined;
  if (!limiter) return null;
  const ip = request.headers.get("CF-Connecting-IP") ?? request.headers.get("x-forwarded-for") ?? "anon";
  const key = `${ip}`;
  try {
    const { success } = await limiter.limit({ key });
    if (!success) {
      return json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
    }
  } catch {
    // If binding misconfigured, fail open (do not block all traffic)
    return null;
  }
  return null;
}

// ── Handlers per card (minimal, explicit params) ─────────────────────

async function handleWeather(url: URL, request: Request, env: Env, cache: Cache, cors: Headers): Promise<Response> {
  const location = url.searchParams.get("location")?.trim();
  const lat = url.searchParams.get("latitude");
  const lon = url.searchParams.get("longitude");

  let latitude: number, longitude: number, placeLabel: string;
  const ms = timeoutMs(env);

  if (lat && lon) {
    latitude = Number(lat);
    longitude = Number(lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return json({ error: "Invalid latitude/longitude." }, { status: 400, headers: cors });
    }
    placeLabel = `${latitude},${longitude}`;
  } else if (location) {
    // Geocode via Nominatim (no key, cache heavily)
    const q = encodeURIComponent(location!);
    const geoUrl = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`;
    const cacheKeyReq = new Request(`https://cache.local/geocode?location=${encodeURIComponent(location!)}`, { method: "GET" });
    const ttl = ttlForCard("map", env as unknown as Record<string, string | undefined>);
    let geoRes: Response;
    const hit = await cache.match(cacheKeyReq);
    if (hit) {
      geoRes = hit;
    } else {
      geoRes = await fetchWithTimeout(geoUrl, ms, { headers: { Accept: "application/json", "User-Agent": "RemiAPI/0.1 (contact: noreply)" } });
      if (!geoRes.ok) return json({ error: "Geocoding failed. Try a different location." }, { status: 502, headers: cors });
      const body = await geoRes.clone().text();
      const toCache = new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` },
      });
      try {
        await cache.put(cacheKeyReq, toCache.clone());
      } catch {}
      geoRes = new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const arr = (await geoRes.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!arr.length) return json({ error: "Location not found." }, { status: 404, headers: cors });
    latitude = Number(arr[0].lat);
    longitude = Number(arr[0].lon);
    placeLabel = arr[0].display_name ?? location!;
  } else {
    // Location was intentionally omitted. Prefer Cloudflare's coarse client
    // geodata (available for direct Worker calls), then an IP lookup. Neither
    // path needs a key or stores the address; the resulting coordinates are
    // only used for this weather request.
    const cf = (request as Request & { cf?: { latitude?: string | number; longitude?: string | number; city?: string } }).cf;
    latitude = Number(cf?.latitude);
    longitude = Number(cf?.longitude);
    placeLabel = cf?.city?.trim() || "Your approximate location";
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      const ip = request.headers.get("CF-Connecting-IP") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      try {
        const ipUrl = ip ? `https://ipapi.co/${encodeURIComponent(ip)}/json/` : "https://ipapi.co/json/";
        const response = await fetchWithTimeout(ipUrl, ms, { headers: { Accept: "application/json" } });
        const geo = (await response.json()) as { latitude?: number; longitude?: number; city?: string; country_name?: string };
        latitude = Number(geo.latitude);
        longitude = Number(geo.longitude);
        placeLabel = geo.city || geo.country_name || "Your approximate location";
      } catch {
        // Return a useful, non-technical message only after both fallbacks fail.
      }
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return json({ error: "Couldn't determine your location. Enable browser location access or provide a city." }, { status: 400, headers: cors });
    }
  }

  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code` +
    `&timezone=auto&forecast_days=3`;

  const keyReq = new Request(
    `https://cache.local/weather?lat=${latitude}&lon=${longitude}`,
    { method: "GET" }
  );
  const ttl = ttlForCard("weather", env as unknown as Record<string, string | undefined>);
  const upstream = await cachedFetch(cache, keyReq, weatherUrl, { headers: { Accept: "application/json" } }, ttl);
  if (!upstream.ok) return json({ error: "Weather provider unavailable." }, { status: 502, headers: cors });
  const data = (await upstream.json()) as Record<string, unknown>;
  // Normalize to a compact visual-friendly shape
  const current = (data.current ?? {}) as Record<string, unknown>;
  const daily = (data.daily ?? {}) as Record<string, unknown>;
  return json(
    {
      card: "weather",
      location: placeLabel,
      latitude,
      longitude,
      current: {
        temperature_c: current.temperature_2m,
        feels_like_c: current.apparent_temperature,
        humidity_pct: current.relative_humidity_2m,
        wind_speed_kmh: current.wind_speed_10m,
        wind_direction_deg: current.wind_direction_10m,
        weather_code: current.weather_code,
        time: current.time,
      },
      forecast: daily,
      source: "open-meteo",
    },
    { headers: cors }
  );
}

async function handleTimezone(url: URL, request: Request, env: Env, cache: Cache, cors: Headers): Promise<Response> {
  const location = url.searchParams.get("location")?.trim();
  const timezone = url.searchParams.get("timezone")?.trim();
  const ms = timeoutMs(env);
  const ttl = ttlForCard("timezone", env as unknown as Record<string, string | undefined>);

  let tz = timezone;
  if (!tz && location) {
    // Resolve location → lat/lon → timezone via Open-Meteo geocoding + timezone lookup
    // Use WorldTimeAPI-style: we can return local time from the forecast's timezone
    const q = encodeURIComponent(location);
    const geoUrl = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`;
    const geoKey = new Request(`https://cache.local/geocode?location=${encodeURIComponent(location)}`, { method: "GET" });
    let geoRes = await cache.match(geoKey);
    if (!geoRes) {
      const r = await fetchWithTimeout(geoUrl, ms, { headers: { Accept: "application/json", "User-Agent": "RemiAPI/0.1" } });
      if (!r.ok) return json({ error: "Geocoding failed." }, { status: 502, headers: cors });
      const body = await r.clone().text();
      const toCache = new Response(body, { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` } });
      try { await cache.put(geoKey, toCache.clone()); } catch {}
      geoRes = new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const arr = (await geoRes.json()) as Array<{ lat: string; lon: string }>;
    if (!arr.length) return json({ error: "Location not found." }, { status: 404, headers: cors });
    const lat = Number(arr[0].lat);
    const lon = Number(arr[0].lon);
    // Ask Open-Meteo for the canonical timezone for that point
    const tzUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&timezone=auto&forecast_days=1`;
    const tzKey = new Request(`https://cache.local/timezone?lat=${lat}&lon=${lon}`, { method: "GET" });
    const tzRes = await cachedFetch(cache, tzKey, tzUrl, { headers: { Accept: "application/json" } }, ttl);
    if (!tzRes.ok) return json({ error: "Timezone lookup failed." }, { status: 502, headers: cors });
    const tzData = (await tzRes.json()) as Record<string, unknown>;
    tz = String(tzData.timezone ?? "");
  }

  if (!tz) return json({ error: "Missing timezone. Provide ?timezone=Area/City or ?location=City" }, { status: 400, headers: cors });

  // WorldTimeAPI (no key)
  const wtaUrl = `https://worldtimeapi.org/api/timezone/${encodeURIComponent(tz)}`;
  const wtaKey = new Request(`https://cache.local/wta?tz=${encodeURIComponent(tz)}`, { method: "GET" });
  const wtaRes = await cachedFetch(cache, wtaKey, wtaUrl, { headers: { Accept: "application/json" } }, ttl);
  if (wtaRes.ok) {
    const j = (await wtaRes.json()) as Record<string, unknown>;
    return json(
      {
        card: "timezone",
        timezone: tz,
        datetime: j.datetime,
        utc_offset: j.utc_offset,
        abbreviation: j.abbreviation,
        dst: j.dst,
        source: "worldtimeapi",
      },
      { headers: cors }
    );
  }
  // Fallback: synthesize from Intl if upstream is down
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "short",
    });
    const parts = fmt.formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const datetime = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
    return json({ card: "timezone", timezone: tz, datetime, source: "intl-fallback" }, { headers: cors });
  } catch {
    return json({ error: "Invalid timezone." }, { status: 400, headers: cors });
  }
}

async function handleCurrency(url: URL, _request: Request, env: Env, cache: Cache, cors: Headers): Promise<Response> {
  const from = (url.searchParams.get("from") ?? url.searchParams.get("base") ?? "").trim().toUpperCase();
  const to = (url.searchParams.get("to") ?? url.searchParams.get("target") ?? "").trim().toUpperCase();
  const amountRaw = url.searchParams.get("amount")?.trim();
  const amount = amountRaw ? Number(amountRaw) : 1;
  if (!from || !to) return json({ error: "Missing from/to. Provide ?from=USD&to=EUR" }, { status: 400, headers: cors });
  if (!Number.isFinite(amount)) return json({ error: "Invalid amount." }, { status: 400, headers: cors });

  const ttl = ttlForCard("currency", env as unknown as Record<string, string | undefined>);
  const frankUrl = `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const keyReq = new Request(`https://cache.local/currency?from=${from}&to=${to}`, { method: "GET" });
  // Frankfurter is ECB reference data (no key). Cache aggressively.
  let frankRes: Response | null = null;
  const hit = await cache.match(keyReq);
  if (hit) frankRes = hit;
  else {
    const r = await fetchWithTimeout(frankUrl, timeoutMs(env), { headers: { Accept: "application/json" } });
    if (r.ok) {
      const body = await r.clone().text();
      const toCache = new Response(body, { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` } });
      try { await cache.put(keyReq, toCache.clone()); } catch {}
      frankRes = new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
    }
  }
  if (frankRes) {
    const j = (await frankRes.json()) as { rates?: Record<string, number>; date?: string; base?: string };
    const rate = j.rates?.[to];
    if (typeof rate === "number") {
      return json(
        {
          card: "currency",
          from,
          to,
          rate,
          amount,
          converted: amount * rate,
          date: j.date,
          source: "frankfurter-ecb",
        },
        { headers: cors }
      );
    }
  }
  // Fallback: exchangerate.host open fallback (also no key for basic usage) — best-effort
  const fallbackUrl = `https://api.exchangerate.host/convert?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${amount}`;
  try {
    const r = await fetchWithTimeout(fallbackUrl, timeoutMs(env), { headers: { Accept: "application/json" } });
    if (r.ok) {
      const j = (await r.json()) as Record<string, unknown>;
      const result = typeof j.result === "number" ? j.result : undefined;
      const info = j.info as Record<string, unknown> | undefined;
      const rate = typeof info?.rate === "number" ? (info.rate as number) : undefined;
      if (typeof result === "number") {
        return json({ card: "currency", from, to, amount, converted: result, rate: rate ?? result / amount, source: "exchangerate.host" }, { headers: cors });
      }
    }
  } catch {}
  return json({ error: "Currency rate unavailable for that pair." }, { status: 502, headers: cors });
}

async function handleMap(url: URL, _request: Request, env: Env, cache: Cache, cors: Headers): Promise<Response> {
  const query = url.searchParams.get("query")?.trim() ?? url.searchParams.get("location")?.trim() ?? url.searchParams.get("q")?.trim() ?? "";
  const lat = url.searchParams.get("latitude");
  const lon = url.searchParams.get("longitude");
  if (!query && !(lat && lon)) {
    return json({ error: "Missing query. Provide ?query=place or ?latitude=&longitude=" }, { status: 400, headers: cors });
  }
  const ttl = ttlForCard("map", env as unknown as Record<string, string | undefined>);
  const ms = timeoutMs(env);

  if (query) {
    const q = encodeURIComponent(query);
    const keyReq = new Request(`https://cache.local/map?q=${encodeURIComponent(query)}`, { method: "GET" });
    const hit = await cache.match(keyReq);
    if (hit) {
      const data = await hit.json();
      return json(data, { headers: cors });
    }
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=5&addressdetails=1`;
    const r = await fetchWithTimeout(nominatimUrl, ms, { headers: { Accept: "application/json", "User-Agent": "RemiAPI/0.1" } });
    if (!r.ok) return json({ error: "Geocoding unavailable." }, { status: 502, headers: cors });
    const arr = (await r.json()) as Array<Record<string, unknown>>;
    let results = arr.map((x) => ({
      display_name: x.display_name,
      latitude: Number(x.lat),
      longitude: Number(x.lon),
      type: x.type,
      class: x.class,
      osm_id: x.osm_id,
      address: x.address,
    }));
    // Nominatim is excellent for addresses but can miss small businesses.
    // Photon indexes OSM POIs differently, so it is a useful second, free
    // lookup before treating a local place as unresolved.
    if (results.length === 0) {
      try {
        const photon = await fetchWithTimeout(`https://photon.komoot.io/api/?limit=5&q=${q}`, ms, { headers: { Accept: "application/json" } });
        if (photon.ok) {
          const body = (await photon.json()) as { features?: Array<{ geometry?: { coordinates?: [number, number] }; properties?: Record<string, unknown> }> };
          results = (body.features ?? []).flatMap((feature) => {
            const [rawLongitude, rawLatitude] = feature.geometry?.coordinates ?? [];
            const longitude = Number(rawLongitude);
            const latitude = Number(rawLatitude);
            const props = feature.properties ?? {};
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
            const label = [props.name, props.street, props.housenumber, props.city, props.country].filter(Boolean).join(", ");
            return [{ display_name: label || query, latitude, longitude, type: props.osm_value, class: props.osm_key, osm_id: undefined, address: props }];
          });
        }
      } catch {}
    }
    const payload = { card: "map", query, results, source: "nominatim" };
    try {
      await cache.put(
        keyReq,
        new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` } })
      );
    } catch {}
    return json(payload, { headers: cors });
  }

  // Reverse geocode
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return json({ error: "Invalid latitude/longitude." }, { status: 400, headers: cors });
  }
  const keyReq = new Request(`https://cache.local/map?lat=${latitude}&lon=${longitude}`, { method: "GET" });
  const hit = await cache.match(keyReq);
  if (hit) {
    const data = await hit.json();
    return json(data, { headers: cors });
  }
  const revUrl = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`;
  const r = await fetchWithTimeout(revUrl, ms, { headers: { Accept: "application/json", "User-Agent": "RemiAPI/0.1" } });
  if (!r.ok) return json({ error: "Reverse geocoding unavailable." }, { status: 502, headers: cors });
  const j = (await r.json()) as Record<string, unknown>;
  const payload = {
    card: "map",
    latitude,
    longitude,
    display_name: j.display_name,
    address: j.address,
    osm_id: j.osm_id,
    source: "nominatim",
  };
  try {
    await cache.put(
      keyReq,
      new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` } })
    );
  } catch {}
  return json(payload, { headers: cors });
}

async function handleCrypto(url: URL, _request: Request, env: Env, cache: Cache, cors: Headers): Promise<Response> {
  const coin = (url.searchParams.get("coin") ?? url.searchParams.get("id") ?? "bitcoin").trim().toLowerCase();
  const vs = (url.searchParams.get("vs") ?? url.searchParams.get("currency") ?? "usd").trim().toLowerCase();
  const ttl = ttlForCard("crypto", env as unknown as Record<string, string | undefined>);
  const keyReq = new Request(`https://cache.local/crypto?coin=${coin}&vs=${vs}`, { method: "GET" });
  const hit = await cache.match(keyReq);
  if (hit) {
    const data = await hit.json();
    return json(data, { headers: cors });
  }
  // CoinGecko public (no key for basic). Keep single-id request to stay in free tier.
  const cgUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coin)}&vs_currencies=${encodeURIComponent(vs)}&include_24hr_change=true&include_market_cap=true`;
  const r = await fetchWithTimeout(cgUrl, timeoutMs(env), { headers: { Accept: "application/json" } });
  if (!r.ok) {
    const status = r.status;
    if (status === 429) return json({ error: "Crypto provider rate-limited. Try again shortly." }, { status: 429, headers: cors });
    return json({ error: "Crypto provider unavailable." }, { status: 502, headers: cors });
  }
  const j = (await r.json()) as Record<string, Record<string, number>>;
  const entry = j[coin];
  if (!entry) return json({ error: "Coin not found." }, { status: 404, headers: cors });
  const payload = {
    card: "crypto",
    coin,
    vs_currency: vs,
    price: entry[vs],
    change_24h_pct: entry[`${vs}_24h_change`],
    market_cap: entry[`${vs}_market_cap`],
    source: "coingecko",
  };
  try {
    await cache.put(
      keyReq,
      new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` } })
    );
  } catch {}
  return json(payload, { headers: cors });
}

export default {
  async fetch(request: Request, env: Env, _ctx: unknown): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // Rate limiting (optional binding). If the limit denies, cors headers are included.
    const rateLimited = await checkRateLimit(request, env);
    if (rateLimited) {
      for (const [k, v] of cors.entries()) rateLimited.headers.set(k, v);
      return rateLimited;
    }

    // Health / discovery — no auth.
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, cards: ["weather", "timezone", "currency", "map", "crypto", "news", "stock"] }, { headers: cors });
    }

    const cache: Cache = (caches as unknown as { default: Cache }).default;

    // Normalize path: /weather, /timezone, /currency, /map, /crypto
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const addCors = (res: Response): Response => {
      const h = new Headers(res.headers);
      for (const [k, v] of cors.entries()) h.set(k, v);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
    };

    // Lightweight news/stock passthroughs — no key required for the
    // free-tier card set; if NEWS_API_KEY is set, news is proxied via
    // NewsAPI and edge-cached. Stock uses Yahoo chart (public).
    async function handleNews(u: URL, _req: Request, e: Env, c: Cache, co: Headers): Promise<Response> {
      const query = u.searchParams.get("query")?.trim() ?? "";
      const category = u.searchParams.get("category")?.trim() ?? "general";
      const count = Math.min(10, Math.max(1, Number(u.searchParams.get("count") ?? "5") || 5));
      const ttl = ttlForCard("news", e as unknown as Record<string, string | undefined>);
      const key = e.NEWS_API_KEY?.trim();
      if (!key) {
        return json({ card: "news", query: query || null, category, count, articles: [], hint: "News not configured on this Worker (set NEWS_API_KEY).", source: "remiapi" }, { headers: co });
      }
      const cacheKey = new Request(`https://cache.local/news?q=${encodeURIComponent(query)}&cat=${encodeURIComponent(category)}&n=${count}`, { method: "GET" });
      const hit = await c.match(cacheKey);
      if (hit) { const d = await hit.json(); return json(d, { headers: co }); }
      const base = query
        ? `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&pageSize=${count}&sortBy=publishedAt&language=en`
        : `https://newsapi.org/v2/top-headlines?category=${encodeURIComponent(category)}&pageSize=${count}&language=en`;
      const r = await fetchWithTimeout(base, timeoutMs(e), { headers: { "X-Api-Key": key, Accept: "application/json" } });
      if (!r.ok) return json({ error: "News provider unavailable." }, { status: 502, headers: co });
      const j = (await r.json()) as { articles?: Array<{ title?: string; url?: string; source?: { name?: string }; publishedAt?: string }> };
      const articles = (j.articles ?? []).slice(0, count).map((a) => ({ title: a.title, url: a.url, source: a.source?.name, publishedAt: a.publishedAt }));
      const payload = { card: "news", query: query || null, category, count, articles, source: "newsapi" };
      try { await c.put(cacheKey, new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` } })); } catch {}
      return json(payload, { headers: co });
    }
    async function handleStock(u: URL, _req: Request, e: Env, c: Cache, co: Headers): Promise<Response> {
      const symbol = (u.searchParams.get("symbol") ?? "").trim().toUpperCase();
      const range = (u.searchParams.get("range") ?? "1d").trim();
      if (!symbol) return json({ error: "Missing symbol. Provide ?symbol=AAPL" }, { status: 400, headers: co });
      const ttl = ttlForCard("stock", e as unknown as Record<string, string | undefined>);
      const cacheKey = new Request(`https://cache.local/stock?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`, { method: "GET" });
      const hit = await c.match(cacheKey);
      if (hit) { const d = await hit.json(); return json(d, { headers: co }); }
      const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=1d`;
      const r = await fetchWithTimeout(yUrl, timeoutMs(e), { headers: { Accept: "application/json", "User-Agent": "RemiAPI/0.1" } });
      if (!r.ok) return json({ error: "Stock provider unavailable." }, { status: 502, headers: co });
      const j = (await r.json()) as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; currency?: string }; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } };
      const result = j.chart?.result?.[0];
      const meta = result?.meta;
      const closes: Array<number | null> = result?.indicators?.quote?.[0]?.close ?? [];
      const valid = closes.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
      const last = valid.at(-1) ?? meta?.regularMarketPrice ?? null;
      const payload = { card: "stock", symbol, range, price: last, currency: meta?.currency ?? "USD", regularMarketPrice: meta?.regularMarketPrice ?? null, chart: valid.slice(-30), source: "yahoo" };
      try { await c.put(cacheKey, new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` } })); } catch {}
      return json(payload, { headers: co });
    }
    let res: Response;
    switch (path) {
      case "/weather":
        res = await handleWeather(url, request, env, cache, cors);
        break;
      case "/timezone":
        res = await handleTimezone(url, request, env, cache, cors);
        break;
      case "/currency":
        res = await handleCurrency(url, request, env, cache, cors);
        break;
      case "/map":
        res = await handleMap(url, request, env, cache, cors);
        break;
      case "/crypto":
        res = await handleCrypto(url, request, env, cache, cors);
        break;
      case "/news":
        res = await handleNews(url, request, env, cache, cors);
        break;
      case "/stock":
        res = await handleStock(url, request, env, cache, cors);
        break;
      default:
        res = json({ error: "Not found. Use /weather, /timezone, /currency, /map, /crypto, /news, /stock, or /health." }, { status: 404 });
        break;
    }

    // Ensure CORS on every response (handlers already set it on success; normalize errors too)
    if (request.method === "GET") {
      return addCors(res);
    }
    return res;
  },
};
