/**
 * Stored on a conversation to represent Remi's virtual automatic model.
 * It is deliberately not a provider-model row: Auto routes through the
 * currently enabled models, so it never becomes stale when providers change.
 */
export const AUTO_MODEL_ID = "__remi_auto__";

export function isAutoModel(modelId: string | null | undefined): boolean {
  return modelId === AUTO_MODEL_ID;
}
