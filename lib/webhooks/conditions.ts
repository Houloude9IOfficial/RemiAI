import type { WebhookCondition } from "@/db/schema";

/**
 * Resolve a dotted path (with numeric array indexes) against an unknown
 * value, e.g. "entry.0.messaging.0.message.text" against an Instagram-style
 * webhook payload. Returns `undefined` when any segment is missing.
 */
export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  const segments = path.split(".");
  let current: unknown = obj;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) return undefined;
      current = current[Number(segment)];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function evaluateOne(payload: unknown, cond: WebhookCondition): boolean {
  const actual = getByPath(payload, cond.field);
  const expected = cond.value ?? "";
  switch (cond.op) {
    case "eq":
      return actual !== undefined && actual !== null && String(actual) === expected;
    case "neq":
      return actual === undefined || actual === null || String(actual) !== expected;
    case "contains":
      return typeof actual === "string" && actual.includes(expected);
    case "startsWith":
      return typeof actual === "string" && actual.startsWith(expected);
    case "endsWith":
      return typeof actual === "string" && actual.endsWith(expected);
    case "exists":
      return actual !== undefined && actual !== null;
    case "matches":
      if (typeof actual !== "string") return false;
      try {
        return new RegExp(expected).test(actual);
      } catch {
        return false; // invalid regex — treat as no match
      }
    default:
      return false;
  }
}

/**
 * Evaluate a webhook's structured filter conditions against a payload.
 * An empty/null list always passes; otherwise ALL conditions must pass (AND).
 */
export function evaluateConditions(
  payload: unknown,
  conditions: WebhookCondition[] | null | undefined,
): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((cond) => evaluateOne(payload, cond));
}
