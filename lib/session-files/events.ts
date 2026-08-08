/**
 * Shared EventEmitter for session-file changes.
 *
 * Every mutation of a conversation's sandbox goes through the storage layer
 * (lib/session-files/storage.ts), which emits an event here. The SSE endpoint
 * (/api/session-files/stream) subscribes to this bus and pushes the event to
 * open clients, so the session files panel refreshes in real time while the
 * AI writes files during a chat (or when files change from any other source).
 *
 * Mirrors the pattern used by lib/fs/watcher-events.ts for watcher status.
 */
import { EventEmitter } from "node:events";

export type SessionFilesChangeOperation =
  | "write"
  | "edit"
  | "delete"
  | "mkdir"
  | "move"
  | "upload";

export interface SessionFilesChangedPayload {
  type: "session-files-changed";
  conversationId: number;
  timestamp: string;
  /** What changed — informational, used for debugging / future UI hints. */
  operation?: SessionFilesChangeOperation;
  /** The sandbox-relative path that changed (forward slashes). */
  path?: string;
}

class SessionFilesEventBus extends EventEmitter {
  private static instance: SessionFilesEventBus;

  private constructor() {
    super();
    this.setMaxListeners(100); // Allow many SSE connections
  }

  static getInstance(): SessionFilesEventBus {
    if (!SessionFilesEventBus.instance) {
      SessionFilesEventBus.instance = new SessionFilesEventBus();
    }
    return SessionFilesEventBus.instance;
  }

  emitChanged(payload: SessionFilesChangedPayload): void {
    this.emit("session-files-changed", payload);
  }

  onChanged(
    handler: (payload: SessionFilesChangedPayload) => void,
  ): () => void {
    this.on("session-files-changed", handler);
    return () => {
      this.off("session-files-changed", handler);
    };
  }
}

export const sessionFilesEventBus = SessionFilesEventBus.getInstance();

/**
 * Convenience helper — emit a "files changed" event for a conversation.
 * Called by the storage layer after any successful sandbox mutation.
 */
export function emitSessionFilesChanged(
  conversationId: number,
  opts?: { operation?: SessionFilesChangeOperation; path?: string },
): void {
  sessionFilesEventBus.emitChanged({
    type: "session-files-changed",
    conversationId,
    timestamp: new Date().toISOString(),
    operation: opts?.operation,
    path: opts?.path,
  });
}
