/**
 * Provider-aware reasoning support.
 *
 * We only enable provider options when the configured provider and model
 * family are known to return reasoning text through the AI SDK stream. Ollama
 * tag-based reasoning is handled separately in the model factory because its
 * `<think>` content arrives as ordinary text. Unknown OpenAI-compatible models
 * stay disabled rather than showing a fabricated thinking UI.
 */

export function supportsStreamingReasoning(
  providerKind: string,
  modelId: string,
): boolean {
  if (providerKind !== "anthropic") return false;

  const id = modelId.toLowerCase();
  return (
    // Older extended-thinking models use the budget-based API.
    /claude-(?:opus|sonnet)-3-7/.test(id) ||
    /claude-(?:opus|sonnet)-4-5/.test(id) ||
    // Newer Opus/Sonnet models support adaptive thinking and summarized
    // display, which is required for visible realtime progress on 4.7+.
    /claude-(?:opus|sonnet)-(?:4-(?:6|7|8)|5(?:$|-))/.test(id)
  );
}

/**
 * Return only provider options that are safe for the selected model family.
 * `undefined` means the request should use the provider's normal behavior.
 */
type ReasoningProviderOptions = {
  anthropic: {
    sendReasoning: boolean;
    thinking:
      | { type: "adaptive"; display: "summarized" }
      | { type: "enabled"; budgetTokens: number };
  };
};

export function streamingReasoningProviderOptions(
  providerKind: string,
  modelId: string,
): ReasoningProviderOptions | undefined {
  if (!supportsStreamingReasoning(providerKind, modelId)) return undefined;

  const id = modelId.toLowerCase();
  const supportsAdaptiveThinking =
    /claude-(?:opus|sonnet)-(?:4-(?:6|7|8)|5(?:$|-))/.test(id);

  if (supportsAdaptiveThinking) {
    return {
      anthropic: {
        sendReasoning: true,
        thinking: { type: "adaptive", display: "summarized" },
      },
    };
  }

  return {
    anthropic: {
      sendReasoning: true,
      thinking: { type: "enabled", budgetTokens: 4_096 },
    },
  };
}
