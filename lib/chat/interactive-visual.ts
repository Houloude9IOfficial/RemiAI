import { z } from "zod";

const label = z.string().trim().min(1).max(120);
const text = z.string().max(1200);
const id = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const numeric = z.number().min(-1e15).max(1e15);
const operand = z.union([numeric, id]);
const scalar = z.union([z.string().max(200), numeric, z.boolean()]);
const icon = z.enum(["activity", "trend", "clock", "chart", "map", "controls", "media", "table", "dashboard", "message", "brain", "cursor"]);
const format = z.object({ digits: z.number().int().min(0).max(8).optional(), unit: z.string().max(16).optional() });
const option = z.object({ label, value: z.union([label, numeric]) });
const controlBase = { id, label };
const numberFields = { format: format.optional(), min: numeric, max: numeric, step: z.number().min(1e-8).max(1e15), initial: numeric };
const choiceFields = { options: z.array(option).min(2).max(12), initial: option.shape.value };
const control = z.discriminatedUnion("type", [
  z.object({ ...controlBase, ...numberFields, type: z.literal("slider") }),
  z.object({ ...controlBase, ...numberFields, type: z.literal("number") }),
  z.object({ ...controlBase, ...choiceFields, type: z.literal("segments") }),
  z.object({ ...controlBase, ...choiceFields, type: z.literal("select") }),
  z.object({ ...controlBase, type: z.literal("checkbox"), initial: z.boolean() }),
  z.object({ ...controlBase, type: z.literal("text"), initial: z.string().max(200) }),
]);
const calculation = z.object({
  id,
  op: z.enum(["add", "subtract", "multiply", "divide", "round"]),
  a: operand,
  b: operand,
  format: format.optional(),
});
const condition = z.object({
  source: id,
  op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte"]),
  value: scalar,
});
const item = z.object({ title: label, description: text.optional(), icon: icon.optional() });
const blockBase = { title: label.optional(), when: condition.optional() };

