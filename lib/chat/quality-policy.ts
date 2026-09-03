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
  // Multi-file creation intent (canvas, websites, apps, dashboards…). These
  // look short ("/canvas create me a movie db") but are multi-step agentic
  // builds — labeling them "simple" would cap their output budget and truncate
  // the run mid-write. Never let a short prompt starve real work.
  if (/^\s*\/(canvas|visual)\b/.test(normalized)) score += 2;
  else if (/^\s*\/(build|chart|image|browser|research|report|web|site)\b/.test(normalized)) score += 1;
  if (
    /\b(create|build|generate|make|design|implement|write|set up)\b[\s\S]{0,80}\b(canvas|website|web ?app|web ?page|landing page|dashboard|portfolio|movie ?db|database|calculator|to-?do app|quiz|game|prototype|mockup)\b/.test(
      normalized,
    )
  ) {
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
  // Output-token budgets are per model call. Reasoning models (Nemotron,
  // DeepSeek, o-series…) spend a large share of that budget on thinking
  // BEFORE they emit a tool call — a call that is cut short mid-reasoning
  // (finishReason "length") ends the whole agentic run as "step limit reached".
  // The non-complex tiers used to be tiny (2048–4096): any slightly-above-
  // trivial request ("/canvas create me a movie db…") could be classified
  // "simple" and silently starved. Floors are raised so a low classification
  // never truncates real work. 16384 is the ceiling the chat route already
  // forces for goal/build/agentic runs, so it is the safe cap for every
  // provider this app talks to (higher values can 400 on models with a lower
  // max output). The remaining differentiators between effort levels are
  // maxRetries, reasoning effort, routing and verification — not a ceiling
  // that truncates the model mid-task.
  if (normalized === "minimal") {
    return {
      policy: normalized,
      complexity,
      label: "Minimal",
      verificationGuidance: "Answer directly; use only the checks needed to avoid an obvious mistake.",
      maxRetries: 1,
      maxOutputTokens: complexity === "complex" ? 8192 : 4096,
    };
  }

  if (normalized === "low") {
    return {
      policy: normalized,
      complexity,
      label: "Low",
      verificationGuidance: "Keep reasoning light; run only quick checks for obvious mistakes.",
      maxRetries: 2,
      maxOutputTokens: complexity === "complex" ? 16384 : 8192,
    };
  }

  if (normalized === "high") {
    return {
      policy: normalized,
      complexity,
      label: "High",
      verificationGuidance: "Take the time to inspect assumptions, use deterministic checks where available, and disclose uncertainty.",
      maxRetries: 3,
      maxOutputTokens: 16384,
    };
  }

  return {
    policy: "medium",
    complexity,
    label: "Medium",
    verificationGuidance: "Use proportionate inspection and verification for the task.",
    maxRetries: 3,
    // Flat: a "simple"-looking prompt that is really an agentic build (canvas,
    // session files, code execution…) must never be starved by its label —
    // the route further raises runs whose write/canvas tools are active.
    maxOutputTokens: 16384,
  };
}
