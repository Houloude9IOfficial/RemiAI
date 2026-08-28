import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GITHUB_URL, SITE_NAME, SITE_URL } from "@/lib/constants";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const TITLE = "RemiAI - Your Local AI Assistant";
const DESCRIPTION =
  "RemiAI is a self-hosted AI assistant that runs entirely on your own hardware. Deep file system integration, persistent memory, MCP tool support, and a full agent system. No cloud, no telemetry.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s - RemiAI",
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
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
    "ChatGPT alternative",
    "Claude alternative",
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
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
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
    title: SITE_NAME,
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
  ],
  colorScheme: "light dark",
};

const softwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  description: DESCRIPTION,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "macOS, Windows, Linux",
  url: SITE_URL,
  downloadUrl: GITHUB_URL,
  license: `${GITHUB_URL}/blob/main/LICENSE`,
  isAccessibleForFree: true,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  author: {
    "@type": "Person",
    name: "Houloude9IOfficial",
    url: "https://github.com/Houloude9IOfficial",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
