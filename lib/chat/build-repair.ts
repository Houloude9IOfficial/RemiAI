import type { BuildVerificationCheck } from "@/lib/chat/build-verification";

export const MAX_BUILD_REPAIR_ATTEMPTS = 2;

export type BuildRepairState = {
  attempt: number;
  lastFailureSignature: string;
};

export type BuildRepairUpdate = BuildRepairState & {
  phase: "executing" | "verifying" | "repairing";
  hasFailure: boolean;
};

function failureSignature(checks: BuildVerificationCheck[]): string {
  return checks
    .filter((check) => check.status !== "passed")
    .map((check) => `${check.command}:${check.status}:${check.detail}`)
    .join("|");
}

/** Advance the repair state only when a new failed/incomplete check appears. */
export function advanceBuildRepairState(
  previous: BuildRepairState,
  checks: BuildVerificationCheck[],
): BuildRepairUpdate {
  const signature = failureSignature(checks);
  if (!signature) {
    return {
      attempt: previous.attempt,
      lastFailureSignature: "",
      phase: checks.length > 0 ? "verifying" : "executing",
      hasFailure: false,
    };
  }

  const attempt =
    signature === previous.lastFailureSignature
      ? previous.attempt
      : Math.min(MAX_BUILD_REPAIR_ATTEMPTS, previous.attempt + 1);
  return {
    attempt,
    lastFailureSignature: signature,
    phase: "repairing",
    hasFailure: true,
  };
}

export function buildRepairGuidance(attempt: number): string {
  if (attempt <= MAX_BUILD_REPAIR_ATTEMPTS) {
    return `A verification check failed or is incomplete. Begin repair attempt ${attempt}/${MAX_BUILD_REPAIR_ATTEMPTS}: inspect the failure, make the smallest file-tool edit needed, then rerun the failed check. Do not claim success while it remains failed.`;
  }
  return `Verification is still failing after ${MAX_BUILD_REPAIR_ATTEMPTS} repair attempts. Stop changing files unless the next repair is clearly justified, and report the remaining failure honestly.`;
}
