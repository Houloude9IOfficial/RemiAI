export const MEMORY_CATEGORIES = [
  "general",
  "work",
  "personal",
  "health",
  "finance",
  "learning",
  "social",
  "projects",
  "other",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export const MEMORY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidCategory(v: string | null | undefined): v is MemoryCategory {
  return !!v && (MEMORY_CATEGORIES as readonly string[]).includes(v);
}

export function isValidMemoryDate(v: string | null | undefined): boolean {
  if (!v) return false;
  if (!MEMORY_DATE_RE.test(v)) return false;
  const d = new Date(v + "T12:00:00.000Z");
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === v;
}

export function normalizeCategory(value: unknown): MemoryCategory {
  if (typeof value === "string" && (MEMORY_CATEGORIES as readonly string[]).includes(value)) {
    return value as MemoryCategory;
  }
  return "general";
}

export function normalizeMemoryDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!MEMORY_DATE_RE.test(trimmed)) return null;
  const d = new Date(trimmed + "T12:00:00.000Z");
  if (Number.isNaN(d.getTime())) return null;
  const iso = d.toISOString().slice(0, 10);
  if (iso !== trimmed) return null;
  return trimmed;
}

export const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  general: "General",
  work: "Work",
  personal: "Personal",
  health: "Health",
  finance: "Finance",
  learning: "Learning",
  social: "Social",
  projects: "Projects",
  other: "Other",
};
