import { getByPath } from "./conditions";

/**
 * Substitute {{path.to.value}} placeholders in a template string using a
 * context object (payload, headers, query, eventId, webhookName).
 * Missing values become an empty string.
 */
export function substituteTemplate(
  template: string,
  context: Record<string, unknown>,
): string {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_\-.[\]]+)\s*\}\}/g,
    (match, path: string) => {
      const value = getByPath(context, path);
      if (value === undefined || value === null) return "";
      if (typeof value === "string") return value;
      if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    },
  );
}
