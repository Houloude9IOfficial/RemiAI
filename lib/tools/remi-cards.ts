import { z } from "zod";
import { truncateToolResult } from "@/lib/utils";

const REMIAPI_DEFAULT = "https://remiapi.example.workers.dev";

let remiApiOverride: string | null = null;
let remiCardDisplayModesOverride: Record<string, string> | null = null;
let remiLocationFallback: { latitude: number; longitude: number } | null = null;

export function setRemiApiOverride(url: string | null | undefined) {
  remiApiOverride = url && url.trim() ? url.trim().replace(/\/+$/, "") : null;
}
export function setRemiCardDisplayModes(modes: Record<string, string> | null | undefined) {
  remiCardDisplayModesOverride = modes && typeof modes === "object" ? (modes as Record<string, string>) : null;
}
export function setRemiLocationFallback(latitude: string | null, longitude: string | null) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  remiLocationFallback = Number.isFinite(lat) && Number.isFinite(lon) ? { latitude: lat, longitude: lon } : null;
}

function remiApiBase(): string {
  if (remiApiOverride) return remiApiOverride;
  const base =
    (typeof process !== "undefined" && (process.env.REMIAPI_URL || process.env.NEXT_PUBLIC_REMIAPI_URL)) ||
    REMIAPI_DEFAULT;
  return base.replace(/\/+$/, "");
}

async function fetchRemi(path: string, fallbackDirect?: () => Promise<unknown>): Promise<unknown> {
  const base = remiApiBase();
  const url = `${base}${path}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      if (fallbackDirect) return fallbackDirect();
      return { error: `${path.slice(1)} unavailable`, status: res.status, source: "remiapi" };
    }
    const data = await res.json();
    return data;
  } catch (e) {
    if (fallbackDirect) return fallbackDirect();
    return { error: String(e), source: "remiapi" };
  }
}

function resolveDisplayMode(card: string, cardOnly?: boolean): string {
  if (cardOnly) return "card-only";
  const perCard = remiCardDisplayModesOverride?.[card];
  if (perCard === "text") return "text";
  return "visual";
}

function cardResult(card: string, query: Record<string, unknown>, data: unknown, opts: { cardOnly?: boolean; description?: string }) {
  const displayMode = resolveDisplayMode(card, opts.cardOnly);
  const payload: Record<string, unknown> = {
    type: "remi_card",
    card,
    query,
    displayMode,
    description: opts.description ?? null,
    data,
  };
  // Also emit a visual hint so MessageBubble can render the card component.
  payload.visual = { type: "remi_card_visual", card, data, description: opts.description ?? null };
  return truncateToolResult(payload);
}

function withDisplayFields(schema: z.ZodObject<any>): z.ZodObject<any> {
  return schema.extend({
    cardOnly: z
      .boolean()
      .optional()
      .describe("If true, show only the visual card with no extra text. The card IS the answer."),
    description: z
      .string()
      .max(300)
      .optional()
      .describe("Optional one-line caption shown under the card (when cardOnly or alongside the card)."),
  });
}

// ── Upstream fallbacks (used if RemiAPI not yet deployed) ──

async function fallbackWeather(location?: string, latitude?: number, longitude?: number) {
  if (latitude != null && longitude != null) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code&timezone=auto&forecast_days=3`;
    const res = await fetch(url);
    if (!res.ok) return { error: "Weather fallback failed" };
    const data = await res.json();
    return { card: "weather", location: `${latitude},${longitude}`, latitude, longitude, ...(data as object), source: "open-meteo-direct" };
  }
  if (location) {
    const q = encodeURIComponent(location);
    const geo = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      headers: { "User-Agent": "RemiAPI/0.1" },
    });
    if (!geo.ok) return { error: "Geocoding failed" };
    const arr = (await geo.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!arr.length) return { error: "Location not found" };
    return fallbackWeather(undefined, Number(arr[0].lat), Number(arr[0].lon));
  }
  return { error: "Missing location" };
}

