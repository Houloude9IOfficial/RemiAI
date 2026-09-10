"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Clock, CloudSun, DollarSign, MapPin, Bitcoin, Newspaper, TrendingUp, ExternalLink, Droplets, Wind, ArrowUpRight, AlertCircle } from "lucide-react";

type CardKind = "weather" | "timezone" | "currency" | "map" | "crypto" | "news" | "stock";

function IconFor({ card }: { card: CardKind }) {
  const cls = "h-4 w-4";
  switch (card) {
    case "weather": return <CloudSun className={cls} />;
    case "timezone": return <Clock className={cls} />;
    case "currency": return <DollarSign className={cls} />;
    case "map": return <MapPin className={cls} />;
    case "crypto": return <Bitcoin className={cls} />;
    case "news": return <Newspaper className={cls} />;
    case "stock": return <TrendingUp className={cls} />;
    default: return <ExternalLink className={cls} />;
  }
}

function fmt(n: unknown, digits = 2): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(digits) : String(n ?? "—");
}

export function RemiCard({ data }: { data: unknown }) {
  if (!data || typeof data !== "object") return null;
  const r = data as Record<string, unknown>;
  // Envelope may be {type:"remi_card", card, data, description} or direct
  const card = (r.card as CardKind | undefined) ?? (r.type === "remi_card" ? (r.card as CardKind) : undefined);
  const description = (r.description as string | null) ?? null;
  const inner = (r.data as Record<string, unknown> | undefined) ?? (r.data == null ? r : undefined);
  if (!card) return null;

  const innerCard = inner && typeof inner === "object" && "card" in inner ? (inner as Record<string, unknown>) : inner ?? r;
  const displayMode = (r.displayMode as string) ?? "";

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-xl overflow-hidden rounded-xl border-none bg-card shadow-sm",
        // displayMode === "card-only" && "ring-1 ring-primary/20"
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/40 px-3.5 py-2.5">
        <span className="flex h-6 w-6 items-center justify-center text-muted-foreground">
          <IconFor card={card} />
        </span>
        <span className="text-xs font-medium capitalize">{card}</span>
      </div>

      <div className="p-3.5 text-center align-middle">
        {typeof (innerCard as any)?.error === "string" ? <CardError message={(innerCard as any).error} /> : <>
        {card === "weather" && <WeatherBody d={innerCard as any} />}
        {card === "timezone" && <TimezoneBody d={innerCard as any} />}
        {card === "currency" && <CurrencyBody d={innerCard as any} />}
        {card === "map" && <MapBody d={innerCard as any} />}
        {card === "crypto" && <CryptoBody d={innerCard as any} />}
        {card === "news" && <NewsBody d={innerCard as any} />}
        {card === "stock" && <StockBody d={innerCard as any} />}
        </>}
      </div>

      {description ? (
        <div className="border-t border-border/30 px-3.5 py-2 text-[11px] text-muted-foreground">{description}</div>
      ) : null}
    </div>
  );
}

function CardError({ message }: { message: string }) {
  return <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground"><AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />{message}</div>;
}

