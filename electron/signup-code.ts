const SIGNUP_CODE_PATTERN = /RemiAI signup code:\s*([A-F0-9]{12})\b/i;
const MAX_BUFFER_LENGTH = 512;

/**
 * Extracts the one-time bootstrap code from the Next.js child process output.
 * Output events do not necessarily align with lines, so retain a small suffix
 * between chunks rather than looking at each chunk in isolation.
 */
export class SignupCodeCapture {
  private buffer = "";

  push(chunk: string): string | null {
    this.buffer = (this.buffer + chunk).slice(-MAX_BUFFER_LENGTH);
    const match = this.buffer.match(SIGNUP_CODE_PATTERN);
    return match?.[1]?.toUpperCase() ?? null;
  }

  reset(): void {
    this.buffer = "";
  }
}
