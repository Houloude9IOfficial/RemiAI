export const QUALITY_POLICIES = ["fast", "balanced", "quality", "selected"] as const;

export type QualityPolicy = (typeof QUALITY_POLICIES)[number];
export type TaskComplexity = "simple" | "moderate" | "complex";

export type QualityStrategy = {
  policy: QualityPolicy;
  complexity: TaskComplexity;
  label: string;
  verificationGuidance: string;
  maxRetries: number;
  maxOutputTokens: number;
};

export function normalizeQualityPolicy(value: unknown): QualityPolicy {
  return typeof value === "string" && QUALITY_POLICIES.includes(value as QualityPolicy)
    ? (value as QualityPolicy)
    : "balanced";
}

/**
 * Estimate task complexity from stable, provider-neutral signals only.
 * This intentionally does not inspect model internals or make extra calls.
 */
export function estimateTaskComplexity(text: string, mode?: string): TaskComplexity {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return "simple";

  let score = 0;
  if (normalized.length > 240) score += 1;
  if (normalized.length > 900) score += 1;
  if ((normalized.match(/\b(and|then|also|after|until|each|multiple)\b/g) ?? []).length >= 2) {
    score += 1;
  }
  if (/\b(build|fix|implement|refactor|migrate|test|debug|deploy|research|compare|analy[sz]e|report|automate|schedule)\b/.test(normalized)) {
    score += 1;
  }
  if (/\b(file|files|repo|repository|directory|source|citation|database|api|browser|script|code)\b/.test(normalized)) {
    score += 1;
  }
  if (mode === "build" || mode === "goal") score += 1;
  if (mode === "plan" && score > 0) score -= 1;

  if (score >= 4) return "complex";
  if (score >= 2) return "moderate";
  return "simple";
}

export function chooseQualityStrategy(
  policy: QualityPolicy,
  complexity: TaskComplexity,
): QualityStrategy {
  const normalized = normalizeQualityPolicy(policy);
  if (normalized === "fast") {
    return {
      policy: normalized,
      complexity,
      label: "Fast",
      verificationGuidance: "Answer directly; use only the checks needed to avoid an obvious mistake.",
      maxRetries: 1,
      maxOutputTokens: complexity === "complex" ? 4096 : 2048,
    };
  }

  if (normalized === "quality") {
    return {
      policy: normalized,
      complexity,
      label: "Quality first",
      verificationGuidance: "Take the time to inspect assumptions, use deterministic checks where available, and disclose uncertainty.",
      maxRetries: 3,
      maxOutputTokens: complexity === "simple" ? 4096 : 16384,
    };
  }

  if (normalized === "selected") {
    return {
      policy: normalized,
      complexity,
      label: "Selected model",
      verificationGuidance: "Use the selected model's normal effort; do not silently route to another model.",
      maxRetries: 3,
      maxOutputTokens: complexity === "complex" ? 16384 : 4096,
    };
  }

  return {
    policy: "balanced",
    complexity,
    label: "Balanced",
    verificationGuidance: "Use proportionate inspection and verification for the task.",
    maxRetries: 3,
    maxOutputTokens: complexity === "complex" ? 16384 : 4096,
  };
}
