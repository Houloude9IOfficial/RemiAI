"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconBrandGithub,
  IconCode,
  IconCpu,
  IconDatabase,
  IconFileText,
  IconPlugConnected,
  IconRobot,
  IconSearch,
  IconTerminal2,
  IconTools,
  IconBrain,
  IconArrowUpRight,
  IconChevronDown,
  IconStar,
  IconSun,
  IconMoon,
} from "@tabler/icons-react";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GITHUB_URL, CREATIONS_URL, SITE_NAME } from "@/lib/constants";

/* ------------------------------------------------------------------ */
/*  Animation helpers                                                  */
/* ------------------------------------------------------------------ */

function StaggerFadeUp({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.1 }}
      variants={{
        visible: { transition: { staggerChildren: 0.12 } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function StaggerItem({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 30 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.25, 0.1, 0, 1] } },
      }}
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
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.25, 0.1, 0, 1] }}
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/80 backdrop-blur-xl shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 h-16">
        <a href="#" className="flex items-center gap-2.5 group" aria-label="Home">
          <Image
            src="/RemiAI.png"
            alt={SITE_NAME}
            width={28}
            height={28}
            draggable={false}
            className="rounded-lg transition-transform duration-200 group-hover:scale-105"
          />
          {/* <span className="font-semibold text-sm tracking-tight">{SITE_NAME}</span> */}
        </a>

        <nav className="hidden md:flex items-center gap-8">
          {[
            { href: "#features", label: "Features" },
            { href: "#highlights", label: "Tech" },
            { href: "#creations", label: "Creations" },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors duration-200"
            >
              {link.label}
            </a>
          ))}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
          >
            <Button variant="primary" size="sm" className="gap-1.5">
              <IconBrandGithub className="w-3.5 h-3.5" />
              GitHub
            </Button>
          </a>
        </nav>

        {/* Mobile menu button */}
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="md:hidden"
          aria-label="GitHub repository"
        >
          <Button variant="primary" size="sm" className="gap-1.5">
            <IconBrandGithub className="w-3.5 h-3.5" />
            GitHub
          </Button>
        </a>
      </div>
    </motion.header>
  );
}

/* ------------------------------------------------------------------ */
/*  Features data                                                      */
/* ------------------------------------------------------------------ */

const FEATURES = [
  {
    icon: IconFileText,
    title: "File System Integration",
    description:
      "List, read, search, and write files in permitted directories. Full local file access with permission controls.",
    gradient: "from-blue-50 to-indigo-50",
    iconColor: "text-blue-600",
  },
  {
    icon: IconBrain,
    title: "Memory Management",
    description:
      "Persistent user-specific preferences, interests, and personal details that are retained across sessions.",
    gradient: "from-violet-50 to-purple-50",
    iconColor: "text-violet-600",
  },
  {
    icon: IconPlugConnected,
    title: "MCP Extensibility",
    description:
      "Call external services using namespaced tools. Connect databases, APIs, and custom servers seamlessly.",
    gradient: "from-emerald-50 to-teal-50",
    iconColor: "text-emerald-600",
  },
  {
    icon: IconRobot,
    title: "Agent System",
    description:
      "Spawn sub-agents for isolated tasks, optimizing token usage and enabling parallel problem-solving.",
    gradient: "from-amber-50 to-orange-50",
    iconColor: "text-amber-600",
  },
  {
    icon: IconDatabase,
    title: "Automated Migrations",
    description:
      "Drizzle ORM with SQLite. Database migrations run automatically on startup. Zero manual setup required.",
    gradient: "from-rose-50 to-pink-50",
    iconColor: "text-rose-600",
  },
  {
    icon: IconTerminal2,
    title: "Cross-Platform Ready",
    description:
      "Handles Windows path normalization, numeric ID coercion, and works flawlessly across all major platforms.",
    gradient: "from-cyan-50 to-sky-50",
    iconColor: "text-cyan-600",
  },
];

const TECH_STACK = [
  { name: "Next.js", src: "/assets/nextjs.svg" },
  { name: "TypeScript", src: "/assets/typescript.svg" },
  { name: "React", src: "/assets/react.svg" },
  { name: "SQLite", src: "/assets/sqlite.svg" },
  { name: "Tailwind CSS", src: "/assets/tailwindcss.svg" },
  { name: "AI SDK", src: "/assets/vercel.svg" },
  { name: "MCP Protocol", src: "/assets/mcp.svg" },
  { name: "Turbopack", src: "/assets/vercel.svg" },
];