export function isInteractiveMediaUrl(value: string, conversationId?: number): boolean {
  if (/[\\\s\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    const url = new URL(value, "https://remi.invalid");
    if (value.startsWith("/")) {
      if (url.origin !== "https://remi.invalid" || url.pathname !== value) return false;
      const chatFile = url.pathname.match(/^\/api\/chat\/(?:uploads\/(\d+)|(\d+)\/session-files)\/(.+)$/);
      const media = url.pathname.match(/^\/api\/media\/\d+\/(.+)$/);
      const path = chatFile?.[3] ?? media?.[1];
      return Boolean(path &&
        (conversationId === undefined || !chatFile || Number(chatFile[1] ?? chatFile[2]) === conversationId) &&
        path.split("/").every((part) => {
          const decoded = decodeURIComponent(part);
          return decoded && decoded !== "." && decoded !== ".." && !/[\/\\\u0000-\u001f\u007f]/u.test(decoded);
        }));
    }
    return /^https:\/\//i.test(value) && url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

const block = z.discriminatedUnion("type", [
  z.object({ ...blockBase, type: z.literal("controls"), ids: z.array(id).min(1).max(12) }),
  z.object({
    ...blockBase, type: z.literal("metrics"),
    items: z.array(z.object({ ...item.shape, value: operand, format: format.optional() })).min(1).max(6),
  }),
  z.object({ ...blockBase, type: z.literal("cards"), items: z.array(item).min(1).max(12) }),
  z.object({ ...blockBase, type: z.literal("steps"), items: z.array(item).min(1).max(12) }),
  z.object({
    ...blockBase, type: z.literal("text"),
    lines: z.array(text).min(1).max(14),
    copyLabel: label.optional(),
  }),
  z.object({ ...blockBase, type: z.literal("copy"), label, lines: z.array(text).min(1).max(20) }),
  z.object({
    ...blockBase, type: z.literal("chart"), chart: z.enum(["bar", "line", "scatter", "pie"]),
    series: label.optional(), caption: text.optional(), colorful: z.boolean().optional(),
    points: z.array(z.object({ label, x: operand.optional(), y: operand })).min(1).max(60).optional(),
    projection: z.object({
      total: operand,
      count: operand,
      labels: z.array(label).min(1).max(60).optional(),
      weights: z.array(z.number().positive().max(1e6)).min(1).max(60).optional(),
    }).optional(),
  }),
  z.object({
    ...blockBase, type: z.literal("table"),
    columns: z.array(label).min(1).max(8),
    rows: z.array(z.array(text).max(8)).max(80),
    filter: z.object({ source: id, column: z.number().int().min(0).max(7), mode: z.enum(["contains", "equals"]), allValue: scalar.optional() }).optional(),
  }),
  z.object({
    ...blockBase, type: z.literal("map"),
    places: z.array(z.object({ label, latitude: z.number().min(-85).max(85), longitude: z.number().min(-180).max(180) })).min(1).max(12),
  }),
  z.object({
    ...blockBase, type: z.literal("media"),
    items: z.array(z.object({
      kind: z.enum(["image", "video"]), label, url: z.string().max(2048).refine((url) => isInteractiveMediaUrl(url), "Use an HTTPS or RemiAI media URL"),
    })).min(1).max(8),
  }),
]);

export const interactiveVisualSchema = z.object({
  version: z.literal(1),
  description: text.optional(),
  icon: icon.optional(),
  badge: label.optional(),
  controls: z.array(control).max(12).optional(),
  calculations: z.array(calculation).max(32).optional(),
  blocks: z.array(block).min(1).max(24),
});

export type InteractiveVisualSpec = z.infer<typeof interactiveVisualSchema>;
export type VisualControl = z.infer<typeof control>;
export type VisualBlock = z.infer<typeof block>;
export type VisualCondition = z.infer<typeof condition>;
export type VisualOperand = z.infer<typeof operand>;
export type VisualScalar = z.infer<typeof scalar>;
export type VisualFormat = z.infer<typeof format>;
export type VisualIcon = z.infer<typeof icon>;
export type VisualValues = ReadonlyMap<string, VisualScalar | null>;

const tokens = /\{([a-z][a-z0-9_]{0,39})\}/g;

export function parseInteractiveVisual(input: unknown): { spec: InteractiveVisualSpec } | { error: string } {
  const result = interactiveVisualSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { error: `${issue.path.join(".") || "spec"}: ${issue.message}` };
  }
  const spec = result.data;
  if (JSON.stringify(spec).length > 24_000) return { error: "Keep the interactive visual under 24,000 characters." };

  const types = new Map<string, ReadonlySet<string>>();
  const controlIds = new Set<string>();
  const validReference = (value: VisualOperand, type?: string) => typeof value === "number" ||
    (types.has(value) && (!type || (types.get(value)?.size === 1 && types.get(value)?.has(type))));
  const validText = (value?: string) => !value || Array.from(value.matchAll(tokens)).every((match) => types.has(match[1]));

  for (const field of spec.controls ?? []) {
    if (types.has(field.id)) return { error: `Duplicate ID: ${field.id}` };
    if (field.type === "slider" || field.type === "number") {
      const steps = (field.initial - field.min) / field.step;
      if (field.min >= field.max || field.initial < field.min || field.initial > field.max ||
        field.step > field.max - field.min || Math.abs(steps - Math.round(steps)) > 1e-7 ||
        field.min + field.step === field.min || field.max - field.step === field.max) {
        return { error: `Invalid numeric bounds or default for ${field.id}` };
      }
    }
    if ("options" in field) {
      const options = new Set(field.options.map(({ value }) => value));
      if (options.size !== field.options.length || !options.has(field.initial)) {
        return { error: `Options for ${field.id} must be distinct and include its default` };
      }
    }
    controlIds.add(field.id);
    types.set(field.id, new Set("options" in field ? field.options.map(({ value }) => typeof value) : [typeof field.initial]));
  }
  for (const rule of spec.calculations ?? []) {
    if (types.has(rule.id) || !validReference(rule.a, "number") || !validReference(rule.b, "number")) {
      return { error: `Calculation ${rule.id} needs a unique ID and two numeric literals or earlier numeric references` };
    }
    types.set(rule.id, new Set(["number"]));
  }

  const displayedControls = new Set<string>();
  if (!validText(spec.description)) return { error: "Unknown binding in the visual description" };
  for (const section of spec.blocks) {
    if (!validText(section.title)) return { error: "Unknown binding in a section title" };
    const when = section.when;
    if (when && (!types.get(when.source)?.has(typeof when.value) ||
      (!["eq", "neq"].includes(when.op) && (typeof when.value !== "number" || !validReference(when.source, "number"))))) {
      return { error: `Invalid visibility condition for ${section.type}` };
    }
    switch (section.type) {
      case "controls":
        for (const fieldId of section.ids) {
          if (!controlIds.has(fieldId) || displayedControls.has(fieldId) || when?.source === fieldId) {
            return { error: `Invalid or duplicate displayed control: ${fieldId}` };
          }
          displayedControls.add(fieldId);
        }
        break;
      case "metrics":
        if (section.items.some((entry) => !validReference(entry.value, "number"))) return { error: "Metrics require numeric values" };
        // Metrics, cards, and steps share label and description bindings.
        // falls through
      case "cards":
      case "steps":
        if (section.items.some((entry) => !validText(entry.title) || !validText(entry.description))) return { error: "Unknown binding in an item" };
        break;
      case "text":
      case "copy":
        if (section.lines.some((line) => !validText(line))) return { error: "Unknown binding in a text line" };
        break;
      case "chart":
        if (Boolean(section.points) === Boolean(section.projection) || !validText(section.caption) ||
          section.points?.some((point) => !validReference(point.y, "number") || !validText(point.label) ||
            (section.chart === "scatter" && point.x === undefined) ||
            (point.x !== undefined && !validReference(point.x, "number"))) ||
          (section.projection && (section.chart === "scatter" || !validReference(section.projection.total, "number") ||
            !validReference(section.projection.count, "number") || section.projection.labels?.some((entry) => !validText(entry))))) {
          return { error: "Charts require one valid points or projection source. Scatter points need x and y values." };
        }
        break;
      case "table":
        if (section.rows.some((row) => row.length !== section.columns.length || row.some((cell) => !validText(cell)))) {
          return { error: "Each table row must match its columns and use valid bindings" };
        }
        if (section.filter && (!controlIds.has(section.filter.source) || section.filter.column >= section.columns.length ||
          (section.filter.allValue !== undefined && !types.get(section.filter.source)?.has(typeof section.filter.allValue)))) {
          return { error: "Table filters need a valid control, column, and optional all value" };
        }
        break;
    }
  }
  if (displayedControls.size !== controlIds.size) return { error: "Include each control ID in a controls block" };
  return { spec };
}

export function initialVisualValues(spec: InteractiveVisualSpec): VisualValues {
  return new Map((spec.controls ?? []).map((field) => [field.id, field.initial]));
}

export function visualNumber(operand: VisualOperand, values: VisualValues): number | null {
  const value = typeof operand === "number" ? operand : values.get(operand);
  return typeof value === "number" ? value : null;
}

export function calculateVisualValues(spec: InteractiveVisualSpec, inputs: VisualValues): VisualValues {
  const values = new Map(inputs);
  for (const { id, op, a, b } of spec.calculations ?? []) {
    const left = visualNumber(a, values);
    const right = visualNumber(b, values);
    let value = NaN;
    if (left !== null && right !== null) {
      switch (op) {
        case "add": value = left + right; break;
        case "subtract": value = left - right; break;
        case "multiply": value = left * right; break;
        case "divide": value = left / right; break;
        case "round": {
          if (Number.isInteger(right) && right >= 0 && right <= 8) value = Number(left.toFixed(right));
          break;
        }
      }
    }
    values.set(id, Number.isFinite(value) && Math.abs(value) <= 1e15 ? value : null);
  }
  return values;
}

export function formatVisualValue(value: VisualScalar | null | undefined, format?: VisualFormat): string {
  if (value == null) return "Unavailable";
  if (typeof value !== "number") return String(value);
  return value.toLocaleString(undefined, { maximumFractionDigits: format?.digits ?? 3 }) + (format?.unit ?? "");
}

export function resolveVisualText(template: string, values: VisualValues, formats: ReadonlyMap<string, VisualFormat>): string {
  return template.replace(tokens, (_, key: string) => formatVisualValue(values.get(key), formats.get(key)));
}

export function visualConditionMatches({ source, op, value }: VisualCondition, values: VisualValues): boolean {
  const actual = values.get(source);
  if (actual == null) return false;
  if (op === "eq") return actual === value;
  if (op === "neq") return actual !== value;
  if (typeof actual !== "number" || typeof value !== "number") return false;
  if (op === "gt") return actual > value;
  if (op === "gte") return actual >= value;
  if (op === "lt") return actual < value;
  return actual <= value;
}

type Chart = Extract<VisualBlock, { type: "chart" }>;
export type VisualPoint = { label: string; x: number; y: number };

export function resolveVisualPoints(block: Chart, values: VisualValues, renderText: (text: string) => string): VisualPoint[] | null {
  if (block.points) {
    const points: VisualPoint[] = [];
    for (const [index, point] of block.points.entries()) {
      const x = visualNumber(point.x ?? index, values);
      const y = visualNumber(point.y, values);
      if (x === null || y === null || (block.chart === "pie" && y < 0)) return null;
      points.push({ x, y, label: renderText(point.label) });
    }
    return points;
  }
  const projection = block.projection;
  if (!projection) return null;
  const total = visualNumber(projection.total, values);
  const count = visualNumber(projection.count, values);
  if (total === null || total < 0 || count === null || !Number.isInteger(count) || count < 1 || count > 60) return null;

  const weights = Array.from({ length: count }, (_, index) => {
    return projection.weights?.[index % projection.weights.length] ?? 1;
  });
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  let cumulativeWeight = 0;
  let allocated = 0;
  return weights.map((weight, x) => {
    cumulativeWeight += weight;
    let runningTotal = x === count - 1 ? total : total * (cumulativeWeight / weightTotal);
    if (Number.isInteger(total)) runningTotal = Math.round(runningTotal);
    const y = runningTotal - allocated;
    allocated = runningTotal;
    return { x, y, label: renderText(projection.labels?.[x] ?? `Day ${x + 1}`) };
  });
}
