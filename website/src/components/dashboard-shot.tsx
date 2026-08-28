"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { SITE_NAME } from "@/lib/constants";

const ease: [number, number, number, number] = [0.16, 1, 0.3, 1];

function usePrefersDark() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return dark;
}

export function DashboardShot() {
  const prefersReduced = useReducedMotion();
  const dark = usePrefersDark();

  return (
    <div className="relative mx-auto mt-16 max-w-5xl md:mt-20">
      {/* Soft aura behind the frame */}
      <div className="hero-glow absolute -inset-x-8 -top-16 -bottom-10 -z-10" aria-hidden />

      <motion.div
        initial={prefersReduced ? false : { opacity: 0, y: 40, scale: 0.98 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.8, ease }}
      >
        <figure className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_1px_rgba(0,0,0,0.03),0_8px_24px_-8px_rgba(0,0,0,0.06)]">
          <div className="flex items-center gap-3 border-b border-border bg-muted/50 px-4 py-2.5">
            <span className="font-mono text-[11px] text-muted-foreground">localhost:3000</span>
            <span className="h-1 w-1 rounded-full bg-emerald-500" aria-hidden />
            <span className="font-mono text-[11px] text-muted-foreground/70">running locally</span>
            <span className="h-1 w-1 rounded-full bg-emerald-500" aria-hidden />
            <span className="font-mono text-[11px] text-muted-foreground/70">v2.4.0</span>
          </div>
          <Image
            src={dark ? "/assets/RemiAI-Dark-2-4-0.png" : "/assets/RemiAI-Light-2-4-0.png"}
            alt={`${SITE_NAME} chat interface running on localhost`}
            width={3420}
            height={1812}
            priority
            className="h-auto w-full select-none"
            sizes="(max-width: 1024px) 100vw, 1024px"
          />
          <figcaption className="border-t border-border bg-muted/30 px-4 py-2 font-mono text-[11px] text-muted-foreground">
            {SITE_NAME} dashboard, running on your machine
          </figcaption>
        </figure>
      </motion.div>
    </div>
  );
}
