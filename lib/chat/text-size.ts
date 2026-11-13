import type { CSSProperties } from "react";

export const DEFAULT_CHAT_TEXT_SIZE = 100;
export const MIN_CHAT_TEXT_SIZE = 85;
export const MAX_CHAT_TEXT_SIZE = 150;
export const CHAT_TEXT_SIZE_STEP = 5;

export function isChatTextSize(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_CHAT_TEXT_SIZE &&
    value <= MAX_CHAT_TEXT_SIZE &&
    value % CHAT_TEXT_SIZE_STEP === 0;
}

export function chatTextSizeStyle(value?: number): CSSProperties {
  const size = isChatTextSize(value) ? value : DEFAULT_CHAT_TEXT_SIZE;
  return { "--chat-text-scale": size / 100 } as CSSProperties;
}