async function fallbackCurrency(from: string, to: string, amount: number) {
  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await fetch(url);
  if (!res.ok) return { error: "Currency fallback failed" };
  const j = (await res.json()) as { rates?: Record<string, number>; date?: string };
  const rate = j.rates?.[to];
  if (typeof rate === "number") return { card: "currency", from, to, rate, amount, converted: amount * rate, date: j.date, source: "frankfurter-direct" };
  return { error: "Rate unavailable" };
}

async function fallbackTimezone(timezone?: string, location?: string) {
  let tz = timezone;
  if (!tz && location) {
    const geo = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`, { headers: { "User-Agent": "RemiAPI/0.1" } });
    if (!geo.ok) return { error: "Timezone lookup failed" };
    const places = (await geo.json()) as Array<{ lat: string; lon: string }>;
    const place = places[0];
    if (!place) return { error: "Location not found" };
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m&timezone=auto`);
    if (!response.ok) return { error: "Timezone lookup failed" };
    tz = String((await response.json() as { timezone?: string }).timezone ?? "");
  }
  if (!tz) return { error: "Provide a timezone or location" };
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" }).formatToParts(new Date());
    const value = (kind: string) => parts.find((part) => part.type === kind)?.value ?? "";
    return { card: "timezone", timezone: tz, datetime: `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:00`, abbreviation: value("timeZoneName"), source: "browser-intl" };
  } catch {
    return { error: "Invalid timezone" };
  }
}

async function fallbackMap(query?: string, latitude?: number, longitude?: number) {
  if (query) {
    const q = encodeURIComponent(query);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=5&addressdetails=1`, {
      headers: { "User-Agent": "RemiAPI/0.1" },
    });
    if (!res.ok) return { error: "Map fallback failed" };
    const arr = (await res.json()) as Array<Record<string, unknown>>;
    if (arr.length) return { card: "map", query, results: arr.slice(0, 5), source: "nominatim-direct" };
    try {
      const photon = await fetch(`https://photon.komoot.io/api/?limit=5&q=${q}`, { headers: { Accept: "application/json" } });
      const body = (await photon.json()) as { features?: Array<{ geometry?: { coordinates?: [number, number] }; properties?: Record<string, unknown> }> };
      const results = (body.features ?? []).flatMap((feature) => {
        const [longitude, latitude] = feature.geometry?.coordinates ?? [];
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
        const props = feature.properties ?? {};
        return [{ latitude, longitude, display_name: [props.name, props.street, props.city, props.country].filter(Boolean).join(", ") || query }];
      });
      return { card: "map", query, results, source: "photon-direct" };
    } catch {
      return { card: "map", query, results: [], source: "nominatim-direct" };
    }
  }
  if (latitude != null && longitude != null) {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
      { headers: { "User-Agent": "RemiAPI/0.1" } }
    );
    if (!res.ok) return { error: "Reverse geocoding failed" };
    return { card: "map", ...(await res.json()), source: "nominatim-direct" };
  }
  return { error: "Missing query" };
}

