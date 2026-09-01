export const QUALITY_POLICIES = ["minimal", "low", "medium", "high"] as const;

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

// Legacy policy values stored by older versions of the app (pre reasoning-effort
// rename). Mapped so existing conversations keep their intent:
//   fast → minimal, balanced → medium, quality → high, selected → medium
const LEGACY_POLICY_MAP: Record<string, QualityPolicy> = {
  fast: "minimal",
  balanced: "medium",
  quality: "high",
  selected: "medium",
};

export function normalizeQualityPolicy(value: unknown): QualityPolicy {
  if (typeof value === "string") {
    if (QUALITY_POLICIES.includes(value as QualityPolicy)) return value as QualityPolicy;
    const legacy = LEGACY_POLICY_MAP[value];
    if (legacy) return legacy;
  }
  return "medium";
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
  if (normalized === "minimal") {
    return {
      policy: normalized,
      complexity,
      label: "Minimal",
      verificationGuidance: "Answer directly; use only the checks needed to avoid an obvious mistake.",
      maxRetries: 1,
      maxOutputTokens: complexity === "complex" ? 4096 : 2048,
    };
  }

  if (normalized === "low") {
    return {
      policy: normalized,
      complexity,
      label: "Low",
      verificationGuidance: "Keep reasoning light; run only quick checks for obvious mistakes.",
      maxRetries: 2,
      maxOutputTokens: complexity === "complex" ? 8192 : 3072,
    };
  }

  if (normalized === "high") {
    return {
      policy: normalized,
      complexity,
      label: "High",
      verificationGuidance: "Take the time to inspect assumptions, use deterministic checks where available, and disclose uncertainty.",
      maxRetries: 3,
      maxOutputTokens: complexity === "simple" ? 8192 : 16384,
    };
  }

  return {
    policy: "medium",
    complexity,
    label: "Medium",
    verificationGuidance: "Use proportionate inspection and verification for the task.",
    maxRetries: 3,
    maxOutputTokens: complexity === "complex" ? 16384 : 4096,
  };
}
