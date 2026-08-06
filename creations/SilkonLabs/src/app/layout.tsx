import type { Metadata } from 'next';
import React from 'react';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { SiteHeader } from '@/components/layout/site-header';
import { Footer } from '@/components/layout/Footer';
import { PageTransition } from '@/components/animations/PageTransition';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Silkon Labs — Building the silicon foundation for AGI',
  description:
    'Silkon Labs develops frontier AI models. Our flagship model Silkon 1T — 1 trillion parameters, unified intelligence.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-canvas text-ink antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 btn-primary"
        >
          Skip to main content
        </a>
        <SiteHeader />
        <main id="main-content" className="pt-[56px]">
          <PageTransition>{children}</PageTransition>
        </main>
        <Footer />
      </body>
    </html>
  );
}
