import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
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
  metadataBase: new URL("https://remi-ai.vercel.app"),
  title: {
    default: "RemiAI — Your Local AI Assistant",
    template: "%s · RemiAI",
  },
  description:
    "RemiAI is a self-hosted AI assistant with deep file system integration, persistent memory, MCP tool support, and a powerful agent system — 100% under your control.",
  keywords: [
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
  ],
  authors: [{ name: "Houloude9IOfficial" }],
  openGraph: {
    title: "RemiAI — Your Local AI Assistant",
    description:
      "A self-hosted AI assistant with file system integration, persistent memory, and MCP tool support.",
    url: "https://remi-ai.vercel.app",
    siteName: "RemiAI",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/assets/RemiAIv2Light.png",
        width: 3420,
        height: 1812,
        alt: "RemiAI dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RemiAI — Your Local AI Assistant",
    description:
      "A self-hosted AI assistant with file system integration, persistent memory, and MCP tool support.",
    images: ["/assets/RemiAIv2Light.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/RemiAI.png",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbfbfc",
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
