import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ---------------------------------------------------------------------------
// Date normalization — handle SQLite vs ISO date formats
// ---------------------------------------------------------------------------

/**
 * Normalize a date string to a format that JavaScript's `Date` constructor
 * can reliably parse.
 *
 * SQLite's `CURRENT_TIMESTAMP` returns `YYYY-MM-DD HH:MM:SS` (no timezone,
 * space separator), which browsers interpret inconsistently (some as UTC,
 * some as local time). `new Date().toISOString()` returns
 * `YYYY-MM-DDTHH:MM:SS.sssZ` (ISO 8601 with explicit UTC).
 *
 * This function:
 * 1. Replaces ` ` with `T` (space → ISO separator)
 * 2. Appends `Z` if no timezone indicator is present (treats as UTC, which
 *    is what SQLite's `CURRENT_TIMESTAMP` actually stores)
 */
export function normalizeDate(dateStr: string): string {
  if (!dateStr) return dateStr;
  // Already has timezone indicator (Z, +HH:MM, -HH:MM)
  if (/[Zz]|[+-]\d{2}:?\d{2}$/.test(dateStr)) return dateStr;
  // Replace space with T if no T present
  const iso = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T");
  // Append Z for UTC
  return iso.endsWith("Z") ? iso : iso + "Z";
}

// ---------------------------------------------------------------------------
// Tool result truncation
// ---------------------------------------------------------------------------

/**
 * Maximum serialised JSON size for any single tool result.
 * ~50 000 chars ≈ ~12 500 tokens, leaving the model plenty of room for
 * reasoning and response generation.
 */
const MAX_RESULT_CHARS = 50_000

/**
 * Walk an unknown value and truncate any strings or arrays that would cause
 * its JSON serialisation to exceed {@link MAX_RESULT_CHARS}. Returns the
 * original value unchanged if it is already under the limit.
 *
 * - **Strings** are clipped to fit within the remaining budget.
 * - **Arrays** are limited to 200 items; excess items are replaced with a
 *   summary placeholder.
 * - **Objects** are recursed field-by-field so no single long string can
 *   overflow the budget.
 *
 * Every truncated result gets `_truncated: true` and a `_note` field with a
 * human-readable explanation so the model understands data was omitted.
 */
export function truncateToolResult(data: unknown): unknown {
  // Quick size check — if serialised JSON already fits, return as-is
  try {
    const raw = JSON.stringify(data)
    if (raw.length <= MAX_RESULT_CHARS) return data
  } catch {
    // JSON.stringify can fail on circular references — return a safe fallback
    return {
      _truncated: true,
      _note:
        "Tool result could not be serialised (circular reference or invalid value).",
    }
  }

  return truncateValue(data, MAX_RESULT_CHARS)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const TRUNCATION_NOTE =
  "Result was too large for the model context. Data has been omitted. " +
  "Use more specific queries or the offset/limit parameters to narrow results."

const MAX_ARRAY_ITEMS = 200

function truncateValue(value: unknown, budget: number): unknown {
  if (budget <= 0) return undefined // signal "skip this"

  if (typeof value === "string") {
    if (value.length <= budget) return value
    const keep = Math.max(0, budget - 120)
    return (
      value.slice(0, keep) +
      `\n\n[...truncated: ${(value.length - keep).toLocaleString()} more bytes]`
    )
  }

  if (typeof value !== "object" || value === null) {
    // Numbers, booleans — always small enough
    return value
  }

  if (Array.isArray(value)) {
    return truncateArray(value, budget)
  }

  return truncateObj(value as Record<string, unknown>, budget)
}

function truncateArray(arr: unknown[], budget: number): unknown[] {
  // Measure a "representative" item by taking the first one
  const sampleSize = arr.length > 0 ? JSON.stringify(arr[0]).length : 2
  const headerBudget = JSON.stringify({ _truncated: true, _skipped: 0 }).length
  const maxFit = Math.max(
    1,
    Math.floor((budget - headerBudget - 60) / sampleSize),
  )
  const keep = Math.min(maxFit, MAX_ARRAY_ITEMS, arr.length)

  const result: unknown[] = []
  let used = 2 // opening `[`

  for (let i = 0; i < keep; i++) {
    const item = truncateValue(arr[i], budget - used)
    if (item === undefined) break
    const tag = JSON.stringify(item)
    if (used + tag.length + 1 > budget - 60) break
    result.push(item)
    used += tag.length + 1 // +1 for comma
  }

  if (result.length < arr.length) {
    const skipped = arr.length - result.length
    result.push({
      _truncated: true,
      _skipped: skipped,
      _note: `${skipped} item${skipped === 1 ? "" : "s"} omitted`,
    })
  }

  return result
}

function truncateObj(
  obj: Record<string, unknown>,
  budget: number,
): Record<string, unknown> {
  const entries = Object.entries(obj)
  const result: Record<string, unknown> = {}
  let used = 2 // opening `{`

  for (const [key, val] of entries) {
    const keyOverhead = key.length + 4 // "key":
    const remaining = budget - used - keyOverhead
    if (remaining <= 0) {
      result._truncated = true
      result._note = TRUNCATION_NOTE
      break
    }

    const truncated = truncateValue(val, remaining)
    if (truncated === undefined) {
      result._truncated = true
      result._note = TRUNCATION_NOTE
      break
    }

    result[key] = truncated
    used += keyOverhead + JSON.stringify(truncated).length + 1 // +1 for comma or closing
  }

  if (result._truncated || used > budget) {
    result._truncated = true
    result._note = result._note ?? TRUNCATION_NOTE
  }

  return result
}
