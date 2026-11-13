"use client";

import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

function DisclosureBody({ children, reduced }: { children: ReactNode; reduced: boolean }) {
  const present = useIsPresent();
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.18, ease: "easeOut" }}
      inert={!present}
      className="overflow-hidden"
    >
      {children}
    </motion.div>
  );
}

export function AnimatedDisclosure({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <div id={id} aria-hidden={!open}>
      <AnimatePresence initial={false}>
        {open && <DisclosureBody reduced={Boolean(reduced)}>{children}</DisclosureBody>}
      </AnimatePresence>
    </div>
  );
}
