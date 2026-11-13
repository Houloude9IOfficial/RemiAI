"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import {
  Activity, ArrowDown, ArrowUpRight, BrainCircuit, ChartNoAxesColumn, Check,
  Clock, Copy, Images, LayoutDashboard, MapPin, MessageCircle, MousePointerClick,
  SlidersHorizontal, Table2, type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  calculateVisualValues, formatVisualValue, initialVisualValues, isInteractiveMediaUrl,
  parseInteractiveVisual, resolveVisualPoints, resolveVisualText, visualConditionMatches,
  visualNumber, type InteractiveVisualSpec, type VisualBlock, type VisualControl,
  type VisualIcon, type VisualScalar, type VisualValues,
} from "@/lib/chat/interactive-visual";
import { InteractiveVisualChart } from "./InteractiveVisualChart";
import { MediaDisplay } from "./MediaDisplay";
import { MapTile } from "./RemiCard";

const icons: Record<VisualIcon, LucideIcon> = {
  activity: Activity, trend: ArrowUpRight, clock: Clock, chart: ChartNoAxesColumn, map: MapPin,
  controls: SlidersHorizontal, media: Images, table: Table2, dashboard: LayoutDashboard,
  message: MessageCircle, brain: BrainCircuit, cursor: MousePointerClick,
};
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const controlTransition = "motion-reduce:transition-none motion-safe:transition-colors motion-safe:duration-150";
const buttonMotion = "motion-reduce:transition-none motion-safe:transition-[background-color,color,opacity,scale] motion-safe:duration-150 motion-safe:active:scale-[0.97]";
const input = `min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:border-muted-foreground/60 focus:border-ring ${controlTransition} ${focus}`;
const heading = "break-words text-sm font-semibold text-foreground";
const muted = "break-words text-sm text-muted-foreground";
const grid = "grid grid-cols-1 gap-2 sm:grid-cols-2";

function WidgetIcon({ name, className }: { name: VisualIcon; className?: string }) {
  const Icon = icons[name];
  return <Icon aria-hidden="true" className={cn("size-4 shrink-0", className)} />;
}

function CopyAction({ label, lines, primary }: { label: string; lines: string[]; primary?: boolean }) {
  const content = lines.join("\n");
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }
  return (
    <button type="button" onClick={copy} onBlur={() => setCopied(false)} className={cn(
      "inline-flex min-h-9 max-w-full items-center justify-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium",
      focus, buttonMotion,
      primary ? "w-full bg-foreground text-background hover:opacity-85" : "border border-border hover:bg-muted",
    )}>
      <span aria-hidden="true" className="relative size-3.5 shrink-0">
        <Copy className={cn("absolute inset-0 size-full motion-safe:transition-opacity", copied && "opacity-0")} />
        <Check className={cn("absolute inset-0 size-full motion-safe:transition-opacity", !copied && "opacity-0")} />
      </span>
      <span className="break-words">{label}</span>
    </button>
  );
}

function NumberControl({ field, id, value, onChange }: {
  field: Extract<VisualControl, { type: "slider" | "number" }>;
  id: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const attrs = { min: field.min, max: field.max, step: field.step };
  const formatted = formatVisualValue(value, field.format);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label className={heading} htmlFor={id}>{field.label}</label>
        {field.type === "slider" && <output htmlFor={id} className="shrink-0 text-sm font-semibold tabular-nums">{formatted}</output>}
      </div>
      {field.type === "slider" ? (
        <>
          <input id={id} type="range" {...attrs} value={value} aria-valuetext={formatted}
            className={`interactive-visual-slider block h-6 w-full cursor-pointer appearance-none rounded-full bg-muted hover:bg-muted-foreground/15 ${controlTransition} ${focus}`}
            onChange={(event) => onChange(event.currentTarget.valueAsNumber)} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatVisualValue(field.min, field.format)}</span>
            <span>{formatVisualValue(field.max, field.format)}</span>
          </div>
        </>
      ) : (
        <input id={id} type="number" {...attrs} className={`${input} w-full`} value={draft ?? value}
          onBlur={() => setDraft(null)}
          onChange={(event) => {
            const target = event.currentTarget;
            setDraft(target.value);
            if (Number.isFinite(target.valueAsNumber) && target.validity.valid) onChange(target.valueAsNumber);
          }} />
      )}
    </div>
  );
}

