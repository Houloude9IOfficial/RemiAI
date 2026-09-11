# RemiAPI — Cloudflare Worker caching proxy

Zero-cost card proxy for the RemiAI visual cards: **weather, timezone, currency, map, crypto**.

- **No secrets committed.** Weather, time, currency, map, crypto, and the current stock provider work without a key. `NEWS_API_KEY` is optional for live news. See [API keys — where they come from](#api-keys--where-they-come-from-and-why).
- **Edge caching:** `Cache API` (`caches.default`) per card with tuned TTLs; repeated queries hit cache instead of the origin.
- **Rate limiting:** optional `[[ratelimits]]` binding (`REMIAPI_LIMIT`) protects the shared free-tier budget. No auth; edge-enforced.

## Deploy

```bash
cd workers/remiapi
npm install
npx wrangler deploy
# Optional: configure rate limiting in wrangler.toml / dashboard, then redeploy.
# Optional live-news key: npx wrangler secret put NEWS_API_KEY
```

## Configure the app

In your RemiAI host (Next.js), set:

- `NEXT_PUBLIC_REMIAPI_URL` — e.g. `https://remiapi.your-subdomain.workers.dev` (fallback is the same-origin `/api/remiapi` or a documented default once live)
- `REMIAPI_URL` (server-side, optional) — if the Worker is on a private origin

Enable/disable the whole RemiAPI-backed card set in **Profile → RemiAPI**, and customize the Worker URL there. Cards work as sole tool or combined.

## Endpoints (proxied)

`GET /weather?location=Paris` or `?latitude=&longitude=` · `GET /timezone?timezone=Europe/Paris` or `?location=` · `GET /currency?from=USD&to=EUR&amount=1` · `GET /map?query=` or `?latitude=&longitude=` · `GET /crypto?coin=bitcoin&vs=usd` · `GET /health`

Upstreams: Open-Meteo, Nominatim/OSM, WorldTimeAPI, Frankfurter (ECB), CoinGecko — all public, no key, edge-cached.

## API keys — where they come from and why

The Worker is built around **keyless, public, free-tier upstreams**. That is what lets the repo stay public and the deployment stay free: there is no secret to leak, rotate, or pay for, and anyone who clones the project gets a working card set without signing up for anything. Only two optional variables exist, and only one of them is actually read by the code.

| Card | Upstream provider | Key | Why this provider |
| --- | --- | --- | --- |
| weather | [Open-Meteo](https://open-meteo.com) (`api.open-meteo.com`) | none | Documented public API, no signup, generous limits, returns current + 3-day forecast in one call so a card needs a single request. |
| timezone — location→tz | [Nominatim](https://nominatim.openstreetmap.org) (OpenStreetMap), then Open-Meteo `timezone=auto` | none | Same OSM geocoder the map card uses; Open-Meteo resolves the canonical IANA zone from the coordinates. |
| timezone — clock | [WorldTimeAPI](https://worldtimeapi.org) with an `Intl.DateTimeFormat` fallback | none | Keyless IANA lookup; the `Intl` fallback computes correct local time with zero network if the upstream is down. |
| currency | [Frankfurter](https://frankfurter.app) (ECB reference rates), [exchangerate.host](https://exchangerate.host) fallback | none | Frankfurter mirrors official ECB rates — authoritative and keyless; exchange rate updates only once per working day, so it caches for an hour. |
| map / geocode | [Nominatim](https://nominatim.openstreetmap.org), [Photon](https://photon.komoot.io) fallback | none | OSM data, no key. Photon is queried only when Nominatim returns no result, because it indexes POIs/small businesses differently. |
| crypto | [CoinGecko](https://www.coingecko.com/en/api) public API | none | Keyless price + 24h change + market cap in one call; single-coin requests keep it inside the free tier. |
| approximate location | Cloudflare `request.cf` geodata, [ipapi.co](https://ipapi.co) fallback | none | Cloudflare supplies coarse lat/lon on the request itself (no lookup, nothing stored); ipapi is the keyless IP fallback. |
| news | [NewsAPI](https://newsapi.org) | **`NEWS_API_KEY`** | See below — the only card with no keyless equivalent. |
| stock | Yahoo Finance chart endpoint (`query1.finance.yahoo.com/v8/finance/chart`) | none (today) | See `STOCKS_API_KEY` below. |

### `NEWS_API_KEY` — from NewsAPI

**Provider:** NewsAPI (newsapi.org). **Where to get it:** register at [newsapi.org/register](https://newsapi.org/register), then copy the key from your account dashboard. **How to set it:**

```bash
npx wrangler secret put NEWS_API_KEY
# paste the key when prompted
```

**Why NewsAPI** — this is the one card type that cannot be keyless: there is no anonymous public news API with comparable headline coverage and keyword search, so *some* token is unavoidable. NewsAPI is the pick because the Worker is not the only consumer: `newsapi` is already a first-class integration in the RemiAI host (Settings → NewsAPI, `news_search` / `news_top_headlines`). The News card prefers the host-side key and falls back to the Worker, so one provider and one key cover both the agent tool and the card. Its auth is a server-side `X-Api-Key` header, which is exactly why it is proxied here instead of called from the browser.

Without the key, `/news` returns a well-formed empty card plus a `hint` field (not an error), so the card shell still renders.

> **Free-tier caveat:** NewsAPI's free *Developer* plan is licensed for development/testing, applies a delay to articles, and caps requests per day. For a publicly deployed Worker you need a paid plan — or accept the empty-card fallback.

### `STOCKS_API_KEY` — reserved, not currently read

**Provider (if enabled):** [Alpha Vantage](https://www.alphavantage.co/support/#api-key), free key, stored with `npx wrangler secret put STOCKS_API_KEY`.

**Why the Stock card needs no key today:** it calls Yahoo's public chart JSON endpoint, which needs no signup and is the only free source that returns a *daily close series* — that series is what draws the sparkline, whereas most free quote APIs return a single price.

**Why the variable exists anyway:** that Yahoo endpoint is undocumented and unsupported (no SLA; it can be rate-limited or changed without notice), unlike every other upstream here, which is a documented public API. So `STOCKS_API_KEY` is the pre-wired migration path: Alpha Vantage is the suggested replacement because it has a documented contract, a free key, and a simple REST daily series. Note its free tier is very small (tens of requests per day), so a swap must also raise `CACHE_TTL_STOCK` well above the 60-second default — otherwise the shared budget runs dry on trivial traffic.

### How keys are stored

- Secrets go in Cloudflare via `wrangler secret put <NAME>`, or for local dev copy `.env.example` to `.dev.vars` (gitignored — never commit it). Never put keys in `wrangler.toml`.
- Responses only ever contain normalized card data plus a `source` field (`"newsapi"`, `"yahoo"`, …) — the key itself never reaches the browser.
- If your Worker is reachable from origins you don't control, set `ALLOWED_ORIGINS` so only your app can consume the proxied results. CORS doesn't protect the key (it stays server-side), it limits who can spend your free-tier quota.
