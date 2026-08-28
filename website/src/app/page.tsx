import Image from "next/image";
import {
  IconBrandGithub,
  IconBrain,
  IconCheck,
  IconFileText,
  IconMicrophone,
  IconPlugConnected,
  IconPlus,
  IconRobot,
  IconShieldLock,
  IconTerminal2,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/reveal";
import { Header } from "@/components/header";
import { DashboardShot } from "@/components/dashboard-shot";
import { CopyButton } from "@/components/copy-button";
import { FAQ_ITEMS } from "@/lib/faq";
import { GITHUB_URL, SITE_NAME } from "@/lib/constants";

/* ------------------------------------------------------------------ */
/*  Hero                                                               */
/* ------------------------------------------------------------------ */

const TECH_BADGES = [
  { name: "Next.js 16", src: "/assets/nextjs.svg" },
  { name: "TypeScript", src: "/assets/typescript.svg" },
  { name: "SQLite", src: "/assets/sqlite.svg" },
  { name: "Drizzle ORM", src: "/assets/drizzle.svg" },
  { name: "AI SDK", src: "/assets/vercel.svg" },
  { name: "Tailwind CSS", src: "/assets/tailwindcss.svg" },
  { name: "MCP", src: "/assets/mcp.svg" },
];

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-20 pb-16 md:pt-24 md:pb-20">
      {/* Grid backdrop */}
      <div
        className="bg-grid absolute inset-0 -z-20 [mask-image:radial-gradient(70%_55%_at_50%_0%,black,transparent)]"
        aria-hidden
      />
      {/* Soft top glow */}
      <div
        className="absolute inset-x-0 -top-40 -z-10 h-[520px] bg-gradient-to-b from-accent/60 to-transparent"
        aria-hidden
      />

      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <p className="inline-flex items-center rounded-full border border-border bg-background/80 px-3.5 py-1.5 font-mono text-[11px] tracking-wide text-muted-foreground">
              Self-hosted · Open source
            </p>
          </Reveal>

          <Reveal delay={0.08}>
            <h1 className="mt-7 text-balance text-4xl font-semibold leading-[1.06] tracking-[-0.02em] sm:text-5xl lg:text-6xl">
              Your local AI assistant, for your own data.
            </h1>
          </Reveal>

          <Reveal delay={0.16}>
            <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
              RemiAI runs entirely on your hardware: deep file system access,
              persistent memory, MCP tools, and a full agent system.
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
                  Get started
                </Button>
              </a>
            </div>
          </Reveal>
        </div>

        <DashboardShot />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Tech strip (under the hero)                                        */
/* ------------------------------------------------------------------ */

function TechStrip() {
  return (
    <section aria-label="Technology stack" className="border-y border-border bg-muted/40">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          {TECH_BADGES.map((tech) => (
            <li
              key={tech.name}
              className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground"
            >
              <Image
                src={tech.src}
                alt=""
                width={16}
                height={16}
                className="h-4 w-4 object-contain opacity-70 grayscale transition-opacity duration-200 hover:opacity-100"
              />
              {tech.name}
            </li>
          ))}
        </ul>
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
      "Read, search, and write files inside permitted directories, with granular permission controls and live file watching.",
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
      "Connect databases, APIs, and custom servers through the Model Context Protocol, with hundreds of additional tools.",
  },
  {
    icon: IconRobot,
    title: "Agent System",
    description:
      "Spawn focused sub-agents for research, coding, and analysis, with parallel problem-solving and efficient token use.",
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
    <section id="features" className="scroll-mt-20 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <h2 className="text-balance text-3xl font-semibold tracking-[-0.015em] md:text-4xl">
              Everything you need, locally
            </h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
              RemiAI combines powerful AI capabilities with deep local integration,
              giving you full control over your data and workflow.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.12}>
          <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="bg-background p-6 md:p-8">
                <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <feature.icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </div>
                <h3 className="text-[15px] font-semibold tracking-tight">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Quickstart                                                         */
/* ------------------------------------------------------------------ */

const TERMINAL_LINES = [
  { prompt: "$", text: "git clone https://github.com/Houloude9IOfficial/RemiAI.git" },
  { prompt: "$", text: "cd RemiAI" },
  { prompt: "$", text: "npm install" },
  { prompt: "$", text: "npm run dev", highlight: true },
];

const QUICKSTART_COMMAND = TERMINAL_LINES.map((l) => l.text).join("\n");

function TerminalBlock() {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-zinc-700" aria-hidden />
          <span className="font-mono text-[11px] text-zinc-500">quickstart</span>
        </div>
        <CopyButton command={QUICKSTART_COMMAND} />
      </div>
      <div className="terminal-enter space-y-1.5 p-5 font-mono text-[13px] leading-relaxed">
        <p className="text-zinc-500" style={{ animationDelay: "0.15s" }}>
          # Clone, install, and run
        </p>
        {TERMINAL_LINES.map((line, i) => (
          <p
            key={i}
            className={line.highlight ? "text-emerald-400" : "text-zinc-300"}
            style={{ animationDelay: `${0.4 + i * 0.12}s` }}
          >
            <span className="mr-2 select-none text-zinc-600">{line.prompt}</span>
            {line.text}
          </p>
        ))}
        <p className="pt-1 text-zinc-500" style={{ animationDelay: "0.95s" }}>
          <span className="mr-2 select-none text-zinc-600">→</span>
          <span className="text-zinc-300">localhost:3000</span>
        </p>
      </div>
    </div>
  );
}

function Quickstart() {
  return (
    <section id="quickstart" className="scroll-mt-20 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <Reveal>
              <h2 className="text-balance text-3xl font-semibold tracking-[-0.015em] md:text-4xl">
                Running in under a minute
              </h2>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="mt-4 max-w-md text-pretty text-lg leading-relaxed text-muted-foreground">
                Clone the repo, install dependencies, and start talking to your
                own local AI assistant.
              </p>
            </Reveal>

            <Reveal delay={0.14}>
              <ul className="mt-8 space-y-3.5">
                {[
                  "Node.js 18 or newer",
                  "One-time signup code printed in your terminal",
                  "Ollama, Anthropic, OpenAI, or your own provider",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="text-sm leading-relaxed text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={0.2}>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" className="gap-2">
                    <IconBrandGithub className="h-4 w-4" />
                    View on GitHub
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

          <Reveal delay={0.1}>
            <TerminalBlock />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  FAQ                                                                */
/* ------------------------------------------------------------------ */

function Faq() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <section id="faq" className="scroll-mt-20 border-t border-border py-20 md:py-28">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <Reveal>
            <h2 className="text-balance text-3xl font-semibold tracking-[-0.015em] md:text-4xl">
              Frequently asked questions
            </h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
              Short answers about how RemiAI works, where your data lives, and how to run it.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.12}>
          <div className="mt-10">
            {FAQ_ITEMS.map((item) => (
              <details key={item.question} className="group border-b border-border first:border-t">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5">
                  <h3 className="text-[15px] font-medium tracking-tight">{item.question}</h3>
                  <IconPlus
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45"
                    aria-hidden
                  />
                </summary>
                <p className="pb-5 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  CTA band                                                           */
/* ------------------------------------------------------------------ */

function CtaBand() {
  return (
    <section aria-label="Get RemiAI" className="pb-20 md:pb-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="relative overflow-hidden rounded-2xl bg-zinc-950 px-6 py-16 text-center md:py-20">
          <div
            className="absolute inset-x-0 -top-24 -z-0 h-72 bg-gradient-to-b from-blue-500/15 to-transparent"
            aria-hidden
          />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-[-0.015em] text-white md:text-4xl">
              Run your AI assistant on your own hardware.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-relaxed text-zinc-400">
              Clone the repo, install dependencies, and start talking to your
              local AI in under a minute.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="gap-2">
                  <IconBrandGithub className="h-4 w-4" />
                  View on GitHub
                </Button>
              </a>
              <a href={`${GITHUB_URL}#readme`} target="_blank" rel="noopener noreferrer">
                <Button
                  variant="outline"
                  size="lg"
                  className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-900 hover:border-zinc-600 hover:text-white"
                >
                  Read the docs
                </Button>
              </a>
            </div>
          </div>
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
            alt=""
            width={20}
            height={20}
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
          © {year} {SITE_NAME}. Built in the open by{" "}
          <a
            href="https://crickdevs.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:underline"
          >
            CrickDevs™
          </a>
          .
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
        <TechStrip />
        <Features />
        <Quickstart />
        <Faq />
        <CtaBand />
      </main>
      <Footer />
    </>
  );
}
