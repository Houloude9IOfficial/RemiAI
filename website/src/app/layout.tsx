import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RemiAI — Your Local AI Assistant",
  description:
    "RemiAI is a lightweight, self-hosted AI assistant with file system integration, memory management, MCP extensibility, and a powerful agent system. Built with Next.js and TypeScript.",
  keywords: [
    "AI assistant",
    "local AI",
    "self-hosted",
    "Next.js",
    "file system AI",
    "MCP",
    "open source",
  ],
  openGraph: {
    title: "RemiAI — Your Local AI Assistant",
    description:
      "A self-hosted AI assistant with file system integration, memory, and MCP tool support.",
    url: "https://remi-ai.vercel.app",
    siteName: "RemiAI",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RemiAI — Your Local AI Assistant",
    description:
      "A self-hosted AI assistant with file system integration, memory, and MCP tool support.",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-screen bg-background text-foreground flex flex-col">
        {children}
      </body>
    </html>
  );
}
