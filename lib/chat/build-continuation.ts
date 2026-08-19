export type BuildContinuationInput = {
  task: string;
  status: "failed" | "interrupted" | "running";
  error?: string | null;
  checkpointStep?: number | null;
};

export function buildBuildContinuationPrompt(input: BuildContinuationInput): string {
  const state =
    input.status === "interrupted"
      ? "interrupted"
      : input.status === "running"
        ? "left in progress with a saved checkpoint"
        : "failed verification";
  const error = input.error?.trim()
    ? ` Last recorded error: ${input.error.trim().slice(0, 400)}`
    : "";
  const checkpoint = input.checkpointStep
    ? ` Resume from the latest saved checkpoint at step ${input.checkpointStep}.`
    : "";
  return `Continue the previous Build task. The original task was: ${input.task.trim()}. The previous run was ${state}.${checkpoint}${error} Inspect the current files and existing changes, address any remaining issues, run the relevant checks, and report the actual result without claiming success if a check fails.`;
}