function WeatherBody({ d }: { d: any }) {
  const cur = d?.current ?? d;
  const forecast = d?.forecast;
  const days = Array.isArray(forecast?.time) ? forecast.time.slice(0, 3) : [];
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div>
          <div className="text-3xl font-semibold tracking-[-0.06em]">{fmt(cur?.temperature_c ?? cur?.temperature_2m ?? d?.temperature_c, 0)}°</div>
          <div className="mt-0.5 text-xs text-muted-foreground">Feels like {fmt(cur?.feels_like_c ?? cur?.apparent_temperature ?? d?.feels_like_c, 0)}°C</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-sm font-medium">{d?.location || "Your location"}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{cur?.time ? String(cur.time).replace("T", " · ") : "Now"}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Metric icon={Droplets} label="Humidity" value={`${fmt(cur?.humidity_pct ?? cur?.relative_humidity_2m ?? d?.humidity_pct, 0)}%`} />
        <Metric icon={Wind} label="Wind" value={`${fmt(cur?.wind_speed_kmh ?? cur?.wind_speed_10m ?? d?.wind_speed_kmh, 0)} km/h`} />
      </div>
      {days.length ? (
        <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border/40">
          {days.map((day: string, i: number) => (
            <div key={day} className="px-2 py-2 text-center not-last:border-r not-last:border-border/40">
              <div className="text-xs font-medium">{i === 0 ? "Today" : new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</div>
              <div className="mt-1.5 text-sm"><span className="font-semibold">{fmt(forecast.temperature_2m_max?.[i], 0)}°</span><span className="ml-1 text-muted-foreground">{fmt(forecast.temperature_2m_min?.[i], 0)}°</span></div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Wind; label: string; value: string }) {
  return <div className="flex items-center gap-2 rounded-lg bg-muted/45 px-2.5 py-2"><Icon className="h-3.5 w-3.5 text-muted-foreground" /><div><div className="text-[10px] text-muted-foreground">{label}</div><div className="text-xs font-medium">{value}</div></div></div>;
}

function TimezoneBody({ d }: { d: any }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);
  const time = d?.timezone
    ? new Intl.DateTimeFormat(undefined, { timeZone: d.timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(new Date())
    : d?.datetime ? new Date(d.datetime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">{d?.timezone ?? "Local time"}</div>
      <div className="font-mono text-2xl tracking-tight">{time}</div>
      <div className="text-xs text-muted-foreground">
        {d?.utc_offset ? `UTC${d.utc_offset} ·` : ""} {d?.abbreviation ? ` ${d.abbreviation}` : ""} {d?.source ? `· ${d.source}` : ""}
      </div>
    </div>
  );
}

function CurrencyBody({ d }: { d: any }) {
  return (
    <div className="rounded-xl border-none border-border/50 bg-none p-3 text-center">
      <div className="flex items-center justify-center gap-2 text-sm">
        <span className="rounded-lg bg-background px-2.5 py-1.5 font-semibold">
          {fmt(d?.amount, 2)} {d?.from}
        </span>
        <span className="text-muted-foreground">→</span>
        <span className="px-2.5 py-1.5 font-semibold text-primary">
          {fmt(d?.converted, 2)} {d?.to}
        </span>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        Rate {fmt(d?.rate, 4)} {d?.date ? `· ${d.date}` : ""} {d?.source ? `· ${d.source}` : ""}
      </div>
    </div>
  );
}

function MapBody({ d }: { d: any }) {
  const results = Array.isArray(d?.results) ? d.results : [];
  const lat = d?.latitude ?? results[0]?.latitude ?? results[0]?.lat;
  const lon = d?.longitude ?? results[0]?.longitude ?? results[0]?.lon;
  const latitude = Number(lat);
  const longitude = Number(lon);
  const label = d?.display_name ?? results[0]?.display_name;
  return (
    <div className="space-y-2.5 text-sm">
      {label ? <div className="truncate text-sm font-medium" title={String(label)}>{String(label)}</div> : null}
      {Number.isFinite(latitude) && Number.isFinite(longitude) ? (
        <div className="overflow-hidden rounded-lg border border-border/40 bg-muted/30">
          <MapTile latitude={latitude} longitude={longitude} />
          <div className="flex justify-between px-2.5 py-2 text-[11px]">
            <span className="min-w-0 truncate font-mono">
              {fmt(lat, 4)}, {fmt(lon, 4)}
              {label ? <span className="font-sans text-muted-foreground"> · {String(label)}</span> : null}
            </span>
            <a
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=14/${lat}/${lon}`}
              target="_blank"
              rel="noreferrer"
            >
              Open <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
        </div>
      ) : <CardError message="This place could not be located. Try the business name with its city or address." />}
    </div>
  );
}

function MapTile({ latitude, longitude }: { latitude: number; longitude: number }) {
  const delta = 0.006;
  return <iframe title="Interactive OpenStreetMap" className="h-56 w-full border-0 rounded-lg" loading="lazy" src={`https://www.openstreetmap.org/export/embed.html?bbox=${longitude - delta}%2C${latitude - delta}%2C${longitude + delta}%2C${latitude + delta}&layer=mapnik&marker=${latitude}%2C${longitude}`} />;
}

function CryptoBody({ d }: { d: any }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold capitalize">{d?.coin ?? d?.card ?? "—"}</span>
        <span className="text-xs uppercase text-muted-foreground">{d?.vs_currency ?? d?.vs ?? ""}</span>
        <span className="ml-auto font-mono text-lg font-semibold tracking-tight">{d?.price != null ? `$${fmt(d.price, 2)}` : "—"}</span>
      </div>
      <div className="mt-2 text-xs">
        {d?.change_24h_pct != null ? (
          <span className={Number(d.change_24h_pct) >= 0 ? "text-emerald-600" : "text-red-600"}>{fmt(d.change_24h_pct, 2)}% (24h)</span>
        ) : null}
        <span className="ml-2 text-muted-foreground">{d?.source ?? ""}</span>
      </div>
    </div>
  );
}

function NewsBody({ d }: { d: any }) {
  const articles: Array<{ title?: string; url?: string; source?: string }> =
    (Array.isArray(d?.articles) ? d.articles : Array.isArray(d?.data?.articles) ? d.data.articles : []) as any;
  if (!articles.length) {
    return <div className="text-xs text-muted-foreground">{d?.hint ?? "No headlines available."}</div>;
  }
  return (
    <ul className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/50 bg-muted/15">
      {articles.slice(0, 5).map((a, i) => (
        <li key={i} className="px-3 py-2.5 leading-snug transition-colors hover:bg-muted/50">
          <a href={a.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
            {a.title ?? "Untitled"}
          </a>
          {a.source ? <span className="ml-2 text-[11px] text-muted-foreground">· {a.source}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function StockBody({ d }: { d: any }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/15 p-3">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold">{d?.symbol ?? d?.card ?? "—"}</span>
        <span className="ml-auto font-mono text-lg font-semibold tracking-tight">{d?.price != null ? fmt(d.price, 2) : d?.regularMarketPrice != null ? fmt(d.regularMarketPrice, 2) : "—"}</span>
        <span className="text-xs text-muted-foreground">{d?.currency ?? ""}</span>
      </div>
      {Array.isArray(d?.chart) && d.chart.length > 2 ? (
        <div className="mt-3 h-16 w-full overflow-hidden rounded-lg border border-border/40 bg-background/50 px-1">
          <Sparkline values={d.chart as number[]} />
        </div>
      ) : null}
      <div className="mt-2 text-xs text-muted-foreground">
        {d?.range ? `Range ${d.range}` : ""} {d?.source ? `· ${d.source}` : ""}
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const valid = values.filter((n) => typeof n === "number" && Number.isFinite(n));
  if (valid.length < 2) return null;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const span = max - min || 1;
  const w = 600;
  const h = 64;
  const step = w / (valid.length - 1);
  const points = valid.map((v, i) => `${i * step},${h - ((v - min) / span) * (h - 8) - 4}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label="Price sparkline">
      <polyline fill="none" stroke="currentColor" strokeWidth={1.5} points={points} className="text-primary" />
    </svg>
  );
}