const CREATIONS = [
  {
    title: "Service Monitor",
    description:
      "A lightweight uptime checker that monitors service availability. Built by RemiAI with Mistral — a fully working prototype.",
    tags: ["Node.js", "REST API", "Monitoring"],
    githubPath: "service-monitor",
  },
  {
    title: "Text to Speech",
    description:
      "Python-based TTS converter that transforms written content into natural-sounding speech audio files.",
    tags: ["Python", "TTS", "Audio"],
    githubPath: "Text2Speech",
  },
  {
    title: "Text to Morse Code",
    description:
      "Convert plain text to Morse code and back. A fun utility showcasing RemiAI's coding versatility.",
    tags: ["Node.js", "Utility", "Encoder"],
    githubPath: "TextToMorseCode",
  },
  {
    title: "CLI Text Analyzer",
    description:
      "A simple Node.js command-line tool for analyzing text files. Counts words, characters, lines, and provides word frequency analysis.",
    tags: ["Node.js", "Analysis", "CLI"],
    githubPath: "CLI%20Text%20Analyzer",
  },
];

/* ------------------------------------------------------------------ */
/*  Dashboard Image — scroll-driven parallax                           */
/* ------------------------------------------------------------------ */

function DashboardImage() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [showDark, setShowDark] = useState(false);

  // Scroll‑driven values — progress goes 0→1 as section enters viewport
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [40, -60]);
  const scale = useTransform(scrollYProgress, [0, 1], [1.05, 0.88]);
  const rotate = useTransform(scrollYProgress, [0, 1], [0, 2]);
  const shadowOpacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0.08, 0.15, 0.2, 0.25]);
  const borderRadius = useTransform(scrollYProgress, [0, 1], [16, 20]);

  return (
    <div ref={sectionRef} className="relative mt-14 md:mt-20 mb-6 md:mb-10">
      {/* Glass card wrapper */}
      <motion.div
        className="relative mx-auto max-w-5xl"
        style={{ y, scale, rotate, perspective: 1200 }}
      >
        {/* Shadow layer */}
        <motion.div
          className="absolute -inset-4 rounded-2xl bg-black/5 blur-xl -z-10"
          style={{ opacity: shadowOpacity }}
        />

        {/* Image container with subtle frame */}
        <motion.div
          className="relative overflow-hidden rounded-2xl bg-white shadow-xl"
          style={{ borderRadius }}
        >
          <Image
            src={showDark ? "/assets/RemiAI-Dash-Dark.png" : "/assets/RemiAI-Dash-Light.png"}
            alt={`${SITE_NAME} Dashboard – ${showDark ? "Dark" : "Light"} theme`}
            width={1920}
            height={1080}
            priority
            draggable={false}
            className="w-full h-auto select-none pointer-events-none"
            sizes="(max-width: 1024px) 100vw, 1024px"
          />
        </motion.div>

        {/* Theme toggle badge */}
        {/* <motion.button
          onClick={() => setShowDark((p) => !p)}
          className="absolute -bottom-3 -right-3 md:-bottom-4 md:-right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-zinc-200 shadow-sm text-[11px] font-medium text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 hover:shadow-md transition-all duration-200 cursor-pointer"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1, duration: 0.4 }}
          aria-label={`Switch to ${showDark ? "light" : "dark"} theme preview`}
        >
          {showDark ? (
            <>
              <IconMoon className="w-3 h-3" />
              <span>Dark UI</span>
            </>
          ) : (
            <>
              <IconSun className="w-3 h-3" />
              <span>Light UI</span>
            </>
          )}
        </motion.button> */}
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero144-inspired Grid Section                                      */
/* ------------------------------------------------------------------ */

const TILES = [
  { label: "File System", icon: IconFileText, gradient: "from-blue-400/10 to-blue-500/5" },
  { label: "Memory", icon: IconBrain, gradient: "from-violet-400/10 to-violet-500/5" },
  { label: "MCP", icon: IconPlugConnected, gradient: "from-emerald-400/10 to-emerald-500/5" },
  { label: "Agents", icon: IconRobot, gradient: "from-amber-400/10 to-amber-500/5" },
  { label: "RemiAI", icon: IconStar, gradient: "from-zinc-100 to-white", isCenter: true, isLogo: true },
  { label: "Search", icon: IconSearch, gradient: "from-cyan-400/10 to-cyan-500/5" },
  { label: "Tools", icon: IconTools, gradient: "from-rose-400/10 to-rose-500/5" },
  { label: "Database", icon: IconDatabase, gradient: "from-indigo-400/10 to-indigo-500/5" },
  { label: "Code", icon: IconCode, gradient: "from-orange-400/10 to-orange-500/5" },
];

function HeroGrid() {
  return (
    <section className="relative pt-28 pb-20 md:pt-36 md:pb-28">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-zinc-50 to-white rounded-full blur-3xl opacity-70" />
      </div>

      <div className="mx-auto max-w-6xl px-6">
        {/* Label */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="flex justify-center mb-6"
        >
          {/* <Badge variant="secondary" className="gap-1.5 px-3 py-1">
            <IconCpu className="w-3 h-3" />
            Open Source · Self-Hosted
          </Badge> */}
        </motion.div>

        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.7 }}
          className="text-center max-w-3xl mx-auto"
        >
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-zinc-900 leading-[1.1]">
            Your Local AI Assistant
            {/* Your Local{" "}
            <span className="bg-gradient-to-r from-zinc-700 to-zinc-500 bg-clip-text text-transparent">
              AI Assistant
            </span> */}
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-zinc-500 leading-relaxed max-w-2xl mx-auto">
            A self-hosted AI assistant with file system integration,
            persistent memory, MCP support, and a powerful agent system.
          </p>
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="flex justify-center gap-3 mt-8 flex-wrap"
        >
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View on GitHub"
          >
            <Button variant="primary" size="lg" className="gap-2">
              <IconBrandGithub className="w-4 h-4" />
              View on GitHub
              {/* <IconArrowUpRight className="w-3.5 h-3.5 opacity-60" /> */}
            </Button>
          </a>
          <a href="#features">
            <Button variant="outline" size="lg">
              Explore Features
            </Button>
          </a>
        </motion.div>

        {/* Dashboard Image — scroll‑driven animation */}
        <DashboardImage />

        {/* Hero144-inspired Grid */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="mt-16 md:mt-20"
        >
          <div className="grid grid-cols-3 gap-3 md:gap-4 max-w-lg mx-auto">
            {TILES.map((tile, i) => (
              <div
                key={tile.label}
                className={`
                  relative rounded-xl border overflow-hidden
                  flex flex-col items-center justify-center
                  p-4 md:p-6 aspect-square
                  transition-all duration-500
                  ${
                    tile.isCenter
                      ? "border-zinc-200 bg-white shadow-md scale-100 z-10"
                      : "border-zinc-100 bg-white/60 shadow-sm scale-[0.92] md:scale-[0.88] blur-[1px] hover:blur-none hover:scale-95 md:hover:scale-95 hover:shadow-md hover:border-zinc-200 hover:z-10"
                  }
                `}
                style={{
                  background: tile.isCenter
                    ? "linear-gradient(135deg, #fafafa, #ffffff)"
                    : undefined,
                }}
              >
                {/* Gradient overlay */}
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${tile.gradient} opacity-60`}
                />

                {/* Content */}
                <div className="relative flex flex-col items-center gap-1.5">
                  {tile.isLogo ? (
                    <Image
                      src="/RemiAI.png"
                      alt={SITE_NAME}
                      width={90}
                      height={90}
                      draggable={false}
                      className="rounded-lg"
                    />
                  ) : (
                    <tile.icon
                      className={`w-5 h-5 md:w-6 md:h-6 ${
                        tile.isCenter ? "text-zinc-900" : "text-zinc-500"
                      }`}
                    />
                  )}
                  <span
                    className={`text-[10px] md:text-xs font-medium text-center leading-tight ${
                      tile.isCenter ? "text-zinc-800" : "text-zinc-500"
                    }`}
                  >
                    {tile.label !== "RemiAI" ? tile.label : null}
                  </span>
                </div>

                {/* Glow effect on center tile */}
                {tile.isCenter && (
                  <div className="absolute -inset-0.5 bg-gradient-to-br from-zinc-200/50 to-white/0 rounded-xl -z-10 blur-md" />
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8 }}
          className="flex justify-center mt-16"
        >
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="text-zinc-300"
          >
            <IconChevronDown className="w-5 h-5" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Features Section                                                    */
/* ------------------------------------------------------------------ */

function FeaturesSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const headingY = useTransform(scrollYProgress, [0, 0.3], [40, 0]);
  const headingScale = useTransform(scrollYProgress, [0, 0.3], [0.92, 1]);
  const headingOpacity = useTransform(scrollYProgress, [0, 0.25], [0.5, 1]);
  const cardsY = useTransform(scrollYProgress, [0, 0.4], [60, 0]);
  const cardsOpacity = useTransform(scrollYProgress, [0, 0.35], [0.4, 1]);

  return (
    <section
      id="features"
      ref={ref}
      className="py-20 md:py-28 scroll-mt-20"
    >
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          style={{ y: headingY, scale: headingScale, opacity: headingOpacity }}
          className="text-center max-w-2xl mx-auto mb-14 md:mb-18"
        >
          {/* <Badge variant="secondary" className="mb-4">Features</Badge> */}
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900">
            Everything you need, locally
          </h2>
          <p className="mt-4 text-zinc-500 text-lg leading-relaxed">
            RemiAI combines powerful AI capabilities with deep local integration,
            giving you full control over your data and workflow.
          </p>
        </motion.div>

        <motion.div
          style={{ y: cardsY, opacity: cardsOpacity, perspective: 800 }}
        >
          <StaggerFadeUp className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((feature) => (
              <StaggerItem key={feature.title}>
                <div className="group relative rounded-2xl border border-zinc-100 bg-white p-6 hover:border-zinc-200 transition-all duration-300">
                  <div
                    className={`w-11 h-11 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-105`}
                  >
                    <feature.icon className={`w-5 h-5 ${feature.iconColor}`} />
                  </div>
                  <h3 className="font-semibold text-zinc-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </StaggerFadeUp>
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Technical Highlights Section                                       */
/* ------------------------------------------------------------------ */

function TechHighlightsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const headingScale = useTransform(scrollYProgress, [0, 0.5], [0.95, 1]);
  const headingOpacity = useTransform(scrollYProgress, [0, 0.3], [0.6, 1]);
  const headingY = useTransform(scrollYProgress, [0, 0.4], [30, 0]);
  const badgesY = useTransform(scrollYProgress, [0, 0.5], [50, 0]);
  const badgesOpacity = useTransform(scrollYProgress, [0, 0.4], [0.3, 1]);
  const statsY = useTransform(scrollYProgress, [0.2, 0.7], [40, 0]);
  const statsOpacity = useTransform(scrollYProgress, [0.2, 0.6], [0, 1]);

  return (
    <section
      id="highlights"
      ref={ref}
      className="py-20 md:py-28 scroll-mt-20"
    >
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          style={{ scale: headingScale, opacity: headingOpacity, y: headingY }}
          className="text-center max-w-2xl mx-auto mb-14 md:mb-18"
        >
          {/* <Badge variant="secondary" className="mb-4">Tech Stack</Badge> */}
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900">
            Built with modern tools
          </h2>
          <p className="mt-4 text-zinc-500 text-lg leading-relaxed">
            A powerful stack that emphasizes developer experience and performance.
          </p>
        </motion.div>

        <motion.div
          style={{ y: badgesY, opacity: badgesOpacity, perspective: 800 }}
        >
          <StaggerFadeUp className="flex flex-wrap justify-center gap-3 max-w-3xl mx-auto">
            {TECH_STACK.map((tech) => (
              <StaggerItem key={tech.name}>
                <div className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-white border border-zinc-100 hover:border-zinc-200 transition-all duration-200 cursor-default">
                  <Image
                    src={tech.src}
                    alt={tech.name}
                    width={20}
                    height={20}
                    draggable={false}
                    className="w-5 h-5 object-contain"
                  />
                  <span className="text-sm font-medium text-zinc-700">{tech.name}</span>
                </div>
              </StaggerItem>
            ))}
          </StaggerFadeUp>
        </motion.div>

        {/* Stats */}
        <motion.div
          style={{ y: statsY, opacity: statsOpacity }}
        >
          <StaggerFadeUp>
            <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              {[
                { value: "100%", label: "Local & Private" },
                { value: "Open Source", label: "MIT Licensed" },
                { value: "Multi-Platform", label: "Windows / MacOS" },
                { value: "Extensible", label: "MCP Protocol" },
              ].map((stat) => (
                <StaggerItem key={stat.label}>
                  <div className="text-center p-5 rounded-xl bg-white border border-zinc-100">
                    <div className="text-lg md:text-xl font-bold text-zinc-900">{stat.value}</div>
                    <div className="text-xs text-zinc-500 mt-1">{stat.label}</div>
                  </div>
                </StaggerItem>
              ))}
            </div>
          </StaggerFadeUp>
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Creations Section                                                  */
/* ------------------------------------------------------------------ */

function CreationsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const headingY = useTransform(scrollYProgress, [0, 0.3], [30, 0]);
  const headingScale = useTransform(scrollYProgress, [0, 0.3], [0.93, 1]);
  const headingOpacity = useTransform(scrollYProgress, [0, 0.25], [0.5, 1]);
  const cardsY = useTransform(scrollYProgress, [0, 0.4], [50, 0]);
  const cardsOpacity = useTransform(scrollYProgress, [0, 0.35], [0.3, 1]);

  return (
    <section
      id="creations"
      ref={ref}
      className="py-20 md:py-28 scroll-mt-20"
    >
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          style={{ y: headingY, scale: headingScale, opacity: headingOpacity }}
          className="text-center max-w-2xl mx-auto mb-14 md:mb-18"
        >
          {/* <Badge variant="secondary" className="mb-4">Creations</Badge> */}
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900">
            Built by RemiAI
          </h2>
          <p className="mt-4 text-zinc-500 text-lg leading-relaxed">
            After building its own core, RemiAI put its coding tools to the test
            by creating these projects from scratch.
          </p>
        </motion.div>

        <motion.div
          style={{ y: cardsY, opacity: cardsOpacity, perspective: 800 }}
        >
          <StaggerFadeUp className="grid sm:grid-cols-2 gap-5">
            {CREATIONS.map((creation) => (
              <StaggerItem key={creation.title}>
                <a
                  href={`${CREATIONS_URL}/${creation.githubPath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                  aria-label={`View ${creation.title} on GitHub`}
                >
                  <div className="rounded-2xl border border-zinc-100 bg-white p-6 hover:border-zinc-200 transition-all duration-300">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-semibold text-zinc-900 group-hover:text-zinc-700 transition-colors">
                        {creation.title}
                      </h3>
                      <IconArrowUpRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 transition-colors shrink-0" />
                    </div>
                    <p className="text-sm text-zinc-500 leading-relaxed mb-4">
                      {creation.description}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {creation.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[11px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </a>
              </StaggerItem>
            ))}
          </StaggerFadeUp>
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  CTA Section                                                        */
/* ------------------------------------------------------------------ */

function CTASection() {
  return (
    <section className="py-20 md:py-28 bg-zinc-900 border-t border-zinc-800">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.25, 0.1, 0, 1] }}
        >
          <Badge
            variant="secondary"
            className="mb-4 bg-zinc-800 text-zinc-300 border-none"
          >
            Get Started
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
            Ready to run locally?
          </h2>
          <p className="mt-4 text-zinc-400 text-lg leading-relaxed max-w-xl mx-auto">
            Clone the repo, install dependencies, and start interacting with
            your own local AI assistant in minutes.
          </p>
          <div className="flex justify-center gap-3 mt-8 flex-wrap">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Get started on GitHub"
            >
              <Button
                variant="primary"
                size="lg"
                className="bg-white text-zinc-900 hover:bg-zinc-100 gap-2"
              >
                <IconBrandGithub className="w-4 h-4" />
                Get Started on GitHub
              </Button>
            </a>
            <a
              href={`${GITHUB_URL}#readme`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Read the documentation"
            >
              <Button
                variant="outline"
                size="lg"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                Read the Docs
              </Button>
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer                                                             */
/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="border-t border-zinc-100 bg-white py-12">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Image
              src="/RemiAI.png"
              alt={SITE_NAME}
              width={22}
              height={22}
              draggable={false}
              className="rounded-md"
            />
            <span className="text-sm font-medium text-zinc-700">{SITE_NAME}</span>
            <span className="text-xs text-zinc-400 ml-2">
              MIT License
            </span>
          </div>
          <div className="flex items-center gap-6">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              GitHub
            </a>
            <a
              href={`${GITHUB_URL}/blob/main/LICENSE`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              License
            </a>
          </div>
        </div>
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
      {/* <Header /> */}
      <main>
        <HeroGrid />
        <FeaturesSection />
        <TechHighlightsSection />
        <CreationsSection />
        {/* <CTASection /> */}
      </main>
      <Footer />
    </>
  );
}
