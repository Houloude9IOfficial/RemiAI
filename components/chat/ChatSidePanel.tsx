"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

function DockedPanel({ children, onClose, title, focusOnOpen }: {
  children: ReactNode;
  onClose: () => void;
  title: string;
  focusOnOpen: boolean;
}) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusOnOpen) closeButton.current?.focus({ preventScroll: true });
  }, [focusOnOpen]);
  return (
    <motion.aside
      aria-label={title}
      inert={!present}
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 288, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.18, ease: "easeOut" }}
      className="hidden min-h-0 shrink-0 overflow-hidden border-l border-border bg-background lg:flex"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex min-h-0 w-72 shrink-0 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button ref={closeButton} type="button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}
            className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>
        {children}
      </div>
    </motion.aside>
  );
}

export function ChatSidePanel({ open, desktop, title, children, onClose, returnFocus, focusOnOpen = false }: {
  open: boolean;
  desktop: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  returnFocus: () => HTMLButtonElement | null | false;
  focusOnOpen?: boolean;
}) {
  if (!desktop) {
    return (
      <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
        <DialogContent
          finalFocus={returnFocus}
          className="inset-y-0 right-0 left-auto flex h-dvh w-[min(85vw,20rem)] max-w-none translate-none flex-col gap-0 rounded-none bg-background p-0 text-foreground sm:max-w-none motion-reduce:animate-none! data-open:zoom-in-100 data-closed:zoom-out-100 data-open:slide-in-from-right-4 data-closed:slide-out-to-right-4"
        >
          <DialogTitle className="flex h-12 shrink-0 items-center border-b border-border px-4 text-sm">{title}</DialogTitle>
          {children}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <AnimatePresence initial={false}>
      {open && (
        <DockedPanel onClose={onClose} title={title} focusOnOpen={focusOnOpen}>
          {children}
        </DockedPanel>
      )}
    </AnimatePresence>
  );
}
