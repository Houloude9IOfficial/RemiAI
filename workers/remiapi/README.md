# RemiAPI — Cloudflare Worker caching proxy

Zero-cost card proxy for the RemiAI visual cards: **weather, timezone, currency, map, crypto**.

- **No secrets committed.** Weather, time, currency, map, crypto, and the current stock provider work without a key. `NEWS_API_KEY` is optional for live news.
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

## Optional API keys

- `NEWS_API_KEY`: create a free developer account at [NewsAPI](https://newsapi.org/register), copy its API key, then run `npx wrangler secret put NEWS_API_KEY` and paste it when prompted. This enables the News card.
- `STOCKS_API_KEY`: the included Stock card currently uses Yahoo's public chart endpoint and does **not** read this variable. If you switch it to a keyed provider, [Alpha Vantage](https://www.alphavantage.co/support/#api-key) offers a free key; store it with `npx wrangler secret put STOCKS_API_KEY`. Keeping this as a Worker secret means it never reaches the browser or repository.

For local development, copy `.env.example` to `.dev.vars` and put values there; do not commit `.dev.vars`.
