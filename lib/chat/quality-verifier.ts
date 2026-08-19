import { generateText } from "ai";
import type { LanguageModel } from "ai";

export type QualityVerificationResult = {
  verdict: "pass" | "needs_review";
  confidence: number;
  issueCount: number;
  summary: string;
};

function parseVerifierText(text: string): QualityVerificationResult {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as Record<string, unknown>;
      const verdict = parsed.verdict === "pass" ? "pass" : "needs_review";
      const confidence = Math.max(
        0,
        Math.min(1, Number(parsed.confidence) || 0),
      );
      const issueCount = Math.max(0, Math.floor(Number(parsed.issueCount) || 0));
      const summary = typeof parsed.summary === "string"
        ? parsed.summary.trim().slice(0, 240)
        : "Verifier returned no summary.";
      return { verdict, confidence, issueCount, summary };
    } catch {
      // Fall through to the conservative result below.
    }
  }

  return {
    verdict: "needs_review",
    confidence: 0,
    issueCount: 1,
    summary: "Verifier output was not valid JSON and needs review.",
  };
}

/**
 * Run only for explicitly selected Quality-first, complex requests. The
 * verifier never edits files or changes the streamed answer; it records a
 * conservative verdict for observability and later UI/reporting.
 */
export async function verifyQualityAnswer(input: {
  model: LanguageModel;
  task: string;
  answer: string;
}): Promise<QualityVerificationResult> {
  const task = input.task.trim().slice(0, 8_000);
  const answer = input.answer.trim().slice(0, 12_000);
  const result = await generateText({
    model: input.model,
    system:
      "You are a strict answer verifier. Do not solve the task or rewrite the answer. Return JSON only with this shape: {\"verdict\":\"pass\"|\"needs_review\",\"confidence\":0..1,\"issueCount\":integer,\"summary\":\"brief reason\"}. Mark needs_review when the answer makes unsupported claims, misses the request, or lacks required verification.",
    prompt: `Task:\n${task}\n\nCandidate answer:\n${answer}`,
    maxOutputTokens: 300,
    maxRetries: 0,
  });
  return parseVerifierText(result.text);
}
