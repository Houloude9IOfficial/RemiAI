/**
 * The normal maximum reveal speed for streamed assistant text. This prevents
 * providers that buffer responses from making an answer appear all at once.
 */
export const MAX_STREAM_DISPLAY_CHARS_PER_SECOND = 130;

/** The longest a buffered final response should take to catch up visually. */
export const STREAM_CATCH_UP_MAX_SECONDS = 5;

/**
 * Chooses a reveal rate for the text currently buffered by the client.
 * An active message keeps the normal cap. Once the provider has finished,
 * a backlog is accelerated only as much as needed to clear within the target.
 */
export function getStreamDisplayCharsPerSecond(
  remainingCharacters: number,
  messageStreaming: boolean,
): number {
  if (messageStreaming || remainingCharacters <= 0) {
    return MAX_STREAM_DISPLAY_CHARS_PER_SECOND;
  }

  return Math.max(
    MAX_STREAM_DISPLAY_CHARS_PER_SECOND,
    remainingCharacters / STREAM_CATCH_UP_MAX_SECONDS,
  );
}
