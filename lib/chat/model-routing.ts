import { contextWindowFor } from "@/lib/providers/catalog";
import type { QualityPolicy, TaskComplexity } from "./quality-policy";

export type ModelCapability =
  | "reasoning"
  | "coding"
  | "research"
  | "analysis"
  | "tool_use";

export type ModelCapabilityMetadata = {
  tier: 1 | 2 | 3 | 4 | 5;
  capabilities: ModelCapability[];
  contextWindow: number;
  latency: "low" | "medium" | "high";
  costTier: "low" | "medium" | "high";
  source: "catalog" | "heuristic";
};

export type ModelRouteCandidate = {
  providerId: number;
  providerKind: string;
  providerLabel: string;
  modelId: string;
};

export type ModelRoute = {
  selected: ModelRouteCandidate;
  active: ModelRouteCandidate;
  selectedMetadata: ModelCapabilityMetadata;
  activeMetadata: ModelCapabilityMetadata;
  needs: ModelCapability[];
  escalated: boolean;
  verifierEligible: boolean;
  expectedLatency: "normal" | "higher";
  expectedCost: "normal" | "higher";
  reason: string;
};

function metadata(
  tier: 1 | 2 | 3 | 4 | 5,
  capabilities: ModelCapability[],
  latency: ModelCapabilityMetadata["latency"],
  costTier: ModelCapabilityMetadata["costTier"],
  source: ModelCapabilityMetadata["source"],
  modelId: string,
): ModelCapabilityMetadata {
  return {
    tier,
    capabilities,
    contextWindow: contextWindowFor(modelId),
    latency,
    costTier,
    source,
  };
}

/**
 * Conservative, provider-neutral metadata for known model families. Unknown
 * discovered/custom models receive a middle-tier heuristic rather than being
 * treated as a guaranteed strong model.
 */
export function modelCapabilityMetadata(
  providerKind: string,
  modelId: string,
): ModelCapabilityMetadata {
  const id = modelId.toLowerCase();

  if (/opus|o3|o4|gpt-4\.1$|gpt-4\.1-(?!mini(?:$|-))|gpt-4o(?:$|-)/.test(id)) {
    return metadata(
      5,
      ["reasoning", "coding", "research", "analysis", "tool_use"],
      "high",
      "high",
      "catalog",
      modelId,
    );
  }
  if (/sonnet|gpt-4(?:$|-)|qwen.*(32b|72b)|deepseek-r1(?!-distill)/.test(id)) {
    return metadata(
      4,
      ["reasoning", "coding", "research", "analysis", "tool_use"],
      "medium",
      "medium",
      "catalog",
      modelId,
    );
  }
  if (/haiku|mini|small|flash|mistral|mixtral|qwen|llama|command-r|phi|gemma/.test(id)) {
    return metadata(
      3,
      ["coding", "research", "analysis", "tool_use"],
      "low",
      "low",
      "catalog",
      modelId,
    );
  }

  // Local and custom models vary substantially. Keep them eligible for normal
  // use, but never claim more than a middle-tier capability without evidence.
  return metadata(
    providerKind === "ollama" ? 2 : 3,
    ["analysis", "tool_use"],
    "medium",
    providerKind === "ollama" ? "low" : "medium",
    "heuristic",
    modelId,
  );
}

export function inferTaskCapabilities(
  text: string,
  mode: string | undefined,
  complexity: TaskComplexity,
): ModelCapability[] {
  const normalized = text.toLowerCase();
  const needs = new Set<ModelCapability>(["analysis"]);

  if (
    mode === "build" ||
    /\b(code|coding|implement|refactor|debug|fix|test|build|migration|repository|file|api)\b/.test(
      normalized,
    )
  ) {
    needs.add("coding");
    needs.add("tool_use");
  }
  if (/\b(research|citation|source|current|compare|news|evidence|web)\b/.test(normalized)) {
    needs.add("research");
  }
  if (complexity === "complex" || mode === "goal") needs.add("reasoning");

  return [...needs];
}

function sameCandidate(a: ModelRouteCandidate, b: ModelRouteCandidate): boolean {
  return a.providerId === b.providerId && a.modelId === b.modelId;
}

/**
 * Keeps the user's selected model fixed while calculating the effort-specific
 * reasoning behavior. Model selection belongs in the model picker.
 */
export function chooseModelRoute(input: {
  policy: QualityPolicy;
  complexity: TaskComplexity;
  text: string;
  mode?: string;
  selected: ModelRouteCandidate;
  candidates: ModelRouteCandidate[];
}): ModelRoute {
  const selectedMetadata = modelCapabilityMetadata(
    input.selected.providerKind,
    input.selected.modelId,
  );
  const needs = inferTaskCapabilities(input.text, input.mode, input.complexity);
  // Effort controls the selected model. Do not silently replace it: users
  // need to be able to compare Minimal/Low/Medium/High on the same model,
  // and some compatible providers have different reasoning capabilities that
  // our metadata cannot reliably infer. Model selection belongs in the model
  // picker, not in this effort control.
  const active = input.selected;
  const activeMetadata = modelCapabilityMetadata(active.providerKind, active.modelId);
  const escalated = !sameCandidate(active, input.selected);
  const verifierEligible = input.policy === "high" && input.complexity === "complex";

  let reason: string;
  if (input.policy !== "high") {
    reason = `${policyLabel(input.policy)} keeps the selected model pinned.`;
  } else if (escalated) {
    // Kept for compatibility if routing is made opt-in later.
    reason = `High effort selected a stronger configured model for this ${input.complexity} task.`;
  } else {
    reason = "High effort keeps the selected model and increases its reasoning effort.";
  }

  return {
    selected: input.selected,
    active,
    selectedMetadata,
    activeMetadata,
    needs,
    escalated,
    verifierEligible,
    expectedLatency: verifierEligible ? "higher" : "normal",
    expectedCost: verifierEligible ? "higher" : "normal",
    reason,
  };
}

function policyLabel(policy: QualityPolicy): string {
  switch (policy) {
    case "minimal":
      return "Minimal";
    case "low":
      return "Low";
    case "high":
      return "High";
    default:
      return "Medium";
  }
}
