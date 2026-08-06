"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import {
  IconBrandGithub,
  IconBrain,
  IconCheck,
  IconClipboard,
  IconFileText,
  IconMicrophone,
  IconPlugConnected,
  IconRobot,
  IconShieldLock,
  IconTerminal2,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { GITHUB_URL, SITE_NAME } from "@/lib/constants";

/* ------------------------------------------------------------------ */
/*  Shared animation variants                                          */
/* ------------------------------------------------------------------ */

const ease: [number, number, number, number] = [0.16, 1, 0.3, 1];

function fadeUp(delay = 0) {
  return {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease, delay } },
  };
}

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.div
      initial={prefersReduced ? false : "hidden"}
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={fadeUp(delay)}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Header                                                             */
/* ------------------------------------------------------------------ */

function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border shadow-[0_1px_0_0_rgba(16,18,22,0.02)]"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="#top" className="group flex items-center gap-2.5" aria-label={`${SITE_NAME} home`}>
          <span className="relative">
            <Image
              src="/RemiAI.png"
              alt={SITE_NAME}
              width={28}
              height={28}
              className="rounded-[7px] transition-transform duration-200 group-hover:scale-105"
            />
          </span>
          {/* <span className="text-[15px] font-semibold tracking-tight">{SITE_NAME}</span> */}
        </a>

        <nav className="hidden items-center gap-7 md:flex">
          {[
            { href: "#features", label: "Features" },
            { href: "#quickstart", label: "Quickstart" },
          ].map((link) => (
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
              Star on GitHub
            </Button>
          </a>
          <a
            href="#quickstart"
            aria-label="Get started"
          >
            <Button size="sm">Get started</Button>
          </a>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero                                                               */
/* ------------------------------------------------------------------ */

const HERO_CHIPS = [
  { label: "File System", icon: IconFileText, className: "left-0 top-10 lg:-left-10" },
  { label: "Memory", icon: IconBrain, className: "right-0 top-24 lg:-right-12" },
  { label: "MCP Tools", icon: IconPlugConnected, className: "left-2 bottom-14 lg:-left-14" },
  { label: "Agents", icon: IconRobot, className: "right-0 bottom-8 lg:-right-10" },
];

const TECH_BADGES = [
  { name: "Next.js 16", src: "/assets/nextjs.svg" },
  { name: "TypeScript", src: "/assets/typescript.svg" },
  { name: "SQLite", src: "/assets/sqlite.svg" },
  { name: "Drizzle ORM", src: "/assets/drizzle.svg" },
  { name: "AI SDK", src: "/assets/vercel.svg" },
  { name: "Tailwind CSS", src: "/assets/tailwindcss.svg" },
  { name: "MCP", src: "/assets/mcp.svg" },
];

function DashboardShot() {
  const prefersReduced = useReducedMotion();

  return (
    <div className="relative mx-auto mt-16 max-w-5xl md:mt-20">
      {/* Glow behind the frame */}
      <div className="glow-hero absolute -inset-x-8 -top-16 -bottom-10 -z-10" aria-hidden />

      <motion.div
        initial={prefersReduced ? false : { opacity: 0, y: 48, scale: 0.97 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.9, ease }}
      >
        {/* Browser frame */}
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_24px_80px_-32px_rgba(16,18,22,0.35)]">
          {/* Window chrome */}
          <div className="flex items-center gap-3 border-b border-border bg-muted/60 px-4 py-3">
            <div className="flex gap-1.5">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            </div>
            <div className="mx-auto flex h-7 w-full max-w-sm items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-[11px] font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              localhost:3000
            </div>
            <div className="w-12" />
          </div>

          {/* Screenshot */}
          <Image
            src="/assets/RemiAIv2Light.png"
            alt={`${SITE_NAME} dashboard — light theme`}
            width={3420}
            height={1812}
            priority
            className="h-auto w-full select-none"
            sizes="(max-width: 1024px) 100vw, 1024px"
          />
        </div>
      </motion.div>

      {/* Floating capability chips */}
      {!prefersReduced &&
        HERO_CHIPS.map((chip, i) => (
          <motion.div
            key={chip.label}
            className={`absolute hidden lg:block ${chip.className}`}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 + i * 0.12, duration: 0.6, ease }}
          >
            <motion.div
              animate={{ y: [0, -7, 0] }}
              transition={{
                duration: 5 + i,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.9 + i * 0.12,
              }}
            >
              <div className="flex items-center gap-2 rounded-full border border-border bg-background/90 px-3.5 py-2 shadow-[0_8px_24px_-12px_rgba(16,18,22,0.25)] backdrop-blur">
                <chip.icon className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium">{chip.label}</span>
              </div>
            </motion.div>
          </motion.div>
        ))}
    </div>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-28">
      {/* Grid backdrop */}
      <div
        className="bg-grid absolute inset-0 -z-20 [mask-image:radial-gradient(70%_55%_at_50%_0%,black,transparent)]"
        aria-hidden
      />
      {/* Soft top glow */}
      <div
        className="absolute inset-x-0 -top-40 -z-10 h-[520px] bg-gradient-to-b from-accent/50 to-transparent"
        aria-hidden
      />

      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          {/* <Reveal>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 shadow-sm">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <IconBrandGithub className="h-3.5 w-3.5" />
                Open source
              </span>
              <span className="h-3 w-px bg-border" />
              <span className="text-xs font-medium text-muted-foreground">MIT License</span>
              <span className="h-3 w-px bg-border" />
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Self-hosted
              </span>
            </div>
          </Reveal> */}

          <Reveal delay={0.08}>
            <h1 className="mt-7 text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
              Your local AI assistant, for your own data.
            </h1>
          </Reveal>

          <Reveal delay={0.16}>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
              {SITE_NAME} is a self-hosted AI assistant with deep file system
              integration, persistent memory, MCP tool support, and a powerful
              agent system running entirely on your own hardware.
            </p>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="gap-2">
                  <IconBrandGithub className="h-4 w-4" />
                  View on GitHub
                </Button>
              </a>
              <a href="#quickstart">
                <Button variant="outline" size="lg" className="gap-2">
                  <IconTerminal2 className="h-4 w-4" />
                  Quickstart
                </Button>
              </a>
            </div>
          </Reveal>

          {/* Tech badges */}
          <Reveal delay={0.32}>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              {TECH_BADGES.map((tech) => (
                <div
                  key={tech.name}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
                >
                  <Image
                    src={tech.src}
                    alt=""
                    width={16}
                    height={16}
                    className="h-4 w-4 object-contain opacity-80 grayscale transition-opacity duration-200 hover:opacity-100"
                  />
                  {tech.name}
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        <DashboardShot />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Features                                                           */
/* ------------------------------------------------------------------ */

const FEATURES = [
  {
    icon: IconFileText,
    title: "File System Integration",
    description:
      "Read, search, and write files inside permitted directories — with granular permission controls and live file watching.",
  },
  {
    icon: IconBrain,
    title: "Persistent Memory",
    description:
      "RemiAI remembers your preferences, interests, and personal details across every conversation, locally.",
  },
  {
    icon: IconPlugConnected,
    title: "MCP Extensibility",
    description:
      "Connect databases, APIs, and custom servers through the Model Context Protocol — hundreds of additional tools.",
  },
  {
    icon: IconRobot,
    title: "Agent System",
    description:
      "Spawn focused sub-agents for research, coding, and analysis — parallel problem-solving with efficient token use.",
  },
  {
    icon: IconMicrophone,
    title: "Talk Mode",
    description:
      "A hands-free voice interface with streaming speech-to-text, interruption support, and premium TTS.",
  },
  {
    icon: IconShieldLock,
    title: "Private by Design",
    description:
      "Encrypted backups, no telemetry, and zero cloud dependencies. Your data never leaves your hardware.",
  },
];

function Features() {
  return (
    <section id="features" className="scroll-mt-24 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal delay={0.06}>
            <h2 className="text-balance text-3xl font-bold tracking-tight md:text-4xl">
              Everything you need, locally
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
              RemiAI combines powerful AI capabilities with deep local
              integration giving you full control over your data and workflow.
            </p>
          </Reveal>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={i * 0.06}>
              <div className="group relative h-full overflow-hidden rounded-2xl border border-border bg-card p-6">
                <div
                  className="absolute inset-x-0 top-0 h-px transition-opacity duration-300 group-hover:opacity-100"
                  aria-hidden
                />
                {/* <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl text-accent-foreground transition-transform duration-300">
                  <feature.icon className="h-5 w-5" />
                </div> */}
                <h3 className="mb-2 font-semibold tracking-tight">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Quickstart / CTA                                                   */
/* ------------------------------------------------------------------ */

const TERMINAL_LINES = [
  { prompt: "$", text: "git clone https://github.com/Houloude9IOfficial/RemiAI.git" },
  { prompt: "$", text: "cd RemiAI" },
  { prompt: "$", text: "npm install" },
  { prompt: "$", text: "npm run dev", highlight: true },
];

const QUICKSTART_COMMAND = TERMINAL_LINES.map((l) => l.text).join("\n");

function CopyButton({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = command;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors duration-200 hover:bg-white/5 hover:text-zinc-200"
      aria-label={copied ? "Copied" : "Copy quickstart command"}
    >
      {copied ? (
        <>
          <IconCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-emerald-400">Copied</span>
        </>
      ) : (
        <>
          <IconClipboard className="h-3.5 w-3.5" />
          Copy
        </>
      )}
    </button>
  );
}

function Quickstart() {
  const prefersReduced = useReducedMotion();

  return (
    <section id="quickstart" className="scroll-mt-24 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Copy */}
          <div>
            <Reveal delay={0.06}>
              <h2 className="text-balance text-3xl font-bold tracking-tight md:text-4xl">
                Running in under a minute
              </h2>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="mt-4 max-w-md text-pretty text-lg leading-relaxed text-muted-foreground">
                Clone the repo, install dependencies, and start talking to your
                own local AI assistant.
              </p>
            </Reveal>

            <Reveal delay={0.18}>
              <ul className="mt-8 space-y-3.5">
                {[
                  "Node.js 18+",
                  "One-time signup code printed in your terminal",
                  "Ollama, Anthropic, OpenAI or bring your own provider",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ">
                      <IconCheck className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span className="text-sm leading-relaxed text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={0.24}>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" className="gap-2">
                    <IconBrandGithub className="h-4 w-4" />
                    Get Started on GitHub
                  </Button>
                </a>
                <a href={`${GITHUB_URL}#readme`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="lg">
                    Read the docs
                  </Button>
                </a>
              </div>
            </Reveal>
          </div>

          {/* Terminal */}
          <Reveal delay={0.12}>
            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-[0_32px_80px_-32px_rgba(0,0,0,0.55)]">
              <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                </div>
                <CopyButton command={QUICKSTART_COMMAND} />
              </div>
              <div
                className={`space-y-1.5 p-5 font-mono text-[13px] leading-relaxed ${
                  prefersReduced ? "" : "terminal-enter"
                }`}
              >
                <p
                  className="text-zinc-500"
                  style={{ animationDelay: prefersReduced ? undefined : "0.15s" }}
                >
                  # Clone, install, and run
                </p>
                {TERMINAL_LINES.map((line, i) => (
                  <p
                    key={i}
                    className={line.highlight ? "text-emerald-400" : "text-zinc-300"}
                    style={{ animationDelay: prefersReduced ? undefined : `${0.4 + i * 0.12}s` }}
                  >
                    <span className="mr-2 select-none text-zinc-600">{line.prompt}</span>
                    {line.text}
                  </p>
                ))}
                <p
                  className="pt-1 text-zinc-500"
                  style={{ animationDelay: prefersReduced ? undefined : "0.95s" }}
                >
                  <span className="mr-2 select-none text-zinc-600">→</span>
                  <span className="text-zinc-300">localhost:3000</span>
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer                                                             */
/* ------------------------------------------------------------------ */

function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 py-10 md:flex-row">
        <div className="flex items-center gap-2.5">
          <Image
            src="/RemiAI.png"
            alt={SITE_NAME}
            width={22}
            height={22}
            className="rounded-md"
          />
          <span className="text-sm font-semibold tracking-tight">{SITE_NAME}</span>
          <span className="ml-1 text-xs text-muted-foreground">MIT License</span>
        </div>

        <div className="flex items-center gap-6">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            <IconBrandGithub className="h-3.5 w-3.5" />
            GitHub
          </a>
          <a
            href={`${GITHUB_URL}/blob/main/LICENSE`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            License
          </a>
          <a
            href={`${GITHUB_URL}#readme`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            Documentation
          </a>
        </div>

        <p className="text-xs text-muted-foreground/70">
          © {year} {SITE_NAME}. Built in the open by <a href="https://crickdevs.com" target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline">CrickDevs&trade;</a>.
        </p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Features />
        <Quickstart />
      </main>
      <Footer />
    </>
  );
}
