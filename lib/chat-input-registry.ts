/**
 * Module-level registry for the chat composer's <textarea>.
 *
 * The global "/" shortcut (handled in ShortcutsProvider) needs to focus the
 * chat input, but the input lives deep inside ChatInput and there is no shared
 * context between the two. ChatInput registers its textarea here on mount and
 * unregisters it on unmount; ShortcutsProvider calls focusChatInput() when
 * "/" is pressed.
 *
 * Only one composer is ever mounted at a time (the empty-chat state OR the
 * conversation page), so a single slot is sufficient.
 */
let chatInput: HTMLTextAreaElement | null = null;

export const CHAT_INPUT_PREFILL_EVENT = "remi:chat-input:prefill";

export type ChatInputPrefillDetail = {
  text: string;
};

/** Register the mounted chat input. */
export function registerChatInput(el: HTMLTextAreaElement): void {
  chatInput = el;
}

/**
 * Unregister a chat input on unmount. Only clears the slot if `el` is the one
 * currently registered — during the composer layout transition two inputs can
 * briefly coexist, and an exiting input must not clear the ref of the entering
 * one.
 */
export function unregisterChatInput(el: HTMLTextAreaElement): void {
  if (chatInput === el) chatInput = null;
}

/** Focus the chat input if one is currently mounted. */
export function focusChatInput(): void {
  chatInput?.focus();
}

/** Prefill the mounted composer without automatically sending a message. */
export function dispatchChatInputPrefill(text: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ChatInputPrefillDetail>(CHAT_INPUT_PREFILL_EVENT, {
      detail: { text },
    }),
  );
}