function Control({ field, value, onChange }: {
  field: VisualControl;
  value: VisualScalar;
  onChange: (value: VisualScalar) => void;
}) {
  const id = useId();
  switch (field.type) {
    case "slider":
    case "number":
      return <NumberControl field={field} id={id} value={Number(value)} onChange={onChange} />;
    case "segments":
      return (
        <div role="group" aria-labelledby={id} className="flex flex-wrap items-center justify-between gap-2">
          <span id={id} className={heading}>{field.label}</span>
          <div className="flex flex-wrap gap-1">
            {field.options.map((option, index) => (
              <button key={index} type="button" aria-pressed={option.value === value}
                className={cn("min-h-9 max-w-full break-words rounded-full px-3 py-1.5 text-sm hover:bg-muted", focus, buttonMotion,
                  option.value === value ? "bg-muted font-semibold" : "text-muted-foreground")}
                onClick={() => onChange(option.value)}>{option.label}</button>
            ))}
          </div>
        </div>
      );
    case "checkbox":
      return (
        <label className="flex min-h-8 w-fit cursor-pointer items-center gap-2.5 text-sm">
          <span className="relative size-5 shrink-0">
            <input type="checkbox" checked={value === true}
              className={`peer size-full cursor-pointer appearance-none rounded-full border border-muted-foreground/65 bg-background checked:border-foreground checked:bg-foreground forced-colors:appearance-auto ${controlTransition} ${focus}`}
              onChange={(event) => onChange(event.currentTarget.checked)} />
            <Check aria-hidden="true" className="pointer-events-none absolute inset-0 m-auto size-3.5 text-background opacity-0 peer-checked:opacity-100 motion-safe:scale-75 motion-safe:transition-[opacity,scale] motion-safe:duration-150 motion-safe:peer-checked:scale-100 forced-colors:hidden" />
          </span>
          {field.label}
        </label>
      );
    case "select":
      return (
        <label className="grid gap-2 text-sm font-semibold">
          {field.label}
          <select className={input} value={field.options.findIndex((option) => option.value === value)}
            onChange={(event) => onChange(field.options[Number(event.currentTarget.value)].value)}>
            {field.options.map((option, index) => <option key={index} value={index}>{option.label}</option>)}
          </select>
        </label>
      );
    case "text":
      return (
        <label className="grid gap-2 text-sm font-semibold">
          {field.label}
          <input type="text" className={input} maxLength={200} value={String(value)}
            onChange={(event) => onChange(event.currentTarget.value)} />
        </label>
      );
  }
}

function PlaceMap({ places }: { places: Extract<VisualBlock, { type: "map" }>["places"] }) {
  const [selected, setSelected] = useState(0);
  const place = places[selected] ?? places[0];
  return (
    <div className="space-y-2">
      {places.length > 1 && (
        <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
          Place
          <select className={input} value={selected} onChange={(event) => setSelected(Number(event.currentTarget.value))}>
            {places.map((entry, index) => <option key={index} value={index}>{entry.label}</option>)}
          </select>
        </label>
      )}
      <div className="overflow-hidden rounded-xl border border-border/70">
        <MapTile latitude={place.latitude} longitude={place.longitude} title={`Map of ${place.label}`} />
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground">
          <span>{place.label}</span>
          <a className={`rounded-sm text-foreground underline underline-offset-2 ${focus}`} target="_blank" rel="noreferrer"
            href={`https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=14/${place.latitude}/${place.longitude}`}>Open in OpenStreetMap</a>
        </div>
      </div>
    </div>
  );
}

type BlockContext = {
  values: VisualValues;
  controls: Map<string, VisualControl>;
  renderText: (text: string) => string;
  setValue: (id: string, value: VisualScalar) => void;
  conversationId?: number;
};

