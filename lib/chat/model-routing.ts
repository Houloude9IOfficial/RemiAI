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

function capabilityScore(
  candidate: ModelRouteCandidate,
  needs: ModelCapability[],
): number {
  const info = modelCapabilityMetadata(candidate.providerKind, candidate.modelId);
  const matches = needs.filter((need) => info.capabilities.includes(need)).length;
  return info.tier * 3 + matches * 2 + Math.min(2, Math.floor(info.contextWindow / 100_000));
}

function sameCandidate(a: ModelRouteCandidate, b: ModelRouteCandidate): boolean {
  return a.providerId === b.providerId && a.modelId === b.modelId;
}

/**
 * Selects a stronger configured model only for Quality-first requests. The
 * other policies are deliberately pinned to the user's selected model.
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
  const selectedScore = capabilityScore(input.selected, needs);
  const eligible = input.candidates
    .filter((candidate) => !sameCandidate(candidate, input.selected))
    .map((candidate) => ({
      candidate,
      metadata: modelCapabilityMetadata(candidate.providerKind, candidate.modelId),
      score: capabilityScore(candidate, needs),
    }))
    .filter(({ score, metadata }) =>
      score >= selectedScore + 2 && metadata.contextWindow >= selectedMetadata.contextWindow,
    )
    .sort((a, b) =>
      b.score - a.score ||
      (a.candidate.providerId === input.selected.providerId ? -1 : 1) -
        (b.candidate.providerId === input.selected.providerId ? -1 : 1) ||
      a.candidate.modelId.localeCompare(b.candidate.modelId),
    );

  const shouldEscalate =
    input.policy === "quality" &&
    (input.complexity === "complex" || selectedMetadata.tier <= 3) &&
    eligible.length > 0;
  const active = shouldEscalate ? eligible[0].candidate : input.selected;
  const activeMetadata = modelCapabilityMetadata(active.providerKind, active.modelId);
  const escalated = !sameCandidate(active, input.selected);
  const verifierEligible = input.policy === "quality" && input.complexity === "complex";

  let reason: string;
  if (input.policy !== "quality") {
    reason = `${policyLabel(input.policy)} keeps the selected model pinned.`;
  } else if (escalated) {
    reason = `Quality first selected a stronger configured model for this ${input.complexity} task.`;
  } else if (eligible.length === 0) {
    reason = "Quality first found no safe stronger configured model, so it kept the selected model.";
  } else {
    reason = "The selected model already meets the estimated task capability needs.";
  }

  return {
    selected: input.selected,
    active,
    selectedMetadata,
    activeMetadata,
    needs,
    escalated,
    verifierEligible,
    expectedLatency: escalated || verifierEligible ? "higher" : "normal",
    expectedCost: escalated || verifierEligible ? "higher" : "normal",
    reason,
  };
}

function policyLabel(policy: QualityPolicy): string {
  switch (policy) {
    case "fast":
      return "Fast";
    case "quality":
      return "Quality first";
    case "selected":
      return "Selected model";
    default:
      return "Balanced";
  }
}
