'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Logomark } from '@/components/ui/Logomark';

const navigation = [
  { label: 'Models', href: '/models' },
  { label: 'Research', href: '/research' },
  { label: 'About', href: '/about' },
  { label: 'Careers', href: '/careers' },
  { label: 'Docs', href: '/docs' },
];

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-40">
      <div className="backdrop-blur-xl bg-canvas/70 border-b border-hairline">
        <div className="container flex h-[56px] items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex-shrink-0" aria-label="Silkon Labs home">
              <Logomark size="md" />
            </Link>

            <nav className="hidden md:flex items-center gap-1" aria-label="Main">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-1.5 text-body-sm text-ink-muted transition-colors duration-fast ease-signature hover:text-ink"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              className="hidden sm:flex btn btn-ghost btn-sm"
              aria-label="Search"
            >
              Search
              <kbd className="hidden lg:inline-flex ml-2 text-caption text-ink-tertiary border border-hairline rounded px-1.5 py-0.5">
                ⌘K
              </kbd>
            </button>

            <Link href="/waitlist" className="btn btn-primary btn-sm hidden sm:flex">
              Get Access
            </Link>

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden btn btn-ghost btn-sm"
              aria-label="Menu"
              aria-expanded={mobileOpen}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className="md:hidden bg-canvas border-b border-hairline overflow-hidden"
          >
            <nav className="container py-4 flex flex-col gap-1" aria-label="Mobile">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-2 text-body text-ink-muted transition-colors duration-fast ease-signature hover:text-ink hover:bg-surface-1 rounded-md"
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              <div className="mt-3 pt-3 border-t border-hairline">
                <Link href="/waitlist" className="btn btn-primary w-full justify-center" onClick={() => setMobileOpen(false)}>
                  Get Access
                </Link>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
            className="border-b border-hairline bg-canvas"
          >
            <div className="container py-3">
              <div className="relative">
                <input
                  type="search"
                  placeholder="Search models, docs, research..."
                  className="input pr-10"
                  autoFocus
                />
                <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-caption text-ink-tertiary border border-hairline rounded px-1.5 py-0.5">
                  ESC
                </kbd>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}