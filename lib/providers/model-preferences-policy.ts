export const DEFAULT_ENABLE_NEW_MODELS = true;

/** Resolve the setting while keeping older or incomplete preference rows safe. */
export function resolveNewModelEnabled(
  enableNewModels: boolean | null | undefined,
): boolean {
  return enableNewModels ?? DEFAULT_ENABLE_NEW_MODELS;
}
