"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { IconBrandGithub, IconArrowRight } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { GITHUB_URL, SITE_NAME } from "@/lib/constants";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#quickstart", label: "Quickstart" },
  { href: "#faq", label: "FAQ" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "border-b border-border bg-background/80 backdrop-blur-xl" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="#top" className="group flex items-center gap-2.5" aria-label={`${SITE_NAME} home`}>
          <span className="relative">
            <Image
              src="/RemiAI.png"
              alt=""
              width={26}
              height={26}
              className="rounded-[7px] transition-transform duration-200 group-hover:scale-105"
            />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">{SITE_NAME}</span>
        </a>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex"
            aria-label={`${SITE_NAME} on GitHub`}
          >
            <Button variant="outline" size="sm" className="gap-1.5">
              <IconBrandGithub className="h-3.5 w-3.5" />
              Star
            </Button>
          </a>
          <a href="#quickstart" aria-label="Get started">
            <Button size="sm" className="gap-1.5">
              Get started
              <IconArrowRight className="h-3.5 w-3.5" />
            </Button>
          </a>
        </div>
      </div>
    </header>
  );
}