function BlockContent({ block, context }: { block: VisualBlock; context: BlockContext }): ReactNode {
  const { values, controls, renderText, setValue, conversationId } = context;
  switch (block.type) {
    case "controls":
      return <div className="space-y-4">{block.ids.map((id) => {
        const field = controls.get(id);
        return field && <Control key={id} field={field} value={values.get(id) ?? field.initial} onChange={(value) => setValue(id, value)} />;
      })}</div>;
    case "metrics":
      return (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-5 px-1 py-1 sm:gap-x-5 sm:px-3">
          {block.items.map((item, index) => (
            <div key={index} className="min-w-0">
              <dt className="flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
                {item.icon && <WidgetIcon name={item.icon} className="mt-0.5" />}
                <span className="break-words">{renderText(item.title)}</span>
              </dt>
              <dd className="mt-1.5 break-words text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{formatVisualValue(visualNumber(item.value, values), item.format)}</dd>
              {item.description && <dd className={`mt-0.5 ${muted}`}>{renderText(item.description)}</dd>}
            </div>
          ))}
        </dl>
      );
    case "cards":
    case "steps": {
      const steps = block.type === "steps";
      const List = steps ? "ol" : "ul";
      return (
        <List className={steps ? "space-y-2" : grid}>
          {block.items.map((item, index) => (
            <li key={index} className={steps ? "grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2.5" : "min-w-0 rounded-xl border border-border/70 p-3"}>
              {steps && <div className="flex flex-col items-center gap-2 pt-0.5 text-muted-foreground">
                {item.icon ? <WidgetIcon name={item.icon} /> : <span className="text-xs">{index + 1}</span>}
                {index < block.items.length - 1 && <ArrowDown className="mt-auto size-3" aria-hidden />}
              </div>}
              <div className={steps ? "pb-2" : undefined}>
                {!steps && item.icon && <WidgetIcon name={item.icon} className="mb-2 text-muted-foreground" />}
                <p className={heading}>{renderText(item.title)}</p>
                {item.description && <p className={`mt-1 ${muted}`}>{renderText(item.description)}</p>}
              </div>
            </li>
          ))}
        </List>
      );
    }
    case "text": {
      const lines = block.lines.map(renderText);
      return (
        <div className={cn("space-y-2 text-sm", block.copyLabel ? "rounded-xl border border-border/70 p-3" : "px-1 sm:px-3")}>
          {lines.map((line, index) => <p key={index} className="whitespace-pre-wrap [overflow-wrap:anywhere]">{line}</p>)}
          {block.copyLabel && <CopyAction label={block.copyLabel} lines={lines} />}
        </div>
      );
    }
    case "copy":
      return <CopyAction primary label={block.label} lines={block.lines.map(renderText)} />;
    case "chart":
      return (
        <>
          <InteractiveVisualChart points={resolveVisualPoints(block, values, renderText)} kind={block.chart}
            title={block.title && renderText(block.title)} series={block.series} colorful={block.colorful} />
          {block.caption && <p className={`mt-2 ${muted}`}>{renderText(block.caption)}</p>}
        </>
      );
    case "table": {
      const rows = block.rows.map((row) => row.map(renderText));
      const filter = block.filter;
      const query = filter && values.get(filter.source);
      const normalized = String(query ?? "").trim().toLocaleLowerCase();
      const visible = filter && normalized && query !== filter.allValue
        ? rows.filter((row) => {
          const cell = row[filter.column].toLocaleLowerCase();
          return filter.mode === "equals" ? cell === normalized : cell.includes(normalized);
        }) : rows;
      return (
        <div className={`overflow-x-auto rounded-xl border border-border/70 ${focus}`} tabIndex={0}
          role="region" aria-label={block.title ? renderText(block.title) : "Comparison table"}>
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60">
              <tr>{block.columns.map((column, index) => <th scope="col" key={index} className="px-3 py-2">{column}</th>)}</tr>
            </thead>
            <tbody>{visible.length ? visible.map((row, index) => (
              <tr key={index} className="border-t border-border/70">
                {row.map((cell, column) => <td key={column} className="px-3 py-2 [overflow-wrap:anywhere]">{cell}</td>)}
              </tr>
            )) : <tr><td colSpan={block.columns.length} className="px-3 py-3 text-muted-foreground">No matching rows.</td></tr>}</tbody>
          </table>
        </div>
      );
    }
    case "map":
      return <PlaceMap places={block.places} />;
    case "media":
      return (
        <div className={block.items.length > 1 ? grid : undefined}>
          {block.items.map((item, index) => (
            <figure key={index} className="min-w-0 overflow-hidden rounded-xl border border-border/70">
              {isInteractiveMediaUrl(item.url, conversationId) ? (
                <MediaDisplay data={{ type: item.kind, url: item.url, filename: item.label }} />
              ) : <p className="p-3 text-sm text-muted-foreground">Media unavailable.</p>}
              {item.kind === "image" && <figcaption className={`px-3 py-2 ${muted}`}>{item.label}</figcaption>}
            </figure>
          ))}
        </div>
      );
  }
}

