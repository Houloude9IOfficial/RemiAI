import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SITE_URL } from "@/lib/constants";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "RemiAI - Your Local AI Assistant",
    template: "%s · RemiAI",
  },
  description:
    "RemiAI is a self-hosted AI assistant with deep file system integration, persistent memory, MCP tool support, and a powerful agent system — 100% under your control.",
  applicationName: "RemiAI",
  authors: [{ name: "Houloude9IOfficial", url: "https://github.com/Houloude9IOfficial" }],
  creator: "Houloude9IOfficial",
  publisher: "Houloude9IOfficial",
  category: "developer tools",
  keywords: [
    "RemiAI",
    "CrickDevs",
    "AI assistant",
    "local AI",
    "self-hosted",
    "Next.js",
    "file system AI",
    "MCP",
    "open source",
    "privacy",
    "agent",
    "LLM",
    "OpenClaw",
    "ChatGPT",
    "Anthropic",
    "Ollama",
    "OpenAI",
    "AI tools",
    "AI agent",
    "AI memory",
    "AI integration",
    "AI development",
    "AI software",
    "AI platform",
    "AI framework",
    "AI application",
    "AI technology",
    "AI solution",
    "AI system",
    "AI service",
    "AI product",
    "AI innovation",
    "AI research",
    "AI engineering",
  ],
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: "RemiAI - Your Local AI Assistant",
    description:
      "A self-hosted AI assistant with file system integration, persistent memory, and MCP tool support.",
    url: SITE_URL,
    siteName: "RemiAI",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RemiAI - Your Local AI Assistant",
    description:
      "A self-hosted AI assistant with file system integration, persistent memory, and MCP tool support.",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
      { url: "/RemiAI.png", sizes: "512x512" },
    ],
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "RemiAI",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbfbfc",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