async function fallbackCrypto(coin: string, vs: string) {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coin)}&vs_currencies=${encodeURIComponent(vs)}&include_24hr_change=true&include_market_cap=true`;
  const res = await fetch(url);
  if (!res.ok) return { error: "Crypto fallback failed" };
  const j = (await res.json()) as Record<string, Record<string, number>>;
  const entry = j[coin];
  if (!entry) return { error: "Coin not found" };
  return { card: "crypto", coin, vs_currency: vs, price: entry[vs], change_24h_pct: entry[`${vs}_24h_change`], source: "coingecko-direct" };
}

// ── Tool definitions — flat, single-purpose, weak-model-proof ──

// Models often serialize omitted optional values as null. Accept that wire
// format and normalize it in each executor instead of failing validation.
const optionalText = (max: number) => z.string().min(1).max(max).nullish();

export const remiCardTools: Record<string, { description: string; inputSchema: z.ZodTypeAny; execute: (args: any) => Promise<unknown> }> = {
  weather_card: {
    description:
      "Show weather as a visual card. Use a city or coordinates when supplied. If neither is supplied, it falls back to the user's browser/IP region and then browser timezone/locale. Returns a visual weather card.",
    inputSchema: withDisplayFields(
      z.object({
        location: optionalText(120).describe("Optional city or place name, e.g. 'Paris'. Null is allowed when no place was specified."),
        latitude: z.number().min(-90).max(90).optional().describe("Latitude, -90 to 90. Use only if you have coordinates."),
        longitude: z.number().min(-180).max(180).optional().describe("Longitude, -180 to 180. Use only if you have coordinates."),
      })
    ),
    execute: async (args: { location?: string; latitude?: number; longitude?: number; cardOnly?: boolean; description?: string }) => {
      const { latitude, longitude, cardOnly, description } = args;
      const location = typeof args.location === "string" ? args.location.trim() : undefined;
      const qs = new URLSearchParams();
      if (location) qs.set("location", location);
      const fallback = !location && latitude == null && longitude == null ? remiLocationFallback : null;
      if (latitude != null || fallback) qs.set("latitude", String(latitude ?? fallback!.latitude));
      if (longitude != null || fallback) qs.set("longitude", String(longitude ?? fallback!.longitude));
      const data = await fetchRemi(`/weather?${qs.toString()}`, () =>
        fallbackWeather(location, latitude, longitude)
      );
      return cardResult("weather", { location: location ?? null, latitude: latitude ?? fallback?.latitude ?? null, longitude: longitude ?? fallback?.longitude ?? null }, data, { cardOnly, description });
    },
  },

  timezone_card: {
    description:
      "Show local time as a visual card. One purpose only: current time for a timezone or place. Use timezone (IANA, e.g. 'Europe/Paris') OR location (city). Returns a time card. Use cardOnly=true for card-only display.",
    inputSchema: withDisplayFields(
      z.object({
        timezone: optionalText(80).describe("IANA timezone, e.g. 'Europe/Paris'. Null is allowed when location is supplied."),
        location: optionalText(120).describe("City name if timezone unknown, e.g. 'Berlin'."),
      })
    ),
    execute: async (args: { timezone?: string; location?: string; cardOnly?: boolean; description?: string }) => {
      const timezone = typeof args.timezone === "string" ? args.timezone.trim() : undefined;
      const location = typeof args.location === "string" ? args.location.trim() : undefined;
      const { cardOnly, description } = args;
      if (!timezone && !location) {
        return truncateToolResult({ error: "Provide timezone (e.g. 'Europe/Paris') or location (e.g. 'Berlin')." });
      }
      const qs = new URLSearchParams();
      if (timezone) qs.set("timezone", timezone);
      if (location) qs.set("location", location);
      // IANA zones can be calculated reliably by the runtime; do that first
      // instead of making a healthy timezone card depend on a proxy service.
      const data = timezone
        ? await fallbackTimezone(timezone)
        : await fetchRemi(`/timezone?${qs.toString()}`, () => fallbackTimezone(undefined, location));
      return cardResult("timezone", { timezone: timezone ?? null, location: location ?? null }, data, { cardOnly, description });
    },
  },

  currency_card: {
    description:
      "Show currency conversion as a visual card. One purpose only: convert amount from one currency to another. Provide from, to (ISO 4217 codes like USD, EUR), and optional amount. Use cardOnly=true for card-only display.",
    inputSchema: withDisplayFields(
      z.object({
        from: z.string().length(3).describe("Source currency code, e.g. 'USD'. Exactly 3 letters, uppercase."),
        to: z.string().length(3).describe("Target currency code, e.g. 'EUR'. Exactly 3 letters, uppercase."),
        amount: z.number().positive().max(1e12).optional().describe("Amount to convert. Default 1."),
      })
    ),
    execute: async (args: { from: string; to: string; amount?: number; cardOnly?: boolean; description?: string }) => {
      const from = args.from.toUpperCase();
      const to = args.to.toUpperCase();
      const amount = args.amount ?? 1;
      const qs = new URLSearchParams({ from, to, amount: String(amount) });
      const data = await fetchRemi(`/currency?${qs.toString()}`, () => fallbackCurrency(from, to, amount));
      return cardResult("currency", { from, to, amount }, data, { cardOnly: args.cardOnly, description: args.description });
    },
  },

  map_card: {
    description:
      "Show a place on a map as a visual card. Use a full street address or coordinates whenever possible. For an ambiguous/local business name, search for its address first, then pass that address as query; do not map the name alone because it may return no coordinates. Shows an OSM map card.",
    inputSchema: withDisplayFields(
      z.object({
        query: optionalText(200).describe("Place to locate, e.g. 'Eiffel Tower' or '1600 Pennsylvania Ave'."),
        latitude: z.number().min(-90).max(90).optional().describe("Latitude for reverse geocoding."),
        longitude: z.number().min(-180).max(180).optional().describe("Longitude for reverse geocoding."),
      })
    ),
    execute: async (args: { query?: string; latitude?: number; longitude?: number; cardOnly?: boolean; description?: string }) => {
      const { latitude, longitude, cardOnly, description } = args;
      const query = typeof args.query === "string" ? args.query.trim() : undefined;
      if (!query && (latitude == null || longitude == null)) {
        return truncateToolResult({ error: "Provide query (e.g. 'Eiffel Tower') or latitude+longitude." });
      }
      const qs = new URLSearchParams();
      if (query) qs.set("query", query);
      if (latitude != null) qs.set("latitude", String(latitude));
      if (longitude != null) qs.set("longitude", String(longitude));
      let data = await fetchRemi(`/map?${qs.toString()}`, () => fallbackMap(query, latitude, longitude));
      // A deployed Worker may predate the POI fallback. Retry locally when it
      // successfully returns an empty place result instead of a hard error.
      if (query && data && typeof data === "object" && Array.isArray((data as { results?: unknown[] }).results) && (data as { results: unknown[] }).results.length === 0) {
        data = await fallbackMap(query, latitude, longitude);
      }
      return cardResult("map", { query: query ?? null, latitude: latitude ?? null, longitude: longitude ?? null }, data, { cardOnly, description });
    },
  },

  crypto_card: {
    description:
      "Show crypto price as a visual card. One purpose only: price for one coin. Provide coin (CoinGecko id like 'bitcoin', 'ethereum', 'solana') and optional vs currency (default 'usd'). Use cardOnly=true for card-only display.",
    inputSchema: withDisplayFields(
      z.object({
        coin: z.string().min(1).max(60).describe("Coin id, e.g. 'bitcoin', 'ethereum', 'solana'. Lowercase, hyphenated if needed."),
        vs: z.string().min(2).max(10).optional().describe("Quote currency code, e.g. 'usd', 'eur'. Default 'usd'. Lowercase."),
      })
    ),
    execute: async (args: { coin: string; vs?: string; cardOnly?: boolean; description?: string }) => {
      const coin = args.coin.toLowerCase();
      const vs = (args.vs ?? "usd").toLowerCase();
      const qs = new URLSearchParams({ coin, vs });
      const data = await fetchRemi(`/crypto?${qs.toString()}`, () => fallbackCrypto(coin, vs));
      return cardResult("crypto", { coin, vs }, data, { cardOnly: args.cardOnly, description: args.description });
    },
  },

  news_card: {
    description:
      "Show news headlines as a visual card. One purpose only: top headlines or search. Provide query (keyword) or category. Uses the integrated news tool when available, otherwise returns a structured card slot. Use cardOnly=true for card-only display.",
    inputSchema: withDisplayFields(
      z.object({
        query: z.string().min(1).max(200).optional().describe("Keyword to search news for, e.g. 'AI regulation'."),
        category: z
          .enum(["business", "entertainment", "general", "health", "science", "sports", "technology"])
          .optional()
          .describe("News category when no query. Default 'general'."),
        count: z.number().int().min(1).max(10).optional().describe("How many headlines, 1-10. Default 5."),
      })
    ),
    execute: async (args: { query?: string; category?: string; count?: number; cardOnly?: boolean; description?: string }) => {
      const { query, category, count, cardOnly, description } = args;
      // Prefer the existing news integration if configured (NewsAPI). Call it directly.
      try {
        const { db } = await import("@/db");
        const { toolConfigs } = await import("@/db/schema");
        const configs = await db.select().from(toolConfigs).all();
        const newsCfg = configs.find((c) => c.toolId === "newsapi");
        if (newsCfg?.enabled && newsCfg.apiKey) {
          const { buildNewsApiTool } = await import("@/lib/tools/newsapi");
          const tools = buildNewsApiTool(newsCfg.apiKey);
          const tool = query ? (tools as any).news_search : (tools as any).news_top_headlines;
          const input: Record<string, unknown> = {};
          if (query) input.query = query;
          if (category) input.category = category;
          input.pageSize = count ?? 5;
          const result = await tool.execute(input);
          return cardResult("news", { query: query ?? null, category: category ?? "general", count: count ?? 5 }, result, {
            cardOnly,
            description,
          });
        }
      } catch {}
      // No news API configured: return a well-formed card with a hint; UI still renders the card shell.
      return cardResult(
        "news",
        { query: query ?? null, category: category ?? "general", count: count ?? 5 },
        { hint: "News search not configured on this host. Enable NewsAPI in Settings or set NEWS_API_KEY on RemiAPI Worker.", articles: [] },
        { cardOnly, description }
      );
    },
  },

  stock_card: {
    description:
      "Show a stock quote as a visual card. One purpose only: quote for one ticker. Provide symbol (e.g. 'AAPL', 'TSLA') and optional range. Use cardOnly=true for card-only display.",
    inputSchema: withDisplayFields(
      z.object({
        symbol: z.string().min(1).max(12).describe("Ticker symbol, e.g. 'AAPL', 'NVDA', 'TSLA'. Uppercase, no exchange prefix."),
        range: z
          .enum(["1d", "5d", "1mo", "3mo", "1y"])
          .optional()
          .describe("Chart range. Default '1d'."),
      })
    ),
    execute: async (args: { symbol: string; range?: string; cardOnly?: boolean; description?: string }) => {
      const symbol = args.symbol.toUpperCase();
      const range = args.range ?? "1d";
      // Try RemiAPI first (if proxied); fall back to a direct public quote via web_fetch semantic shape.
      // We avoid hardcoding a keyed provider; use Stooq/Yahoo-style fallback via Frankfurter-ish shape if needed.
      const remiPath = `/stock?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`;
      const data = await fetchRemi(remiPath);
      const isError =
        data && typeof data === "object" && "error" in (data as Record<string, unknown>) && String((data as Record<string, unknown>).error).toLowerCase().includes("not found");
      if (isError) {
        // Best-effort direct fetch for demo (Yahoo chart is public but rate-limited; we try once)
        try {
          const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=1d`;
          const r = await fetch(yUrl, { headers: { Accept: "application/json", "User-Agent": "RemiAPI/0.1" } });
          if (r.ok) {
            const j = (await r.json()) as any;
            const meta = j?.chart?.result?.[0]?.meta;
            const quote = j?.chart?.result?.[0]?.indicators?.quote?.[0];
            const closes: number[] = quote?.close ?? [];
            const last = closes.filter((n) => typeof n === "number").at(-1);
            return cardResult(
              "stock",
              { symbol, range },
              {
                card: "stock",
                symbol,
                range,
                price: last ?? meta?.regularMarketPrice ?? null,
                currency: meta?.currency ?? "USD",
                regularMarketPrice: meta?.regularMarketPrice ?? null,
                chart: closes.slice(-30),
                source: "yahoo-direct",
              },
              { cardOnly: args.cardOnly, description: args.description }
            );
          }
        } catch {}
      }
      return cardResult("stock", { symbol, range }, data, { cardOnly: args.cardOnly, description: args.description });
    },
  },
};

export function buildRemiCardTools(): Record<string, unknown> {
  return remiCardTools as unknown as Record<string, unknown>;
}