function FadingBlock({ children, className }: { children: ReactNode; className?: string }) {
  const present = useIsPresent();
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }} className={className} inert={!present} aria-hidden={!present}>
      {children}
    </motion.div>
  );
}

function Widget({ spec, title, conversationId }: { spec: InteractiveVisualSpec; title: string; conversationId?: number }) {
  const [inputs, setInputs] = useState(() => initialVisualValues(spec));
  const values = calculateVisualValues(spec, inputs);
  const formats = new Map((spec.calculations ?? []).flatMap(({ id, format }) => format ? [[id, format]] : []));
  const titleId = useId();
  const reducedMotion = useReducedMotion();
  const renderText = (line: string) => resolveVisualText(line, values, formats);
  const context: BlockContext = {
    values,
    controls: new Map((spec.controls ?? []).map((field) => [field.id, field])),
    renderText,
    setValue: (id, value) => setInputs((previous) => new Map(previous).set(id, value)),
    conversationId,
  };
  return (
    <section aria-labelledby={titleId} className="w-full min-w-0 rounded-[1.25rem] border border-border/80 bg-card p-3 text-card-foreground sm:p-4">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-border/60 pb-4 sm:gap-3">
        {spec.icon && <WidgetIcon name={spec.icon} className="size-[1.125rem]" />}
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="break-words text-base font-semibold tracking-tight sm:text-lg">{title}</h3>
          {spec.description && <p className={`mt-0.5 ${muted}`}>{renderText(spec.description)}</p>}
        </div>
        {spec.badge && <span className="max-w-full break-words rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:text-emerald-300">{spec.badge}</span>}
      </header>
      <div className="space-y-5 pt-4">
        {spec.blocks.map((block, index) => {
          const visible = !block.when || visualConditionMatches(block.when, values);
          const fading = block.when && context.controls.get(block.when.source)?.type === "checkbox" && !reducedMotion;
          if (!visible && !fading) return null;
          const divided = block.type === "controls" && block.ids.some((id) => context.controls.get(id)?.type === "checkbox");
          const className = divided ? "border-t border-border/60 pt-3" : undefined;
          const content = (
            <>
              {block.title && <h4 className={`mb-2 ${heading}`}>{renderText(block.title)}</h4>}
              <BlockContent block={block} context={context} />
            </>
          );
          // Checkbox reveals can fade in place. Chart and filter swaps stay immediate.
          if (fading) {
            return <AnimatePresence key={index} initial={false}>{visible && <FadingBlock className={className}>{content}</FadingBlock>}</AnimatePresence>;
          }
          return <div key={index} className={className}>{content}</div>;
        })}
      </div>
    </section>
  );
}

export function InteractiveVisual({ spec, title, conversationId }: { spec: unknown; title: string; conversationId?: number }) {
  const parsed = useMemo(() => parseInteractiveVisual(spec), [spec]);
  if ("error" in parsed) return <p className="rounded-xl border border-border p-3 text-sm text-muted-foreground">This interactive visual could not be displayed.</p>;
  return <Widget spec={parsed.spec} title={title} conversationId={conversationId} />;
}
